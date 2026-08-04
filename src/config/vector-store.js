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

  // 计算文本向量（若 embedding 可用），否则返回 null。支持单条字符串或字符串数组（批量）。
  // 可用条件：开启了向量（vectorEnabled）且 EmbeddingClient 存在；
  // 地址优先级：独立 embeddingBaseUrl > 复用 LLM 地址（embeddingUseLLM 默认开）。
  // 只要二者之一有地址即可，无需用户额外东跑西跑配第二个服务。
  async function embed(text, settings) {
    settings = settings || WM.Settings.load();
    if (settings.vectorEnabled === false || !WM.EmbeddingClient || !WM.EmbeddingClient.embed) return null;
    const llmOk = settings.embeddingUseLLM !== false && settings.llmConfig && settings.llmConfig.apiUrl;
    if (!settings.embeddingBaseUrl && !llmOk) return null;
    try { return await WM.EmbeddingClient.embed(text, settings); } catch (e) { return null; }
  }

  // 批量计算向量：把多条文本一次性发给 embedding 服务（一次请求），避免逐条 N 次请求。
  // 返回与 texts 同序的向量数组（失败项为 null）。
  async function embedBatch(texts, settings) {
    const list = (texts || []).filter((t) => t && String(t).trim());
    if (!list.length) return [];
    const out = new Array(texts.length).fill(null);
    const vecs = await embed(list, settings); // EmbeddingClient.embed 支持数组输入
    if (Array.isArray(vecs)) {
      let k = 0;
      for (let i = 0; i < texts.length; i++) {
        if (texts[i] && String(texts[i]).trim()) { out[i] = vecs[k++]; }
      }
    }
    return out;
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
    // 为新记忆补向量（批量一次请求，避免逐条 N 次调用）。
    // 维度与当前模型不一致的旧缓存也视为缺失，需重算，避免模型更换后全部失效。
    const missing = memories.filter((m) => m && m.id != null && (!map[m.id] || map[m.id].length !== vec.length));
    if (missing.length) {
      const vecs = await embedBatch(missing.map((m) => m.text), settings);
      for (let i = 0; i < missing.length; i++) {
        if (vecs[i]) { await put({ id: missing[i].id, text: missing[i].text, vector: vecs[i], ts: Date.now() }); map[missing[i].id] = vecs[i]; }
      }
    }
    let scored = memories
      .map((m) => ({ m, score: (map[m.id] && map[m.id].length === vec.length) ? cosine(vec, map[m.id]) : -1 }))
      .sort((a, b) => b.score - a.score);
    // 弱相关剔除：仅在过滤后仍有候选时才丢弃 score<=0.1 的条目，避免阈值把结果清空导致静默回退
    const strong = scored.filter((x) => x.score > 0.1);
    if (strong.length) scored = strong;
    if ((settings.rerankEnabled || settings.takeoverRerank) && WM.RerankClient && WM.RerankClient.rerank) {
      const docs = scored.map((x) => x.m.text);
      try { console.log('[WarmMemo] 已真正调用重排序 rerank，文档数=', docs.length); } catch (e) {}
      const rs = await WM.RerankClient.rerank(query, docs, settings, {});
      // 仅当 rerank 真正返回有效分数（长度一致且至少有一条 > 0）时才覆盖，否则保留 cosine 排序
      if (rs && rs.length === docs.length && rs.some((x) => x > 0)) {
        scored.forEach((x, i) => (x.score = rs[i]));
        scored.sort((a, b) => b.score - a.score);
      } else {
        try { console.log('[WarmMemo] rerank 未返回有效分数，保留余弦相似度排序'); } catch (e) {}
      }
    }
    return scored.slice(0, topK || 12).map((x) => x.m);
  }

  WM.VectorStore = { search, cosine, getAll, put, get enabled() { return _enabled; }, get lastQuery() { return _lastQuery; }, set lastQuery(v) { _lastQuery = v; } };
})();
