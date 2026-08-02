// 真实注入模块：监听 CHAT_COMPLETION_PROMPT_READY，把「有温度记忆」与「世界观设定」
// 注入到 system prompt，而非仅仅 setExtensionPrompt 静态插一次。
// 这是用户质疑「总结不加入上下文真的有做到吗」的回答：确实进入每次请求的上下文。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function buildMemoryBlock() {
    const settings = WM.Settings.load();
    const mem = WM.MemoryStore.getMemories();
    if (!mem.length && !WM.MemoryStore.getWorld()) return '';

    // 检索：若有向量则按相似度取 topN，否则取最近 N 条
    let picked = mem;
    if (settings.vectorEnabled && WM.VectorStore && WM.VectorStore.lastQuery) {
      picked = WM.VectorStore.search(mem, WM.VectorStore.lastQuery, 12);
    } else {
      picked = mem.slice(-Math.min(20, mem.length));
    }

    let block = '【有温度的记忆（角色与用户共同经历的过往）】\n';
    block += picked.map((m) => '· ' + m.text).join('\n');
    const world = WM.MemoryStore.getWorld();
    if (world) {
      block += '\n\n【当前世界观设定】\n' + world;
    }
    const items = WM.MemoryStore.getItems();
    if (items.length) {
      block += '\n\n【物品/持有物追踪】\n' + items.map((i) => `· ${i.name}（${i.owner || '未知'}）：${i.desc}`).join('\n');
    }
    return block;
  }

  function init() {
    const es = (window.eventSource && window.eventSource.eventNames)
      ? window.eventSource
      : (window.SillyTavern && window.SillyTavern.eventSource);
    if (!es || typeof es.on !== 'function') {
      console.warn('[WarmMemo] 未找到 eventSource，注入不可用');
      return;
    }
    const readyEvent = (window.eventSource && window.eventSource.eventNames)
      ? window.eventSource.eventNames.CHAT_COMPLETION_PROMPT_READY
      : 'CHAT_COMPLETION_PROMPT_READY';

    es.on(readyEvent, (event) => {
      try {
        const block = buildMemoryBlock();
        if (!block) return;
        // event.detail.chat 即本次请求的 messages；把记忆写进 system 末尾
        const chat = event.detail && event.detail.chat;
        if (!Array.isArray(chat) || !chat.length) return;
        const sys = chat.find((m) => m.role === 'system');
        if (sys) {
          sys.content = (sys.content || '') + '\n\n' + block;
        } else {
          chat.unshift({ role: 'system', content: block });
        }
      } catch (e) {
        console.error('[WarmMemo] 注入失败', e);
      }
    });
  }

  WM.Injection = { init, buildMemoryBlock };
})();
