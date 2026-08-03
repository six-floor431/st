// 向量存储：本地 IndexedDB 缓存向量，按查询文本做余弦相似度检索（可选 rerank 重排）。
// launcher 用 WM.VectorStore.search(memories, queryText, topK)。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const DB = 'warm_memo_vec';
  const STORE = 'vectors';
  let _db = null;
  let _enabled = false;
  let _lastQuery = '';

  function open() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  function cosine(a, b) {
    if (!a || !b || a.length !== b.length) return -1;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    if (na === 0 || nb === 0) return -1;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  async function getAll() {
    _db = _db || (await open());
    if (_db) {
      return new Promise((res) => {
        const tx = _db.transaction(STORE, 'readonly');
        const out = [];
        tx.objectStore(STORE).openCursor().onsuccess = (e) => {
          const cur = e.target.result;
          if (cur) { out.push(cur.value); cur.continue(); } else res(out);
        };
        tx.onerror = () => res([]);
      });
    }
    return Object.values(WM._vecMem || {});
  }

  async function put(rec) {
    _db = _db || (await open());
    if (_db) return new Promise((res) => {
      const tx = _db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
    (WM._vecMem = WM._vecMem || {})[rec.id] = rec;
    return true;
  }

  // 计算文本向量（若 embedding 已配置），否则返回 null
  async function embed(text, settings) {
    settings = settings || WM.Settings.load();
    if (!settings.vectorEnabled || !WM.EmbeddingClient || !WM.EmbeddingClient.embed) return null;
    // 判断向量是否真正可用：兼容 cloud(用 embeddingBaseUrl) / 本地反代 / Ollama(用 embeddingProxyPath)
    const hasEndpoint =
      !!settings.embeddingBaseUrl ||
      settings.embeddingSource === 'localProxy' && !!settings.embeddingProxyPath ||
      settings.embeddingSource === 'ollama';
    if (!hasEndpoint) return null;
    try { return await WM.EmbeddingClient.embed(text, settings); } catch (e) { return null; }
  }

  // 检索：对 memories 数组，按 query 文本返回 topK 个最相关记忆条目
  async function search(memories, query, topK) {
    _lastQuery = query || '';
    const settings = WM.Settings.load();
    if (!settings.vectorEnabled) { _enabled = false; return memories.slice(-topK); }
    _enabled = true;
    const vec = await embed(query, settings);
    if (!vec) { try { console.log('[WarmMemo] 向量未启用/不可用，检索回退为最近 N 条'); } catch (e) {} return memories.slice(-topK); } // 无向量能力则回退最近 N 条
    try { console.log('[WarmMemo] 已真正调用向量 embed，维度=', vec.length); } catch (e) {}
    const stored = await getAll();
    const map = {};
    stored.forEach((r) => (map[r.id] = r.vector));
    // 为新记忆补向量
    for (const m of memories) {
      if (!map[m.id]) {
        const v = await embed(m.text, settings);
        if (v) { await put({ id: m.id, text: m.text, vector: v, ts: Date.now() }); map[m.id] = v; }
      }
    }
    let scored = memories
      .map((m) => ({ m, score: map[m.id] ? cosine(vec, map[m.id]) : -1 }))
      .filter((x) => x.score > 0.1)
      .sort((a, b) => b.score - a.score);
    if (settings.rerankEnabled && WM.RerankClient && WM.RerankClient.rerank) {
      const docs = scored.map((x) => x.m.text);
      try { console.log('[WarmMemo] 已真正调用重排序 rerank，文档数=', docs.length); } catch (e) {}
      const rs = await WM.RerankClient.rerank(query, docs, settings, {});
      if (rs) { scored.forEach((x, i) => (x.score = rs[i])); scored.sort((a, b) => b.score - a.score); }
    }
    return scored.slice(0, topK || 12).map((x) => x.m);
  }

  WM.VectorStore = { search, cosine, getAll, put, get enabled() { return _enabled; }, get lastQuery() { return _lastQuery; }, set lastQuery(v) { _lastQuery = v; } };
})();
