// Embedding 客户端：统一 OpenAI 兼容 / Gemini 协议，支持云端与本地反代
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  const PROVIDERS = {
    compatible: { label: '兼容 OpenAI', defBase: '', defModel: 'text-embedding-3-small' },
    openai: { label: 'OpenAI', defBase: 'https://api.openai.com/v1', defModel: 'text-embedding-3-small' },
    siliconflow: { label: 'SiliconFlow', defBase: 'https://api.siliconflow.cn/v1', defModel: 'BAAI/bge-m3' },
    gemini: { label: 'Gemini', defBase: 'https://generativelanguage.googleapis.com/v1beta', defModel: 'text-embedding-004' },
    local: { label: '本地反代', defBase: 'http://127.0.0.1:11434/v1', defModel: 'nomic-embed-text' },
  };

  function normalizeBaseUrl(u) {
    if (!u) return u;
    return u.replace('0.0.0.0', '127.0.0.1').replace(/\/+$/, '');
  }

  function resolveOpenAiUrl(base) {
    base = normalizeBaseUrl(base) || '';
    return base.replace(/\/?v1\/?$/, '') + '/v1/embeddings';
  }

  function resolveGeminiUrl(base, model) {
    base = normalizeBaseUrl(base) || '';
    return base + '/models/' + model + ':embedContent';
  }

  async function embed(texts, settings) {
    const s = settings || WM._embedSettings || {};
    const provider = s.provider || 'siliconflow';
    const base = normalizeBaseUrl(s.baseUrl) || PROVIDERS[provider].defBase;
    const model = s.model || PROVIDERS[provider].defModel;
    const key = s.apiKey || '';
    const input = Array.isArray(texts) ? texts : [texts];

    if (provider === 'gemini') {
      // Gemini 逐条（无批量接口）
      const out = [];
      for (const t of input) {
        const url = resolveGeminiUrl(base, model);
        const r = await fetch(url, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { 'x-goog-api-key': key } : {}),
          body: JSON.stringify({ content: { parts: [{ text: t }] } }),
        });
        const j = await r.json();
        out.push((j.embedding && (j.embedding.values || j.embedding)) || []);
      }
      return out.length === 1 ? out[0] : out;
    }

    // OpenAI 兼容
    const url = resolveOpenAiUrl(base);
    const r = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}),
      body: JSON.stringify({ model, input }),
    });
    const j = await r.json();
    if (!j.data) throw new Error('embedding 返回异常: ' + JSON.stringify(j).slice(0, 200));
    const vecs = j.data.map((d) => d.embedding);
    return Array.isArray(texts) ? vecs : vecs[0];
  }

  async function testConnection(settings) {
    try {
      const v = await embed('test', settings);
      return { success: true, dimension: Array.isArray(v) ? v.length : 0 };
    } catch (e) {
      return { success: false, error: String(e.message || e) };
    }
  }

  WM.EmbeddingClient = { PROVIDERS, embed, testConnection, normalizeBaseUrl };
})();
