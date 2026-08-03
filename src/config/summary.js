// 总结模块：自动总结 + 关系/剧情/世界观/物品 并行提炼。
// 设计：callLLM 带失败重试（3 次，间隔 1 秒）；总结完成后并行调用其余提示词；
// 全部失败时收集错误并上报 ErrLog + 弹窗。支持「消息数」与「楼层区间」两种自动模式。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 占位符替换：支持 {{recent}} {{historySummary}} {{relations}} {{plot}} {{world}}
  function fillTemplate(tpl, data) {
    if (!tpl) return '';
    return String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, k) {
      return data && data[k] != null ? String(data[k]) : '';
    });
  }

  // 取得最近 N 条原始对话（用于总结）
  function getRecentMessages(n) {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
      const chat = ctx && ctx.chat;
      if (!Array.isArray(chat)) return [];
      const sliced = chat.slice(-(n || 40));
      return sliced.map((m) => ({
        role: m.is_user ? 'user' : 'assistant',
        content: m.mes || '',
        name: m.name || '',
      }));
    } catch (e) { return []; }
  }

  // 把消息转成 LLM 输入格式
  function toMessages(msgs) {
    return msgs.map((m) => ({
      role: m.role,
      content: (m.name ? '【' + m.name + '】' : '') + m.content,
    }));
  }

  // 带重试的 LLM 调用：失败重试 3 次，指数退避（1s→2s→4s）
  async function callLLM(systemText, userText, settings, opts) {
    opts = opts || {};
    const maxRetry = opts.maxRetry != null ? opts.maxRetry : 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        const out = await WM.LLMClient.complete(systemText, userText, settings, opts);
        const text = (out && out.trim && out.trim()) || '';
        if (!text) throw new Error('模型返回空内容');
        return text;
      } catch (e) {
        lastErr = e;
        if (attempt < maxRetry) {
          // 指数退避，避免 LLM 长时间挂起时卡死
          const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          if (WM.ErrLog) await WM.ErrLog.add('llm', e, { phase: opts.phase || 'unknown', attempt, willRetry: true, backoffMs: backoff });
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }
    if (WM.ErrLog) await WM.ErrLog.add('llm', lastErr || new Error('未知LLM失败'), { phase: opts.phase || 'unknown', attempt: maxRetry, willRetry: false });
    throw lastErr || new Error('LLM 调用失败');
  }

  // ── 防重入锁：上一段总结没跑完，不启动下一段（避免并行四项重叠） ──
  let _summarizing = false;
  function isSummarizing() { return _summarizing; }

  // 触发一次完整总结（含关系/剧情/世界观/物品并行提炼）
  // range: 可选 [start,end] 楼层区间，用于 UI 展示
  // opts.forceEnd: 到达聊天末尾时强制收尾（即便不足一段也总结剩余楼层）
  async function triggerSummary(settings, opts) {
    opts = opts || {};
    settings = settings || {};
    const auto = settings.autoSummaryMode || 'new';
    if (!settings.autoSummaryEnabled) return false;

    // 防重入：上一段未跑完直接跳过，避免并行四项重叠
    if (_summarizing) return false;
    _summarizing = true;

    // 计算要总结的区间
    let range, total;
    try {
      const msgs = getRecentMessages(1000);
      total = msgs.length;
      if (auto === 'new') {
        // 只总结新增楼层：从 summaryPointer 之后到最新
        const ptr = WM.MemoryStore.getSummaryPointer();
        if (ptr >= total) return false;
        range = [ptr + 1, total];
      } else if (auto === 'count') {
        const win = Math.max(5, settings.autoSummaryCount || 20);
        const from = Math.max(0, total - win);
        range = [from + 1, total];
      } else if (auto === 'range') {
        const start = Math.max(1, settings.autoSummaryStart || 1);
        let end = settings.autoSummaryEnd;
        if (end == null || end < 0) end = total;
        end = Math.min(end, total);
        if (start > end) return false;
        range = [start, end];
      } else if (auto === 'floor') {
        // 楼层区间模式：每 autoSummaryFloor 层触发一段（1-20,21-40,...）
        const floor = Math.max(1, settings.autoSummaryFloor || 20);
        const ptr = WM.MemoryStore.getSummaryPointer();
        const segEnd = Math.floor(ptr / floor) * floor + floor; // 下一段的结束楼层
        if (opts.forceEnd) {
          // 末尾收尾：聊天已到末尾，仍有未总结楼层则强制收尾（即使不足一段）
          if (ptr >= total) return false; // 已全部总结完
          if (total < segEnd) range = [ptr + 1, total];
          else range = [ptr + 1, Math.min(total, segEnd)];
        } else {
          if (total < segEnd) return false; // 还没攒够一整段，等待
          range = [ptr + 1, Math.min(total, segEnd)];
        }
      } else {
        return false;
      }
    const recent = msgs.slice(range[0] - 1, range[1]);
    if (!recent.length) return false;

    // 关系/剧情/世界观/物品 的可复用上下文
    const histSummaries = (WM.MemoryStore.getSummaries() || []).map((s) => `· ${s.title}：${s.text}`).join('\n');
    const relationsText = (WM.MemoryStore.getRelations() || []).map((r) => `· ${r.from} → ${r.to}：${r.label || ''}`).join('\n');
    const plotsText = (WM.MemoryStore.getPlots() || []).map((p) => `· ${p.title}：${p.summary}`).join('\n');

    // 1) 先做总结
    const summaryTpl = settings.prompts && settings.prompts.summary;
    const sys = fillTemplate(summaryTpl, { recent: recent.map((m) => (m.name ? '【' + m.name + '】' : '') + m.content).join('\n'), historySummary: histSummaries });
    let summaryText = '';
    try {
      summaryText = await callLLM(sys, '请输出这段对话的总结：', settings, { temperature: 0.3, phase: 'summary' });
      await WM.MemoryStore.addSummary(summaryText, 'summary', '楼层 ' + range[0] + '-' + range[1]);
      await WM.MemoryStore.setSummaryPointer(range[1]);
    } catch (e) {
      // 总结本身失败 → 直接上报并弹窗，后续并行任务无意义
      if (WM.ErrLog) await WM.ErrLog.add('summary', e, { range });
      WM.UI && WM.UI.toast && WM.UI.toast('总结失败：' + (e.message || e), 'error');
      return { ok: false, range, reason: (e && e.message) ? e.message : String(e) };
    }

    // 2) 并行调用其余提示词（关系 / 剧情 / 世界观 / 物品）
    const tasks = [];
    const labels = [];

    // 关系
    tasks.push((async () => {
      const tpl = settings.prompts && settings.prompts.relations;
      const s = fillTemplate(tpl, { recent: recent.map((m) => (m.name ? '【' + m.name + '】' : '') + m.content).join('\n'), historySummary: histSummaries });
      const out = await callLLM(s, '请输出角色之间的关系（每行 人物A → 人物B：关系）：', settings, { temperature: 0.3, phase: 'relations' });
      let parsed = [];
      try {
        const arr = JSON.parse(out);
        if (Array.isArray(arr)) parsed = arr;
      } catch (e) {
        parsed = out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const m = l.match(/^(.*?)\s*[→\-–>]\s*(.*?)[:：]\s*(.*)$/);
          return m ? { from: m[1].trim(), to: m[2].trim(), label: m[3].trim() } : { from: l, to: '', label: '' };
        });
      }
      await WM.MemoryStore.setRelations(parsed);
      return { kind: 'relations', ok: true };
    })());
    labels.push('relations');

    // 剧情
    tasks.push((async () => {
      const tpl = settings.prompts && settings.prompts.plot;
      const s = fillTemplate(tpl, { recent: recent.map((m) => (m.name ? '【' + m.name + '】' : '') + m.content).join('\n'), historySummary: histSummaries, relations: relationsText });
      const out = await callLLM(s, '请输出当前剧情线（标题｜摘要，每行一条）：', settings, { temperature: 0.4, phase: 'plot' });
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const ln of lines) {
        const idx = ln.indexOf('｜');
        const idx2 = ln.indexOf('|');
        const sep = idx >= 0 ? idx : idx2;
        if (sep >= 0) await WM.MemoryStore.addPlot(ln.slice(0, sep).trim(), ln.slice(sep + 1).trim(), 'active');
        else await WM.MemoryStore.addPlot(ln, '', 'active');
      }
      return { kind: 'plot', ok: true };
    })());
    labels.push('plot');

    // 世界观
    tasks.push((async () => {
      const world = await WM.Worldbook.inferWorldview(settings, { recent });
      if (world && world.trim()) await WM.MemoryStore.setWorld(world);
      return { kind: 'worldview', ok: true };
    })());
    labels.push('worldview');

    // 物品
    tasks.push((async () => {
      // 复用关系提示词里的物品抽取能力：直接在总结后用一个轻量调用
      const tpl = settings.prompts && settings.prompts.itemExtract;
      if (!tpl) return { kind: 'items', ok: true, skipped: true };
      const s = fillTemplate(tpl, { recent: recent.map((m) => (m.name ? '【' + m.name + '】' : '') + m.content).join('\n') });
      const out = await callLLM(s, '请输出本段出现的物品（每行 物品名｜描述｜持有者）：', settings, { temperature: 0.3, phase: 'items' });
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const ln of lines) {
        const parts = ln.split(/[｜|]/);
        if (parts[0] && parts[0].trim()) await WM.MemoryStore.addItem(parts[0].trim(), parts[1] ? parts[1].trim() : '', parts[2] ? parts[2].trim() : '');
      }
      return { kind: 'items', ok: true };
    })());
    labels.push('items');

    // 并行执行 + 全部失败收集
    const results = await Promise.allSettled(tasks);
    const failures = [];
    const successes = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const scope = labels[i];
        failures.push({ scope, err: r.reason });
        if (WM.ErrLog) WM.ErrLog.add(scope, r.reason, { range }).catch(() => {});
      } else if (r.value && !r.value.skipped) {
        successes.push(r.value.kind);
      }
    });

    if (failures.length === results.length && failures.length > 0) {
      // 全部失败 → 弹窗 + 上报
      const reason = failures.map((f) => '【' + f.scope + '】' + (f.err && f.err.message ? f.err.message : f.err)).join('；\n');
      if (WM.ErrLog) await WM.ErrLog.add('pipeline', new Error('所有并行任务失败'), { range, reason });
      WM.UI && WM.UI.toast && WM.UI.toast('提炼全部失败，见「错误报告」：\n' + reason, 'error');
    } else if (failures.length > 0) {
      // 部分失败 → 明确标注成功/失败项，便于用户感知
      const okList = successes.join('、') || '无';
      const failList = failures.map((f) => f.scope).join('、');
      const detail = '成功：' + okList + '；失败：' + failList;
      if (WM.ErrLog) await WM.ErrLog.add('pipeline', new Error('部分并行任务失败'), { range, ok: successes, fail: failures.map((f) => f.scope), detail }).catch(() => {});
      WM.UI && WM.UI.toast && WM.UI.toast('部分提炼失败 → ' + detail, 'warn');
    }

    // 触发面板与记忆刷新
    if (WM.UI && WM.UI.refresh) WM.UI.refresh();
    return {
      ok: true,
      range,
      count: recent.length,
      partial: failures.length > 0,
      successes,
      failures: failures.map((f) => f.scope),
      results: {
        relations: (WM.MemoryStore.getRelations() || []).length,
        plots: (WM.MemoryStore.getPlots() || []).length,
        world: !!(WM.MemoryStore.getWorld() || '').trim(),
        items: (WM.MemoryStore.getItems ? WM.MemoryStore.getItems() : []).length,
      },
    };
  } finally {
    _summarizing = false; // 无论成功/失败/提前 return，都释放防重入锁
  }
}

  // 兼容旧 UI 调用名
  WM.Summary = { fillTemplate, callLLM, triggerSummary, runSummary: triggerSummary, getRecentMessages, toMessages, isSummarizing };
})();
