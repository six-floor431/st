// Rerank 客户端：兼容 SiliconFlow / OpenAI rerank 协议（云端），无本地悬浮窗
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function normalize(url) {
    if (!url) return url;
    return url.replace('0.0.0.0', '127.0.0.1').replace(/\/+$/, '');
  }

  // 智能补全 rerank 地址：兼容 /vec 同源代理、裸 host、已含 /v1/rerank 等多种形式
  function buildRerankUrl(rawPath) {
    let u = normalize(rawPath) || '';
    if (!u) return '';
    let query = '';
    const qi = u.indexOf('?');
    if (qi >= 0) { query = u.slice(qi); u = u.slice(0, qi); }
    if (/v1\/rerank$/i.test(u)) { /* 已完整 */ }
    else if (/\/v1\/?$/i.test(u)) u += '/rerank';
    else if (/\/rerank$/i.test(u)) { /* 已是 rerank 路径 */ }
    else if (/\/vec\/?$/i.test(u)) u += '/v1/rerank'; // 同源代理：/vec -> /vec/v1/rerank
    else if (/\/vec\/v1\/?$/i.test(u)) u += '/rerank';
    else u += '/v1/rerank';
    return u + query;
  }

  function isGetMode(urlOrPath) {
    return /[?&]method=GET/i.test(urlOrPath || '') || /[?&]get=1\b/i.test(urlOrPath || '');
  }

  // 直接按 Base URL 解析 rerank 实际请求地址（自适应任意 OpenAI 兼容 / 本地反代）
  function resolveRerankUrl(s) {
    return buildRerankUrl(normalize(s.rerankBaseUrl) || '');
  }

  // 外网同源代理改写（跟 embedding-client.js 的 applyVecProxy 一样的逻辑，用 rerankProxyPath）
  //   本地访问酒馆（端口 8000/8001）→ 直连原始地址
  //   外网访问酒馆 → 把原始地址改写成「页面源 + 代理路径 + 原 path」的同源 URL
  //   当酒馆 /proxy/ 可用时不需要此改写（ServerProxy 优先）
  function applyRerankProxy(url, settings) {
    if (!url) return url;
    var s = settings || {};
    if (s.rerankProxyEnabled === false) return url;
    if (!/^https?:\/\//i.test(url)) return url;
    var base = '';
    try { base = (window.top && window.top.location && window.top.location.origin) || window.location.origin; } catch (e) { base = window.location.origin; }
    if (!base || base === 'null') return url;
    var port = '';
    try { var u0 = new URL(base); port = u0.port || (u0.protocol === 'https:' ? '443' : '80'); } catch (e) {}
    if (port === '8000' || port === '8001') return url;
    var proxyPath = (s.rerankProxyPath || '/rerank').replace(/\/+$/, '');
    try {
      var eu = new URL(url, base);
      var pathOnly = eu.pathname + (eu.search || '');
      var rewritten = base + proxyPath + pathOnly;
      try { console.log('[WarmMemo] Rerank 同源代理改写：' + url + ' → ' + rewritten); } catch (e) {}
      return rewritten;
    } catch (e) { return url; }
  }

  async function rerank(query, documents, rawSettings, options) {
    const s = rawSettings || {};
    // 重排启用判定：独立 rerankEnabled「或」向量接管模式下的 takeoverRerank 二者之一即可。
    // 关键：vector-store.search 在「接管模式」下会调用本函数，但此时 rerankEnabled 往往为 false
    // （用户只开了 takeoverRerank），必须同时认 takeoverRerank，否则接管重排静默失效。
    const enabled = s.rerankEnabled || s.takeoverRerank;
    if (!enabled) return null;

    // 优先走酒馆服务端代理（/proxy/<url>），无 CORS 问题，外网也能直连本地服务
    // 代理不可用时回退 applyRerankProxy 同源改写
    // 关键：必须 await detectProxy() 确保检测完成，否则 isAvailable() 在检测前返回 false
    if (WM.ServerProxy && typeof WM.ServerProxy.detectProxy === 'function') {
      await WM.ServerProxy.detectProxy();
    }
    const rawUrl = resolveRerankUrl(s);
    const useServerProxy = (WM.ServerProxy && WM.ServerProxy.isAvailable());
    const url = useServerProxy ? rawUrl : applyRerankProxy(rawUrl, s);

    const model = s.rerankModel || 'BAAI/bge-reranker-v2-m3';
    const key = s.rerankApiKey || '';
    const docs = (documents || []).filter((d) => d && String(d).trim());
    if (!docs.length) return [];

    const useGet = isGetMode(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), s.timeoutMs || 3000);
    try {
      let finalUrl = url;
      let body;
      const headers = Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {});
      if (useGet) {
        const q = new URL(finalUrl, location.href);
        q.searchParams.set('model', model);
        q.searchParams.set('query', query);
        docs.forEach((d, i) => q.searchParams.set('documents[' + i + ']', d));
        q.searchParams.set('top_n', String(docs.length));
        finalUrl = q.toString();
      } else {
        // instruction 对齐万楼：用自然语言告诉 rerank 模型「按什么标准排序」（如「优先能直接回答用户当前意图的条目」）
        const rerankInstruction = (typeof s.rerankInstruction === 'string' && s.rerankInstruction.trim()) ? s.rerankInstruction.trim() : '';
        body = JSON.stringify({
          model,
          query,
          documents: docs,
          top_n: docs.length,
          return_documents: false,
          ...(rerankInstruction ? { instruction: rerankInstruction } : {}),
        });
      }
      // —— 调试记录：请求 message ——
      if (WM.DebugLog) {
        WM.DebugLog.logRequest('rerank', {
          url: finalUrl,
          method: useGet ? 'GET' : 'POST',
          model,
          query,
          documents: docs,
          top_n: docs.length,
          bodyPreview: body ? body.slice(0, 400) : '(GET, 参数在 query)',
          viaProxy: useServerProxy,
        });
      }
      let r;
      try {
        const fetchFn = useServerProxy ? WM.ServerProxy.proxyFetch : fetch;
        r = await fetchFn(finalUrl, {
          method: useGet ? 'GET' : 'POST',
          signal: ctrl.signal,
          headers: useGet ? Object.assign({}, headers, { 'Content-Type': 'application/x-www-form-urlencoded' }) : headers,
          body,
        });
      } catch (netErr) {
        const msg = String(netErr && netErr.message ? netErr.message : netErr);
        const isCors = /Failed to fetch|NetworkError|Cross-Origin|CORS/i.test(msg);
        const hint = (isCors ? '请求被浏览器拦截（疑似跨域/CORS）。' : '网络请求失败：' + msg + '。') +
          ' 解决方式：①在酒馆 config.yaml 中设置 enableCorsProxy: true（推荐，外网也能用）；' +
          '②或用同源代理地址（如 http://localhost:8080/vec/v1/rerank）。';
        if (WM.DebugLog) WM.DebugLog.logError('rerank', { url: finalUrl, error: hint });
        throw new Error(hint);
      }
      const rawText = await r.text();
      if (!r.ok) {
        if (WM.DebugLog) WM.DebugLog.logError('rerank', { url: finalUrl, httpStatus: r.status, response: rawText.slice(0, 400) });
        throw new Error('rerank 服务返回 HTTP ' + r.status + '：' + rawText.slice(0, 200));
      }
      let j;
      try { j = JSON.parse(rawText); }
      catch (e) {
        if (WM.DebugLog) WM.DebugLog.logError('rerank', { url: finalUrl, error: '返回非 JSON', response: rawText.slice(0, 400) });
        throw new Error('rerank 返回非 JSON（HTTP ' + r.status + '）：' + rawText.slice(0, 200));
      }
      // 返回与 documents 同序的 score 数组
      const scoreMap = {};
      (j.results || []).forEach((it) => {
        scoreMap[it.index] = it.relevance_score;
      });
      const scores = docs.map((_, i) => scoreMap[i] != null ? scoreMap[i] : 0);
      if (WM.DebugLog) WM.DebugLog.logResponse('rerank', { url: finalUrl, httpStatus: r.status, scores, responsePreview: rawText.slice(0, 400) });
      return scores;
    } catch (e) {
      console.warn('[WarmMemo] rerank 失败，返回 null（由调用方保留原排序）', e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function testConnection(rawSettings) {
    try {
      // 测试时临时启用，确保真正去请求一次验证连通性
      const s = Object.assign({}, rawSettings, { rerankEnabled: true });
      const scores = await rerank('test', ['a', 'b'], s, { topN: 2 });
      if (scores === null) return { success: false, error: 'rerank 返回 null（服务不可达或地址/字段错误）' };
      return { success: Array.isArray(scores) && scores.length === 2 };
    } catch (e) {
      return { success: false, error: String(e.message || e) };
    }
  }

  WM.RerankClient = { rerank, testConnection, resolveRerankUrl, applyRerankProxy };
})();
