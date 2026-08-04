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

  // 禁止词汇表（覆盖 summary/plot/worldview 等所有提示词中明确禁止的元描述词汇）：
  //   含这些词的行大概率是 LLM 回显指令或自我介绍，应删除。
  var BANNED_WORDS_RE = /总结|梳理|概括|归纳|回顾|记录|时间线|时间顺序|按时间|状态标记|供后续参考|核心事件|关键信息|要点|摘要|概述|概要|简述|备注|注记|梳理如下|整理如下|汇总如下|分析如下|描述如下|说明如下|根据对话|用户让我|以下为|以上为|绝对禁止|最高级禁令|写作要求|判断标准|禁止事项/;

  // 净化 LLM 原始输出：清理模型可能「回显」的提示词残留标记与寒暄前缀，
  // 防止「把提示词里的示例/标签也写进结果」这种形式的跑题。只删明确属于噪声的行/前缀，不伤正文。
  function sanitizeLLMText(raw) {
    if (!raw) return '';
    var t = String(raw);
    t = t.split('\n').map(function (ln) {
      var s = ln.trim();
      if (!s) return ln; // 空行保留（由后续合并处理）
      // 孤立的方括号标题行
      if (/^【[^】]{1,20}】$/.test(s)) return '';
      // 提示词结构标记行
      if (/^(最高级禁令|正确示例|错误示例|写作要求|禁止事项|判断标准|说明|要求|说明：|绝对禁止)[:：]/.test(s)) return '';
      // 提示词里的举例括号行
      if (/^（(如|围绕|内容)[:：]/.test(s)) return '';
      // 寒暄/声明前缀行（含"用户让我""根据对话""时间线梳理"等图2中实际出现的残留）
      if (/^(以下是|好的，这是|这是为您|以上为|总结如下|以下是总结|时间线梳理|剧情事件如下|根据对话内容|用户让我|按照要求)[:：]/.test(s)) return '';
      // 含禁止元词汇且以"如下/以下"结尾 → 指令回显引导行
      if (/(如下|以下|为下)[:：]?\s*$/.test(s) && BANNED_WORDS_RE.test(s)) return '';
      // 以"第X"/"首先"/"其次"开头且含禁止词 → 序号罗列式指令回显
      if (/^(第[一二三四五六七八九十]|首先|其次|再次|最后|另外)[、，:：]/.test(s) && BANNED_WORDS_RE.test(s)) return '';
      return ln;
    }).join('\n');
    // 去掉开头的寒暄/声明前缀（一行内）
    t = t.replace(/^(好的，?|当然，?|以下是|这是|为您|根据|按照)[^\n]{0,25}[:：]?\s*/i, '');
    // 合并多余空行
    t = t.replace(/\n{3,}/g, '\n\n').trim();
    // 二次扫描：如果开头第一行仍含明显指令回显特征，逐行删除
    var lines = t.split('\n');
    while (lines.length && BANNED_WORDS_RE.test(lines[0]) && /[:：]/.test(lines[0])) lines.shift();
    return lines.join('\n');
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

  // 构造传给 LLM 的「对话文本块」：对每条 content 应用标签过滤（剔除 {{{ }}} 等包裹内容）
  function buildDialogue(msgs, settings) {
    const rules = (settings && settings.tagStripRules) || [];
    return msgs.map((m) => {
      const raw = (m.name ? '【' + m.name + '】' : '') + (m.content || '');
      return WM.TagFilter && WM.TagFilter.strip ? WM.TagFilter.strip(raw, rules) : raw;
    }).join('\n');
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
        return sanitizeLLMText(text);
      } catch (e) {
        lastErr = e;
        if (attempt < maxRetry) {
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
  async function triggerSummary(settings, opts) {
    opts = opts || {};
    settings = settings || {};
    if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
      try { const fresh = WM.Settings && WM.Settings.load && WM.Settings.load(); if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh; } catch (e) {}
    }
    const auto = settings.autoSummaryMode || 'new';
    if (!settings.autoSummaryEnabled) return { ok: false, reason: '自动总结未开启' };
    if (_summarizing) return { ok: false, reason: '上一段总结仍在运行，请稍候' };
    _summarizing = true;

    let range, total;
    try {
      const msgs = getRecentMessages(1000);
      total = msgs.length;
      if (!total) return { ok: false, range: [0, 0], reason: '当前对话没有可总结的楼层（请先有对话内容）' };
      if (opts.forceAll) {
        range = [1, total];
      } else if (auto === 'new') {
        const ptr = WM.MemoryStore.getSummaryPointer();
        if (ptr >= total) return { ok: false, range: [ptr + 1, total], reason: '没有新增楼层需要总结（已总结到最新）' };
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
        if (start > end) return { ok: false, range: [start, end], reason: '区间起始大于结束' };
        range = [start, end];
      } else if (auto === 'floor') {
        const floor = Math.max(1, settings.autoSummaryFloor || 20);
        const ptr = WM.MemoryStore.getSummaryPointer();
        const segEnd = Math.floor(ptr / floor) * floor + floor;
        if (opts.forceEnd) {
          if (ptr >= total) return { ok: false, range: [ptr + 1, total], reason: '已全部总结完，无新增楼层' };
          if (total < segEnd) range = [ptr + 1, total];
          else range = [ptr + 1, Math.min(total, segEnd)];
        } else {
          if (total < segEnd) return { ok: false, range: [ptr + 1, Math.min(total, segEnd)], reason: '尚未攒满一段，暂不总结' };
          range = [ptr + 1, Math.min(total, segEnd)];
        }
      } else {
        return { ok: false, range: [0, 0], reason: '未知的自动总结模式：' + auto };
      }
    const recent = msgs.slice(range[0] - 1, range[1]);
    if (!recent.length) return { ok: false, range, reason: '计算出的总结区间为空' };

    const histSummaries = (WM.MemoryStore.getSummaries() || []).map((s) => `· ${s.title}：${s.text}`).join('\n');
    const relationsText = (WM.MemoryStore.getRelations() || []).map((r) => `· ${r.from} → ${r.to}：${r.label || ''}`).join('\n');
    const plotsText = (WM.MemoryStore.getPlots() || []).map((p) => `· ${p.title}：${p.summary}`).join('\n');

    // 1) 先做总结
    const summaryTpl = settings.prompts && settings.prompts.summary;
    const sys = fillTemplate(summaryTpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries });
    let summaryText = '';
    try {
      summaryText = await callLLM(sys, '请输出这段对话的总结：', settings, { temperature: 0.3, phase: 'summary' });
      await WM.MemoryStore.addSummary(summaryText, 'summary', '楼层 ' + range[0] + '-' + range[1]);
      await WM.MemoryStore.setSummaryPointer(range[1]);
    } catch (e) {
      if (WM.ErrLog) await WM.ErrLog.add('summary', e, { range });
      WM.UI && WM.UI.toast && WM.UI.toast('总结失败：' + (e.message || e), 'error');
      return { ok: false, range, reason: (e && e.message) ? e.message : String(e) };
    }

    // 2) 并行调用其余提示词（关系 / 剧情 / 世界观 / 物品）
    const tasks = [];
    const labels = [];

    if (settings.autoRelation !== false) {
      tasks.push((async () => {
        const tpl = settings.prompts && settings.prompts.relations;
        const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries });
        const out = await callLLM(s, '请输出角色之间的关系（每行 人物A → 人物B：关系）：', settings, { temperature: 0.3, phase: 'relations' });
        let parsed = [];
        try {
          const arr = JSON.parse(out);
          if (Array.isArray(arr)) parsed = arr;
        } catch (e) {
          const ANALYSIS_RE = /(对.*有|存在|潜在|感受|情感|纠葛|复杂|某种|表明|显示|意味|似乎|看起来)/;
          parsed = out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
            const m = l.match(/^(.*?)\s*[→\-–>]\s*(.*?)[:：]\s*(.*)$/);
            if (!m) return null;
            const from = m[1].trim(), to = m[2].trim(), label = (m[3] || '').trim();
            if (!from || !to || !label) return null;
            if (ANALYSIS_RE.test(from) || ANALYSIS_RE.test(to)) return null;
            if (label.length > 10) return null;
            if (from.length > 8 || to.length > 8) return null;
            return { from, to, label };
          }).filter(Boolean);
        }
        const prev = WM.MemoryStore.getRelations() || [];
        const merged = WM.Relations && WM.Relations.mergeRelations ? WM.Relations.mergeRelations(prev, parsed) : parsed;
        await WM.MemoryStore.setRelations(merged);
        return { kind: 'relations', ok: true };
      })());
      labels.push('relations');
    }

    if (settings.autoPlot !== false) {
      tasks.push((async () => {
        const tpl = settings.prompts && settings.prompts.plot;
        const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries, relations: relationsText });
        const out = await callLLM(s, '请输出本段剧情（每行 时间｜标题｜内容｜状态）：', settings, { temperature: 0.4, phase: 'plot' });
        function normStatus(raw) {
          if (!raw) return 'active';
          const t = String(raw).replace(/[【】\[\]（）()]/g, '').trim();
          if (/^(已完结|完结|已完成|结束|完结了|告一段落|已结束|收尾|落幕|落幕了|大结局|终章|结局|圆满|成功|解决|完成)$/.test(t)) return 'done';
          if (/(完结|完成|结束|告一段落|落幕|解决|达成|实现)/.test(t)) return 'done';
          if (/^(已废弃|废弃|放弃|停止|作废|取消|烂尾|搁置|中断|终止|夭折|不了了之)$/.test(t)) return 'abandon';
          if (/(废弃|放弃|停止|作废|取消|烂尾|搁置|中断|终止)/.test(t)) return 'abandon';
          return 'active';
        }
        const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
          .filter((l) => !/^(时间\s*[｜|]\s*标题|[-=]{3,})/.test(l));
        for (const ln of lines) {
          const parts = ln.replace(/^[\s\-*·]+/, '').split(/[｜|]/).map((x) => x.trim());
          if (!parts.length) continue;
          let time = '', title = '', summary = '', status = 'active';
          if (parts.length >= 4) {
            time = /^(未标注|无|未知|-)$/.test(parts[0]) ? '' : parts[0];
            title = parts[1] || ''; summary = parts[2] || ''; status = normStatus(parts[3]);
          } else if (parts.length === 3) {
            title = parts[0]; summary = parts[1]; status = normStatus(parts[2]);
          } else if (parts.length === 2) {
            title = parts[0]; summary = parts[1];
          } else { title = parts[0]; }
          if (!title) continue;
          const exist = (WM.MemoryStore.getPlots() || []).find((p) => p.title === title);
          if (exist) await WM.MemoryStore.updatePlot(exist.id, { time, title, summary, status });
          else await WM.MemoryStore.addPlot({ time, title, summary, status });
        }
        return { kind: 'plot', ok: true };
      })());
      labels.push('plot');
    }

    if (settings.autoWorld !== false) {
      tasks.push((async () => {
        const world = await WM.Worldbook.inferWorldview(settings, { recent });
        if (!world || !world.trim()) return { kind: 'worldview', ok: true, skipped: true };
        const parsed = WM.Worldbook.parseWorldview ? WM.Worldbook.parseWorldview(world) : null;
        if (parsed) {
          const cur = WM.MemoryStore.getWorldMeta ? WM.MemoryStore.getWorldMeta() : {};
          await WM.MemoryStore.setWorldMeta({
            name: parsed.name || cur.name || '',
            kind: parsed.kind || cur.kind || '',
            desc: parsed.desc || cur.desc || '',
          });
          for (const sec of parsed.sections) {
            const exist = (WM.MemoryStore.getWorldSections() || []).find((x) => x.title === sec.title);
            if (exist) await WM.MemoryStore.updateWorldSection(exist.id, { body: sec.body });
            else await WM.MemoryStore.addWorldSection(sec.title, sec.body);
          }
        } else {
          await WM.MemoryStore.setWorld(world);
        }
        return { kind: 'worldview', ok: true };
      })());
      labels.push('worldview');
    }

    if (settings.autoItems !== false) {
      tasks.push((async () => {
        const tpl = settings.prompts && settings.prompts.itemExtract;
        if (!tpl) return { kind: 'items', ok: true, skipped: true };
        const knownPlots = (WM.MemoryStore.getPlots() || [])
          .map((p) => `· ${p.title || p.time || p.id}`).join('\n') || '（无）';
        const s = fillTemplate(tpl, {
          recent: buildDialogue(recent, settings),
          plot: knownPlots,
        });
        const out = await callLLM(s, '请输出本段出现的物品（每行 物品名｜作用｜持有者｜关联剧情｜来历）：', settings, { temperature: 0.3, phase: 'items' });
        const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
          .filter((l) => !/^(物品名\s*[｜|]|[-=]{3,})/.test(l));
        const allPlots = WM.MemoryStore.getPlots() || [];
        const blank = (v) => !v || /^(无|未知|未标注|-|—)$/.test(v);
        for (const ln of lines) {
          const parts = ln.replace(/^[\s\-*·]+/, '').split(/[｜|]/).map((x) => x.trim());
          const name = parts[0];
          if (!name) continue;
          const relIds = [];
          if (!blank(parts[3])) {
            for (const t of parts[3].split(/[、,，/]/).map((x) => x.trim()).filter(Boolean)) {
              const hit = allPlots.find((p) => p.title === t) || allPlots.find((p) => p.title && (p.title.includes(t) || t.includes(p.title)));
              if (hit) relIds.push(hit.id);
            }
          }
          const exist = (WM.MemoryStore.getItems() || []).find((x) => x.name === name);
          const data = {
            name,
            desc: blank(parts[1]) ? (exist ? exist.desc : '') : parts[1],
            owner: blank(parts[2]) ? (exist ? exist.owner : '') : parts[2],
            origin: blank(parts[4]) ? (exist ? exist.origin : '') : parts[4],
            relatedPlots: relIds.length ? relIds : (exist ? exist.relatedPlots : []),
          };
          if (exist) await WM.MemoryStore.updateItem(exist.id, data);
          else await WM.MemoryStore.addItem(data);
        }
        return { kind: 'items', ok: true };
      })());
      labels.push('items');
    }

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
      const reason = failures.map((f) => '【' + f.scope + '】' + (f.err && f.err.message ? f.err.message : f.err)).join('；\n');
      if (WM.ErrLog) await WM.ErrLog.add('pipeline', new Error('所有并行任务失败'), { range, reason });
      WM.UI && WM.UI.toast && WM.UI.toast('提炼全部失败，见「错误报告」：\n' + reason, 'error');
    } else if (failures.length > 0) {
      const okList = successes.join('、') || '无';
      const failList = failures.map((f) => f.scope).join('、');
      const detail = '成功：' + okList + '；失败：' + failList;
      if (WM.ErrLog) await WM.ErrLog.add('pipeline', new Error('部分并行任务失败'), { range, ok: successes, fail: failures.map((f) => f.scope), detail }).catch(() => {});
      WM.UI && WM.UI.toast && WM.UI.toast('部分提炼失败 → ' + detail, 'warn');
    }

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
    _summarizing = false;
  }
}

  WM.Summary = { fillTemplate, callLLM, triggerSummary, runSummary: triggerSummary, getRecentMessages, toMessages, isSummarizing };
})();
