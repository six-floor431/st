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

    // 组装 OpenAI 兼容请求体（只含我们自己的提示词）
    const body = {
      model: profile.model || '',
      messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), content: String(m.content || '') })),
      max_tokens: maxTokens,
      temperature: temperature,
      stream: false,
    };
    const headers = { 'Content-Type': 'application/json' };
    if (profile.apiKey) headers['Authorization'] = 'Bearer ' + profile.apiKey;

    // —— 调试记录：请求 message ——
    if (WM.DebugLog) {
      WM.DebugLog.logRequest('llm', {
        url,
        model: body.model,
        messages: body.messages,
        max_tokens: maxTokens,
        temperature: temperature,
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
    try { j = JSON.parse(rawText); }
    catch (e) { if (WM.DebugLog) WM.DebugLog.logError('llm', { url, error: '返回非 JSON', response: rawText.slice(0, 500) }); throw new Error('[LLM 返回非 JSON] ' + rawText.slice(0, 500)); }

    // 提取输出文本
    let text = '';
    if (j && j.choices && j.choices[0]) {
      text = (j.choices[0].message && j.choices[0].message.content) || j.choices[0].text || '';
    } else if (typeof j === 'string') {
      text = j;
    }

    // —— 调试记录：AI 输出结果 ——
    if (WM.DebugLog) {
      WM.DebugLog.logResponse('llm', {
        url,
        model: (j && j.model) || body.model,
        output: String(text || ''),
        usage: j && j.usage,
        finish_reason: j && j.choices && j.choices[0] && j.choices[0].finish_reason,
      });
    }
    return text ? String(text).trim() : '';
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
          { profile, maxTokens: 8, temperature: 0 }
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
