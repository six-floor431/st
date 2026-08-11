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

  // 外网同源代理改写（对齐星河预设 resolveEndpoint 的场景判断）：
  //   本地访问酒馆（端口 8000/8001）→ 直连原始地址（浏览器和 Ollama 同机，通）
  //   外网访问酒馆（穿透域名/公网，非 8000/8001）→ 把原始地址改写成「页面源 + 代理路径 + 原 path」的同源 URL，
  //     走 Caddy/反代转发到本地 Ollama。这样用户照填本地地址，外网也能连到内网向量服务。
  //   相对路径（用户已填 /vec）或非 http(s) 地址 → 原样返回（已是同源或无需改写）。
  function applyVecProxy(url, settings) {
    if (!url) return url;
    var s = settings || {};
    if (s.vecProxyEnabled === false) return url; // 用户显式关闭代理改写
    // 只改写 http(s) 绝对地址；相对路径（如 /vec/...）已是同源，直接放行
    if (!/^https?:\/\//i.test(url)) return url;
    // 取顶层窗口的页面源（穿透时就是 https://你的域名）
    var base = '';
    try { base = (window.top && window.top.location && window.top.location.origin) || window.location.origin; } catch (e) { base = window.location.origin; }
    if (!base || base === 'null') return url;
    // 端口检测：本地访问（8000/8001）→ 直连，跳过改写
    var port = '';
    try { var u0 = new URL(base); port = u0.port || (u0.protocol === 'https:' ? '443' : '80'); } catch (e) {}
    if (port === '8000' || port === '8001') return url;
    // 外网访问：改写成同源代理 URL = base + 代理路径 + 原 endpoint 的 path(+query)
    var proxyPath = (s.vecProxyPath || '/vec').replace(/\/+$/, '');
    try {
      var eu = new URL(url, base);
      var pathOnly = eu.pathname + (eu.search || '');
      var rewritten = base + proxyPath + pathOnly;
      try { console.log('[WarmMemo] 向量同源代理改写：' + url + ' → ' + rewritten); } catch (e) {}
      return rewritten;
    } catch (e) { return url; }
  }

  // 直接按 Base URL 解析 embedding 实际请求地址（自适应任意 OpenAI 兼容 / 本地反代 / Gemini）
  // 关键：当未单独填 Embedding 地址时，自动复用用户已配的 LLM Base URL（embeddingUseLLM 默认开），
  // 实现「只要配了 LLM，向量接管就能零配置真生效」，用户不必再东跑西跑配第二个地址。
  function resolveEmbedUrl(s) {
    let base = normalizeBaseUrl(s.embeddingBaseUrl) || s.baseUrl || '';
    let apiKey = s.embeddingApiKey || s.apiKey || '';
    // 复用 LLM 地址（默认开启）
    if (!base && s.embeddingUseLLM !== false && s.llmConfig && s.llmConfig.apiUrl) {
      base = normalizeBaseUrl(s.llmConfig.apiUrl) || '';
      if (!apiKey && s.llmConfig.apiKey) apiKey = s.llmConfig.apiKey;
    }
    if (!base) return { url: '', provider: 'compatible', model: s.embeddingModel || '' };
    // Gemini 特殊 host 直接走 gemini 协议
    if (/generativelanguage\.googleapis\.com/i.test(base)) {
      return { url: base, provider: 'gemini', model: s.embeddingModel || s.model || 'text-embedding-004' };
    }
    // 其余一律按 OpenAI 兼容：buildEmbedUrl 智能补全 /embeddings 后缀（用户可能填 /v1 或已完整地址）
    return { url: buildEmbedUrl(base), provider: 'compatible', model: s.embeddingModel || s.model || 'BAAI/bge-m3', apiKey: apiKey };
  }

  async function embed(texts, settings) {
    const s = settings || {};
    const info = resolveEmbedUrl(s);
    const base = info.url;
    const model = info.model;
    const key = info.apiKey || s.embeddingApiKey || s.apiKey || '';
    const provider = info.provider;
    const input = Array.isArray(texts) ? texts : [texts];
    WM._lastEmbedResolve = { source: s.embeddingSource, url: base, model, provider };

    if (provider === 'gemini') {
      // Gemini 逐条（无批量接口）
      const fetchFn = (WM.ServerProxy && WM.ServerProxy.isAvailable()) ? WM.ServerProxy.proxyFetch : fetch;
      const out = [];
      for (const t of input) {
        const url = resolveGeminiUrl(base, model);
        const r = await fetchFn(url, {
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
    //
    // 请求路由策略（v2 改进）：
    //   1. ServerProxy 探测可用 → proxyFetch 自动改写 URL 为 /proxy/<url>（同源无 CORS）
    //   2. ServerProxy 探测不可用 → 仍手动加 /proxy/ 前缀尝试（探测可能不准：时序、网络抖动等）
    //      如果 /proxy/ 实际可用，请求成功并调用 markAvailable() 更新缓存
    //      如果 /proxy/ 未启用，返回 404（同源，不会 CORS 失败），给出明确提示
    //   3. 不再回退到 applyVecProxy（用户可能已取消同源代理，直连必 CORS 失败）
    if (WM.ServerProxy && typeof WM.ServerProxy.detectProxy === 'function') {
      await WM.ServerProxy.detectProxy();
    }
    const useServerProxy = (WM.ServerProxy && WM.ServerProxy.isAvailable());
    let url;
    let useProxyFetch = false;
    if (useServerProxy) {
      url = base; // 服务端代理：保持原始 URL，由 proxyRewrite 改写
      useProxyFetch = true;
    } else {
      // 探测不可用，但仍尝试走 /proxy/（探测可能不准确）
      // 直接手动改写 URL 为 /proxy/ 格式，用普通 fetch 发送（同源，无 CORS）
      url = '/proxy/' + base;
      useProxyFetch = false;
    }
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
    // 诊断追踪：把本次实际请求原样记录，供 F12 Console 与调试面板查看
    const reqTrace = { url: finalUrl, method: useGet ? 'GET' : 'POST', model, bodyPreview: body ? body.slice(0, 400) : '(无body)' };
    WM._lastEmbedReq = reqTrace;
    if (WM.DebugLog) WM.DebugLog.logRequest('embedding', reqTrace);
    try { console.log('[WarmMemo] Embedding 实际请求：', reqTrace); } catch (e) {}
    let r;
    try {
      // 优先走服务端代理（proxyFetch 会自动改写 URL 为 /proxy/<url>）
      // 探测不可用时 useProxyFetch=false，但 URL 已手动加了 /proxy/ 前缀，用普通 fetch 发送
      const fetchFn = useProxyFetch ? WM.ServerProxy.proxyFetch : fetch;
      r = await fetchFn(finalUrl, {
        method: useGet ? 'GET' : 'POST',
        headers: useGet ? Object.assign({}, headers, { 'Content-Type': 'application/x-www-form-urlencoded' }) : headers,
        body,
      });
    } catch (netErr) {
      // fetch 抛错只可能是「连接层面」失败（CORS / 地址不可达 / 证书等）。
      // 注意：若后端已返回 200，fetch 不会进这里，而是进下面 r.text() 分支。
      // 走 /proxy/ 时是同源请求，不应该抛 CORS 错误；如果抛了，说明 /proxy/ 路径有问题
      const msg = String(netErr && netErr.message ? netErr.message : netErr);
      const isCors = /Failed to fetch|NetworkError|Cross-Origin|CORS|blocked by CORS/i.test(msg);
      const proxyReason = (WM.ServerProxy && typeof WM.ServerProxy.getDetectReason === 'function') ? WM.ServerProxy.getDetectReason() : '';
      const hint = isCors
        ? '浏览器层面的跨域/CORS 拦截。ServerProxy 状态：' + (WM.ServerProxy && WM.ServerProxy.isAvailable() ? '可用' : '不可用') + (proxyReason ? '（' + proxyReason + '）' : '') + '。解决方式：①确认酒馆 config.yaml 中 enableCorsProxy: true 且已重启酒馆；②或用同源代理地址（如 http://localhost:8080/vec/v1/embeddings）而非直连 127.0.0.1:11434。'
        : ('网络请求失败：' + msg + '。');
      if (WM.DebugLog) WM.DebugLog.logError('embedding', { url: finalUrl, error: hint });
      throw new Error('[Embedding 请求失败] 实际请求地址：' + finalUrl + '｜' + hint);
    }
    const rawText = await r.text();
    // 检查是否是 /proxy/ 未启用的 404
    if (r.status === 404 && /CORS proxy is disabled/i.test(rawText)) {
      const reason = (WM.ServerProxy && typeof WM.ServerProxy.getDetectReason === 'function') ? WM.ServerProxy.getDetectReason() : '';
      const hint = '酒馆 /proxy/ 端点未启用（返回 404）。' + (reason ? '探测详情：' + reason + '。' : '') + '请在 config.yaml 中设置 enableCorsProxy: true 并重启酒馆，或配置同源代理地址。';
      if (WM.DebugLog) WM.DebugLog.logError('embedding', { url: finalUrl, httpStatus: 404, response: rawText.slice(0, 400) });
      throw new Error('[Embedding 代理未启用] ' + hint);
    }
    if (!r.ok) {
      if (WM.DebugLog) WM.DebugLog.logError('embedding', { url: finalUrl, httpStatus: r.status, response: rawText.slice(0, 400) });
      throw new Error('[Embedding HTTP ' + r.status + '] 请求地址：' + finalUrl + '｜响应：' + rawText.slice(0, 200));
    }
    // 手动走 /proxy/ 成功 → 更新缓存，后续请求自动走 proxyFetch
    if (!useProxyFetch && WM.ServerProxy && typeof WM.ServerProxy.markAvailable === 'function') {
      WM.ServerProxy.markAvailable();
    }
    let j;
    try { j = JSON.parse(rawText); }
    catch (e) { throw new Error('embedding 返回非 JSON（HTTP ' + r.status + '）：' + rawText.slice(0, 200)); }
    if (!j.data) throw new Error('embedding 返回异常（缺少 data 字段）：' + rawText.slice(0, 200));
    if (WM.DebugLog) WM.DebugLog.logResponse('embedding', { url: finalUrl, httpStatus: r.status, dimension: Array.isArray(j.data) && j.data[0] && j.data[0].embedding ? j.data[0].embedding.length : 0, responsePreview: rawText.slice(0, 400) });
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

  WM.EmbeddingClient = { PROVIDERS, embed, testConnection, normalizeBaseUrl, resolveEmbedUrl, applyVecProxy };
})();
