// 调试日志：分别记录 LLM / Embedding / Rerank 三类调用的
// 「请求 message」 与 「AI 输出结果」，三者互不混合，供扩展内调试面板查看。
// 每类保留最近 N 条（环形缓冲），记录时间戳、方向（请求/响应/错误）、摘要与完整内容。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  const MAX = 30; // 每类最多保留条数
  const store = {
    llm: [],
    embedding: [],
    rerank: [],
  };

  function push(kind, entry) {
    const arr = store[kind] || (store[kind] = []);
    arr.push(Object.assign({ ts: Date.now() }, entry));
    while (arr.length > MAX) arr.shift();
  }

  // 记录一条「请求」
  function logRequest(kind, data) {
    push(kind, { dir: 'request', data });
  }
  // 记录一条「响应 / 结果」
  function logResponse(kind, data) {
    push(kind, { dir: 'response', data });
  }
  // 记录一条「错误」
  function logError(kind, data) {
    push(kind, { dir: 'error', data });
  }

  function get(kind) {
    return (store[kind] || []).slice();
  }
  function clear(kind) {
    if (kind) store[kind] = [];
    else { store.llm = []; store.embedding = []; store.rerank = []; }
  }

  WM.DebugLog = { logRequest, logResponse, logError, get, clear, MAX };
})();
