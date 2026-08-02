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

  // complete：summary 等子模块用；基于新 settings 字段（summaryModel/summaryBaseUrl/summaryApiKey）
  // 行为：若配了 key 或 model → 真实直连 /chat/completions；否则真实回退酒馆 shared-api。
  // 关键：失败时**明确抛错**（不返回空字符串伪装成功），让上层 UI 显示真实原因。
  async function complete(messages, opts) {
    opts = opts || {};
    const s = opts.settings || (await WM.Settings.load());
    const baseUrl = s.summaryBaseUrl || 'https://api.openai.com/v1';
    const apiKey = s.summaryApiKey || '';
    const model = opts.model || s.summaryModel || '';

    if (apiKey || model) {
      try {
        return await callIndependent(messages, {
          baseUrl, apiKey, model: model || 'gpt-4o-mini',
          temperature: opts.temperature != null ? opts.temperature : 0.7,
          max_tokens: opts.max_tokens,
        });
      } catch (e) {
        // 仅在确实配了独立 API 但失败时才回退；回退失败则抛明确错误
        console.warn('[WarmMemo] 独立API失败，尝试回退 shared-api:', e.message);
        try {
          return await callShared(messages);
        } catch (e2) {
          throw new Error('LLM 调用失败：独立API(' + e.message + ') 且 shared-api(' + e2.message + ')。请在设置中填写有效的总结模型 API。');
        }
      }
    }
    // 未配置独立 API：直接走 shared-api，失败抛明确错误（不静默）
    try {
      return await callShared(messages);
    } catch (e) {
      throw new Error('未配置总结模型且酒馆 shared-api 不可用：' + e.message + '。请在设置中填写 BaseURL/Key/模型名。');
    }
  }

  WM.LLMClient = { generate, complete, callIndependent, callShared, normalizeBaseUrl };
})();
