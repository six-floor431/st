// 记忆存储层：仿「万楼不会忘记」——所有结构化记忆存于对话元数据 chat_metadata，
// 不占上下文 token，只在需要时经 CHAT_COMPLETION_PROMPT_READY 注入。
// chat_metadata 是酒馆为每个对话单独保存的槽位，换对话即切换，万楼不丢。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  const FIELD = 'warm_memo_v2'; // 在 chat_metadata 中的键名

  // 默认空库结构
  function emptyStore() {
    return {
      version: 2,
      memories: [],   // [{id, text, ts, range:[start,end], vector?:number[]}]
      summaries: [], // 每段总结/剧情摘要独立存档 [{id, kind:'summary'|'plot', title, text, ts}]
      // 物品：name=名称 / desc=作用 / owner=持有者；relatedPlots 关联剧情线，origin 来历
      items: [],      // [{id, name, desc, owner, relatedPlots:[], origin, ts}]
      // 剧情线：time=剧情内时间（最左列显示），ts=记录时间戳（排序兜底）
      plots: [],      // [{id, title, summary, time, ts, status:'active'|'done'|'abandon'}]
      world: '',      // 世界观设定文本（旧版兼容 / 也作为「世界简述」）
      worldMeta: { name: '', kind: '', desc: '' }, // 世界名 / 世界类型 / 一句话简述
      worldSections: [], // 分条设定 [{id, title, body, ts}]
      relations: [],  // 关系边 [{from,to,label,weight}]
      summaryPointer: 0, // 已总结到的楼层索引（用于自动隐藏）
    };
  }

  // 读取当前对话的元数据
  function getMetadata() {
    const ctx = window.SillyTavern && window.SillyTavern.getContext();
    const md = ctx && ctx.chatMetadata;
    if (md && typeof md === 'object' && !Array.isArray(md)) return md;
    return null;
  }

  function activeChatId() {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      return (ctx && ctx.chatId) || null;
    } catch (e) { return null; }
  }

  // 读取记忆库（总是从 chat_metadata 取，保证唯一真相源）
  function load() {
    const md = getMetadata();
    const raw = md && md[FIELD];
    if (!raw) return emptyStore();
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const base = emptyStore();
      const s = Object.assign(base, obj);
      // —— 旧数据迁移：补齐新增字段，避免 UI 读到 undefined ——
      if (!s.worldMeta || typeof s.worldMeta !== 'object') s.worldMeta = { name: '', kind: '', desc: '' };
      if (!Array.isArray(s.worldSections)) s.worldSections = [];
      s.items = (Array.isArray(s.items) ? s.items : []).map((it) => Object.assign(
        { id: 'it_' + Math.random().toString(36).slice(2), name: '', desc: '', owner: '', relatedPlots: [], origin: '', ts: Date.now() },
        it,
        { relatedPlots: Array.isArray(it && it.relatedPlots) ? it.relatedPlots : [] }
      ));
      s.plots = (Array.isArray(s.plots) ? s.plots : []).map((p) => Object.assign(
        { id: 'pl_' + Math.random().toString(36).slice(2), title: '', summary: '', time: '', status: 'active', ts: Date.now() },
        p
      ));
      return s;
    } catch (e) {
      return emptyStore();
    }
  }

  // 写回 chat_metadata（酒馆官方持久化路径）
  // 真实 API：ctx.updateChatMetadata(new_values, reset) 会合并并触发保存；
  // 再用 saveMetadata() 兜底落盘。绝不直接改 md 引用（会与内部逻辑竞态）。
  async function save(store) {
    const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
    if (!ctx || !ctx.updateChatMetadata) return false;
    try {
      ctx.updateChatMetadata({ [FIELD]: store }, false);
      if (typeof ctx.saveMetadata === 'function') await ctx.saveMetadata();
      else if (typeof ctx.saveChat === 'function') await ctx.saveChat();
      // 存档成功后，异步把结构化数据拆分同步到世界书条目（不阻塞存档）
      // 注意：开启「向量接管」时，内容改由温记自家 embedding+rerank 召回注入，不再拆写酒馆世界书，避免双重注入。
      const st = WM.Settings && WM.Settings.load();
      if (WM.Worldbook && st && st.worldToLorebook !== false && !(st.takeoverEmbedding && st.vectorEnabled)) {
        dispatchLorebook().catch((e) => console.warn('[WarmMemo] 世界书同步失败', e));
      }
      return true;
    } catch (e) {
      console.error('[WarmMemo] 保存记忆失败', e);
      return false;
    }
  }

  // ── 记忆条目 ──
  async function addMemory(text, range) {
    const s = load();
    const id = 'mem_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    s.memories.push({ id, text: String(text).trim(), ts: Date.now(), range: range || null });
    if (s.memories.length > 400) s.memories = s.memories.slice(-400); // 防无限胀
    await save(s);
    return id;
  }
  function getMemories() { return load().memories; }

  // ── 总结 / 剧情摘要（独立存档，不与其他内容挤在一起） ──
  async function addSummary(text, kind, title) {
    const s = load();
    const id = 'sm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    s.summaries.push({
      id,
      kind: kind || 'summary',
      title: title || new Date().toLocaleString('zh-CN'),
      text: String(text).trim(),
      ts: Date.now(),
    });
    if (s.summaries.length > 300) s.summaries = s.summaries.slice(-300);
    await save(s);
    return id;
  }
  async function removeSummary(id) {
    const s = load();
    s.summaries = s.summaries.filter((x) => x.id !== id);
    await save(s);
  }
  function getSummaries() { return load().summaries; }

  // ── 世界书分派：把结构化数据「拆分」成独立世界书条目（每段总结/每个物品/每组关系各一条） ──
  // 数据隔离已由 chat_metadata 保证；此处只负责把内容写入「当前角色卡绑定」的世界书。
  //
  // 并发保护：save() 会 fire-and-forget 调用本函数。若连续多次增删改，
  // 多个 dispatch 会交错执行——后启动的那个可能读到旧快照，其 prune 阶段
  // 会把前一个刚写入的条目误删。这里用「串行队列 + 尾部合并」保证：
  //   1) 任一时刻只有一个 dispatch 在跑；
  //   2) 排队期间的多次请求合并成一次，最终必定按最新数据再跑一遍。
  let _dispatching = null;   // 当前正在执行的 Promise
  let _dispatchPending = false; // 是否有后续请求待合并
  async function dispatchLorebook() {
    if (_dispatching) {
      _dispatchPending = true;
      return _dispatching;
    }
    _dispatching = (async () => {
      try {
        do {
          _dispatchPending = false;
          await doDispatch();
        } while (_dispatchPending); // 期间又有新改动，用最新数据再跑一次
      } finally {
        _dispatching = null;
      }
    })();
    return _dispatching;
  }

  async function doDispatch() {
    if (!WM.Worldbook) return;
    const s = load();
    const settings = WM.Settings.load();
    if (settings.worldToLorebook === false) return; // 用户关闭了世界书写入
    if (settings.takeoverEmbedding && settings.vectorEnabled) return; // 接管模式：内容由自家向量召回注入，不拆写世界书
    // 1) 每段总结/剧情摘要 → 独立条目（不挤在一起）
    for (const sm of s.summaries) {
      await WM.Worldbook.writeEntry({
        kind: sm.kind === 'plot' ? 'summary' : 'summary',
        sourceId: 'summary::' + sm.id,
        title: (sm.kind === 'plot' ? '剧情摘要·' : '总结·') + sm.title,
        content: sm.text,
        strategy: 'constant',
      });
    }
    // 2) 每个物品 → 独立条目（按物品名 + 持有者 + 关联剧情名触发）
    const plotTitleById = {};
    for (const p of s.plots) plotTitleById[p.id] = p.title;
    for (const it of s.items) {
      if (!it.name) continue;
      const relNames = (it.relatedPlots || []).map((pid) => plotTitleById[pid] || pid).filter(Boolean);
      const lines = [`物品：${it.name}`];
      if (it.desc) lines.push(`作用：${it.desc}`);
      if (it.owner) lines.push(`持有者：${it.owner}`);
      if (it.origin) lines.push(`来历：${it.origin}`);
      if (relNames.length) lines.push(`关联剧情：${relNames.join('、')}`);
      const keys = [it.name];
      if (it.owner) keys.push(it.owner);
      for (const n of relNames) keys.push(n);
      await WM.Worldbook.writeEntry({
        kind: 'item',
        sourceId: 'item::' + it.id,
        title: '物品·' + it.name,
        content: lines.join('\n'),
        keys: Array.from(new Set(keys.filter(Boolean))),
        strategy: 'selective',
      });
    }
    // 2.5) 每条剧情线 → 独立条目（最新在上由 UI 负责，世界书按条写）
    for (const p of s.plots) {
      if (!p.title && !p.summary) continue;
      const lines = [];
      if (p.time) lines.push(`时间：${p.time}`);
      if (p.summary) lines.push(p.summary);
      const stat = p.status === 'done' ? '已完结' : (p.status === 'abandon' ? '已废弃' : '进行中');
      lines.push(`状态：${stat}`);
      await WM.Worldbook.writeEntry({
        kind: 'plot',
        sourceId: 'plot::' + p.id,
        title: '剧情·' + (p.title || p.time || p.id),
        content: lines.join('\n'),
        keys: [p.title].filter(Boolean),
        strategy: p.status === 'active' ? 'constant' : 'selective',
      });
    }
    // 3) 关系 → 按主体人物分组，同一人挤一起、不同人分开
    const groups = WM.Relations && WM.Relations.groupByPerson ? WM.Relations.groupByPerson({ pairs: s.relations }) : [];
    for (const g of groups) {
      await WM.Worldbook.writeEntry({
        kind: 'relation',
        sourceId: 'relation::' + g.person,
        title: '关系·' + g.person,
        content: `${g.person}的关系：${g.text}`,
        keys: g.keys,
        strategy: 'constant',
      });
    }
    // 4) 世界观总纲 → 单条目（世界名 + 类型 + 简述）
    const wm = s.worldMeta || {};
    const headLines = [];
    if (wm.name) headLines.push(`世界名：${wm.name}`);
    if (wm.kind) headLines.push(`世界类型：${wm.kind}`);
    if (wm.desc) headLines.push(wm.desc);
    if (!headLines.length && s.world && s.world.trim()) headLines.push(s.world.trim());
    if (headLines.length) {
      await WM.Worldbook.writeEntry({
        kind: 'world',
        sourceId: 'world::main',
        title: '世界观·' + (wm.name || '总纲'),
        content: headLines.join('\n'),
        strategy: 'constant',
      });
    }
    // 5) 世界设定分条 → 每条独立条目（如「修炼体系」「势力分布」）
    for (const w of (s.worldSections || [])) {
      if (!w.title && !w.body) continue;
      await WM.Worldbook.writeEntry({
        kind: 'world',
        sourceId: 'worldsec::' + w.id,
        title: '设定·' + (w.title || w.id),
        content: `${w.title ? w.title + '\n' : ''}${w.body || ''}`.trim(),
        keys: [w.title].filter(Boolean),
        strategy: 'selective',
      });
    }

    // 6) 清理残留：已在面板中删除的条目，同步从世界书移除
    if (WM.Worldbook.pruneByPrefix) {
      await WM.Worldbook.pruneByPrefix('item::', s.items.map((x) => 'item::' + x.id));
      await WM.Worldbook.pruneByPrefix('plot::', s.plots.map((x) => 'plot::' + x.id));
      await WM.Worldbook.pruneByPrefix('worldsec::', (s.worldSections || []).map((x) => 'worldsec::' + x.id));
      await WM.Worldbook.pruneByPrefix('summary::', s.summaries.map((x) => 'summary::' + x.id));
    }
  }

  // ── 物品（name=名称 / desc=作用 / owner=持有者 / relatedPlots=关联剧情线） ──
  function normItem(o) {
    return {
      name: String((o && o.name) || '').trim(),
      desc: String((o && o.desc) || '').trim(),
      owner: String((o && o.owner) || '').trim(),
      origin: String((o && o.origin) || '').trim(),
      relatedPlots: Array.isArray(o && o.relatedPlots) ? o.relatedPlots.filter(Boolean).map(String) : [],
    };
  }
  // 兼容两种调用：addItem({name,desc,owner,...}) 或 addItem(name, desc, owner)
  async function addItem(a, desc, owner) {
    const s = load();
    const data = (a && typeof a === 'object') ? normItem(a) : normItem({ name: a, desc, owner });
    const id = 'it_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    s.items.push(Object.assign({ id, ts: Date.now() }, data));
    await save(s);
    return id;
  }
  async function updateItem(id, patch) {
    const s = load();
    const it = s.items.find((x) => x.id === id);
    if (!it) return false;
    Object.assign(it, patch || {});
    if (patch && 'relatedPlots' in patch) it.relatedPlots = Array.isArray(patch.relatedPlots) ? patch.relatedPlots.map(String) : [];
    await save(s);
    return true;
  }
  async function removeItem(id) {
    const s = load();
    s.items = s.items.filter((x) => x.id !== id);
    await save(s);
  }
  function getItems() { return load().items; }

  // ── 剧情线（time=剧情内时间；列表按「最新在上」排序） ──
  function normPlot(o) {
    return {
      title: String((o && o.title) || '').trim(),
      summary: String((o && o.summary) || '').trim(),
      time: String((o && o.time) || '').trim(),
      status: (o && o.status) || 'active',
    };
  }
  // 兼容 addPlot({title,summary,time,status}) 或 addPlot(title, summary, status)
  async function addPlot(a, summary, status) {
    const s = load();
    const data = (a && typeof a === 'object') ? normPlot(a) : normPlot({ title: a, summary, status });
    const id = 'pl_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    s.plots.push(Object.assign({ id, ts: Date.now() }, data));
    await save(s);
    return id;
  }
  async function updatePlot(id, patch) {
    const s = load();
    const p = s.plots.find((x) => x.id === id);
    if (!p) return false;
    Object.assign(p, patch || {});
    await save(s);
    return true;
  }
  async function removePlot(id) {
    const s = load();
    s.plots = s.plots.filter((x) => x.id !== id);
    await save(s);
  }
  function getPlots() { return load().plots; }
  // 最新在上：优先按 ts 倒序（ts 相同则按插入顺序倒序）
  function getPlotsSorted() {
    const list = load().plots.slice();
    return list.map((p, i) => ({ p, i })).sort((A, B) => {
      const d = (B.p.ts || 0) - (A.p.ts || 0);
      return d !== 0 ? d : B.i - A.i;
    }).map((x) => x.p);
  }

  // ── 世界观 ──
  async function setWorld(text) { const s = load(); s.world = String(text || '').trim(); await save(s); }
  function getWorld() { return load().world; }

  // 世界元信息：名称 / 类型 / 简述
  function getWorldMeta() {
    const m = load().worldMeta || {};
    return { name: m.name || '', kind: m.kind || '', desc: m.desc || '' };
  }
  async function setWorldMeta(patch) {
    const s = load();
    s.worldMeta = Object.assign({ name: '', kind: '', desc: '' }, s.worldMeta || {}, patch || {});
    s.worldMeta.name = String(s.worldMeta.name || '').trim();
    s.worldMeta.kind = String(s.worldMeta.kind || '').trim();
    s.worldMeta.desc = String(s.worldMeta.desc || '').trim();
    await save(s);
  }

  // 世界设定分条
  function getWorldSections() { return load().worldSections || []; }
  async function addWorldSection(title, body) {
    const s = load();
    const id = 'ws_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    s.worldSections.push({ id, title: String(title || '').trim(), body: String(body || '').trim(), ts: Date.now() });
    await save(s);
    return id;
  }
  async function updateWorldSection(id, patch) {
    const s = load();
    const w = s.worldSections.find((x) => x.id === id);
    if (!w) return false;
    Object.assign(w, patch || {});
    await save(s);
    return true;
  }
  async function removeWorldSection(id) {
    const s = load();
    s.worldSections = s.worldSections.filter((x) => x.id !== id);
    await save(s);
  }

  // ── 关系 ──
  async function setRelations(rels) { const s = load(); s.relations = rels || []; await save(s); }
  function getRelations() { return load().relations; }

  // ── 总结指针（自动隐藏楼层用） ──
  async function setSummaryPointer(idx) { const s = load(); s.summaryPointer = idx; await save(s); }
  function getSummaryPointer() { return load().summaryPointer || 0; }

  // ── 导出 / 导入（备份防丢） ──
  function exportJSON() {
    const s = load();
    return JSON.stringify({ type: 'warmmemo_v2', exportedAt: Date.now(), data: s }, null, 2);
  }
  async function importJSON(text) {
    const obj = JSON.parse(text);
    const data = obj && obj.data ? obj.data : obj; // 兼容裸对象
    const base = emptyStore();
    const merged = Object.assign(base, data);
    await save(merged);
    return true;
  }

  // ── 清空当前角色卡全部数据（不可还原） ──
  // 1) chat_metadata 中的 warm_memo_v2 整体重置为空库；
  // 2) 把之前因总结而被隐藏的楼层（is_wm_hidden）恢复显示，不再隐藏；
  // 不影响全局设置（autoSummaryEnabled 等存在 localStorage，保留）。
  async function clearAll() {
    await save(emptyStore());
    // 反隐藏：清除所有被本扩展标记隐藏的消息标记
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
      const chat = ctx && ctx.chat;
      if (chat && Array.isArray(chat)) {
        let changed = false;
        for (const m of chat) {
          if (m && m.is_wm_hidden) {
            m.is_wm_hidden = false;
            m.is_system = false; // 仅去掉隐藏标记，不破坏其它 is_system（如系统提示）
            changed = true;
          }
        }
        if (changed) {
          if (typeof ctx.saveChat === 'function') await ctx.saveChat();
          if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
        }
      }
    } catch (e) { console.warn('[WarmMemo] 清空时恢复隐藏楼层失败', e); }
    return true;
  }

  WM.MemoryStore = {
    FIELD, emptyStore, load, save,
    addMemory, getMemories,
    addSummary, removeSummary, getSummaries,
    addItem, removeItem, getItems, updateItem,
    addPlot, updatePlot, removePlot, getPlots, getPlotsSorted,
    setWorld, getWorld,
    getWorldMeta, setWorldMeta,
    getWorldSections, addWorldSection, updateWorldSection, removeWorldSection,
    setRelations, getRelations,
    dispatchLorebook,
    setSummaryPointer, getSummaryPointer,
    exportJSON, importJSON, clearAll,
  };
})();
