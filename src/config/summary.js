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
  var BANNED_WORDS_RE = /总结|梳理|概括|归纳|回顾|记录|时间线|时间顺序|按时间|状态标记|供后续参考|核心事件|关键信息|要点|摘要|概述|概要|简述|备注|注记|梳理如下|整理如下|汇总如下|分析如下|描述如下|说明如下|根据对话|用户让我|以下为|以上为|绝对禁止|最高级禁令|写作要求|判断标准|禁止事项|写作原则|文风要求|输出格式|系统要求|提示词/;

  // 元说明/规则回显句式（LLM 把"我打算怎么写"当正文输出）：整行删除。
  //   例："因此我们应该把最近对话提炼成一段叙事。" / "注意：系统要求只写已发生的事实。" / "我需要避免使用禁词。"
  var META_LINE_RE = /^(因此|所以|那么|接下来|首先|注意|提醒|请注意|综上|总之)?[，,、：:\s]*((我|我们|你)(们)?(需要|应该|要|将|会|得|可以|打算|必须|不能|不应|应当|试图|尝试)|注意[:：]|根据(系统|上述|以上|提示|要求|指令)|按照(系统|要求|指令|提示)|系统要求|题目要求|用户要求|遵循(以上|上述|该)?(规则|要求)|不能(出现|使用|写)|避免(使用|出现|写))/;

  // 规则性措辞（提示词红线里的祈使句）：出现在正文里 = 规则回显
  var RULE_VERB_RE = /严禁|禁止|不得|不许|必须|应当|只写|只记录|只提取|不写|不要写|不能写|违反|即无效|判定无效/;

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
      // 元说明/规则回显整行（"因此我们应该…""注意：系统要求…""我需要避免…"）
      if (META_LINE_RE.test(s)) return '';
      // 编号 + 规则措辞 的条目回显（"1. 只写已发生的事实""3、严禁使用以下词汇"）
      if (/^\d+\s*[.、)）：:]\s*/.test(s) && (RULE_VERB_RE.test(s) || BANNED_WORDS_RE.test(s))) return '';
      // 红线符号(🛑✗✓※等，含代理对，故用 u 标志)开头 + 规则措辞 的行
      if (/^[\u{1F6D1}\u{2717}\u{2713}\u{203B}\u{2731}*\-–—•·]\s*/u.test(s) && RULE_VERB_RE.test(s)) return '';
      // 行内以红线符号起头（无论后面接什么），若整行含规则措辞也删
      if (/^(🛑|✗|✓|※|●|▲)/u.test(s) && RULE_VERB_RE.test(s)) return '';
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

  // 按「符号包裹」标记精确提取某任务输出（与提示词里的 <<<XXX_START>>> / <<<XXX_END>>> 对应）。
  // 提取不到则回退到全文（兼容旧模型不输出标记的情况）。
  function extractTagged(raw, startTag, endTag) {
    if (!raw) return '';
    const s = String(raw);
    const re = new RegExp('<<<' + startTag + '_START>>>([\\s\\S]*?)<<<' + startTag + '_END>>>', 'i');
    const m = s.match(re);
    if (m && m[1] && m[1].trim()) return sanitizeLLMText(m[1]);
    // 兼容：只出现 START 没 END，或反过来，截取 START 之后 / END 之前
    const si = s.indexOf('<<<' + startTag + '_START>>>');
    const ei = s.indexOf('<<<' + startTag + '_END>>>');
    if (si >= 0 && ei > si) return sanitizeLLMText(s.slice(si + ('<<<' + startTag + '_START>>>').length, ei));
    if (si >= 0) return sanitizeLLMText(s.slice(si + ('<<<' + startTag + '_START>>>').length));
    if (ei >= 0) return sanitizeLLMText(s.slice(0, ei));
    return sanitizeLLMText(s); // 无标记：回退全文
  }
  // ── 总结正文净化：只留叙事散文，剔除模型多输出的一切壳子 ──
  // 处理场景：markdown 标题、开场白、编号/项目符号列表、结尾的"以上"类收尾句、残留标签、加粗符号。
  function cleanSummaryText(raw) {
    if (!raw) return '';
    let t = String(raw);
    // 残留标签（含未配对的）
    t = t.replace(/<<<\s*[A-Z_]+\s*>>>/g, '');
    // 代码块围栏
    t = t.replace(/^```[a-z]*\s*$/gim, '');
    let lines = t.split('\n').map((ln) => {
      let s = ln.trim();
      if (!s) return '';
      // markdown 标题行 / 分隔线
      if (/^#{1,6}\s*/.test(s)) return '';
      if (/^(-{3,}|={3,}|\*{3,})$/.test(s)) return '';
      // 形如 「## 对话总结 ##」「【总结】」的装饰标题
      if (/^[#＃*【\[]*\s*(总结|摘要|概述|梗概|正文|叙事|片段|记忆|内容)[^\n]{0,6}[#＃*】\]]*$/.test(s)) return '';
      // 开场白 / 收尾句
      if (/^(好的|当然|明白|收到|没问题)[，,。！!]?\s*(以下|下面|这是|我来)?/.test(s) && s.length < 40) return '';
      if (/^(以下|下面)(是|为)[^\n]{0,20}[:：]?$/.test(s)) return '';
      if (/^(以上|综上)[^\n]{0,30}$/.test(s)) return '';
      // 编号 / 项目符号列表 → 去掉标记保留内容（保持散文感）
      s = s.replace(/^\d+\s*[.、)）]\s*/, '');
      s = s.replace(/^[-*•·]\s+/, '');
      // 去掉行首的加粗/星号包裹（保留原文，不额外插空格）
      s = s.replace(/^\*{1,2}([^*\n]+)\*{1,2}/, '$1');
      return s;
    });
    // 去掉首尾空行
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    t = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    // 去掉全文残留的 markdown 粗体标记（保留文字）
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '$1');
    return t;
  }

  // ── 剧情线净化：只保留符合「时间｜标题｜事件」格式的有效行 ──
  // 模型若回显指令/开场白/收尾句，一律视为噪声删除（从根源兜底，不依赖正则枚举关键词）。
  function cleanPlotText(raw) {
    if (!raw) return '';
    let t = String(raw);
    t = t.replace(/<<<\s*[A-Z_]+\s*>>>/g, ''); // 残留标签
    let lines = t.split('\n').map((ln) => ln.trim()).filter(Boolean);
    // 只保留：用 ｜ 或 | 分隔成 2~3 段、且每段非空的行；其余（开场白/收尾/分析句）全删
    const kept = lines.filter((s) => {
      const parts = s.split(/[｜|]/).map((x) => x.trim()).filter(Boolean);
      return parts.length >= 2 && parts.length <= 3 && s.length <= 80;
    });
    return kept.join('\n').trim();
  }

  // ── 物品字段截断：强制每个字段不超过上限，防止模型把整段叙事塞进一个字段 ──
  function truncateItemFields(items) {
    const MAX = { name: 20, desc: 40, owner: 30, rel: 30, origin: 30 };
    return items.map((it) => ({
      name: (it.name || '').slice(0, MAX.name).trim(),
      desc: (it.desc || '').slice(0, MAX.desc).trim(),
      owner: (it.owner || '').slice(0, MAX.owner).trim(),
      relatedPlotText: (it.relatedPlotText || '').slice(0, MAX.rel).trim(),
      origin: (it.origin || '').slice(0, MAX.origin).trim(),
      // 保留关联剧情 ID 数组（若 parseItems 已匹配出），与存储层 normItem 字段对齐
      ...(Array.isArray(it.relatedPlots) ? { relatedPlots: it.relatedPlots.filter(Boolean).map(String) } : {}),
    }));
  }

  // 便捷封装：每个阶段对应一个标签名
  function taggedSummary(out) {
    // 优先 JSON：{"text":"..."}
    const { ok, data } = parseJSON(out);
    if (ok && data && typeof data === 'object' && data.text != null) {
      const text = cleanSummaryText(String(data.text));
      // summary 最终卫生检查：不能太短、不能含元指令
      if (text.length >= 10 && !_isDirtyValue(text)) return text;
    }
    // 回退：旧式 <<<SUMMARY_START>>> 标签
    const fallback = cleanSummaryText(extractTagged(out, 'SUMMARY', 'SUMMARY'));
    // 回退结果也必须通过卫生检查，否则返回空串（宁缺毋滥）
    if (fallback.length >= 10 && !_isDirtyValue(fallback)) return fallback;
    return '';
  }
  // v6+：提示词已改为「原生 JSON 契约 + response_format=json_object」双重硬锁。
  //   旧的 <<<RELATIONS_START>>> 标签提取会在"LLM 在 JSON 前多吐一两句前言"时截空，
  //   故这里统一透传原文，由 parseJSON 截取第一个合法 JSON 块。
  function taggedRelations(out) { return out != null ? String(out) : ''; }
  function taggedPlot(out)     { return out != null ? String(out) : ''; }
  function taggedItems(out)    { return out != null ? String(out) : ''; }
  function taggedWorld(out)    { return out != null ? String(out) : ''; }

  // ── 通用 JSON 解析：容忍模型加的 ```json 围栏、前后噪声、截断 ──
  // 返回 { ok, data }；解析失败 ok=false, data=null
  //
  // ⚠️ 关键防护（v5）：修复策略拼出的结果必须通过 sanity check，
  //   拒绝「碰巧能 JSON.parse 但内容是垃圾」的情况（如截取到 {"time":""} 这种片段）。
  function parseJSON(raw) {
    if (raw == null) return { ok: false, data: null };
    let s = String(raw).trim();
    // 去 ```json / ``` 围栏
    s = s.replace(/^```[a-zA-Z]*\s*/g, '').replace(/```\s*$/g, '').trim();
    // 截取第一个 { 或 [ 到最后一个 } 或 ]
    const start = s.search(/[[{]/);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (start === -1) return { ok: false, data: null };
    s = end >= start ? s.slice(start, end + 1) : s.slice(start);
    try {
      const data = JSON.parse(s);
      return _sanityCheck(data) ? { ok: true, data } : { ok: false, data: null };
    } catch (e) {
      // 尝试修复尾部残缺（模型常截断在字符串中途、缺闭合引号/括号）
      const fixes = [
        s + '"',
        s + '"}',
        s + ']',
        s + '}]',
        s.replace(/,\s*$/, '') + '}',
        s.replace(/,\s*$/, '') + '"}',
        s + '}',
      ];
      for (const f of fixes) {
        try {
          const d = JSON.parse(f);
          if (_sanityCheck(d)) return { ok: true, data: d };
        } catch (e2) {}
      }
      return { ok: false, data: null };
    }
  }

  // ── Sanity check：验证解析结果是否为"合理的数据结构"而非垃圾片段 ──
  // 拒绝以下情况：
  //   - 纯字符串值但长度 > 500（大概率是整段叙事/指令回显）
  //   - 对象的所有 value 都是空串（如 {"time":"","title":"","summary":""}）
  //   - 数组中每个元素的所有可枚举 value 都空（同上）
  //   - 值包含明显的 JSON 片段残留（{"time":""} 这类字面量）
  //   - 值包含元指令特征（"只输出"/"不要解释"/"JSON 格式"等）
  function _sanityCheck(data) {
    if (data == null) return false;
    if (typeof data === 'string') {
      // 字符串只在 summary 场景合法，且不能太长（>800 大概率是垃圾）
      return data.length > 0 && data.length <= 800;
    }
    if (typeof data !== 'object') return false;
    if (Array.isArray(data)) {
      // 空数组 [] 是合法的（表示"无新事件/无关系"）
      if (data.length === 0) return true;
      // 非空数组：只要存在至少一个非 junk 元素就通过（不过滤，留给上层 parsePlots/parseItems 做逐条过滤）
      // 这样避免"一个坏元素害死整个数组"的问题
      return data.some((item) => item && typeof item === 'object' && Object.keys(item).length > 0 && !_isJunkObject(item));
    }
    // 普通对象
    return Object.keys(data).length > 0 && !_isJunkObject(data);
  }

  // 检测一个对象是否为"垃圾对象"（所有字段值都空，或含明显非法内容）
  function _isJunkObject(obj) {
    if (!obj || typeof obj !== 'object') return true;
    const vals = Object.values(obj).map((v) => String(v == null ? '' : v));
    // 所有值都空 → 垃圾
    if (vals.every((v) => v.trim() === '')) return true;
    // 任一值含 JSON 片段残留或元指令 → 整个对象可疑
    const junkPat = /^\s*\{["']?\w+["']?\s*:\s*["']?\s*["']?\}/;  // {"time":""} 这类
    const numberedJsonPat = /^\d+\s*[\.\、]\s*\{/;  // "6. {\"time\":\"}" 这类
    // 元指令/思考过程关键词（不设长度下限，短文本也要拦）
    const metaPat = /只输出|不要任何|JSON|markdown|代码块|格式如下|输出格式|系统要求|请严格|注意[:：]|我们需要|让我们构造|时间点.*可以是|按顺序|分析物品|关联剧情标题|我们分析/;
    for (const v of vals) {
      if (junkPat.test(v.trim())) return true;
      if (numberedJsonPat.test(v.trim())) return true;
      if (metaPat.test(v)) return true;
      // 字符串值超长（>800）→ 大概率是整段叙事/指令回显被塞进了单个字段
      if (v.length > 800) return true;
    }
    return false;
  }

  // ── 字段值卫生检查：检测单个字段值是否含非法内容 ──
  function _isDirtyValue(v) {
    const s = String(v == null ? '' : v);
    if (!s) return false;  // 空值不算脏，由上层必填校验处理
    // 含字段名模式（模型把 "desc xxx；owner yyy" 当成 desc 的值）
    if (/^(desc|name|title|summary|owner|origin|related|label|from|to|time|type|rules?|content)\s+[^\s]/i.test(s.trim())) return true;
    if (/^(desc|name|title|summary|owner|origin|related|label|from|to|time|type|rules?|content)\s*[：:]/i.test(s.trim())) return true;
    // 含元指令/思考过程残留
    if (/只输出|不要任何|markdown 代码块|JSON 格式|输出应该|我们需要压缩|注意：输出/.test(s) && s.length > 8) return true;
    // 占位符/无意义填充
    if (/^[\(（](未填写|无|未知|空)[^)）]*[\)）]$/.test(s.trim())) return true;
    if (/^(未填写作用|（未填写作用）)$/.test(s.trim())) return true;
    // 含 JSON 片段字面量（如 {"time":""} 被当成 title）
    if (/^\s*\{".*"\s*\}/.test(s.trim())) return true;
    // 思考过程/元语句前缀
    if (/^(让我们构造|按顺序|时间点.*可以是|分析物品|关联剧情标题|我们分析|让我们)/.test(s.trim())) return true;
    // 编号+JSON片段（如 "6. {\"time\":\"}" 这类）
    if (/^\d+\s*[\.\、]\s*\{/.test(s.trim())) return true;
    return false;
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
        const cleaned = sanitizeLLMText(text);
    // 输出过短保护：模型偶尔抽风只回一两个字（如"和"），这种无效片段不应被当成成功。
    // 按 phase 给不同最小长度预期（可在 opts.minLen 覆盖）；非 phase 调用默认 8。
    let minLen = 8;
    if (opts && opts.minLen != null) minLen = opts.minLen;
    else if (opts && opts.phase === 'summary') minLen = 30;
    else if (opts && opts.phase === 'world') minLen = 20;
    else if (opts && opts.phase === 'plot') minLen = 15;
    else if (opts && opts.phase === 'items') minLen = 10;
    else if (opts && opts.phase === 'relations') minLen = 6;
        if (cleaned.length < minLen) {
          throw new Error('模型返回过短（仅 ' + cleaned.length + ' 字：' + cleaned.slice(0, 20) + '），疑似截断/抽风');
        }
        return cleaned;
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

  // ── 关系解析：只认 JSON，强制 Schema 校验；含推测/分析/占位语的整条丢弃。
  //   v5 文本回退路径已删除——"回退"反而会把 LLM 的分析前言当关系吞进结构化字段。
  //   JSON 失败时 callLLM 会触发重试，三次重试拿不到就放弃本条，绝不拿垃圾填空。
  function parseRelations(out) {
    const { ok, data } = parseJSON(out);
    if (!ok || !Array.isArray(data)) return [];
    // label 必须是明确关系词（短词、名词性），不能是完整句子或分析语。
    const BAD_LABEL_RE = /(可能|也许|或许|大概|似乎|好像|感觉|推测|推测是|应该是|可能是|也许是|未提及|未出现|暂无|未知|不确定|不清楚|不知道|不明|有待|关系|互动|联系|关联|对话|交流|接触|见过|认识|提到|讨论|提及|涉及|关于)/;
    // from/to 不能是占位语，不能是完整句子。
    const BAD_NAME_RE = /(对话未提及|未提及具体|可能还需要|让我们|按顺序|分析物品|关联剧情|以上|以下|如下|用户要求|系统要求|注意[:：]|时间点可以是)|[\.。,，；;！!？?]/;
    return data
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        from: String(r.from || '').trim(),
        to: String(r.to || '').trim(),
        label: String(r.label || '').trim(),
      }))
      .filter((r) => {
        if (!r.from || !r.to || !r.label) return false;
        if (r.from === r.to) return false; // 自环无意义
        if (_isDirtyValue(r.from) || _isDirtyValue(r.to) || _isDirtyValue(r.label)) return false;
        // 长度硬限
        if (r.label.length < 2 || r.label.length > 10) return false;
        if (r.from.length < 2 || r.from.length > 8) return false;
        if (r.to.length < 2 || r.to.length > 8) return false;
        // 语义过滤：label 不能含推测词/句子性词
        if (BAD_LABEL_RE.test(r.label)) return false;
        if (BAD_NAME_RE.test(r.from) || BAD_NAME_RE.test(r.to)) return false;
        // label 不能是 from/to 自己的名字（模型常见错位输出）
        if (r.label === r.from || r.label === r.to) return false;
        return true;
      });
  }

  // ── 剧情线解析：只认 JSON，强制 Schema 校验；v5 文本回退已删除。
  //   时间列（time）不是必填——对话没提时间就留空，不允许把"对话未提及具体""可能还需要考虑…"这类占位语写进去。
  function parsePlots(out) {
    const { ok, data } = parseJSON(out);
    if (!ok || !Array.isArray(data)) return [];
    // 占位/分析前缀：任一字段含这些词，整条丢弃或该字段清空。
    const BAD_RE = /(对话未提及|未提及具体|可能还需要|建议考虑|需进一步|有待补充|暂无信息|待定|待补充|未填写|未标注|占位|示例|示例如下|时间点可以是|分析如下|解析如下|逐段解析|第一段|第二段|第三段|第四段|第五段)/;
    // 编号开头："8. xxx""7、xxx"这类模型把行号塞进 title 的垃圾
    const NUM_PREFIX_RE = /^\s*\d+\s*[\.、\)\)：:]/;
    return data
      .filter((p) => p && typeof p === 'object')
      .map((p) => {
        let time = String(p.time || '').slice(0, 20).trim();
        let title = String(p.title || '').slice(0, 12).trim();
        let summary = String(p.summary || '').slice(0, 80).trim();
        if (BAD_RE.test(time)) time = '';
        if (BAD_RE.test(summary)) summary = '';
        // 去编号前缀
        if (NUM_PREFIX_RE.test(title)) title = title.replace(NUM_PREFIX_RE, '').trim();
        if (NUM_PREFIX_RE.test(summary)) summary = summary.replace(NUM_PREFIX_RE, '').trim();
        return { time, title, summary };
      })
      .filter((p) => {
        // title 必须有实质内容（不能是空串、不能是 JSON 片段、不能是元指令、不能是占位语）
        if (!p.title) return false;
        if (_isDirtyValue(p.title)) return false;
        if (BAD_RE.test(p.title)) return false;
        if (NUM_PREFIX_RE.test(p.title)) return false;
        if (_isDirtyValue(p.summary)) p.summary = '';  // summary 脏则清空，不整条丢弃
        if (_isDirtyValue(p.time)) p.time = '';
        // title 不能是纯标点/数字/单个字符（如 "." / "1" / "{"）
        if (/^[\d\{\}\[\]\"\'\.\,\;\:\|｜]+$/.test(p.title)) return false;
        // title 长度至少 2 字符
        if (p.title.length < 2) return false;
        return true;
      });
  }

  // ── 物品解析：只认 JSON，强制 Schema 校验；v5 文本回退已删除。
  //   plots: 可选，传入已有剧情线列表时，直接把关联剧情文本匹配成 relatedPlots(ID数组)，与存储层字段对齐。
  function parseItems(out, plots) {
    const isBlankRel = (v) => !v || /^(无|未知|未标注|-|—)$/.test(v);
    const matchPlotIds = (text) => {
      if (!text || isBlankRel(text) || !Array.isArray(plots)) return [];
      const ids = [];
      for (const t of String(text).split(/[、,，/]/).map((x) => x.trim()).filter(Boolean)) {
        const hit = plots.find((p) => p.title === t) || plots.find((p) => p.title && (p.title.includes(t) || t.includes(p.title)));
        if (hit) ids.push(hit.id);
      }
      return ids;
    };
    const { ok, data } = parseJSON(out);
    if (!ok || !Array.isArray(data)) return [];
    // 占位/分析前缀：任一字段含这些词则整条丢弃或对应字段清空。
    //   ——这是修复你截图里"另外，对话中提到的掌门印信…""让我逐段解析…""第一段""第二段"
    //     这些 LLM 分析前言被误认作物品名的核心过滤。
    const BAD_NAME_RE = /(对话未提及|未提及具体|可能还需要|建议考虑|另外[，,]|对话中提到|逐段解析|解析如下|分析如下|第一段|第二段|第三段|第四段|第五段|第六段|第七段|第八段|第九段|第十段|让我|我们来|接下来|总结一下|以上|以下|示例|示例如下|未填写|待补充|暂无|占位)/;
    const BAD_DESC_RE = /(未填写作用|未填写|待补充|暂无作用|待明确|作用未明)/;
    const BAD_OWNER_RE = /^持有者[:：]|未知$/;
    const items = data
      .filter((it) => it && typeof it === 'object')
      .map((it) => {
        let name = String(it.name || '').trim();
        let desc = String(it.desc || '').trim();
        let owner = String(it.owner || '').trim();
        let origin = String(it.origin || '').trim();
        let relText = String(it.related || it.relatedPlotText || '').trim();
        // 字段级清洗：命中占位词则清空
        if (BAD_DESC_RE.test(desc)) desc = '';
        if (BAD_OWNER_RE.test(owner)) owner = '';
        if (_isDirtyValue(desc)) desc = '';
        if (_isDirtyValue(owner)) owner = '';
        if (_isDirtyValue(origin)) origin = '';
        if (_isDirtyValue(relText)) relText = '';
        const relIds = matchPlotIds(relText);
        const obj = { name, desc, owner, origin, relatedPlotText: relText };
        if (relIds.length) obj.relatedPlots = relIds;
        return obj;
      })
      .filter((it) => {
        if (!it.name) return false;
        if (_isDirtyValue(it.name)) return false;
        // 最关键的一条：name 绝不能是 LLM 的分析前言。
        if (BAD_NAME_RE.test(it.name)) return false;
        // name 不能是句子（长度过长或含标点过多），也不能是纯标点/JSON 片段
        if (it.name.length < 1 || it.name.length > 20) return false;
        if (/^[\d\{\}\[\]\"\'\.\,\;\:\|｜]+$/.test(it.name)) return false;
        // name 含句号/问号/感叹号 —— 是一句话不是物品名，整条丢
        if (/[。！？!?\n]/.test(it.name)) return false;
        return true;
      });
    return truncateItemFields(items);
  }

  // ── 世界观解析：优先 JSON，强制 Schema 校验 ──
  function parseWorld(out) {
    const { ok, data } = parseJSON(out);
    if (ok && data && typeof data === 'object') {
      const rules = Array.isArray(data.rules) ? data.rules
        .filter((r) => r && typeof r === 'object')
        .map((r) => ({ title: String(r.title || '').slice(0, 20).trim(), content: String(r.content || '').slice(0, 60).trim() }))
        .filter((r) => {
          if (!r.title || !r.content) return false;
          if (_isDirtyValue(r.title) || _isDirtyValue(r.content)) return false;
          return true;
        })
        : [];
      // name/type/desc 卫生检查
      const name = _isDirtyValue(data.name) ? '' : String(data.name || '').slice(0, 30).trim();
      const type = _isDirtyValue(data.type) ? '' : String(data.type || '').slice(0, 20).trim();
      const desc = _isDirtyValue(data.desc) ? '' : String(data.desc || '').slice(0, 80).trim();
      return { name, type, desc, rules: rules.slice(0, 6) };
    }
    // 回退：旧式「■标题｜内容」文本
    const text = out.replace(/<<<\s*[A-Z_]+\s*>>>/g, '').trim();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const meta = { name: '', type: '', desc: '' };
    const rules = [];
    for (const ln of lines) {
      const m = ln.match(/^■\s*(.+?)\s*[｜|]\s*(.+)$/);
      if (m) { rules.push({ title: m[1].trim().slice(0, 20), content: m[2].trim().slice(0, 60) }); continue; }
      const kv = ln.match(/^(世界名|世界类型|简述|名称|类型|描述)[:：]\s*(.+)$/);
      if (kv) {
        const k = kv[1];
        if (k.includes('名')) meta.name = kv[2].trim().slice(0, 30);
        else if (k.includes('类型')) meta.type = kv[2].trim().slice(0, 20);
        else if (k.includes('简述') || k.includes('描述')) meta.desc = kv[2].trim().slice(0, 80);
      }
    }
    return { name: meta.name, type: meta.type, desc: meta.desc, rules: rules.slice(0, 6) };
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
        const rawSummary = await callLLM(sys, '直接输出 JSON 对象 {"text":"..."}，整段回复须可被 JSON.parse 解析。', settings, { temperature: 0.3, phase: 'summary', jsonMode: true });
        const summaryText = taggedSummary(rawSummary);
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
          const worldRaw = await WM.Worldbook.inferWorldview(settings, { recent });
          const world = taggedWorld(worldRaw);
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
          const out = await callLLM(s, '直接输出 JSON 数组，整段回复须可被 JSON.parse 解析。', settings, { temperature: 0.3, phase: 'items', jsonMode: true });
          const itemRaw = taggedItems(out);
          const parsedItems = parseItems(itemRaw);
          const allPlots = WM.MemoryStore.getPlots() || [];
          const blank = (v) => !v || /^(无|未知|未标注|-|—)$/.test(v);
          for (const it of parsedItems) {
            const name = it.name;
            if (!name) continue;
            const relIds = [];
            if (!blank(it.relatedPlotText)) {
              for (const t of it.relatedPlotText.split(/[、,，/]/).map((x) => x.trim()).filter(Boolean)) {
                const hit = allPlots.find((p) => p.title === t) || allPlots.find((p) => p.title && (p.title.includes(t) || t.includes(p.title)));
                if (hit) relIds.push(hit.id);
              }
            }
            const exist = (WM.MemoryStore.getItems() || []).find((x) => x.name === name);
            const data = {
              name,
              desc: blank(it.desc) ? (exist ? exist.desc : '') : it.desc,
              owner: blank(it.owner) ? (exist ? exist.owner : '') : it.owner,
              origin: blank(it.origin) ? (exist ? exist.origin : '') : it.origin,
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
          const out = await callLLM(s, '直接输出 JSON 数组，整段回复须可被 JSON.parse 解析。', settings, { temperature: 0.3, phase: 'relations', jsonMode: true });
          const parsed = parseRelations(taggedRelations(out));
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
          const out = await callLLM(s, '直接输出 JSON 数组，整段回复须可被 JSON.parse 解析；无新事件则输出 []。', settings, { temperature: 0.4, phase: 'plot', jsonMode: true });
          const parsed = parsePlots(taggedPlot(out));
          const existing = WM.MemoryStore.getPlots() || [];
          // 归一化 key：用于跨次去重，避免模型偶尔回显旧事件时产生重复条目
          const normKey = (p) => `${(p.time || '').replace(/\s/g, '')}|${(p.title || '').replace(/\s/g, '')}|${(p.summary || '').replace(/\s/g, '')}`;
          const existKeys = new Set(existing.map(normKey));
          let added = 0, skipped = 0;
          for (const ev of parsed) {
            // 增量语义：只追加「新事件」，已有（key 相同）一律跳过，不覆盖、不重复
            if (existKeys.has(normKey(ev))) { skipped++; continue; }
            await WM.MemoryStore.addPlot(ev);
            added++;
          }
          // 指针推进：仅「仅新增楼层(new)」与「立即处理全部(forceAll)」推进指针，
          // 避免 count/range/floor 等窗口模式跑一次就把指针顶到 total → 之后永远 skip 导致"不自动更新"。
          if (settings.autoPlotMode === 'new' || opts.forceAll) {
            await WM.MemoryStore.setPlotPointer(range[1]);
          }
          return { kind: 'plot', ok: true, added, skipped };
        })());
        labels.push('plot');
      }

      // —— 物品 LLM（跟随剧情线一并跑：用本段 recent 区间，关联已有剧情线） ——
      if (settings.autoItems !== false) {
        tasks.push((async () => {
          const tpl = settings.prompts && settings.prompts.itemExtract;
          if (!tpl) return { kind: 'items', ok: true, skipped: true };
          const allPlots = WM.MemoryStore.getPlots() || [];
          const knownPlots = allPlots
            .map((p) => `· ${p.title || p.time || p.id}`).join('\n') || '（无）';
          const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), plot: knownPlots });
          const out = await callLLM(s, '直接输出 JSON 数组，整段回复须可被 JSON.parse 解析。', settings, { temperature: 0.3, phase: 'items', jsonMode: true });
          const itemRaw = taggedItems(out);
          // 传入 allPlots，让 parseItems 直接把关联剧情文本匹配成 relatedPlots(ID数组)
          const parsedItems = parseItems(itemRaw, allPlots);
          const blank = (v) => !v || /^(无|未知|未标注|-|—)$/.test(v);
          for (const it of parsedItems) {
            const name = it.name;
            if (!name) continue;
            const exist = (WM.MemoryStore.getItems() || []).find((x) => x.name === name);
            const data = {
              name,
              desc: blank(it.desc) ? (exist ? exist.desc : '') : it.desc,
              owner: blank(it.owner) ? (exist ? exist.owner : '') : it.owner,
              origin: blank(it.origin) ? (exist ? exist.origin : '') : it.origin,
              relatedPlots: Array.isArray(it.relatedPlots) && it.relatedPlots.length ? it.relatedPlots : (exist ? exist.relatedPlots : []),
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
      const rawBig = await callLLM(sys, '直接输出 JSON 对象 {"text":"..."}，整段回复须可被 JSON.parse 解析。', settings, { temperature: 0.3, phase: 'summary', jsonMode: true });
      const text = taggedSummary(rawBig);
      await WM.MemoryStore.addSummary(text, 'big', '大总结（整合 ' + recentSmalls.length + ' 段小总结）');
      return { ok: true, count: recentSmalls.length };
    } catch (e) {
      if (WM.ErrLog) await WM.ErrLog.add('big-summary', e, {});
      return { ok: false, reason: e && e.message ? e.message : String(e) };
    }
  }

  WM.Summary = { fillTemplate, callLLM, triggerSummary, runSummary: triggerSummary, triggerPlot, triggerBigSummary, getRecentMessages, toMessages, isSummarizing, isPlotting,
    extractTagged, taggedSummary, taggedRelations, taggedPlot, taggedWorld, taggedItems, parsePlots, parseRelations, parseItems, parseWorld, parseJSON,
    sanitizeLLMText, cleanSummaryText, cleanPlotText, truncateItemFields };
})();
