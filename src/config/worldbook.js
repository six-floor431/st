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

  // 用 LLM 推断世界观（真实调用），返回文本
  // 提示词可编辑：settings.prompts.worldview（支持 {{plot}} {{recent}} 占位符）
  async function inferWorldview(settings, opts) {
    settings = settings || (WM.Settings && WM.Settings.load) || {};
    const char = getCharacterCard();
    const user = getUserCard();
    const prev = WM.MemoryStore ? WM.MemoryStore.getWorld() : '';
    const plots = (WM.MemoryStore && WM.MemoryStore.getPlots ? WM.MemoryStore.getPlots() : []).map((p) => `· ${p.title}：${p.summary}`).join('\n');
    const tpl = (settings && settings.prompts && settings.prompts.worldview) ||
      '你是世界观提炼者。请基于【剧情线】和【最近对话】，抽取本世界的关键设定：地点、势力、规则、物品、概念。输出条目，每条一行。\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}';
    const sys = WM.Summary.fillTemplate(tpl, { plot: plots, recent: '' });
    const userMsg = `【角色设定】${char.name || '未知'}：${char.description || ''}
【用户设定】${user.name || '未知'}：${user.description || ''}
【已有世界观】${prev || '（无）'}
请输出世界观设定：`;
    if (!WM.Summary || !WM.Summary.callLLM) return prev;
    const out = await WM.Summary.callLLM(sys, userMsg, settings, { maxTokens: 700, temperature: 0.4 });
    return out && out.trim() ? out.trim() : prev;
  }

  WM.Worldbook = {
    available, ensureLorebook, writeEntry, removeEntry, clearAll, listEntries, getLorebookEntries,
    writeSummary, writeItem, writeRelation, writeWorld, targetName,
    getCharacterCard, getUserCard, inferWorldview,
  };
})();
