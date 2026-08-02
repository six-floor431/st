// Rerank 客户端：兼容 SiliconFlow / OpenAI rerank 协议（云端），无本地悬浮窗
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function normalize(url) {
    if (!url) return url;
    return url.replace('0.0.0.0', '127.0.0.1').replace(/\/+$/, '');
  }

  async function rerank(query, documents, rawSettings, options) {
    const s = rawSettings || WM._rerankSettings || {};
    if (!s.enabled) return null;
    const url = normalize(s.baseUrl) || 'https://api.siliconflow.cn/v1/rerank';
    const model = s.model || 'BAAI/bge-reranker-v2-m3';
    const key = s.apiKey || '';
    const docs = (documents || []).filter((d) => d && String(d).trim());
    if (!docs.length) return [];

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), s.timeoutMs || 3000);
    try {
      const r = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}),
        body: JSON.stringify({
          model,
          query,
          documents: docs,
          top_n: docs.length,
          return_documents: false,
        }),
      });
      const j = await r.json();
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

  WM.RerankClient = { rerank, testConnection };
})();
