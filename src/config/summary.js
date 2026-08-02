// 总结模块（真实调用）：
// - 真实向 LLM 发送「近期对话 + 角色卡 + 用户卡 + 世界书 + 现有总结」，产出有温度的记忆。
// - 不做假：调用 WM.LLMClient（独立模型直连，失败回退酒馆 shared-api）。
// - 总结后分派：关系抽取、剧情线更新、世界观推断、物品抽取。
// - 记忆只存 chat_metadata（不进上下文），按需经 injection 注入。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 统一的 LLM 调用入口（供 relations/plot/worldbook/items 复用）
  // 真实调用：直接 await LLMClient.complete，失败则抛出明确错误（不伪装成功）。
  async function callLLM(system, user, settings, opts) {
    settings = settings || WM.Settings.load();
    opts = opts || {};
    const prompt = [{ role: 'system', content: system }, { role: 'user', content: user }];
    const out = await WM.LLMClient.complete(prompt, {
      temperature: opts.temperature != null ? opts.temperature : 0.3,
      max_tokens: opts.maxTokens || 700,
      model: settings.summaryModel || '',
      settings,
    });
    return out || '';
  }

  // 记忆去重：若新记忆与已有记忆高度相似则合并（覆盖旧文本），否则新增
  function dedupeMemory(text, range) {
    const s = WM.MemoryStore.load();
    const t = text.trim();
    const sim = s.memories.find((m) => m.text === t || m.text.includes(t) || t.includes(m.text));
    if (sim) {
      sim.text = t; // 更新为更完整的表述
      sim.ts = Date.now();
      if (range) sim.range = range;
      WM.MemoryStore.save(s);
      return sim.id;
    }
    return WM.MemoryStore.addMemory(t, range);
  }

  // 抓取对话楼层文本
  function getChatMessages() {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      const msgs = (ctx && ctx.chat) || [];
      return msgs.map((m, i) => ({ index: i, name: m.name || (m.is_user ? '用户' : '角色'), text: m.mes || '' }));
    } catch (e) { return []; }
  }

  // 主总结流程：从 startFloor 到 endFloor（含）的楼层
  async function runSummary(settings, range) {
    settings = settings || WM.Settings.load();
    const msgs = getChatMessages();
    if (!msgs.length) return { ok: false, reason: 'no_messages' };

    let start = range && range.start != null ? range.start : WM.MemoryStore.getSummaryPointer();
    let end = range && range.end != null ? range.end : msgs.length - 1;
    start = Math.max(0, start); end = Math.min(msgs.length - 1, end);
    if (end < start) return { ok: false, reason: 'empty_range' };

    const slice = msgs.slice(start, end + 1).map((m) => `${m.name}：${m.text}`).join('\n');
    const prevMem = WM.MemoryStore.getMemories().slice(-20).map((m) => m.text).join('\n');

    // 客观读取角色卡/用户卡/世界书（用户需求 3）
    const char = (WM.Worldbook.getCharacterCard && WM.Worldbook.getCharacterCard()) || {};
    const user = (WM.Worldbook.getUserCard && WM.Worldbook.getUserCard()) || {};
    const lore = (WM.Worldbook.getLorebookEntries && WM.Worldbook.getLorebookEntries()) || [];
    const loreTxt = lore.length ? lore.map((l) => `· ${l.key}: ${l.content.slice(0, 160)}`).join('\n') : '（无）';

    const sys = `你是有温度的记忆整理者。请基于【角色设定】【用户设定】【世界书】【已有记忆】与【新对话】，提炼「有温度记忆」。
要求：
- 用第三人称、客观但有温度的口吻，记录角色与用户之间发生的关键事件、情感互动、约定、细节、性格展现。
- 重点保留：人物关系变化、重要约定、关键物品、剧情进展、角色情绪与性格细节。
- 不要复述无关寒暄；不要编造未发生的；与已有记忆冲突以新对话为准。
- 输出若干条，每条一行；不要加序号前缀外的格式。`;

    let userMsg = `【角色设定】${char.name || '未知'}：${char.description || ''} | 性格：${char.personality || ''}\n`;
    userMsg += `【用户设定】${user.name || '未知'}：${user.description || ''}\n`;
    userMsg += `【世界书】${loreTxt}\n`;
    userMsg += `【已有记忆】\n${prevMem || '（无）'}\n\n`;
    userMsg += `【新对话（楼层 ${start}-${end}）】\n${slice}\n\n请输出本次提炼的记忆：`;

    const out = await callLLM(sys, userMsg, settings, { maxTokens: 1000, temperature: 0.35 });
    if (!out || !out.trim()) return { ok: false, reason: 'llm_empty_or_failed' };

    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) await dedupeMemory(line, [start, end]);

    // 本次总结作为「独立一段」存档（不与其它段落挤在一起），并写入独立世界书条目
    const dateLabel = new Date().toLocaleString('zh-CN');
    await WM.MemoryStore.addSummary(out, 'summary', dateLabel);

    // 更新总结指针（用于自动隐藏已处理楼层）
    await WM.MemoryStore.setSummaryPointer(end + 1);

    // 分派子任务（真实调用，失败抛错由上层捕获显示）
    const results = { relations: 0, plots: 0, world: false, items: 0 };
    if (settings.autoRelation) {
      try {
        const rels = await WM.Relations.extractRelations(lines.join('\n'), settings);
        results.relations = rels.length;
        const merged = WM.Relations.mergeRelations(WM.MemoryStore.getRelations(), rels);
        await WM.MemoryStore.setRelations(merged);
      } catch (e) { results.relationsErr = e.message; }
    }
    if (settings.autoPlot) {
      try {
        const plots = await WM.Plot.extractPlots(settings);
        if (plots.length) {
          const s = WM.MemoryStore.load();
          s.plots = plots.map((p) => ({ id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title: p.title, summary: p.summary, status: p.status, ts: Date.now() }));
          await WM.MemoryStore.save(s);
          // 每条剧情线作为独立「剧情摘要」存档（分开，不挤在一起）
          for (const p of plots) await WM.MemoryStore.addSummary(p.summary, 'plot', p.title);
          results.plots = plots.length;
        }
      } catch (e) { results.plotsErr = e.message; }
    }
    if (settings.autoWorld) {
      try {
        const world = await WM.Worldbook.inferWorldview(settings);
        if (world) { await WM.MemoryStore.setWorld(world); results.world = true; }
      } catch (e) { results.worldErr = e.message; }
    }
    if (settings.autoItems) {
      try {
        const items = await extractItems(settings, lines.join('\n'));
        if (items.length) { for (const it of items) await WM.MemoryStore.addItem(it.name, it.desc, it.owner); results.items = items.length; }
      } catch (e) { results.itemsErr = e.message; }
    }

    return { ok: true, count: lines.length, range: [start, end], results };
  }

  // 物品抽取（从记忆+对话中识别获得/失去/持有的物品）
  async function extractItems(settings, text) {
    const msgs = getChatMessages();
    const recent = msgs.slice(-30).map((m) => `${m.name}：${m.text}`).join('\n');
    const sys = `从对话中识别【物品/道具/持有物】的新增或状态变化。每行一条，格式：物品名|描述|持有者/所属。
只列明确提到的；无则输出空。最多 12 条。`;
    try {
      const raw = await callLLM(sys, `【近期对话】\n${recent}\n【本批记忆】\n${text}\n\n请列出物品：`, settings, { maxTokens: 500 });
      if (!raw) return [];
      return raw.split('\n').map((l) => l.trim()).filter((l) => l.includes('|')).map((l) => {
        const [name, desc, owner] = l.split('|').map((x) => x.trim());
        return name ? { name, desc: desc || '', owner: owner || '' } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  WM.Summary = { callLLM, runSummary, getChatMessages, extractItems };
})();
