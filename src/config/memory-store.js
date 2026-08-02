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
      items: [],      // 物品追踪 [{id, name, desc, owner, ts}]
      plots: [],      // 剧情线 [{id, title, summary, ts, status:'active'|'done'|'abandon'}]
      world: '',      // 世界观设定文本
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
      return Object.assign(base, obj);
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

  // ── 物品 ──
  async function addItem(name, desc, owner) {
    const s = load();
    s.items.push({ id: 'it_' + Date.now(), name: String(name).trim(), desc: String(desc || '').trim(), owner: String(owner || '').trim(), ts: Date.now() });
    await save(s);
  }
  async function updateItem(id, patch) {
    const s = load();
    const it = s.items.find((x) => x.id === id);
    if (it) Object.assign(it, patch);
    await save(s);
  }
  async function removeItem(id) {
    const s = load();
    s.items = s.items.filter((x) => x.id !== id);
    await save(s);
  }
  function getItems() { return load().items; }

  // ── 剧情线 ──
  async function addPlot(title, summary, status) {
    const s = load();
    s.plots.push({ id: 'pl_' + Date.now(), title: String(title).trim(), summary: String(summary || '').trim(), status: status || 'active', ts: Date.now() });
    await save(s);
  }
  async function updatePlot(id, patch) {
    const s = load();
    const p = s.plots.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    await save(s);
  }
  async function removePlot(id) {
    const s = load();
    s.plots = s.plots.filter((x) => x.id !== id);
    await save(s);
  }
  function getPlots() { return load().plots; }

  // ── 世界观 ──
  async function setWorld(text) { const s = load(); s.world = String(text || '').trim(); await save(s); }
  function getWorld() { return load().world; }

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

  WM.MemoryStore = {
    FIELD, emptyStore, load, save,
    addMemory, getMemories,
    addItem, updateItem, removeItem, getItems,
    addPlot, updatePlot, removePlot, getPlots,
    setWorld, getWorld,
    setRelations, getRelations,
    setSummaryPointer, getSummaryPointer,
    exportJSON, importJSON,
  };
})();
