// 楼层隐藏：总结/剧情线推进后，把指针之前的楼层标记隐藏，不进入 LLM 对话上下文。
// 参考 @types/function/chat_message.d.ts：官方隐藏字段是 is_hidden（对 user/assistant/system 均有效）。
// 旧实现只用 is_system，对 user 楼层可能无效（酒馆内部强制 user 进上下文），且条件含 !m.is_user
// 直接导致 user 楼层永远不隐藏 —— 这是「已总结楼层仍进上下文」的根因。
// 现采用三重保险：is_hidden（官方，主）+ is_system（assistant 兜底）+ is_wm_hidden（本扩展标记，便于反隐藏）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function helper() { return window.TavernHelper; }

  // 将一段楼层区间标记为隐藏。summaryPointer 为 0-indexed 指针，隐藏 0..summaryPointer-1 的对话楼层。
  async function applySummaryPointerHiding(summaryPointer, settings) {
    if (!summaryPointer || summaryPointer <= 0) return 'no_pointer';
    const ctx = window.SillyTavern ? window.SillyTavern.getContext() : null;
    if (!ctx || !ctx.chat) return 'no_context';
    const chat = ctx.chat;
    if (summaryPointer > chat.length) return 'stale_pointer';

    // 收集要隐藏的楼层索引：所有「未被本扩展隐藏过」且「原本不是酒馆 system 消息」的楼层。
    // 关键修复：去掉旧条件里的 !m.is_user —— user 楼层同样要隐藏，否则 user 发言仍进上下文。
    // 保留 !m.is_system：不动酒馆自身的 system 消息（开局/作者注释/系统插入），避免破坏角色卡。
    const toHide = [];
    for (let i = 0; i < summaryPointer; i++) {
      const m = chat[i];
      if (m && !m.is_system && !m.is_wm_hidden) toHide.push(i);
    }
    if (!toHide.length) return 'already';

    // 路径 1（优先）：酒馆助手官方 setChatMessages API 设 is_hidden=true。
    //   这是对 user/assistant/system 均可靠的隐藏方式（见 chat_message.d.ts 示例）。
    //   refresh:'affected' 让酒馆 UI 立即折叠/隐藏这些楼层（用户要求：本地酒馆也要隐藏，不只是不进上下文）。
    let apiOk = false;
    try {
      const h = helper();
      if (h && typeof h.setChatMessages === 'function') {
        await h.setChatMessages(
          toHide.map((id) => ({ message_id: id, is_hidden: true })),
          { refresh: 'affected' }
        );
        apiOk = true;
      }
    } catch (e) { console.warn('[WarmMemo] setChatMessages 隐藏失败，回退直接改 chat:', e); }

    // 路径 2（补充/回退）：直接改 ctx.chat，设三重标记。
    //   - is_wm_hidden：本扩展标记，clearAll 反隐藏时按它识别（无论 API 是否成功都要设）。
    //   - is_hidden / is_system：API 失败时在这里兜底；API 成功时 setChatMessages 已设 is_hidden，
    //     这里再设一次 is_system 作为 assistant 楼层的双保险，并记录 is_original_system 便于恢复。
    for (const i of toHide) {
      const m = chat[i];
      m.is_original_system = false;        // 标记：原本不是 system，反隐藏时可安全恢复
      if (!apiOk) {
        m.is_system = true;                // 官方 API 不可用时，用 is_system 兜底（对 assistant 有效）
        m.is_hidden = true;                // 同时设 is_hidden，兼容支持该字段的酒馆版本
      }
      m.is_wm_hidden = true;               // 本扩展标记，始终设置
    }
    if (typeof ctx.saveChat === 'function') {
      try { await ctx.saveChat(); } catch (e) { console.warn('[WarmMemo] saveChat 失败:', e); }
    }
    // UI 刷新双保险：refresh:'affected' 理论上已更新显示，但部分酒馆版本/皮肤下可能不生效，
    // 无条件再调一次 showChat() 强制重渲染，确保楼层在界面上真正隐藏（用户核心诉求）。
    try {
      const showChat = (ctx && typeof ctx.showChat === 'function') ? ctx.showChat
        : (window.SillyTavern && typeof window.SillyTavern.showChat === 'function') ? window.SillyTavern.showChat : null;
      if (showChat) showChat();
    } catch (e) {}
    if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
    return 'hidden';
  }

  // 隐藏直到指定楼层（含）：总结/剧情线推进后调用，hideUntil(lastIndex)
  // lastIndex 为 1-based 楼层号（如 range[1]=3 表示已处理到第 3 层）。
  // 要隐藏的是第 1..lastIndex 层，对应 0-indexed 的 0..lastIndex-1，
  // 故传给 applySummaryPointerHiding 的指针应为 lastIndex（循环条件 i < lastIndex）。
  async function hideUntil(lastIndex, settings) {
    if (lastIndex == null || lastIndex < 0) return 'invalid';
    return applySummaryPointerHiding(lastIndex, settings);
  }

  // 反隐藏：清除本扩展标记的隐藏状态（clearAll 时调用）
  async function unhideAll() {
    const ctx = window.SillyTavern ? window.SillyTavern.getContext() : null;
    if (!ctx || !ctx.chat) return false;
    const chat = ctx.chat;
    const toRestore = [];
    for (let i = 0; i < chat.length; i++) {
      const m = chat[i];
      if (m && m.is_wm_hidden) toRestore.push(i);
    }
    if (!toRestore.length) return false;

    // 路径 1：官方 API 恢复 is_hidden=false，refresh:'affected' 让 UI 立即重新显示这些楼层
    try {
      const h = helper();
      if (h && typeof h.setChatMessages === 'function') {
        await h.setChatMessages(
          toRestore.map((id) => ({ message_id: id, is_hidden: false })),
          { refresh: 'affected' }
        );
      }
    } catch (e) { console.warn('[WarmMemo] setChatMessages 反隐藏失败:', e); }

    // 路径 2：直接改 chat，清本扩展标记 + 恢复 is_system
    for (const i of toRestore) {
      const m = chat[i];
      m.is_wm_hidden = false;
      // 仅恢复「被本扩展临时置为 system」的消息；原本就是 system 的不动（is_original_system=false 表示原本非 system）
      if (!m.is_original_system) {
        m.is_system = false;
        m.is_hidden = false;
      }
    }
    if (typeof ctx.saveChat === 'function') {
      try { await ctx.saveChat(); } catch (e) {}
    }
    // 反隐藏同样需要 showChat 刷新 UI，否则楼层仍处于隐藏状态
    try {
      const showChat = (ctx && typeof ctx.showChat === 'function') ? ctx.showChat
        : (window.SillyTavern && typeof window.SillyTavern.showChat === 'function') ? window.SillyTavern.showChat : null;
      if (showChat) showChat();
    } catch (e) {}
    if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
    return true;
  }

  WM.FloorHider = { applySummaryPointerHiding, hideUntil, unhideAll };
})();
