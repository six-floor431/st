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

  // 把用户填写的「本地反代路径」智能补全为可用的 embeddings 请求地址。
  // 适配多种反代约定：
  //   - 同源代理(Caddy 等)：http://localhost:8080/vec  ->  http://localhost:8080/vec/v1/embeddings
  //   - 裸 host：http://127.0.0.1:8080                  ->  http://127.0.0.1:8080/v1/embeddings
  //   - 已含 /v1 或 /v1/embeddings：原样保留
  //   - 七七八八的变体：http://x/v1/embeddings?method=GET 之类
  function buildEmbedUrl(rawPath) {
    let u = normalizeBaseUrl(rawPath) || '';
    if (!u) return '';
    // 若用户把 query 写在路径里（如 ?method=GET），拆出保留
    let query = '';
    const qi = u.indexOf('?');
    if (qi >= 0) { query = u.slice(qi); u = u.slice(0, qi); }
    if (/v1\/embeddings$/i.test(u)) { /* 已完整 */ }
    else if (/\/v1\/?$/i.test(u)) u += '/embeddings';
    else if (/\/embeddings$/i.test(u)) { /* 已是 embeddings 路径但无 v1，保留 */ }
    else if (/\/vec\/?$/i.test(u)) u += '/v1/embeddings'; // 同源代理常见：/vec -> /vec/v1/embeddings
    else if (/\/vec\/v1\/?$/i.test(u)) u += '/embeddings';
    else u += '/v1/embeddings'; // 默认补齐
    return u + query;
  }

  function resolveOpenAiUrl(base) {
    base = normalizeBaseUrl(base) || '';
    return base.replace(/\/?v1\/?$/, '') + '/v1/embeddings';
  }

  function resolveGeminiUrl(base, model) {
    base = normalizeBaseUrl(base) || '';
    return base + '/models/' + model + ':embedContent';
  }

  // 是否用 GET 发送（部分本地反代/同源代理节点只接受 GET，再由中间层转 POST）
  function isGetMode(urlOrPath) {
    return /[?&]method=GET/i.test(urlOrPath || '') || /[?&]get=1\b/i.test(urlOrPath || '');
  }

  // 按来源解析 embedding 实际请求地址
  function resolveEmbedUrl(s) {
    const src = s.embeddingSource || 'cloud';
    if (src === 'ollama') {
      // 本地 Ollama（OpenAI 兼容接口）
      return { url: buildEmbedUrl(s.embeddingProxyPath || 'http://127.0.0.1:11434'), provider: 'compatible', model: s.embeddingModel || 'nomic-embed-text' };
    }
    if (src === 'localProxy') {
      // 用户自建本地反代：proxyPath 智能补全为完整 embeddings 地址
      return { url: buildEmbedUrl(s.embeddingProxyPath) || '', provider: 'compatible', model: s.embeddingModel || 'nomic-embed-text' };
    }
    // cloud：用填写的 Base URL（OpenAI 兼容 / Gemini 按 host 推断）
    const base = normalizeBaseUrl(s.embeddingBaseUrl) || s.baseUrl || 'https://api.siliconflow.cn/v1';
    if (/generativelanguage\.googleapis\.com/i.test(base)) {
      return { url: base, provider: 'gemini', model: s.embeddingModel || s.model || 'text-embedding-004' };
    }
    // 经 buildEmbedUrl 智能补全 /embeddings 后缀（用户可能填 /v1 或已完整地址）
    return { url: buildEmbedUrl(base), provider: 'compatible', model: s.embeddingModel || s.model || 'BAAI/bge-m3' };
  }

  async function embed(texts, settings) {
    const s = settings || {};
    const info = resolveEmbedUrl(s);
    const base = info.url;
    const model = info.model;
    const key = s.embeddingApiKey || s.apiKey || '';
    const provider = info.provider;
    const input = Array.isArray(texts) ? texts : [texts];
    WM._lastEmbedResolve = { source: s.embeddingSource, url: base, model, provider };

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

    // OpenAI 兼容（支持本地反代/同源代理的 GET 模式）
    // 注意：info.url（即 base）已由 resolveEmbedUrl/buildEmbedUrl 处理为完整 embeddings 地址，
    // 此处绝不能再二次拼接，否则会出现 .../v1/embeddings/v1/embeddings 的 404。
    const url = base;
    const useGet = isGetMode(url);
    const headers = Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {});
    let finalUrl = url;
    let body;
    if (useGet) {
      // GET 模式：参数放 query，兼容只接受 GET 的本地反代节点
      const q = new URL(finalUrl, location.href);
      q.searchParams.set('model', model);
      if (!Array.isArray(texts)) q.searchParams.set('input', texts);
      finalUrl = q.toString();
    } else {
      body = JSON.stringify({ model, input });
    }
    // 诊断追踪：把本次实际请求原样记录，供 F12 Console 与测试详情查看
    const reqTrace = { url: finalUrl, method: useGet ? 'GET' : 'POST', model, bodyPreview: body ? body.slice(0, 200) : '(无body)' };
    WM._lastEmbedReq = reqTrace;
    try { console.log('[WarmMemo] Embedding 实际请求：', reqTrace); } catch (e) {}
    let r;
    try {
      r = await fetch(finalUrl, {
        method: useGet ? 'GET' : 'POST',
        headers: useGet ? Object.assign({}, headers, { 'Content-Type': 'application/x-www-form-urlencoded' }) : headers,
        body,
      });
    } catch (netErr) {
      // fetch 抛错只可能是「连接层面」失败（CORS / 地址不可达 / 证书等）。
      // 注意：若后端已返回 200，fetch 不会进这里，而是进下面 r.text() 分支。
      const msg = String(netErr && netErr.message ? netErr.message : netErr);
      const isCors = /Failed to fetch|NetworkError|Cross-Origin|CORS|blocked by CORS/i.test(msg);
      const hint = isCors
        ? '这是浏览器层面的跨域/CORS 拦截（不是后端问题）。请确认：①地址是同源代理（如 http://localhost:8080/vec/v1/embeddings）而非直连 127.0.0.1:11434；②反代已返回 access-control-allow-origin 头。'
        : ('网络请求失败：' + msg + '。');
      throw new Error('[Embedding 请求失败] 实际请求地址：' + finalUrl + '｜' + hint);
    }
    const rawText = await r.text();
    if (!r.ok) {
      throw new Error('[Embedding HTTP ' + r.status + '] 请求地址：' + finalUrl + '｜响应：' + rawText.slice(0, 200));
    }
    let j;
    try { j = JSON.parse(rawText); }
    catch (e) { throw new Error('embedding 返回非 JSON（HTTP ' + r.status + '）：' + rawText.slice(0, 200)); }
    if (!j.data) throw new Error('embedding 返回异常（缺少 data 字段）：' + rawText.slice(0, 200));
    const vecs = j.data.map((d) => d.embedding);
    return Array.isArray(texts) ? vecs : vecs[0];
  }

  async function testConnection(settings) {
    const ver = (window.WarmMemo && window.WarmMemo.version) || '?';
    try {
      const v = await embed('test', settings);
      return { success: true, dimension: Array.isArray(v) ? v.length : 0, version: ver, resolve: WM._lastEmbedResolve, request: WM._lastEmbedReq };
    } catch (e) {
      return { success: false, error: String(e.message || e), version: ver, resolve: WM._lastEmbedResolve, request: WM._lastEmbedReq };
    }
  }

  WM.EmbeddingClient = { PROVIDERS, embed, testConnection, normalizeBaseUrl, resolveEmbedUrl };
})();
