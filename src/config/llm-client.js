// 真实 LLM 调用客户端
// 模式 A（independent-api）：直连 OpenAI 兼容 /chat/completions（用独立的总结模型与 key）
// 模式 B（shared-api）：回退到酒馆已配置的 textgeneration（不额外要 key）
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function normalizeBaseUrl(u) {
    if (!u) return u;
    return u.replace('0.0.0.0', '127.0.0.1').replace(/\/+$/, '');
  }

  // 直连独立 API：真实发起 /chat/completions 请求
  async function callIndependent(messages, cfg) {
    const base = normalizeBaseUrl(cfg.baseUrl) || 'https://api.openai.com/v1';
    const url = base.replace(/\/?v1\/?$/, '') + '/v1/chat/completions';
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (cfg.apiKey || ''),
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages,
        temperature: cfg.temperature != null ? cfg.temperature : 0.7,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error('独立API ' + r.status + ': ' + t.slice(0, 200));
    }
    const j = await r.json();
    return j.choices && j.choices[0] && j.choices[0].message.content;
  }

  // 酒馆 shared-api：走 SillyTavern 全局 textgeneration
  async function callShared(messages) {
    if (window.textgeneration && typeof window.textgeneration.generate === 'function') {
      return await window.textgeneration.generate(messages);
    }
    if (window.SillyTavern && window.SillyTavern.sendGenerateRequest) {
      return await window.SillyTavern.sendGenerateRequest(messages, { noHistory: true });
    }
    throw new Error('酒馆 shared-api 不可用（textgeneration 未就绪）');
  }

  // 主入口（兼容旧调用）
  async function generate(messages, settings) {
    const s = settings || (await WM.Settings.load());
    const mode = s.summaryMode || 'independent-api';
    if (mode === 'independent-api' && s.summaryApi && s.summaryApi.apiKey) {
      try {
        return await callIndependent(messages, {
          baseUrl: s.summaryApi.baseUrl,
          apiKey: s.summaryApi.apiKey,
          model: s.summaryApi.model,
          temperature: 0.7,
        });
      } catch (e) {
        console.warn('[WarmMemo] 独立API失败，回退 shared-api:', e.message);
        return await callShared(messages);
      }
    }
    return await callShared(messages);
  }

  // complete：支持按 profile 独立调用（各功能不挤在一起）
  // profile: { source:'local'|'custom', baseUrl, apiKey, model }
  //   source==='local'  => 走酒馆 shared-api（textgeneration），无需额外配置
  //   source==='custom' => 直连独立 API（baseUrl/apiKey/model）
  // opts: { settings, temperature, max_tokens, model }
  // 关键：失败时**明确抛错**（不返回空字符串伪装成功），让上层 UI 显示真实原因。
  async function complete(messages, opts) {
    opts = opts || {};
    const s = opts.settings || (await WM.Settings.load());
    const profile = opts.profile || null;

    // 无 profile 或 source 为 local/未配置 → 走酒馆 shared-api
    const useCustom = profile && profile.source === 'custom' && (profile.apiKey || profile.model || profile.baseUrl);
    if (!useCustom) {
      try {
        return await callShared(messages);
      } catch (e) {
        throw new Error('酒馆 shared-api 不可用：' + e.message + '。如需独立模型请在对应功能的 LLM 配置选「自定义」并填写 BaseURL/Key/模型名。');
      }
    }

    // 自定义独立 API
    const baseUrl = profile.baseUrl || s.summaryBaseUrl || 'https://api.openai.com/v1';
    const apiKey = profile.apiKey || '';
    const model = opts.model || profile.model || s.summaryModel || 'gpt-4o-mini';
    try {
      return await callIndependent(messages, {
        baseUrl, apiKey, model,
        temperature: opts.temperature != null ? opts.temperature : 0.7,
        max_tokens: opts.max_tokens,
      });
    } catch (e) {
      // 自定义失败不静默回退（用户明确选了 custom），直接抛明确错误
      throw new Error('自定义 API 调用失败（' + (profile.model || model) + '）：' + e.message);
    }
  }

  // 测试连接：发一个最小请求，验证总结模型（独立 API 或酒馆 shared-api）是否可用
  async function testConnection(settings) {
    try {
      const out = await complete(
        [{ role: 'user', content: '请只回复两个字：ok' }],
        { settings: settings, max_tokens: 8, temperature: 0 }
      );
      const ok = typeof out === 'string' && out.length > 0;
      return { success: ok, detail: ok ? ('模型返回: ' + out.slice(0, 40)) : '返回为空' };
    } catch (e) {
      return { success: false, error: String(e.message || e) };
    }
  }

  WM.LLMClient = { generate, complete, callIndependent, callShared, testConnection, normalizeBaseUrl };
})();
