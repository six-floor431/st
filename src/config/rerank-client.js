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

  // 按来源解析 rerank 实际请求地址
  function resolveRerankUrl(s) {
    const src = s.rerankSource || 'cloud';
    if (src === 'localProxy') {
      // 用户自建本地反代：proxyPath 智能补全为完整 rerank 地址
      return buildRerankUrl(s.rerankProxyPath) || '';
    }
    return normalize(s.rerankBaseUrl) || 'https://api.siliconflow.cn/v1/rerank';
  }

  async function rerank(query, documents, rawSettings, options) {
    const s = rawSettings || {};
    if (!s.rerankEnabled) return null; // 与 settings.rerankEnabled 对齐
    const url = resolveRerankUrl(s);
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
        body = JSON.stringify({
          model,
          query,
          documents: docs,
          top_n: docs.length,
          return_documents: false,
        });
      }
      let r;
      try {
        r = await fetch(finalUrl, {
          method: useGet ? 'GET' : 'POST',
          signal: ctrl.signal,
          headers: useGet ? Object.assign({}, headers, { 'Content-Type': 'application/x-www-form-urlencoded' }) : headers,
          body,
        });
      } catch (netErr) {
        const msg = String(netErr && netErr.message ? netErr.message : netErr);
        const isCors = /Failed to fetch|NetworkError|Cross-Origin|CORS/i.test(msg);
        throw new Error(
          (isCors ? '请求被浏览器拦截（疑似跨域/CORS，或反代未返回 CORS 头）。' : '网络请求失败：' + msg + '。') +
          ' 若你填的是 http://127.0.0.1:xxxx 直连本地服务，请改用同源代理地址（如 http://localhost:8080/vec/v1/rerank）。'
        );
      }
      const rawText = await r.text();
      if (!r.ok) throw new Error('rerank 服务返回 HTTP ' + r.status + '：' + rawText.slice(0, 200));
      let j;
      try { j = JSON.parse(rawText); }
      catch (e) { throw new Error('rerank 返回非 JSON（HTTP ' + r.status + '）：' + rawText.slice(0, 200)); }
      // 返回与 documents 同序的 score 数组
      const scoreMap = {};
      (j.results || []).forEach((it) => {
        scoreMap[it.index] = it.relevance_score;
      });
      return docs.map((_, i) => scoreMap[i] != null ? scoreMap[i] : 0);
    } catch (e) {
      console.warn('[WarmMemo] rerank 失败，回退原序', e);
      return docs.map(() => 0);
    } finally {
      clearTimeout(timer);
    }
  }

  async function testConnection(rawSettings) {
    try {
      const scores = await rerank('test', ['a', 'b'], rawSettings, { topN: 2 });
      return { success: Array.isArray(scores) };
    } catch (e) {
      return { success: false, error: String(e.message || e) };
    }
  }

  WM.RerankClient = { rerank, testConnection, resolveRerankUrl };
})();
