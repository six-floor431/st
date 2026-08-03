// 错误日志模块：集中收集所有功能（总结/关系/剧情/世界观/物品/世界书）运行时抛出的错误与 bug。
// 数据存 chat_metadata（与记忆同槽位，按对话隔离），并在设置「错误报告」二级标签中展示。
// 提供 add/get/clear/last 接口，供各模块在 catch 中上报。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  const FIELD = 'warm_memo_errors_v1';
  const MAX = 200;

  function getMeta() {
    const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
    const md = ctx && ctx.chatMetadata;
    if (md && typeof md === 'object' && !Array.isArray(md)) return md;
    return null;
  }

  function load() {
    const md = getMeta();
    const raw = md && md[FIELD];
    if (!raw) return [];
    try { return Array.isArray(raw) ? raw : (Array.isArray(raw.list) ? raw.list : []); }
    catch (e) { return []; }
  }

  async function persist(list) {
    const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
    if (!ctx || !ctx.updateChatMetadata) { console.error('[WarmMemo] 错误日志无法持久化：无 updateChatMetadata'); return; }
    try { ctx.updateChatMetadata({ [FIELD]: list.slice(-MAX) }, false); if (typeof ctx.saveMetadata === 'function') await ctx.saveMetadata(); }
    catch (e) { console.error('[WarmMemo] 错误日志持久化失败', e); }
  }

  // 上报一条错误。scope 用于区分来源（summary/relations/plot/worldview/items/worldbook/llm...）
  // 返回登记的错误对象（含 id 与 ts），方便上层弹窗引用。
  async function add(scope, err, extra) {
    const item = {
      id: 'err_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      ts: Date.now(),
      scope: scope || 'unknown',
      message: (err && err.message) ? err.message : String(err || '未知错误'),
      stack: (err && err.stack) ? String(err.stack).slice(0, 2000) : '',
      extra: extra || null,
    };
    const list = load();
    list.push(item);
    if (list.length > MAX) list.splice(0, list.length - MAX);
    await persist(list);
    console.error('[WarmMemo][' + (scope || 'unknown') + ']', item.message, item.extra || '');
    return item;
  }

  function get() { return load().slice().reverse(); } // 最新在前
  async function clear() { await persist([]); }
  function last() { const l = load(); return l.length ? l[l.length - 1] : null; }

  WM.ErrLog = { add, get, clear, last };
})();
