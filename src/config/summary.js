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

  // 各阶段对应的「任务 token」配置键（用于二级输出上限控制）
  function taskMaxKey(phase) {
    if (phase === 'summary') return 'summary';
    if (phase === 'relations') return 'relations';
    if (phase === 'plot') return 'plot';
    if (phase === 'worldview') return 'world';
    if (phase === 'items') return 'items';
    return null;
  }
  // 取某任务的实际 maxTokens：优先 taskTokens[键]（>0 才生效），否则回落 llmConfig.maxTokens
  function resolveTaskMax(settings, phase) {
    const key = taskMaxKey(phase);
    const tt = settings && settings.taskTokens;
    if (key && tt && tt[key] > 0) return tt[key];
    const cfg = settings && settings.llmConfig;
    return (cfg && cfg.maxTokens) || 700;
  }

  // 带重试的 LLM 调用：失败重试 3 次，指数退避（1s→2s→4s）
  async function callLLM(systemText, userText, settings, opts) {
    opts = opts || {};
    // 二级 token 控制：若未显式传 maxTokens，则按 phase 取该任务的独立上限
    if (opts.maxTokens == null && opts.phase) opts.maxTokens = resolveTaskMax(settings, opts.phase);
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

  // ── 防重入锁：总结与剧情线各自独立，互不阻塞 ──
  let _summarizing = false;
  let _plotting = false;
  function isSummarizing() { return _summarizing; }
  function isPlotting() { return _plotting; }

  // 通用：根据模式计算要处理的楼层区间 [start, end]（1-based 闭区间）。
  //   modeKey 指向 settings 里 *Mode 字段名；ptrKey 指向「已处理指针」取/存函数（get/set 由调用方传入）。
  // 返回 { range, recent, total } 或 { skip:true, range, reason }。
  function computeRange(settings, opts, modeKey, getPtr, forceAllKey) {
    opts = opts || {};
    const auto = settings[modeKey] || 'new';
    const msgs = getRecentMessages(1000);
    const total = msgs.length;
    if (!total) return { skip: true, range: [0, 0], total, reason: '当前对话没有可总结的楼层（请先有对话内容）' };
    let range;
    if (opts.forceAll) {
      range = [1, total];
    } else if (auto === 'new') {
      const ptr = getPtr();
      if (ptr >= total) return { skip: true, range: [ptr + 1, total], total, reason: '没有新增楼层需要处理（已处理到最新）' };
      range = [ptr + 1, total];
    } else if (auto === 'count') {
      const win = Math.max(5, settings[(forceAllKey ? forceAllKey.replace('Mode', 'Count') : modeKey.replace('Mode', 'Count'))] || 20);
      const from = Math.max(0, total - win);
      range = [from + 1, total];
    } else if (auto === 'range') {
      const startKey = modeKey.replace('Mode', 'Start'), endKey = modeKey.replace('Mode', 'End');
      const start = Math.max(1, settings[startKey] || 1);
      let end = settings[endKey];
      if (end == null || end < 0) end = total;
      end = Math.min(end, total);
      if (start > end) return { skip: true, range: [start, end], total, reason: '区间起始大于结束' };
      range = [start, end];
    } else if (auto === 'floor') {
      const floor = Math.max(1, settings[modeKey.replace('Mode', 'Floor')] || 20);
      const ptr = getPtr();
      const segEnd = Math.floor(ptr / floor) * floor + floor;
      if (opts.forceEnd) {
        if (ptr >= total) return { skip: true, range: [ptr + 1, total], total, reason: '已全部处理完，无新增楼层' };
        range = total < segEnd ? [ptr + 1, total] : [ptr + 1, Math.min(total, segEnd)];
      } else {
        if (total < segEnd) return { skip: true, range: [ptr + 1, Math.min(total, segEnd)], total, reason: '尚未攒满一段，暂不处理' };
        range = [ptr + 1, Math.min(total, segEnd)];
      }
    } else {
      return { skip: true, range: [0, 0], total, reason: '未知的处理模式：' + auto };
    }
    const recent = msgs.slice(range[0] - 1, range[1]);
    if (!recent.length) return { skip: true, range, total, reason: '计算出的处理区间为空' };
    return { range, recent, total };
  }

  // ── 关系解析：把 LLM 输出的关系文本解析为三元组数组（带分析句过滤） ──
  function parseRelations(out) {
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
    return parsed;
  }

  // ── 剧情线解析：把 LLM 输出的剧情文本解析为事件数组（无状态列） ──
  function parsePlots(out) {
    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^(时间\s*[｜|]\s*标题|[-=]{3,})/.test(l));
    const result = [];
    for (const ln of lines) {
      const parts = ln.replace(/^[\s\-*·]+/, '').split(/[｜|]/).map((x) => x.trim());
      if (!parts.length) continue;
      let time = '', title = '', summary = '';
      if (parts.length >= 3) {
        time = /^(未标注|无|未知|-)$/.test(parts[0]) ? '' : parts[0];
        title = parts[1] || ''; summary = parts[2] || '';
      } else if (parts.length === 2) {
        title = parts[0]; summary = parts[1];
      } else { title = parts[0]; }
      if (!title) continue;
      result.push({ time, title, summary });
    }
    return result;
  }

  // 触发一次「纯记忆」总结（只跑 summary + 世界观 + 物品，不再顺带跑关系/剧情）
  async function triggerSummary(settings, opts) {
    opts = opts || {};
    settings = settings || {};
    if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
      try { const fresh = WM.Settings && WM.Settings.load && WM.Settings.load(); if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh; } catch (e) {}
    }
    if (!settings.autoSummaryEnabled) return { ok: false, reason: '自动总结未开启' };
    if (_summarizing) return { ok: false, reason: '上一段总结仍在运行，请稍候' };
    _summarizing = true;

    let range, total, recent;
    try {
      const cr = computeRange(settings, opts, 'autoSummaryMode', () => WM.MemoryStore.getSummaryPointer());
      if (cr.skip) return { ok: false, range: cr.range, reason: cr.reason };
      range = cr.range; recent = cr.recent; total = cr.total;

      const histSummaries = (WM.MemoryStore.getSummaries() || []).map((s) => `· ${s.title}：${s.text}`).join('\n');

      // 1) 先做总结（纯记忆）
      const summaryTpl = settings.prompts && settings.prompts.summary;
      const sys = fillTemplate(summaryTpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries });
      try {
        const summaryText = await callLLM(sys, '请输出这段对话的总结：', settings, { temperature: 0.3, phase: 'summary' });
        await WM.MemoryStore.addSummary(summaryText, 'summary', '楼层 ' + range[0] + '-' + range[1]);
        await WM.MemoryStore.setSummaryPointer(range[1]);
      } catch (e) {
        if (WM.ErrLog) await WM.ErrLog.add('summary', e, { range });
        WM.UI && WM.UI.toast && WM.UI.toast('总结失败：' + (e.message || e), 'error');
        return { ok: false, range, reason: (e && e.message) ? e.message : String(e) };
      }

      // 2) 并行跑「记忆类」子任务：世界观 + 物品（关系/剧情已迁出为独立流程）
      const tasks = [];
      const labels = [];

      if (settings.autoWorld !== false) {
        // 世界观自动只跑一次：若已有世界观数据（世界名/类型/简述/设定条目/旧纯文本任一），自动流程跳过，
        // 后续只能由用户在「世界设定」面板手动点「生成世界设定」才再次调用 LLM（见 launcher world-gen）。
        const hasWorld = (() => {
          const meta = WM.MemoryStore.getWorldMeta ? WM.MemoryStore.getWorldMeta() : {};
          const secs = WM.MemoryStore.getWorldSections ? WM.MemoryStore.getWorldSections() : [];
          const wold = WM.MemoryStore.getWorld ? WM.MemoryStore.getWorld() : '';
          return !!(meta && (meta.name || meta.kind || meta.desc)) || (secs && secs.length) || (wold && String(wold).trim());
        })();
        if (hasWorld) {
          // 跳过自动世界观，但仍占位不阻塞其它任务
        } else {
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
      }

      if (settings.autoItems !== false) {
        tasks.push((async () => {
          const tpl = settings.prompts && settings.prompts.itemExtract;
          if (!tpl) return { kind: 'items', ok: true, skipped: true };
          const knownPlots = (WM.MemoryStore.getPlots() || [])
            .map((p) => `· ${p.title || p.time || p.id}`).join('\n') || '（无）';
          const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), plot: knownPlots });
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
          failures.push({ scope: labels[i], err: r.reason });
          if (WM.ErrLog) WM.ErrLog.add(labels[i], r.reason, { range }).catch(() => {});
        } else if (r.value && !r.value.skipped) {
          successes.push(r.value.kind);
        }
      });
      if (failures.length === results.length && failures.length > 0) {
        const reason = failures.map((f) => '【' + f.scope + '】' + (f.err && f.err.message ? f.err.message : f.err)).join('；\n');
        if (WM.ErrLog) await WM.ErrLog.add('pipeline', new Error('所有并行任务失败'), { range, reason });
        WM.UI && WM.UI.toast && WM.UI.toast('记忆提炼全部失败，见「错误报告」：\n' + reason, 'error');
      } else if (failures.length > 0) {
        const okList = successes.join('、') || '无';
        const failList = failures.map((f) => f.scope).join('、');
        if (WM.ErrLog) await WM.ErrLog.add('pipeline', new Error('部分并行任务失败'), { range, ok: successes, fail: failures.map((f) => f.scope) }).catch(() => {});
        WM.UI && WM.UI.toast && WM.UI.toast('部分记忆提炼失败 → 成功：' + okList + '；失败：' + failList, 'warn');
      }

      // 自动大总结：每累计 bigSummaryEvery 次小总结，整合近期小总结为一份长期记忆
      if (settings.bigSummaryEnabled !== false) {
        const allSmall = (WM.MemoryStore.getSummaries ? WM.MemoryStore.getSummaries() : []).filter((s) => s.kind !== 'big');
        const every = Math.max(2, settings.bigSummaryEvery || 5);
        if (allSmall.length > 0 && allSmall.length % every === 0) {
          try {
            const big = await triggerBigSummary(settings);
            if (big && big.ok) {
              WM.UI && WM.UI.toast && WM.UI.toast('🌿 温记：已自动生成大总结（整合 ' + big.count + ' 段小总结）');
            }
          } catch (e) { /* 大总结失败不阻断小总结结果 */ }
        }
      }

      if (WM.UI && WM.UI.refresh) WM.UI.refresh();
      return { ok: true, range, count: recent.length, partial: failures.length > 0, successes, failures: failures.map((f) => f.scope) };
    } finally {
      _summarizing = false;
    }
  }

  // ── 剧情线独立流程：与总结解耦，有独立指针与攒段逻辑；触发时同时并联调用「关系线 LLM」 ──
  async function triggerPlot(settings, opts) {
    opts = opts || {};
    settings = settings || {};
    if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
      try { const fresh = WM.Settings && WM.Settings.load && WM.Settings.load(); if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh; } catch (e) {}
    }
    if (settings.autoPlotEnabled === false) return { ok: false, reason: '剧情线独立推进未开启' };
    if (_plotting) return { ok: false, reason: '上一段剧情线仍在推进，请稍候' };
    _plotting = true;

    let range, total, recent;
    try {
      const cr = computeRange(settings, opts, 'autoPlotMode', () => WM.MemoryStore.getPlotPointer());
      if (cr.skip) return { ok: false, range: cr.range, reason: cr.reason };
      range = cr.range; recent = cr.recent; total = cr.total;

      const histSummaries = (WM.MemoryStore.getSummaries() || []).map((s) => `· ${s.title}：${s.text}`).join('\n');
      // 历史剧情线（自我推进的依据）：最新在上
      const plotsSorted = WM.MemoryStore.getPlotsSorted ? WM.MemoryStore.getPlotsSorted() : (WM.MemoryStore.getPlots() || []);
      const historyPlot = plotsSorted.map((p) => `· ${p.time ? '[' + p.time + '] ' : ''}${p.title}：${p.summary}`).join('\n') || '（暂无，请从最近对话起笔）';
      // 历史关系（并联时 plot 不阻塞等待新关系，直接用已有的）
      const relationsText = (WM.MemoryStore.getRelations() || []).map((r) => `· ${r.from} → ${r.to}：${r.label || ''}`).join('\n') || '（暂无已知关系）';

      // 并联：关系线 + 剧情线 同时调用 LLM
      const tasks = [];
      const labels = [];

      // —— 关系线 LLM ——
      if (settings.autoRelation !== false) {
        tasks.push((async () => {
          const tpl = settings.prompts && settings.prompts.relations;
          const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries });
          const out = await callLLM(s, '请输出角色之间的关系（每行 人物A → 人物B：关系）：', settings, { temperature: 0.3, phase: 'relations' });
          const parsed = parseRelations(out);
          const prev = WM.MemoryStore.getRelations() || [];
          const merged = WM.Relations && WM.Relations.mergeRelations ? WM.Relations.mergeRelations(prev, parsed) : parsed;
          await WM.MemoryStore.setRelations(merged);
          return { kind: 'relations', ok: true };
        })());
        labels.push('relations');
      }

      // —— 剧情线 LLM（基于历史剧情线自我推进） ——
      if (settings.autoPlot !== false) {
        tasks.push((async () => {
          const tpl = settings.prompts && settings.prompts.plot;
          const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), relations: relationsText, historyPlot });
          const out = await callLLM(s, '请基于已有剧情线继续推进，输出本段新增的剧情事件（每行 时间｜标题｜事件叙述）：', settings, { temperature: 0.4, phase: 'plot' });
          const parsed = parsePlots(out);
          const existing = WM.MemoryStore.getPlots() || [];
          for (const ev of parsed) {
            const exist = existing.find((p) => p.title === ev.title);
            if (exist) await WM.MemoryStore.updatePlot(exist.id, ev);
            else await WM.MemoryStore.addPlot(ev);
          }
          await WM.MemoryStore.setPlotPointer(range[1]);
          return { kind: 'plot', ok: true };
        })());
        labels.push('plot');
      }

      // —— 物品 LLM（跟随剧情线一并跑：用本段 recent 区间，关联已有剧情线） ——
      if (settings.autoItems !== false) {
        tasks.push((async () => {
          const tpl = settings.prompts && settings.prompts.itemExtract;
          if (!tpl) return { kind: 'items', ok: true, skipped: true };
          const knownPlots = (WM.MemoryStore.getPlots() || [])
            .map((p) => `· ${p.title || p.time || p.id}`).join('\n') || '（无）';
          const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), plot: knownPlots });
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
          failures.push({ scope: labels[i], err: r.reason });
          if (WM.ErrLog) WM.ErrLog.add(labels[i], r.reason, { range }).catch(() => {});
        } else if (r.value) {
          successes.push(r.value.kind);
        }
      });
      if (failures.length === results.length && failures.length > 0) {
        const reason = failures.map((f) => '【' + f.scope + '】' + (f.err && f.err.message ? f.err.message : f.err)).join('；\n');
        if (WM.ErrLog) await WM.ErrLog.add('plot-pipeline', new Error('剧情线并行任务全部失败'), { range, reason });
        WM.UI && WM.UI.toast && WM.UI.toast('剧情线推进失败，见「错误报告」：\n' + reason, 'error');
      } else if (failures.length > 0) {
        if (WM.ErrLog) await WM.ErrLog.add('plot-pipeline', new Error('剧情线部分失败'), { ok: successes, fail: failures.map((f) => f.scope) }).catch(() => {});
        WM.UI && WM.UI.toast && WM.UI.toast('剧情线部分失败 → ' + failures.map((f) => f.scope).join('、'), 'warn');
      }

      if (WM.UI && WM.UI.refresh) WM.UI.refresh();
      return {
        ok: true, range, count: recent.length, partial: failures.length > 0,
        successes, failures: failures.map((f) => f.scope),
        results: {
          relations: (WM.MemoryStore.getRelations() || []).length,
          plots: (WM.MemoryStore.getPlots() || []).length,
        },
      };
    } finally {
      _plotting = false;
    }
  }

  // ── 自动大总结：把最近的若干「小总结」整合为一份长期记忆 ──
  // 大总结与小总结用同一份提示词（summary），只是把「历史小总结」作为 {{historySummary}} 喂入，
  // 让模型把多段碎片合并成连贯的长期记忆。结果以 kind='big' 存入 summaries。
  async function triggerBigSummary(settings) {
    settings = settings || {};
    if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
      try { const fresh = WM.Settings && WM.Settings.load && WM.Settings.load(); if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh; } catch (e) {}
    }
    if (settings.bigSummaryEnabled === false) return { ok: false, reason: '大总结未开启' };
    const all = WM.MemoryStore.getSummaries ? WM.MemoryStore.getSummaries() : [];
    const every = Math.max(2, settings.bigSummaryEvery || 5);
    const maxSeg = settings.bigSummaryMaxSegments || 0;
    // 取最近 every 条小总结（kind 非 big 的）做整合
    const smalls = all.filter((s) => s.kind !== 'big');
    const recentSmalls = maxSeg > 0 ? smalls.slice(-maxSeg) : smalls.slice(-every);
    if (recentSmalls.length < 2) return { ok: false, reason: '小总结数量不足，暂不大总结' };
    const joined = recentSmalls.map((s, i) => `（小总结 ${i + 1}）${s.title}\n${s.text}`).join('\n\n');
    const summaryTpl = settings.prompts && settings.prompts.summary;
    const sys = fillTemplate(summaryTpl, {
      recent: '【以下是此前多段小总结，请将它们整合为一份连贯、不重复的长期记忆】\n' + joined,
      historySummary: '',
    });
    try {
      const text = await callLLM(sys, '请将以上多段小总结整合为一份连贯的长期记忆：', settings, { temperature: 0.3, phase: 'summary' });
      await WM.MemoryStore.addSummary(text, 'big', '大总结（整合 ' + recentSmalls.length + ' 段小总结）');
      return { ok: true, count: recentSmalls.length };
    } catch (e) {
      if (WM.ErrLog) await WM.ErrLog.add('big-summary', e, {});
      return { ok: false, reason: e && e.message ? e.message : String(e) };
    }
  }

  WM.Summary = { fillTemplate, callLLM, triggerSummary, runSummary: triggerSummary, triggerPlot, triggerBigSummary, getRecentMessages, toMessages, isSummarizing, isPlotting };
})();
