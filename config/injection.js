// 真实注入模块：监听 CHAT_COMPLETION_PROMPT_READY，把「有温度记忆」与「世界观设定」
// 注入到 system prompt。基于真实酒馆 API（见 lolocard-master @types）：
//   - 事件名来自 ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY = 'chat_completion_prompt_ready'
//   - event.detail.chat = SendingMessage[]，可直接改写 system 内容
// 这是用户质疑「总结不加入上下文真的有做到吗」的回答：确实进入每次请求的上下文。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function getCtx() {
    return window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
  }

  function getReadyEventName() {
    const ctx = getCtx();
    // 真实：ctx.eventTypes === tavern_events，含 CHAT_COMPLETION_PROMPT_READY
    if (ctx && ctx.eventTypes && ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY) {
      return ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY;
    }
    if (window.tavern_events && window.tavern_events.CHAT_COMPLETION_PROMPT_READY) {
      return window.tavern_events.CHAT_COMPLETION_PROMPT_READY;
    }
    return 'chat_completion_prompt_ready'; // 兜底常量
  }

  function buildMemoryBlock() {
    const settings = WM.Settings.load();
    if (settings.injectMemories === false && settings.injectWorld === false) return '';
    const mem = WM.MemoryStore.getMemories();
    const world = WM.MemoryStore.getWorld();
    const items = WM.MemoryStore.getItems();
    if (!mem.length && !world && !items.length) return '';

    // 检索：向量可用且最近有查询 → 向量 topK；否则最近 N 条；最终混合去重
    let picked = mem;
    if (settings.vectorEnabled && WM.VectorStore && WM.VectorStore.lastQuery && WM.VectorStore.enabled) {
      picked = WM.VectorStore.search(mem, WM.VectorStore.lastQuery, 12);
    } else {
      picked = mem.slice(-Math.min(20, mem.length));
    }

    const parts = [];
    if (settings.injectMemories !== false && picked.length) {
      parts.push('【有温度的记忆（角色与用户共同经历的过往）】\n' + picked.map((m) => '· ' + m.text).join('\n'));
    }
    if (settings.injectWorld !== false && world) {
      parts.push('【当前世界观设定】\n' + world);
    }
    if (settings.injectMemories !== false && items.length) {
      parts.push('【物品/持有物追踪】\n' + items.map((i) => `· ${i.name}（${i.owner || '未知'}）：${i.desc}`).join('\n'));
    }
    return parts.join('\n\n');
  }

  function init() {
    const ctx = getCtx();
    const es = ctx && ctx.eventSource;
    if (!es || typeof es.on !== 'function') {
      console.warn('[WarmMemo] 未找到 ctx.eventSource，注入不可用');
      return;
    }
    const readyEvent = getReadyEventName();
    es.on(readyEvent, (event) => {
      try {
        const block = buildMemoryBlock();
        if (!block) return;
        const chat = event && event.detail && event.detail.chat;
        if (!Array.isArray(chat) || !chat.length) return;
        const sys = chat.find((m) => m.role === 'system');
        if (sys) {
          if (sys.content && sys.content.includes('【有温度的记忆')) {
            // 防止重复追加（同一请求多次触发）
            sys.content = sys.content.replace(/【有温度的记忆[\s\S]*$/, '') + '\n\n' + block;
          } else {
            sys.content = (sys.content || '') + '\n\n' + block;
          }
        } else {
          chat.unshift({ role: 'system', content: block });
        }
      } catch (e) {
        console.error('[WarmMemo] 注入失败', e);
      }
    });
    console.log('[WarmMemo] 注入钩子已绑定：', readyEvent);
  }

  WM.Injection = { init, buildMemoryBlock };
})();
