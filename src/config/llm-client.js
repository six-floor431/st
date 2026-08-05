// LLM 调用封装：直接按用户填写的 Base URL 走 OpenAI 兼容 /chat/completions 协议，
// 不再依赖酒馆的 generateRaw / generate（彻底删掉"本地酒馆源"调用路径）。
// 只发送我们自己的自定义提示词（system + user），不携带酒馆预设/角色卡/聊天历史。
// 每次调用都通过 WM.DebugLog 分别记录「请求 message」与「AI 输出结果」。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function normalizeBaseUrl(u) {
    if (!u) return '';
    return String(u).replace('0.0.0.0', '127.0.0.1').replace(/\/+$/, '');
  }

  // 由 profile 解析出完整的 chat completions 地址。
  // 用户直接填 Base URL（自适应 OpenAI / DeepSeek / 火山引擎等 OpenAI 兼容服务）。
  // 常见形态：
  //   https://api.openai.com/v1                       -> .../v1/chat/completions
  //   https://ark.cn-beijing.volces.com/api/v3        -> .../api/v3/chat/completions
  //   https://api.deepseek.com/v1                     -> .../v1/chat/completions
  //   https://x.example.com/v1/chat/completions       -> 原样
  function resolveUrl(p) {
    const base = normalizeBaseUrl(p && p.apiUrl) || '';
    if (!base) return '';
    if (/chat\/completions$/i.test(base)) return base; // 已完整
    if (/\/v1\/chat$/i.test(base)) return base + '/completions';
    if (/\/v1\/?$/i.test(base)) return base + '/chat/completions'; // 标准 /v1
    // 其余（如火山 /api/v3、或裸 host）统一补齐 /chat/completions
    return base + '/chat/completions';
  }

  // 核心：直接 fetch 用户配置的 OpenAI 兼容接口。
  // 支持两种签名（向后兼容）：
  //   新：complete(messages, opts)  —— messages: [{role:'system'|'user', content}]
  //   旧：complete(systemText, userText, settings, opts)
  async function complete(a, b, c, d) {
    let messages, opts;
    if (typeof b === 'string') {
      // 旧签名：complete(systemText, userText, settings, opts)
      messages = [{ role: 'system', content: a || '' }, { role: 'user', content: b || '' }];
      opts = Object.assign({}, d || {}, (c && c.llmConfig) ? { profile: c.llmConfig } : {});
    } else {
      // 新签名：complete(messages, opts)
      messages = a || [];
      opts = b || {};
    }
    opts = opts || {};
    const profile = opts.profile || {};
    const url = resolveUrl(profile);
    if (!url) {
      throw new Error('未配置 LLM Base URL（请在设置中填写 apiUrl，如 https://api.openai.com/v1）');
    }
    const maxTokens = opts.maxTokens || profile.maxTokens || 700;
    const temperature = opts.temperature != null ? opts.temperature : (profile.temperature != null ? profile.temperature : 0.3);
    // 深度思考：开启后按模型名自适应注入各家「深度思考/推理」参数
    const deepOn = profile.deepThinking === true;
    const reasoningEffort = (opts && opts.reasoningEffort) || profile.reasoningEffort || 'medium';
    // 原生 JSON 模式：仅当调用方明确要求（opts.jsonMode）且模型支持时注入。
    // 支持列表：DeepSeek（api.deepseek.com）、OpenAI（gpt-4o/gpt-4/gpt-4.1 等非思考系）、通义/兼容 OpenAI 的 JSON 端点。
    // 思考模型（o 系列 / deepseek-reasoner / qwen3-thinking 等）不强制 json_object，避免与思考链冲突——它们已靠 prompt 约束。
    const mdl = String(profile.model || '').toLowerCase();
    const isJsonCapable = /deepseek|gpt-4|gpt-3\.5|openai|qwen|通义|dashscope|moonshot|kimi|glm|智谱|zhipu|doubao|豆包|volc|abab|minimax|baichuan|chatglm/.test(mdl)
      && !/reasoner|(^|[^a-z0-9])o[0-9]|(^|[^a-z0-9])(o1|o3|o4)([^a-z0-9]|$)|qwq|qwen-?3.*thinking|thinking/.test(mdl);
    const wantJson = opts.jsonMode === true && isJsonCapable;

    // 组装 OpenAI 兼容请求体（只含我们自己的提示词）
    const body = {
      model: profile.model || '',
      messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), content: String(m.content || '') })),
      max_tokens: maxTokens,
      temperature: temperature,
    };

    // 原生 JSON 模式：API 层强制输出合法 JSON（比 prompt 软约束可靠得多）。
    // 仅在调用方要求且模型支持时注入；思考模型不注入以免与思考链冲突。
    if (wantJson) {
      body.response_format = { type: 'json_object' };
      // DeepSeek 要求：开启 JSON 模式时，system 或 user 消息里需包含「json」字样，否则易 400。
      // 我们的 prompt 已含 JSON 示例，这里再保险地在 user 末尾追加一句，确保兼容。
      const lastUser = body.messages.filter((m) => m.role === 'user').pop();
      if (lastUser && !/json/i.test(lastUser.content)) {
        lastUser.content += '\n请严格以 JSON 格式输出。';
      }
    }

    // —— 深度思考参数适配（按模型名判断厂家/系列）——
    // 不同厂家对「深度思考」的实现完全不同，这里统一在开关开启时注入对应字段：
    //   OpenAI o 系列      : reasoning_effort = low|medium|high
    //   DeepSeek reasoner  : 模型本身即思考模型，返回 reasoning_content，无需额外参数（仅确保 max_tokens 充足）
    //   火山/通用兼容 thinking : thinking: { type:'enabled', budget_tokens:N }
    //   Qwen3 思考模型      : enable_thinking: true（部分兼容端点）
    if (deepOn) {
      const mdl = String(profile.model || '').toLowerCase();
      if (/(^|[^a-z0-9])o[0-9]|(^|[^a-z0-9])(o1|o3|o4)([^a-z0-9]|$)|gpt-5|gpt5/.test(mdl)) {
        // OpenAI o 系列 / GPT-5：reasoning_effort
        body.reasoning_effort = /^(low|medium|high)$/.test(reasoningEffort) ? reasoningEffort : 'medium';
        // 推理模型思考链较长，给足输出上限
        body.max_tokens = Math.max(maxTokens, 2000);
      } else if (/reasoner/.test(mdl)) {
        // DeepSeek reasoner：思考链由模型自身产出（reasoning_content），无需额外参数；
        // 仅把输出上限放宽，避免思考链挤占正文导致"返回为空"
        body.max_tokens = Math.max(maxTokens, 2000);
      } else if (/doubao|thinking|qwq|qwen3|qwen-3|gemini|claude/.test(mdl)) {
        // 火山豆包 thinking / Qwen 思考模型 / Gemini(adaptive) / Claude(extended)：通用 thinking 块
        body.thinking = { type: 'enabled', budget_tokens: Math.min(Math.max(Math.floor(maxTokens * 0.6), 1024), 8192) };
        if (/qwen3|qwen-3/.test(mdl)) body.enable_thinking = true;
        // thinking 模型同样需要足够输出空间，避免正文被预算挤没
        body.max_tokens = Math.max(maxTokens, 1500);
      } else {
        // 未知/普通模型（如 gpt-4o）：开启开关但不强发任何字段，避免未知字段触发 400。
        // 这类模型本身无深度思考能力，开关开启仅作"预留"，请求保持标准格式。
        if (WM.DebugLog) WM.DebugLog.logResponse('llm', { note: '深度思考开关已开，但模型「' + profile.model + '」未匹配到已知思考模型，未注入思考参数' });
      }
    }
    const headers = { 'Content-Type': 'application/json' };
    if (profile.apiKey) headers['Authorization'] = 'Bearer ' + profile.apiKey;

    // —— 调试记录：请求 message ——
      if (WM.DebugLog) {
        WM.DebugLog.logRequest('llm', {
          url,
          model: body.model,
          messages: body.messages,
          max_tokens: body.max_tokens,
          temperature: temperature,
          deepThinking: deepOn,
          reasoningEffort: deepOn ? (body.reasoning_effort || (body.thinking ? 'thinking-block' : 'model-native')) : false,
        });
      }

    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (netErr) {
      const msg = String(netErr && netErr.message ? netErr.message : netErr);
      if (WM.DebugLog) WM.DebugLog.logError('llm', { url, error: msg });
      throw new Error('[LLM 请求失败] 地址：' + url + '｜' + msg);
    }
    const rawText = await res.text();
    if (!res.ok) {
      if (WM.DebugLog) WM.DebugLog.logError('llm', { url, httpStatus: res.status, response: rawText.slice(0, 500) });
      throw new Error('[LLM HTTP ' + res.status + '] 地址：' + url + '｜响应：' + rawText.slice(0, 500));
    }
    let j;
    let parseErr = null;
    try { j = JSON.parse(rawText); }
    catch (e) { parseErr = e; j = null; }

    // 提取输出文本（兼容多种返回结构，避免"返回为空"误报）
    let text = extractText(j, rawText);

    // —— 调试记录：AI 输出结果（无论成败都记录原始返回，方便定位） ——
    if (WM.DebugLog) {
      WM.DebugLog.logResponse('llm', {
        url,
        model: (j && j.model) || body.model,
        output: String(text || ''),
        usage: j && j.usage,
        finish_reason: j && j.choices && j.choices[0] && j.choices[0].finish_reason,
        rawPreview: rawText.slice(0, 600),
      });
    }

    if (!text) {
      // text 为空：把真实返回抛出来，便于用户从调试面板/错误信息看到 DeepSeek 到底回了什么
      const hint = parseErr ? ('返回非 JSON（' + String(parseErr.message) + '）') : '响应体已收到但提取不到文本内容';
      throw new Error('[LLM 返回为空] ' + hint + '｜原始响应前500字：' + rawText.slice(0, 500));
    }
    return String(text).trim();
  }

  // 从多种可能的返回结构中提取文本：
  //   OpenAI:    choices[].message.content / choices[].text
  //   Gemini:    candidates[].content.parts[].text
  //   SSE 流:    data: {...} 行里 message.content（兼容忽略 stream:false 的端点）
  //   裸字符串 / 其它
  function extractText(j, rawText) {
    if (j == null) {
      // 尝试当作 SSE / NDJSON 解析
      return extractFromSSE(rawText);
    }
    let t = '';
    let reasoning = '';
    if (j.choices && j.choices[0]) {
      const m = j.choices[0].message || {};
      t = m.content || j.choices[0].text || '';
      reasoning = m.reasoning_content || ''; // 深度思考链（部分模型如 deepseek-reasoner 把正文放这里）
    } else if (j.candidates && j.candidates[0]) {
      const c = j.candidates[0];
      const parts = (c.content && c.content.parts) || [];
      t = parts.map((p) => p.text || '').join('');
    } else if (typeof j === 'string') {
      t = j;
    }
    if (t) return String(t).trim();
    // content 为空但有思考链：回退用思考链内容（避免 finish_reason=length 时误报空）
    if (reasoning) return String(reasoning).trim();
    // JSON 合法但结构不匹配：再试 SSE（某些端点即便 stream:false 也回 SSE）
    return extractFromSSE(rawText);
  }

  function extractFromSSE(rawText) {
    if (!rawText) return '';
    // 取最后一个 data: 行（跳过 [DONE]）
    const lines = rawText.split('\n');
    let acc = '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const o = JSON.parse(payload);
        const c = (o.choices && o.choices[0]) || {};
        const txt = (c.message && c.message.content) || c.text || (c.delta && c.delta.content) || '';
        if (txt) acc += txt;
      } catch (e) { /* 忽略该行 */ }
    }
    return acc.trim();
  }

  // 测试连接：一次极简请求，验证连通性。
  async function testConnection(opts) {
    opts = opts || {};
    const profile = opts.profile || {};
    const timeoutMs = 20000;
    const guard = new Promise((_, reject) => setTimeout(() => reject(new Error('测试超时（' + (timeoutMs / 1000) + 's 无响应）')), timeoutMs));
    const ver = (window.WarmMemo && window.WarmMemo.version) || '?';
    try {
      const out = await Promise.race([
        complete(
          [{ role: 'system', content: '你是一个连通性测试工具。只输出指令要求的内容，不要回答任何其它问题。' },
           { role: 'user', content: '[WarmMemo测试连接]请只回复「成功」两个字，不要回复其它任何内容。' }],
          { profile, maxTokens: 60, temperature: 0 }
        ),
        guard,
      ]);
      if (out && String(out).trim().length > 0) {
        return { success: true, detail: '连通[v' + ver + ']，返回：' + String(out).trim().slice(0, 30) };
      }
      return { success: false, error: '返回为空' };
    } catch (e) {
      return { success: false, error: String(e && e.message ? e.message : e) };
    }
  }

  WM.LLMClient = { complete, testConnection, resolveUrl, normalizeBaseUrl };
})();
