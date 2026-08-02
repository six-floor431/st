// 真实注入模块：监听 CHAT_COMPLETION_PROMPT_READY，把记忆/总结/物品/关系/世界观注入上下文。
// 注入策略（用户需求：通过世界书注入 + 可接管酒馆向量/重排序）：
//   - 若开启接管(takeoverEmbedding)：用我们自己的 VectorStore(embedding+cosine) + 可选 Rerank 对内容召回 topK 注入；
//   - 若未接管且世界书可用：世界书条目由酒馆原生按 constant/keys 激活注入，本模块只兜底注入「楼层记忆块」；
//   - 若世界书不可用：回退为把所有内容拼成文本注入（保证不丢）。
// 数据隔离已由 chat_metadata 保证（每个角色卡/对话独立）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function getCtx() {
    return window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
  }

  function getReadyEventName() {
    const ctx = getCtx();
    if (ctx && ctx.eventTypes && ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY) {
      return ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY;
    }
    if (window.tavern_events && window.tavern_events.CHAT_COMPLETION_PROMPT_READY) {
      return window.tavern_events.CHAT_COMPLETION_PROMPT_READY;
    }
    return 'chat_completion_prompt_ready';
  }

  // 收集所有「可注入内容候选」（每段总结/每个物品/每组关系/世界观，各自独立，不挤在一起）
  function collectCandidates() {
    const s = WM.MemoryStore.load();
    const cands = [];
    s.summaries.forEach((sm) => cands.push({ id: sm.id, type: sm.kind === 'plot' ? '剧情摘要' : '总结', text: sm.title + '\n' + sm.text }));
    s.items.forEach((it) => cands.push({ id: it.id, type: '物品', text: `物品：${it.name}${it.owner ? '（持有者：' + it.owner + '）' : ''}\n${it.desc || ''}` }));
    const groups = WM.Relations && WM.Relations.groupByPerson ? WM.Relations.groupByPerson({ pairs: s.relations }) : [];
    groups.forEach((g) => cands.push({ id: 'relation::' + g.person, type: '关系', text: g.person + '的关系：' + g.text }));
    if (s.world && s.world.trim()) cands.push({ id: 'world::main', type: '世界观', text: s.world });
    return cands;
  }

  function buildMemoryBlock() {
    const settings = WM.Settings.load();
    if (settings.injectMemories === false && settings.injectWorld === false) return '';

    // 楼层记忆块（不在世界书条目里，始终作为基础兜底）
    const mem = WM.MemoryStore.getMemories();
    let memBlock = '';
    if (settings.injectMemories !== false && mem.length) {
      let picked = mem;
      if (settings.vectorEnabled && WM.VectorStore && WM.VectorStore.lastQuery && WM.VectorStore.enabled) {
        picked = WM.VectorStore.search(mem, WM.VectorStore.lastQuery, 12);
      } else {
        picked = mem.slice(-Math.min(20, mem.length));
      }
      memBlock = '【有温度的记忆（角色与用户共同经历的过往）】\n' + picked.map((m) => '· ' + (m.text || '')).join('\n');
    }

    const wbOk = WM.Worldbook && WM.Worldbook.available();
    const candidates = collectCandidates();

    // 情况 A：开启向量接管 → 用我们的 VectorStore 对候选召回 topK（替代酒馆原生向量检索）
    if (settings.takeoverEmbedding && settings.vectorEnabled && WM.VectorStore) {
      const q = WM.VectorStore.lastQuery || '';
      const ranked = q ? WM.VectorStore.search(candidates, q, settings.injectTopK || 8) : candidates.slice(-(settings.injectTopK || 8));
      const parts = [memBlock];
      if (settings.injectMemories !== false && ranked.length) {
        parts.push('【温记召回（向量接管）】\n' + ranked.map((c) => '· [' + c.type + '] ' + c.text).join('\n'));
      }
      return parts.filter(Boolean).join('\n\n');
    }

    // 情况 B：世界书可用「且」用户开启了拆分写入世界书 → 条目由酒馆原生按 constant/keys 激活注入，
    // 本模块只兜底注入楼层记忆块。注意：wbOk 仅代表 API 可用，不代表有条目，必须看 worldToLorebook 开关。
    if (wbOk && settings.worldToLorebook !== false) {
      return memBlock; // 世界书条目由酒馆自己注入
    }

    // 情况 C：世界书不可用（纯兜底）→ 拼接全部候选到 prompt，保证内容不丢。
    // 注意：候选拼接只受 injectWorld 控制（结构化内容含总结/物品/关系/世界观），
    // 与 injectMemories 无关（memBlock 已单独处理），避免某个开关关掉就整段丢失。
    const parts = [memBlock];
    if (settings.injectWorld !== false && candidates.length) {
      parts.push('【温记内容（世界书不可用，已兜底注入）】\n' + candidates.map((c) => '· [' + c.type + '] ' + c.text).join('\n'));
    }
    return parts.filter(Boolean).join('\n\n');
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
            sys.content = sys.content.replace(/【有温度的记忆[\s\S]*$/, '') + '\n\n' + block;
          } else if (sys.content && sys.content.includes('【温记')) {
            sys.content = sys.content.replace(/【温记[\s\S]*$/, '') + '\n\n' + block;
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

  WM.Injection = { init, buildMemoryBlock, collectCandidates };
})();
