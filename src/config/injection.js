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

    // 剧情线：最新在上，带剧情内时间（纯事件，无状态标签）
    const plotTitle = {};
    (s.plots || []).forEach((p) => { plotTitle[p.id] = p.title || p.time || p.id; });
    (s.plots || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).forEach((p) => {
      if (!p.title && !p.summary) return;
      cands.push({ id: p.id, type: '剧情', text: `${p.time ? '[' + p.time + '] ' : ''}${p.title || ''}\n${p.summary || ''}`.trim() });
    });

    // 物品：名称 / 作用 / 持有者 / 关联剧情
    (s.items || []).forEach((it) => {
      const rel = (it.relatedPlots || []).map((pid) => plotTitle[pid]).filter(Boolean);
      const lines = [`物品：${it.name}`];
      if (it.desc) lines.push(`作用：${it.desc}`);
      if (it.owner) lines.push(`持有者：${it.owner}`);
      if (it.origin) lines.push(`来历：${it.origin}`);
      if (rel.length) lines.push(`关联剧情：${rel.join('、')}`);
      cands.push({ id: it.id, type: '物品', text: lines.join('\n') });
    });

    const groups = WM.Relations && WM.Relations.groupByPerson ? WM.Relations.groupByPerson({ pairs: s.relations }) : [];
    groups.forEach((g) => cands.push({ id: 'relation::' + g.person, type: '关系', text: g.person + '的关系：' + g.text }));

    // 世界观总纲：世界名 + 类型 + 简述（兼容旧的纯文本 world）
    const wm = s.worldMeta || {};
    const head = [];
    if (wm.name) head.push(`世界名：${wm.name}`);
    if (wm.kind) head.push(`世界类型：${wm.kind}`);
    if (wm.desc) head.push(wm.desc);
    if (!head.length && s.world && s.world.trim()) head.push(s.world.trim());
    if (head.length) cands.push({ id: 'world::main', type: '世界观', text: head.join('\n') });

    // 世界设定分条
    (s.worldSections || []).forEach((w) => {
      if (!w.title && !w.body) return;
      cands.push({ id: w.id, type: '世界设定', text: `${w.title ? w.title + '\n' : ''}${w.body || ''}`.trim() });
    });

    return cands;
  }

  async function buildMemoryBlock() {
    const settings = WM.Settings.load();
    if (settings.injectMemories === false && settings.injectWorld === false) return '';

    // 楼层记忆块（不在世界书条目里，始终作为基础兜底）
    const mem = WM.MemoryStore.getMemories();
    let memBlock = '';
    if (settings.injectMemories !== false && mem.length) {
      let picked = mem;
      if (settings.vectorEnabled && WM.VectorStore && WM.VectorStore.lastQuery && WM.VectorStore.enabled) {
        // 注意：search 是异步的，必须 await，否则 picked 会是 Promise 导致后续 .map 出错
        picked = await WM.VectorStore.search(mem, WM.VectorStore.lastQuery, 12);
      } else {
        picked = mem.slice(-Math.min(20, mem.length));
      }
      memBlock = '【有温度的记忆（角色与用户共同经历的过往）】\n' + picked.map((m) => '· ' + (m.text || '')).join('\n');
    }

    const wbOk = WM.Worldbook && WM.Worldbook.available();
    const candidates = collectCandidates();
    // 统一用 worldbook.isTakeoverOn 作为接管判定真相源 —— 与 buildEntry 设 enabled=false 的条件完全一致，
    // 避免分裂导致「条目被禁用但温记没召回」的静默丢内容。
    const takeover = (WM.Worldbook && WM.Worldbook.isTakeoverOn) ? WM.Worldbook.isTakeoverOn() : false;

    // 情况 A：开启向量接管 → 用我们的 VectorStore 对候选召回 topK（真正替代酒馆原生向量检索）。
    // 关键点：接管模式下必须「跳过酒馆原生世界书召回」（情况 B），否则情况 B 会提前 return，
    // 导致温记自己的 embedding/rerank 永远不生效（这就是此前"假接管"的根因）。
    if (takeover) {
      const q = WM.VectorStore.lastQuery || '';
      const ranked = q ? await WM.VectorStore.search(candidates, q, settings.injectTopK || 8) : candidates.slice(-(settings.injectTopK || 8));
      const parts = [memBlock];
      if (settings.injectWorld !== false && ranked.length) {
        parts.push('【温记召回（向量接管·自家 embedding+rerank）】\n' + ranked.map((c) => '· [' + c.type + '] ' + c.text).join('\n'));
      }
      return parts.filter(Boolean).join('\n\n');
    }

    // 情况 B：未接管「且」世界书可用「且」用户开启拆分写入 → 条目由酒馆原生按 constant/keys 激活注入，
    // 本模块只兜底注入楼层记忆块。注意：wbOk 仅代表 API 可用，不代表有条目，必须看 worldToLorebook 开关。
    if (wbOk && settings.worldToLorebook !== false) {
      // 同时若开启了 rerank 接管，但内容走酒馆原生召回时无法插入我们的重排——因此 rerank 接管仅在情况 A 生效。
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

  // 把温记 block 拼进 chat 的 system 消息（去重：先清掉上一次注入残留）
  // 用唯一包裹标记（START/END）圈定本次注入范围，避免贪心正则误删温记块之后的其它 system 内容。
  const WM_BLOCK_START = '【温记·BEGIN】';
  const WM_BLOCK_END = '【温记·END】';
  function injectBlockIntoChat(chat, block) {
    if (!Array.isArray(chat) || !chat.length || !block) return chat;
    const sys = chat.find((m) => m && m.role === 'system');
    const wrapped = WM_BLOCK_START + '\n' + block + '\n' + WM_BLOCK_END;
    if (sys) {
      let c = sys.content || '';
      // 清掉上一次注入的温记块（精确匹配 START→END，不波及块外内容）
      if (c.indexOf(WM_BLOCK_START) >= 0) {
        c = c.replace(new RegExp(WM_BLOCK_START + '[\\s\\S]*?' + WM_BLOCK_END, 'g'), '').replace(/\n{3,}/g, '\n\n').trim();
      }
      sys.content = (c ? c + '\n\n' : '') + wrapped;
    } else {
      chat.unshift({ role: 'system', content: wrapped });
    }
    return chat;
  }

  // 从 chat 提取「当前用户最新输入」作为向量检索 query（真搜索的关键）
  function extractQueryFromChat(chat) {
    if (!Array.isArray(chat) || !chat.length) return '';
    const userMsgs = chat.filter((m) => m && m.role === 'user');
    const lastUser = userMsgs.length ? userMsgs[userMsgs.length - 1].content : '';
    return lastUser ? String(lastUser).slice(0, 2000) : '';
  }

  // 真正执行一次注入（被下面的 hook filter / eventSource 两路共用）
  async function doInject(chat) {
    try {
      const q = extractQueryFromChat(chat);
      if (q && WM.VectorStore) WM.VectorStore.lastQuery = q;
      const block = await buildMemoryBlock();
      if (!block) return chat;
      return injectBlockIntoChat(chat, block);
    } catch (e) {
      console.error('[WarmMemo] 注入失败', e);
      return chat;
    }
  }

  function init() {
    // 注入入口采用「双保险」：优先用酒馆官方过滤器钩子 window.hooks.addFilter，
    // 它能真正修改最终送出的 prompt（很多版本里 eventSource 的 PROMPT_READY 事件触发时 prompt 已冻结，
    // 仅靠 eventSource.on 改 event.detail.chat 不保证写回生效——这正是「接管无效」的根因）。
    let bound = false;

    // 入口 1：window.hooks.addFilter('chat_completion_prompt_ready', ...) —— 酒馆官方、最可靠的注入点
    try {
      if (window.hooks && typeof window.hooks.addFilter === 'function') {
        window.hooks.addFilter('chat_completion_prompt_ready', async (chat) => {
          // chat 形如 { type, chat: [...] } 或直接是 [...]；统一规整成数组
          const arr = Array.isArray(chat) ? chat : (chat && chat.chat && Array.isArray(chat.chat) ? chat.chat : null);
          if (!arr) return chat;
          const out = await doInject(arr);
          if (Array.isArray(chat)) return out;
          chat.chat = out;
          return chat;
        }, 1000);
        bound = true;
        console.log('[WarmMemo] 注入钩子已绑定：window.hooks.addFilter(chat_completion_prompt_ready)');
      }
    } catch (e) { console.warn('[WarmMemo] addFilter 绑定失败', e); }

    // 入口 2：eventSource 事件（双保险，覆盖无 hooks 的老版本）
    const ctx = getCtx();
    const es = ctx && ctx.eventSource;
    if (es && typeof es.on === 'function') {
      const readyEvent = getReadyEventName();
      es.on(readyEvent, async (event) => {
        const chat = event && event.detail && Array.isArray(event.detail.chat) ? event.detail.chat
          : (event && Array.isArray(event.chat) ? event.chat : null);
        if (!chat) return;
        const out = await doInject(chat);
        if (event && event.detail && Array.isArray(event.detail.chat)) event.detail.chat = out;
        if (event && Array.isArray(event.chat)) event.chat = out;
      });
      if (bound) console.log('[WarmMemo] 注入钩子已追加双保险：', readyEvent);
      else console.log('[WarmMemo] 注入钩子已绑定（仅 eventSource）：', readyEvent);
    } else if (!bound) {
      console.warn('[WarmMemo] 未找到任何可用的注入入口（hooks / eventSource 均不可用）');
    }
  }

  WM.Injection = { init, buildMemoryBlock, collectCandidates };
})();
