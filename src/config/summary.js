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

  // ════════════════════════════════════════════════════════════
  // v8 重写：统一垃圾检测 + 精简净化层
  // 旧版叠了 BANNED_WORDS_RE / META_LINE_RE / RULE_VERB_RE / extractTagged /
  //   _sanityCheck / _isJunkObject / _isDirtyValue 七层正则枚举，互相重叠仍漏。
  // v8 只留一个 isJunkText 做单点判断，所有 parse 函数共用。
  // ════════════════════════════════════════════════════════════

  // 统一垃圾检测：判断单个字段值是否是 LLM 前言/占位语/分析语/编号前缀/字段错位/纯标点。
  // 返回 true = 垃圾，该字段应丢弃或清空。空串返回 false（由上层必填校验处理）。
  function isJunkText(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return false;
    // 长文本（>60字）不可能是短字段垃圾（前言/编号/占位），直接放行——
    //   这条保护 summary 正文和长 desc 不被误杀（如"师尊让我去丹房"里的"让我"）。
    if (s.length > 60) return false;
    // 1. 字段名错位：模型把 "desc：xxx" "name: xxx" 当成字段值
    if (/^(desc|name|title|summary|owner|origin|related|label|from|to|time|type|rules?|content)\s*[：:]/i.test(s)) return true;
    if (/^(desc|name|title|summary|owner|origin|related|label|from|to|time|type|rules?|content)\s+[^\s：:]/i.test(s)) return true;
    // 2. LLM 分析前言 / 思考过程（只拦以这些词【开头】的短字段值，不拦正常叙事里含这些词的长文本）
    if (/^(让我|我们来|接下来我|另外[，,]|逐段|解析如下|分析如下|总结一下|根据对话|按照要求|用户要求|系统要求|我们需要|我打算|我将)/.test(s)) return true;
    // 3. 占位语 / 模板填充语（短字段值才检查，长叙事里"未提及"可能是正常用语）
    if (s.length < 30 && /(未提及|未填写|可能还需要|建议考虑|需进一步|有待补充|待补充|暂无|占位|示例|示例如下|不确定|不清楚|不知道)/.test(s)) return true;
    // 4. 段落编号开头："第一段" "第二段"
    if (/^第[一二三四五六七八九十百]+段/.test(s)) return true;
    // 5. 数字编号开头："8. xxx" "7、xxx" "1) xxx"（但允许"第一天""第一次"这种时间词）
    if (/^\d+\s*[\.、\)\）]/.test(s)) return true;
    // 6. JSON 片段残留：值本身就是 {"time":""} 这种
    if (/^\s*\{['"]?\w+['"]?\s*:/.test(s)) return true;
    if (/^\d+\s*[\.、]\s*\{/.test(s)) return true;
    // 7. 纯标点 / 纯数字 / 纯符号
    if (/^[\d\s\{\}\[\]"'\.\,\;\:\|｜\-–—•·]+$/.test(s)) return true;
    // 8. 元指令残留
    if (/(只输出|不要任何|markdown|代码块|格式如下|输出格式|输出应该|注意：输出)/.test(s)) return true;
    return false;
  }

  // 净化 LLM 原始输出（精简版 v8）：只去 markdown 围栏 + 寒暄前缀 + 合并空行。
  //   旧版三层禁词正则已删除——禁词回显的根源在提示词（v8 不再列禁词），
  //   字段级垃圾由 isJunkText 在 parse 阶段统一拦截。
  function sanitizeLLMText(raw) {
    if (!raw) return '';
    var t = String(raw);
    t = t.replace(/^```[a-zA-Z]*\s*$/gim, '').replace(/```\s*$/g, '').trim(); // 去 ```json 围栏
    t = t.replace(/<<<\s*[A-Z_]+\s*>>>/g, ''); // 去残留标签
    t = t.replace(/^(好的[，,。！!]?\s*|当然[，,]?\s*|明白[，,]?\s*|没问题[，,]?\s*|以下是[^\n]{0,20}[:：]?\s*|这是为您[^\n]{0,20}[:：]?\s*)/i, ''); // 去寒暄前缀
    t = t.replace(/\n{3,}/g, '\n\n').trim(); // 合并空行
    return t;
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

  // cleanPlotText 已删除（v8：plot 走 JSON，不需要旧式「时间｜标题｜事件」文本净化）

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

  // v8：taggedSummary 只走 JSON，解析失败返回空串（宁缺毋滥，不回退到旧式标签文本）
  function taggedSummary(out) {
    const { ok, data } = parseJSON(out);
    if (ok && data && typeof data === 'object' && data.text != null) {
      const text = cleanSummaryText(String(data.text));
      // summary 卫生检查：不能太短、不能是 LLM 前言/元指令
      if (text.length >= 10 && !isJunkText(text)) return text;
    }
    return '';
  }
  // v6+：提示词已改为「原生 JSON 契约 + response_format=json_object」双重硬锁。
  //   旧的 <<<RELATIONS_START>>> 标签提取会在"LLM 在 JSON 前多吐一两句前言"时截空，
  //   故这里统一透传原文，由 parseJSON 截取第一个合法 JSON 块。
  function taggedRelations(out) { return out != null ? String(out) : ''; }
  function taggedPlot(out)     { return out != null ? String(out) : ''; }
  function taggedItems(out)    { return out != null ? String(out) : ''; }
  function taggedWorld(out)    { return out != null ? String(out) : ''; }

  // ── 通用 JSON 解析（v8 精简版）：容忍 ```json 围栏、前后噪声、尾部截断 ──
  // 返回 { ok, data }；只做结构校验（能 JSON.parse 且非 null），内容质量交给 isJunkText 在 parse 阶段拦截。
  // 旧的 _sanityCheck / _isJunkObject / _isDirtyValue 三层内容校验已删除——与 isJunkText 职责重叠，
  //   且在 parseJSON 层做内容校验会导致"一个坏元素害死整个数组"。
  function parseJSON(raw) {
    if (raw == null) return { ok: false, data: null };
    let s = String(raw).trim();
    s = s.replace(/^```[a-zA-Z]*\s*/g, '').replace(/```\s*$/g, '').trim(); // 去围栏
    const start = s.search(/[[{]/);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (start === -1) return { ok: false, data: null };
    s = end >= start ? s.slice(start, end + 1) : s.slice(start);
    try {
      const data = JSON.parse(s);
      return data == null ? { ok: false, data: null } : { ok: true, data };
    } catch (e) {
      // 尝试修复尾部残缺（模型常截断在字符串中途、缺闭合引号/括号）
      const fixes = [s + '"', s + '"}', s + ']', s + '}]', s.replace(/,\s*$/, '') + '}', s.replace(/,\s*$/, '') + '"}', s + '}'];
      for (const f of fixes) {
        try {
          const d = JSON.parse(f);
          if (d != null) return { ok: true, data: d };
        } catch (e2) {}
      }
      return { ok: false, data: null };
    }
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

  // ── 关系解析（v8）：只认 JSON，用 isJunkText 统一过滤。文本回退已删。
  //   JSON 失败时 callLLM 重试三次，三次拿不到就放弃，绝不拿垃圾填空。
  function parseRelations(out) {
    const { ok, data } = parseJSON(out);
    if (!ok || !Array.isArray(data)) return [];
    // label 必须是明确关系词（2-6字短词），不能含推测/句子性词
    const LABEL_BAD = /(可能|也许|或许|大概|似乎|好像|感觉|推测|应该|未提及|未出现|暂无|未知|不确定|不清楚|不知道|不明|有待|关系|互动|联系|关联|对话|交流|接触|见过|认识|提到|讨论|提及|涉及|关于)/;
    return data
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        from: String(r.from || '').trim().slice(0, 8),
        to: String(r.to || '').trim().slice(0, 8),
        label: String(r.label || '').trim().slice(0, 10),
      }))
      .filter((r) => {
        if (!r.from || !r.to || !r.label) return false;
        if (r.from === r.to) return false;            // 自环无意义
        if (isJunkText(r.from) || isJunkText(r.to) || isJunkText(r.label)) return false;
        if (r.label.length < 2 || r.from.length < 2) return false;
        if (LABEL_BAD.test(r.label)) return false;     // label 含推测/句子性词
        if (r.label === r.from || r.label === r.to) return false; // label 错位
        return true;
      });
  }

  // ── 剧情线解析（v8）：只认 JSON，用 isJunkText 统一过滤。文本回退已删。
  //   time 不是必填——对话没提时间就留空，不允许把占位语写进去。
  function parsePlots(out) {
    const { ok, data } = parseJSON(out);
    if (!ok || !Array.isArray(data)) return [];
    return data
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        time: String(p.time || '').trim().slice(0, 20),
        // 末尾断句符先去掉（LLM 常给标题加尾标点）；内部仍含则由 filter 判为句子丢弃
        title: String(p.title || '').trim().replace(/[。！？!?\n]+$/g, '').trim().slice(0, 12),
        summary: String(p.summary || '').trim().slice(0, 80),
      }))
      .filter((p) => {
        if (!p.title) return false;                    // title 必填
        if (isJunkText(p.title)) return false;        // title 是垃圾 → 整条丢
        if (p.title.length < 2) return false;
        if (/[。！？!?\n]/.test(p.title)) return false; // title 是一句话不是标题
        // time/summary 是选填，脏则清空，不整条丢
        if (isJunkText(p.time)) p.time = '';
        if (isJunkText(p.summary)) p.summary = '';
        return true;
      });
  }

  // ── 物品解析（v8）：只认 JSON，用 isJunkText 统一过滤。文本回退已删。
  //   plots: 可选，传入已有剧情线时把 related 文本匹配成 relatedPlots(ID 数组)。
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
    const items = data
      .filter((it) => it && typeof it === 'object')
      .map((it) => {
        // 末尾的句号/感叹号/问号去掉再判断（LLM 常给标题加尾标点，整条丢太可惜）；
        //   若去掉尾标点后内部仍含这些断句符，filter 阶段会判定为"是句子不是标题"再丢。
        let name = String(it.name || '').trim().replace(/[。！？!?\n]+$/g, '').trim();
        let desc = String(it.desc || '').trim();
        let owner = String(it.owner || '').trim();
        let origin = String(it.origin || '').trim();
        let relText = String(it.related || it.relatedPlotText || '').trim();
        // 选填字段脏则清空，不整条丢
        if (isJunkText(desc)) desc = '';
        if (isJunkText(owner) || /^(未知|持有者[:：].*)$/.test(owner)) owner = '';
        if (isJunkText(origin)) origin = '';
        if (isJunkText(relText)) relText = '';
        const relIds = matchPlotIds(relText);
        const obj = { name, desc, owner, origin, relatedPlotText: relText };
        if (relIds.length) obj.relatedPlots = relIds;
        return obj;
      })
      .filter((it) => {
        if (!it.name) return false;                   // name 必填
        if (isJunkText(it.name)) return false;       // name 是垃圾 → 整条丢
        if (it.name.length < 2 || it.name.length > 20) return false;
        if (/[。！？!?\n]/.test(it.name)) return false; // name 是一句话不是物品名
        return true;
      });
    return truncateItemFields(items);
  }

  // ── 世界观解析（v8）：只认 JSON，用 isJunkText 统一过滤。旧式 ■ 文本回退已删。
  function parseWorld(out) {
    const { ok, data } = parseJSON(out);
    if (!ok || !data || typeof data !== 'object') return { name: '', type: '', desc: '', rules: [] };
    const rules = Array.isArray(data.rules) ? data.rules
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({ title: String(r.title || '').trim().slice(0, 20), content: String(r.content || '').trim().slice(0, 60) }))
      .filter((r) => {
        if (!r.title || !r.content) return false;
        if (isJunkText(r.title) || isJunkText(r.content)) return false;
        return true;
      })
      .slice(0, 6) : [];
    const name = isJunkText(data.name) ? '' : String(data.name || '').trim().slice(0, 30);
    const type = isJunkText(data.type) ? '' : String(data.type || '').trim().slice(0, 20);
    const desc = isJunkText(data.desc) ? '' : String(data.desc || '').trim().slice(0, 80);
    return { name, type, desc, rules };
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
    taggedSummary, taggedRelations, taggedPlot, taggedWorld, taggedItems, parsePlots, parseRelations, parseItems, parseWorld, parseJSON,
  sanitizeLLMText, cleanSummaryText, truncateItemFields, isJunkText };
})();
