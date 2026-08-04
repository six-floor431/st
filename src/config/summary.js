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

  // 净化 LLM 原始输出：清理模型可能「回显」的提示词残留标记与寒暄前缀，
  // 防止「把提示词里的示例/标签也写进结果」这种形式的跑题。只删明确属于噪声的行/前缀，不伤正文。
  function sanitizeLLMText(raw) {
    if (!raw) return '';
    let t = String(raw);
    // 1) 删除整行是提示词残留标记的行（如「【最高级禁令】」「【正确示例】」「【错误示例】」「【最近对话】」「【关系】」等方括号标题行）
    t = t.split('\n').map((ln) => {
      const s = ln.trim();
      if (/^【[^】]{1,12}】$/.test(s)) return '';                       // 孤立的方括号标题行
      if (/^(最高级禁令|正确示例|错误示例|写作要求|禁止事项|判断标准|说明|要求|说明：)[:：]/.test(s)) return '';
      if (/^（(如|围绕|内容)[:：]/.test(s)) return '';                    // 提示词里的举例括号行
      if (/^(以下是|好的，这是|这是为您|以上为|总结如下|以下是总结)[:：]/.test(s)) return '';
      return ln;
    }).join('\n');
    // 2) 去掉开头的寒暄/声明前缀（一行内）
    t = t.replace(/^(好的，?|当然，?|以下是|这是|为您)[^\n]{0,20}[:：]?\s*/i, '');
    // 3) 合并多余空行
    t = t.replace(/\n{3,}/g, '\n\n').trim();
    return t;
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

  // 构造传给 LLM 的「对话文本块」：对每条 content 应用标签过滤（剔除 <think> 等包裹内容）
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
    // 若传入的配置缺少可用的 LLM Base URL，强制回退到已持久化的最新设置，
    // 避免「填了 URL 没保存 / 面板旧配置」导致总结拿到空 apiUrl 而失败。
    if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
      try { const fresh = WM.Settings && WM.Settings.load && WM.Settings.load(); if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh; } catch (e) {}
    }
    const auto = settings.autoSummaryMode || 'new';
    if (!settings.autoSummaryEnabled) return { ok: false, reason: '自动总结未开启' };

    // 防重入：上一段未跑完直接跳过，避免并行四项重叠
    if (_summarizing) return { ok: false, reason: '上一段总结仍在运行，请稍候' };
    _summarizing = true;

    // 计算要总结的区间
    let range, total;
    try {
      const msgs = getRecentMessages(1000);
      total = msgs.length;
      if (!total) return { ok: false, range: [0, 0], reason: '当前对话没有可总结的楼层（请先有对话内容）' };
      if (opts.forceAll) {
        // 「立即总结」按钮专用：无视模式与指针，强制总结全部楼层，确保一定发起 LLM 调用
        range = [1, total];
      } else if (auto === 'new') {
        // 只总结新增楼层：从 summaryPointer 之后到最新
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
        // 楼层区间模式：每 autoSummaryFloor 层触发一段（1-20,21-40,...）
        const floor = Math.max(1, settings.autoSummaryFloor || 20);
        const ptr = WM.MemoryStore.getSummaryPointer();
        const segEnd = Math.floor(ptr / floor) * floor + floor; // 下一段的结束楼层
        if (opts.forceEnd) {
          // 末尾收尾：聊天已到末尾，仍有未总结楼层则强制收尾（即使不足一段）
          if (ptr >= total) return { ok: false, range: [ptr + 1, total], reason: '已全部总结完，无新增楼层' }; // 已全部总结完
          if (total < segEnd) range = [ptr + 1, total];
          else range = [ptr + 1, Math.min(total, segEnd)];
        } else {
          if (total < segEnd) return { ok: false, range: [ptr + 1, Math.min(total, segEnd)], reason: '尚未攒满一段，暂不总结' }; // 还没攒够一整段，等待
          range = [ptr + 1, Math.min(total, segEnd)];
        }
      } else {
        return { ok: false, range: [0, 0], reason: '未知的自动总结模式：' + auto };
      }
    const recent = msgs.slice(range[0] - 1, range[1]);
    if (!recent.length) return { ok: false, range, reason: '计算出的总结区间为空' };

    // 关系/剧情/世界观/物品 的可复用上下文
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
      // 总结本身失败 → 直接上报并弹窗，后续并行任务无意义
      if (WM.ErrLog) await WM.ErrLog.add('summary', e, { range });
      WM.UI && WM.UI.toast && WM.UI.toast('总结失败：' + (e.message || e), 'error');
      return { ok: false, range, reason: (e && e.message) ? e.message : String(e) };
    }

    // 2) 并行调用其余提示词（关系 / 剧情 / 世界观 / 物品）
    const tasks = [];
    const labels = [];

    // 关系（受 autoRelation 开关控制；关闭则不跑，保留用户手动编辑的关系）
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
          // 严格解析：只接受 "A → B：词" 格式；过滤分析句/长句
          const ANALYSIS_RE = /(对.*有|存在|潜在|感受|情感|纠葛|复杂|某种|表明|显示|意味|似乎|看起来)/;
          parsed = out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
            const m = l.match(/^(.*?)\s*[→\-–>]\s*(.*?)[:：]\s*(.*)$/);
            if (!m) return null;
            const from = m[1].trim(), to = m[2].trim(), label = (m[3] || '').trim();
            // 过滤：from/to 含分析词、label 超过 10 字（说明是句子不是关系词）、from 或 to 为空
            if (!from || !to || !label) return null;
            if (ANALYSIS_RE.test(from) || ANALYSIS_RE.test(to)) return null;
            if (label.length > 10) return null;
            // from/to 本身不能是长句（超过 8 字说明不是人名）
            if (from.length > 8 || to.length > 8) return null;
            return { from, to, label };
          }).filter(Boolean);
        }
        await WM.MemoryStore.setRelations(parsed);
        return { kind: 'relations', ok: true };
      })());
      labels.push('relations');
    }

    // 剧情：时间｜标题｜内容｜状态（受 autoPlot 开关控制；标题去重避免重复追加）
    if (settings.autoPlot !== false) {
      tasks.push((async () => {
        const tpl = settings.prompts && settings.prompts.plot;
        const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries, relations: relationsText });
        const out = await callLLM(s, '请输出本段剧情（每行 时间｜标题｜内容｜状态）：', settings, { temperature: 0.4, phase: 'plot' });
        // 宽松状态识别：把各种说法归一为 active/done/abandon
        function normStatus(raw) {
          if (!raw) return 'active';
          const t = String(raw).replace(/[【】\[\]（）()]/g, '').trim();
          // done：明确完结词（精确匹配 + 包含匹配）
          if (/^(已完结|完结|已完成|结束|完结了|告一段落|已结束|收尾|落幕|落幕了|大结局|终章|结局|圆满|成功|解决|完成)$/.test(t)) return 'done';
          if (/(完结|完成|结束|告一段落|落幕|解决|达成|实现)/.test(t)) return 'done';
          // abandon：明确废弃/放弃词
          if (/^(已废弃|废弃|放弃|停止|作废|取消|烂尾|搁置|中断|终止|夭折|不了了之)$/.test(t)) return 'abandon';
          if (/(废弃|放弃|停止|作废|取消|烂尾|搁置|中断|终止)/.test(t)) return 'abandon';
          // active：进行中/持续（含默认）
          return 'active';
        }
        const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
          .filter((l) => !/^(时间\s*[｜|]\s*标题|[-=]{3,})/.test(l)); // 滤掉表头/分隔线
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
          // 标题去重：已存在同名剧情则更新，否则新增，避免每次总结重复追加
          const exist = (WM.MemoryStore.getPlots() || []).find((p) => p.title === title);
          if (exist) await WM.MemoryStore.updatePlot(exist.id, { time, title, summary, status });
          else await WM.MemoryStore.addPlot({ time, title, summary, status });
        }
        return { kind: 'plot', ok: true };
      })());
      labels.push('plot');
    }

    // 世界观：解析结构化输出 → worldMeta + worldSections
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

    // 物品：物品名｜作用｜持有者｜关联剧情｜来历（物品须关联角色与剧情线）
    if (settings.autoItems !== false) {
      tasks.push((async () => {
        const tpl = settings.prompts && settings.prompts.itemExtract;
        if (!tpl) return { kind: 'items', ok: true, skipped: true };
        // 把已有剧情线标题喂给模型，便于它做关联
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
          // 关联剧情：把标题映射回剧情 id
          const relIds = [];
          if (!blank(parts[3])) {
            for (const t of parts[3].split(/[、,，/]/).map((x) => x.trim()).filter(Boolean)) {
              const hit = allPlots.find((p) => p.title === t) || allPlots.find((p) => p.title && (p.title.includes(t) || t.includes(p.title)));
              if (hit) relIds.push(hit.id);
            }
          }
          // 同名物品则更新，避免重复堆积
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
