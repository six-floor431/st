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
    const tpl = (settings && settings.prompts && settings.prompts.plot) ||
      '你是剧情梳理者。请基于【关系】和【最近对话】，梳理当前剧情主线、支线、悬念与下一步可能发展。输出条目，每条一行。\n\n【关系】\n{{relations}}\n\n【最近对话】\n{{recent}}';
    const sys = WM.Summary.fillTemplate(tpl, { recent, relations: existing });
    const userMsg = `【已有剧情线】\n${existing || '（无）'}\n\n【近期记忆】\n${recent}\n\n请输出更新后的剧情线：`;
    try {
      const raw = await WM.Summary.callLLM(sys, userMsg, settings, {});
      if (!raw) return [];
      return raw.split('\n').map((l) => l.trim()).filter((l) => l.includes('|')).map((l) => {
        const [title, summary, status] = l.split('|').map((x) => x.trim());
        return title ? { title, summary: summary || '', status: ['active', 'done', 'abandon'].includes(status) ? status : 'active' } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  WM.Plot = { extractPlots };
})();
