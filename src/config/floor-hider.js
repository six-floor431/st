// 楼层隐藏：总结后把指针之前的楼层标记隐藏，不进入上下文
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 将一段楼层区间标记为隐藏（is_system=true 使酒馆不发送；is_wm_hidden 便于 UI 识别）
  async function applySummaryPointerHiding(summaryPointer, settings) {
    if (!summaryPointer || summaryPointer <= 0) return 'no_pointer';
    const ctx = window.SillyTavern ? window.SillyTavern.getContext() : null;
    if (!ctx || !ctx.chat) return 'no_context';
    const chat = ctx.chat;
    if (summaryPointer > chat.length) return 'stale_pointer';

    const delay = (settings && settings.summaryDelay) || 2;
    const dialogueCount = chat.filter((m) => m && !m.is_system).length;
    if (dialogueCount < summaryPointer + delay) return 'summary_delay';

    for (let i = 0; i < summaryPointer; i++) {
      const m = chat[i];
      // 只隐藏「对话消息」（user/assistant），绝不隐藏酒馆自身的 system 消息，避免破坏角色卡/系统提示。
      // 已隐藏的跳过，避免重复写。
      if (m && !m.is_user && !m.is_system && !m.is_wm_hidden) {
        m.is_original_system = false; // 标记：原本不是 system，反隐藏时可安全恢复
        m.is_system = true;
        m.is_wm_hidden = true;
      }
    }
    if (ctx.saveChat && typeof ctx.saveChat === 'function') ctx.saveChat();
    if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
    return 'hidden';
  }

  // 隐藏直到指定楼层（含）：总结后调用，hideUntil(lastIndex)
  async function hideUntil(lastIndex, settings) {
    if (lastIndex == null || lastIndex < 0) return 'invalid';
    return applySummaryPointerHiding(lastIndex + 1, settings);
  }

  WM.FloorHider = { applySummaryPointerHiding, hideUntil };
})();
