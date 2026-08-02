// 向量存储：本地 IndexedDB 化，余弦相似度检索，可选 rerank 重排
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const DB = 'warm_memo_vec';
  const STORE = 'vectors';
  let _db = null;

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
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return -1;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  async function insert(id, text, vector, meta) {
    _db = _db || (await open());
    const rec = { id, text, vector, meta: meta || {}, ts: Date.now() };
    if (_db) {
      return new Promise((res) => {
        const tx = _db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      });
    }
    // 降级：内存 + localStorage
    const mem = (WM._vecMem = WM._vecMem || {});
    mem[id] = rec;
    return true;
  }

  async function search(queryVec, settings, topK) {
    _db = _db || (await open());
    const limit = topK || (settings && settings.recallLimit) || 6;
    const thr = (settings && settings.threshold) || 0.3;
    let all = [];
    if (_db) {
      all = await new Promise((res) => {
        const tx = _db.transaction(STORE, 'readonly');
        const out = [];
        tx.objectStore(STORE).openCursor().onsuccess = (e) => {
          const cur = e.target.result;
          if (cur) { out.push(cur.value); cur.continue(); } else res(out);
        };
        tx.onerror = () => res([]);
      });
    } else {
      all = Object.values(WM._vecMem || {});
    }

    let scored = all
      .map((r) => ({ rec: r, score: cosine(queryVec, r.vector) }))
      .filter((x) => x.score >= thr)
      .sort((a, b) => b.score - a.score);

    // rerank：先召回 2 倍，再重排
    const recall = scored.slice(0, limit * 2);
    if (settings && settings.rerank && settings.rerank.enabled) {
      const docs = recall.map((x) => x.rec.text);
      const scores = await WM.RerankClient.rerank('', docs, settings.rerank, {});
      if (scores) {
        recall.forEach((x, i) => (x.score = scores[i]));
        recall.sort((a, b) => b.score - a.score);
      }
    }
    return recall.slice(0, limit).map((x) => x.rec);
  }

  async function clearAll() {
    _db = _db || (await open());
    if (_db) {
      return new Promise((res) => {
        const tx = _db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      });
    }
    WM._vecMem = {};
    return true;
  }

  WM.VectorStore = { insert, search, clearAll, cosine };
})();
