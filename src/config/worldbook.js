// 世界书模块：把关卡数据（总结/物品/关系/世界观）拆分成「独立世界书条目」写入，
// 实现「每段总结一个条目、每个物品一个条目、同一人的关系一个条目、不同人分开」，
// 并通过绑定到当前角色卡的世界书做到数据隔离。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function helper() { return window.TavernHelper; }
  function available() { return typeof helper() !== 'undefined'; }

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
      // 绑定到当前角色卡的世界书列表，做到每角色卡独立
      if (helper().rebindCharWorldbooks) {
        const cur = await helper().getCharWorldbookNames('current');
        if (!cur.includes(name)) {
          await helper().rebindCharWorldbooks([...cur, name], 'current');
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
      const entries = await helper().getWorldbookEntries(name);
      return (entries || []).map((e, i) => ({ uid: String(e.uid != null ? e.uid : i), entry: e }));
    } catch (e) { return []; }
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

    const entry = {
      content: opts.content,
      comment: opts.title || opts.kind,
      name: opts.title || '',
      enabled: true,
      position: opts.position || 'before_prompt', // 默认在提示词之前
      // 触发策略
      strategy: {
        type: opts.strategy === 'selective' ? 'selective' : 'constant',
        depth: 1,
        useExcept: false,
        tokens: 512,
        keys: opts.keys && opts.keys.length ? opts.keys : [],
        order: 100,
      },
      excludeRecursion: false,
      preventRecursion: false,
      delayUntilRecursion: false,
      probability: 100,
      useProbability: false,
      extra: extraOf(sourceId),
    };

    try {
      const existing = await listEntries();
      const hit = existing.find((x) => x.entry.extra && x.entry.extra.warmMemo && x.entry.extra.sourceId === sourceId);
      if (hit) {
        // 更新已有条目（合并内容/keys）
        const merged = Object.assign({}, x_merge(hit.entry), entry);
        await helper().updateWorldbookEntry(name, hit.uid, merged);
        return hit.uid;
      } else {
        const created = await helper().createWorldbookEntries(name, [entry]);
        if (Array.isArray(created) && created.length) return String(created[0].uid != null ? created[0].uid : created[0].id);
        return 'new';
      }
    } catch (e) {
      console.warn('[WarmMemo] writeEntry 失败:', e);
      return null;
    }
  }

  function x_merge(base) {
    // 仅保留 base 中世界书原生字段，避免 extra 被旧值覆盖我们刚设的
    return Object.assign({}, base);
  }

  // 删除某 sourceId 对应的条目
  async function removeEntry(sourceId) {
    if (!available() || !sourceId) return;
    const name = targetName();
    try {
      const existing = await listEntries();
      const hit = existing.find((x) => x.entry.extra && x.entry.extra.warmMemo && x.entry.extra.sourceId === sourceId);
      if (hit) await helper().deleteWorldbookEntry(name, hit.uid);
    } catch (e) { console.warn('[WarmMemo] removeEntry 失败:', e); }
  }

  // 清空本扩展写入的所有条目（保留世界书本身）
  async function clearAll() {
    if (!available()) return;
    const name = targetName();
    try {
      const existing = await listEntries();
      for (const x of existing) {
        if (x.entry.extra && x.entry.extra.warmMemo) await helper().deleteWorldbookEntry(name, x.uid);
      }
    } catch (e) { console.warn('[WarmMemo] clearAll 失败:', e); }
  }

  // ── 便捷封装：按类型写独立条目 ──
  async function writeSummary(dateLabel, content) {
    return writeEntry({ kind: 'summary', title: '总结·' + dateLabel, content, strategy: 'constant' });
  }
  async function writeItem(itemName, content) {
    return writeEntry({ kind: 'item', title: '物品·' + itemName, content, keys: [itemName], strategy: 'selective' });
  }
  async function writeRelation(person, content, keys) {
    return writeEntry({ kind: 'relation', title: '关系·' + person, content, keys: keys && keys.length ? keys : [person], strategy: 'constant' });
  }
  async function writeWorld(content) {
    return writeEntry({ kind: 'world', title: '世界观设定', content, strategy: 'constant' });
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
  async function inferWorldview(settings, opts) {
    settings = settings || (WM.Settings && WM.Settings.load) || {};
    const char = getCharacterCard();
    const user = getUserCard();
    const prev = WM.MemoryStore ? WM.MemoryStore.getWorld() : '';
    const sys = `你是世界观整理者。基于【角色设定】【用户设定】与【已有世界观】，推断并补全当前故事的世界观设定。
要求：客观、紧凑，涵盖时代/地点/势力/规则/关键设定。与已有不冲突则合并。最多 600 字。
${opts && opts.extraInstruction ? '额外指令：' + opts.extraInstruction : ''}`;
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
