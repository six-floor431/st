// 剧情线模块：从记忆自动抽取剧情进展，维护多条剧情线（标题/摘要/状态），
// 用 LLM 归纳，存 chat_metadata，可手动增删改。可视化由 UI 渲染成时间线。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  async function extractPlots(settings) {
    const memories = WM.MemoryStore.getMemories();
    const recent = memories.slice(-40).map((m) => m.text).join('\n');
    const existing = WM.MemoryStore.getPlots().map((p) => `· ${p.title}（${p.status}）：${p.summary}`).join('\n');
    if (!recent.trim()) return [];
    const sys = `从「有温度记忆」中归纳当前的【剧情线】。
要求：最多 8 条仍在推进或重要的剧情线。每行一条，格式严格为：
标题|进展摘要|状态(active/done/abandon)
状态说明：active=进行中, done=已完成, abandon=已放弃。已有剧情线若已结束请改状态。只基于记忆，不编造。`;
    const userMsg = `【已有剧情线】\n${existing || '（无）'}\n\n【近期记忆】\n${recent}\n\n请输出更新后的剧情线：`;
    try {
      const raw = await WM.Summary.callLLM(sys, userMsg, settings, { maxTokens: 900 });
      if (!raw) return [];
      return raw.split('\n').map((l) => l.trim()).filter((l) => l.includes('|')).map((l) => {
        const [title, summary, status] = l.split('|').map((x) => x.trim());
        return title ? { title, summary: summary || '', status: ['active', 'done', 'abandon'].includes(status) ? status : 'active' } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  WM.Plot = { extractPlots };
})();
