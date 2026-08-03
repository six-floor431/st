// 世界书模块：把关卡数据（总结/物品/关系/世界观）拆分成「独立世界书条目」写入，
// 实现「每段总结一个条目、每个物品一个条目、同一人的关系一个条目、不同人分开」，
// 并通过绑定到当前角色卡的世界书做到数据隔离。
//
// 严格对齐酒馆助手 API（@types/function/worldbook.d.ts）：
//   getWorldbookNames / createWorldbook / getWorldbook /
//   createWorldbookEntries / updateWorldbookWith / deleteWorldbookEntries /
//   getCharWorldbookNames / rebindCharWorldbooks
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function helper() { return window.TavernHelper; }
  function available() {
    const h = helper();
    return !!h && typeof h.getWorldbookNames === 'function' && typeof h.getWorldbook === 'function';
  }

  // 取得当前应使用的世界书名（自定义，默认 WarmMemo）
  function targetName() {
    const s = (WM.Settings && WM.Settings.load) ? WM.Settings.load() : {};
    return (s.lorebookName && s.lorebookName.trim()) || 'WarmMemo';
  }

  // 确保世界书存在，并绑定到当前角色卡（实现按角色卡数据隔离）
  async function ensureLorebook() {
    if (!available()) return false;
    const name = targetName();
    try {
      const names = await helper().getWorldbookNames();
      if (!names.includes(name)) {
        await helper().createWorldbook(name, []);
      }
      // 绑定到当前角色卡的世界书列表，做到每角色卡独立。
      // 真实签名：rebindCharWorldbooks('current', { primary, additional })
      if (typeof helper().rebindCharWorldbooks === 'function') {
        const cur = await helper().getCharWorldbookNames('current'); // { primary, additional }
        const additional = Array.isArray(cur.additional) ? cur.additional.slice() : [];
        if (!additional.includes(name)) {
          additional.push(name);
          await helper().rebindCharWorldbooks('current', { primary: cur.primary || null, additional });
        }
      }
      return true;
    } catch (e) {
      console.warn('[WarmMemo] ensureLorebook 失败:', e);
      return false;
    }
  }

  // 在条目 extra 中标记来源，便于按 sourceId 精确更新/删除
  function extraOf(sourceId) { return { warmMemo: true, sourceId: sourceId || '' }; }

  // 列出当前世界书所有条目，返回 {uid, entry} 数组
  async function listEntries() {
    if (!available()) return [];
    const name = targetName();
    try {
      const entries = await helper().getWorldbook(name);
      return (entries || []).map((e, i) => ({ uid: String(e.uid != null ? e.uid : i), entry: e }));
    } catch (e) { return []; }
  }

  // 构造一个符合真实 WorldbookEntry 结构的条目对象
  function buildEntry(opts) {
    const isSelective = opts.strategy === 'selective';
    return {
      name: opts.title || '',
      enabled: true,
      content: opts.content,
      // 激活策略（真实结构：type / keys / keys_secondary / scan_depth）
      strategy: {
        type: isSelective ? 'selective' : 'constant',
        keys: opts.keys && opts.keys.length ? opts.keys : [],
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global',
      },
      position: {
        type: 'after_author_note', // 真实枚举：作者注释之后
        role: 'system',
        depth: 1,
        order: 100,
      },
      probability: 100,
      // 递归：禁止条目互相递归激活，避免爆量
      recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
      effect: { sticky: null, cooldown: null, delay: null },
      extra: extraOf(opts.sourceId),
    };
  }

  // 写入/更新一个条目。sourceId 相同则更新，否则新建。实现「每条独立条目」。
  // opts: { sourceId, kind, title, content, keys, strategy }
  //   kind: 'summary' | 'item' | 'relation' | 'world' | 'memory'
  //   strategy: 'constant'（蓝灯常驻）| 'selective'（绿灯按 keys 触发）
  async function writeEntry(opts) {
    if (!opts || !opts.content || !opts.content.trim()) return null;
    const ok = await ensureLorebook();
    if (!ok) return null;
    const name = targetName();
    const sourceId = opts.sourceId || [opts.kind, opts.title].join('::');
    const entry = buildEntry(Object.assign({ sourceId }, opts));

    try {
      const existing = await listEntries();
      const hit = existing.find((x) => x.entry.extra && x.entry.extra.warmMemo && x.entry.extra.sourceId === sourceId);
      if (hit) {
        // 更新已有条目：保留 uid，合并最新内容/keys（用 updateWorldbookWith）
        const uid = Number(hit.uid);
        await helper().updateWorldbookWith(name, (wb) => {
          return wb.map((e) => (String(e.uid) === hit.uid ? Object.assign({}, e, entry, { uid: e.uid }) : e));
        });
        return hit.uid;
      } else {
        // 新建：真实返回 { worldbook, new_entries }
        const res = await helper().createWorldbookEntries(name, [entry]);
        const created = res && res.new_entries ? res.new_entries : [];
        if (created.length) return String(created[0].uid != null ? created[0].uid : created[0].id);
        return 'new';
      }
    } catch (e) {
      console.warn('[WarmMemo] writeEntry 失败:', e);
      return null;
    }
  }

  // 删除某 sourceId 对应的条目（真实：deleteWorldbookEntries(name, predicate)）
  async function removeEntry(sourceId) {
    if (!available() || !sourceId) return;
    const name = targetName();
    try {
      await helper().deleteWorldbookEntries(name, (e) => !!(e.extra && e.extra.warmMemo && e.extra.sourceId === sourceId));
    } catch (e) { console.warn('[WarmMemo] removeEntry 失败:', e); }
  }

  // 按前缀清理「已不存在」的条目：keepIds 为该前缀下应保留的 sourceId 集合。
  // 用于删除物品/剧情/世界分条后，同步移除世界书里的残留条目。
  async function pruneByPrefix(prefix, keepIds) {
    if (!available() || !prefix) return;
    const name = targetName();
    const keep = new Set(Array.isArray(keepIds) ? keepIds : []);
    try {
      await helper().deleteWorldbookEntries(name, (e) => {
        const ex = e && e.extra;
        if (!ex || !ex.warmMemo || !ex.sourceId) return false;
        if (String(ex.sourceId).indexOf(prefix) !== 0) return false;
        return !keep.has(String(ex.sourceId));
      });
    } catch (e) { console.warn('[WarmMemo] pruneByPrefix 失败:', e); }
  }

  // 清空本扩展写入的所有条目（保留世界书本身）
  async function clearAll() {
    if (!available()) return;
    const name = targetName();
    try {
      await helper().deleteWorldbookEntries(name, (e) => !!(e.extra && e.extra.warmMemo));
    } catch (e) { console.warn('[WarmMemo] clearAll 失败:', e); }
  }

  // ── 便捷封装：按类型写独立条目 ──
  // 注意：sourceId 统一规则，便于外部按 sourceId 精确删除（与 dispatchLorebook 保持同一种子）
  //   summary -> summary::<dateLabel>
  //   item    -> item::<name>
  //   relation-> relation::<person>
  //   world   -> world::main
  async function writeSummary(dateLabel, content) {
    return writeEntry({ kind: 'summary', sourceId: 'summary::' + dateLabel, title: '总结·' + dateLabel, content, strategy: 'constant' });
  }
  async function writeItem(itemName, content) {
    return writeEntry({ kind: 'item', sourceId: 'item::' + itemName, title: '物品·' + itemName, content, keys: [itemName], strategy: 'selective' });
  }
  async function writeRelation(person, content, keys) {
    return writeEntry({ kind: 'relation', sourceId: 'relation::' + person, title: '关系·' + person, content, keys: keys && keys.length ? keys : [person], strategy: 'constant' });
  }
  async function writeWorld(content) {
    return writeEntry({ kind: 'world', sourceId: 'world::main', title: '世界观设定', content, strategy: 'constant' });
  }

  // ── 角色卡/用户卡/世界书读取（供总结模块客观取数） ──
  function getCtx() { return window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext(); }
  function getCharacterCard() {
    try {
      const ctx = getCtx();
      const c = ctx && ctx.characterCard;
      if (c) return { name: c.name, description: c.description, personality: c.personality };
      const chat = ctx && ctx.chat;
      const last = chat && chat.find((m) => !m.is_user);
      return { name: (last && last.name) || (ctx && ctx.name2) || '', description: (last && last.mes) || '' };
    } catch (e) { return {}; }
  }
  function getUserCard() {
    try {
      const ctx = getCtx();
      const u = ctx && ctx.user;
      if (u) return { name: u.name, description: u.description };
      return { name: (ctx && ctx.name1) || '用户', description: '' };
    } catch (e) { return {}; }
  }
  // 兼容别名（summary.js / 面板仍调用 getLorebookEntries）
  async function getLorebookEntries() {
    const list = await listEntries();
    return list.map((x) => ({ key: x.entry.name || x.entry.comment || '', content: x.entry.content || '' }));
  }

  // 解析 AI 输出的结构化世界观文本 → { name, kind, desc, sections:[{title,body}] }
  // 期望格式：
  //   世界名：九霄大陆
  //   世界类型：修仙世界
  //   简述：……
  //   ## 修炼体系
  //   ……
  function parseWorldview(text) {
    if (!text || !String(text).trim()) return null;
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    const out = { name: '', kind: '', desc: '', sections: [] };
    let cur = null;
    const descBuf = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { if (cur) cur.body.push(''); continue; }
      // 小标题：## xxx 或 【xxx】 或 「xxx」
      let m = line.match(/^#{1,6}\s*(.+?)\s*$/) || line.match(/^【(.+?)】\s*$/) || line.match(/^「(.+?)」\s*$/);
      if (m) { cur = { title: m[1].trim(), body: [] }; out.sections.push(cur); continue; }
      // 顶部字段
      m = line.match(/^(?:世界名(?:称)?|世界)\s*[:：]\s*(.+)$/);
      if (m && !cur) { out.name = m[1].trim(); continue; }
      m = line.match(/^世界类型\s*[:：]\s*(.+)$/);
      if (m && !cur) { out.kind = m[1].trim(); continue; }
      m = line.match(/^(?:简述|世界简述|概述)\s*[:：]\s*(.+)$/);
      if (m && !cur) { descBuf.push(m[1].trim()); continue; }
      if (cur) cur.body.push(line);
      else descBuf.push(line);
    }
    out.desc = descBuf.join('\n').trim();
    out.sections = out.sections
      .map((s) => ({ title: s.title, body: s.body.join('\n').trim() }))
      .filter((s) => s.title || s.body);
    if (!out.name && !out.kind && !out.desc && !out.sections.length) return null;
    return out;
  }

  // 用 LLM 推断世界观（真实调用），返回结构化文本
  // 提示词可编辑：settings.prompts.worldview（支持 {{plot}} {{recent}} 占位符）
  async function inferWorldview(settings, opts) {
    settings = settings || (WM.Settings && WM.Settings.load && WM.Settings.load()) || {};
    const char = getCharacterCard();
    const user = getUserCard();
    const store = WM.MemoryStore;
    const prevMeta = store && store.getWorldMeta ? store.getWorldMeta() : { name: '', kind: '', desc: '' };
    const prevSecs = store && store.getWorldSections ? store.getWorldSections() : [];
    const prev = store ? store.getWorld() : '';
    const plots = (store && store.getPlots ? store.getPlots() : [])
      .map((p) => `· ${p.time ? '[' + p.time + '] ' : ''}${p.title}：${p.summary}`).join('\n');
    const items = (store && store.getItems ? store.getItems() : [])
      .map((i) => `· ${i.name}（持有者：${i.owner || '未知'}）：${i.desc || ''}`).join('\n');
    const tpl = (settings && settings.prompts && settings.prompts.worldview) || DEFAULT_WORLDVIEW_PROMPT;
    const sys = WM.Summary.fillTemplate(tpl, { plot: plots, recent: '', items });
    const known = [
      prevMeta.name ? `世界名：${prevMeta.name}` : '',
      prevMeta.kind ? `世界类型：${prevMeta.kind}` : '',
      prevMeta.desc ? `简述：${prevMeta.desc}` : '',
      ...prevSecs.map((w) => `## ${w.title}\n${w.body}`),
    ].filter(Boolean).join('\n');
    const userMsg = `【角色设定】${char.name || '未知'}：${char.description || ''}
【用户设定】${user.name || '未知'}：${user.description || ''}
【剧情线】
${plots || '（无）'}
【已知物品】
${items || '（无）'}
【已有世界观】
${known || prev || '（无）'}
${opts && opts.extraInstruction ? '【额外要求】' + opts.extraInstruction + '\n' : ''}请按规定格式输出世界设定：`;
    if (!WM.Summary || !WM.Summary.callLLM) return prev;
    const out = await WM.Summary.callLLM(sys, userMsg, settings, { temperature: 0.4 });
    return out && out.trim() ? out.trim() : prev;
  }

  const DEFAULT_WORLDVIEW_PROMPT = `你是世界观提炼者。请基于【角色设定】【剧情线】【已知物品】，提炼这个故事所处世界的设定。

严格按以下格式输出，不要添加任何多余说明：

世界名：（这个世界/大陆/城市叫什么，没有就起一个贴切的）
世界类型：（用一个词概括，如：修仙世界、赛博朋克、蒸汽朋克、现代都市、剑与魔法）
简述：（一到两句话说明这是个什么样的世界）

## 设定标题一
（围绕"世界类型"展开的具体规则。例如修仙世界就写修炼体系的境界划分；赛博朋克就写义体与企业规则）

## 设定标题二
（内容）

要求：
1. 「世界类型」决定了下面写什么。修仙世界就必须有修炼体系、灵气、宗门等设定，不要写无关内容。
2. 每条设定要具体、可被后续剧情引用，不要空泛。
3. 输出 3-6 条设定条目。

【剧情线】
{{plot}}

【已知物品】
{{items}}

【最近对话】
{{recent}}`;

  WM.Worldbook = {
    available, ensureLorebook, writeEntry, removeEntry, clearAll, pruneByPrefix, listEntries, getLorebookEntries,
    writeSummary, writeItem, writeRelation, writeWorld, targetName,
    getCharacterCard, getUserCard, inferWorldview, parseWorldview, DEFAULT_WORLDVIEW_PROMPT,
  };
})();
