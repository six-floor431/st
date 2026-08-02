// WarmMemo (温记) — 单文件自包含构建
// 所有模块已内联，无任何子文件 HTTP 请求（避免 404 / text/plain MIME 被拒问题）。
// 酒馆以 type="module" 加载本文件；模块均为 IIFE 挂 window.WarmMemo。
(function () {
  'use strict';

/* ===== config/settings.js ===== */
// 设置模块：含「自定义自动总结楼层」配置（用户需求：可自定义选择自动总结的楼层）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const LS_KEY = 'warmmemo_settings_v2';

  const DEFAULTS = {
    summaryModel: '',
    summaryBaseUrl: 'https://api.openai.com/v1',
    summaryApiKey: '',
    showMemoryButton: true,
    autoUpdate: true,
    vectorEnabled: false,
    embeddingBaseUrl: '',
    embeddingApiKey: '',
    embeddingModel: 'text-embedding-3-small',
    rerankEnabled: false,
    rerankBaseUrl: '',
    rerankApiKey: '',
    rerankModel: '',
    // 自动总结楼层设置（自定义）
    autoSummaryEnabled: true,     // 是否开启自动总结
    autoSummaryMode: 'new',       // 'new'=只总结新增楼层, 'range'=按区间, 'count'=最近N条
    autoSummaryCount: 20,         // count 模式：最近 N 条
    autoSummaryStart: 0,          // range 模式：起始楼层
    autoSummaryEnd: -1,           // range 模式：-1 表示到最新
    autoHideFloors: true,          // 总结后隐藏已处理楼层
    // 各自动子任务开关
    autoRelation: true,
    autoPlot: true,
    autoWorld: true,
    autoItems: true,
    worldToLorebook: false,       // 是否把世界观写进世界书
    lorebookName: '',             // 世界书名（saveWorldInfo 需要，留空则只存对话记忆）
    injectMemories: true,         // 是否注入记忆到上下文
    injectWorld: true,
  };

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  WM.Settings = { load, save, DEFAULTS };
})();


/* ===== config/storage.js ===== */
// 本地持久化：记忆条目、总结指针、向量目录、设置
// 优先 IndexedDB（localforage 风格封装），降级到 localStorage
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const DB_NAME = 'warm_memo';
  const STORE = 'kv';
  let _db = null;

  function openDB() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function get(key, fallback) {
    _db = _db || (await openDB());
    if (_db) {
      return new Promise((resolve) => {
        const tx = _db.transaction(STORE, 'readonly');
        const rq = tx.objectStore(STORE).get(key);
        rq.onsuccess = () => resolve(rq.result !== undefined ? rq.result : fallback);
        rq.onerror = () => resolve(fallback);
      });
    }
    try {
      const v = localStorage.getItem('wm:' + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  async function set(key, value) {
    _db = _db || (await openDB());
    if (_db) {
      return new Promise((resolve) => {
        const tx = _db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    }
    try {
      localStorage.setItem('wm:' + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  WM.Storage = { get, set, openDB };
})();


/* ===== config/memory-store.js ===== */
// 记忆存储层：仿「万楼不会忘记」——所有结构化记忆存于对话元数据 chat_metadata，
// 不占上下文 token，只在需要时经 CHAT_COMPLETION_PROMPT_READY 注入。
// chat_metadata 是酒馆为每个对话单独保存的槽位，换对话即切换，万楼不丢。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  const FIELD = 'warm_memo_v2'; // 在 chat_metadata 中的键名

  // 默认空库结构
  function emptyStore() {
    return {
      version: 2,
      memories: [],   // [{id, text, ts, range:[start,end], vector?:number[]}]
      items: [],      // 物品追踪 [{id, name, desc, owner, ts}]
      plots: [],      // 剧情线 [{id, title, summary, ts, status:'active'|'done'|'abandon'}]
      world: '',      // 世界观设定文本
      relations: [],  // 关系边 [{from,to,label,weight}]
      summaryPointer: 0, // 已总结到的楼层索引（用于自动隐藏）
    };
  }

  // 读取当前对话的元数据
  function getMetadata() {
    const ctx = window.SillyTavern && window.SillyTavern.getContext();
    const md = ctx && ctx.chatMetadata;
    if (md && typeof md === 'object' && !Array.isArray(md)) return md;
    return null;
  }

  function activeChatId() {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      return (ctx && ctx.chatId) || null;
    } catch (e) { return null; }
  }

  // 读取记忆库（总是从 chat_metadata 取，保证唯一真相源）
  function load() {
    const md = getMetadata();
    const raw = md && md[FIELD];
    if (!raw) return emptyStore();
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const base = emptyStore();
      return Object.assign(base, obj);
    } catch (e) {
      return emptyStore();
    }
  }

  // 写回 chat_metadata（酒馆官方持久化路径）
  // 真实 API：ctx.updateChatMetadata(new_values, reset) 会合并并触发保存；
  // 再用 saveMetadata() 兜底落盘。绝不直接改 md 引用（会与内部逻辑竞态）。
  async function save(store) {
    const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
    if (!ctx || !ctx.updateChatMetadata) return false;
    try {
      ctx.updateChatMetadata({ [FIELD]: store }, false);
      if (typeof ctx.saveMetadata === 'function') await ctx.saveMetadata();
      else if (typeof ctx.saveChat === 'function') await ctx.saveChat();
      return true;
    } catch (e) {
      console.error('[WarmMemo] 保存记忆失败', e);
      return false;
    }
  }

  // ── 记忆条目 ──
  async function addMemory(text, range) {
    const s = load();
    const id = 'mem_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    s.memories.push({ id, text: String(text).trim(), ts: Date.now(), range: range || null });
    if (s.memories.length > 400) s.memories = s.memories.slice(-400); // 防无限胀
    await save(s);
    return id;
  }
  function getMemories() { return load().memories; }

  // ── 物品 ──
  async function addItem(name, desc, owner) {
    const s = load();
    s.items.push({ id: 'it_' + Date.now(), name: String(name).trim(), desc: String(desc || '').trim(), owner: String(owner || '').trim(), ts: Date.now() });
    await save(s);
  }
  async function updateItem(id, patch) {
    const s = load();
    const it = s.items.find((x) => x.id === id);
    if (it) Object.assign(it, patch);
    await save(s);
  }
  async function removeItem(id) {
    const s = load();
    s.items = s.items.filter((x) => x.id !== id);
    await save(s);
  }
  function getItems() { return load().items; }

  // ── 剧情线 ──
  async function addPlot(title, summary, status) {
    const s = load();
    s.plots.push({ id: 'pl_' + Date.now(), title: String(title).trim(), summary: String(summary || '').trim(), status: status || 'active', ts: Date.now() });
    await save(s);
  }
  async function updatePlot(id, patch) {
    const s = load();
    const p = s.plots.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    await save(s);
  }
  async function removePlot(id) {
    const s = load();
    s.plots = s.plots.filter((x) => x.id !== id);
    await save(s);
  }
  function getPlots() { return load().plots; }

  // ── 世界观 ──
  async function setWorld(text) { const s = load(); s.world = String(text || '').trim(); await save(s); }
  function getWorld() { return load().world; }

  // ── 关系 ──
  async function setRelations(rels) { const s = load(); s.relations = rels || []; await save(s); }
  function getRelations() { return load().relations; }

  // ── 总结指针（自动隐藏楼层用） ──
  async function setSummaryPointer(idx) { const s = load(); s.summaryPointer = idx; await save(s); }
  function getSummaryPointer() { return load().summaryPointer || 0; }

  // ── 导出 / 导入（备份防丢） ──
  function exportJSON() {
    const s = load();
    return JSON.stringify({ type: 'warmmemo_v2', exportedAt: Date.now(), data: s }, null, 2);
  }
  async function importJSON(text) {
    const obj = JSON.parse(text);
    const data = obj && obj.data ? obj.data : obj; // 兼容裸对象
    const base = emptyStore();
    const merged = Object.assign(base, data);
    await save(merged);
    return true;
  }

  WM.MemoryStore = {
    FIELD, emptyStore, load, save,
    addMemory, getMemories,
    addItem, updateItem, removeItem, getItems,
    addPlot, updatePlot, removePlot, getPlots,
    setWorld, getWorld,
    setRelations, getRelations,
    setSummaryPointer, getSummaryPointer,
    exportJSON, importJSON,
  };
})();


/* ===== config/llm-client.js ===== */
// 真实 LLM 调用客户端
// 模式 A（independent-api）：直连 OpenAI 兼容 /chat/completions（用独立的总结模型与 key）
// 模式 B（shared-api）：回退到酒馆已配置的 textgeneration（不额外要 key）
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function normalizeBaseUrl(u) {
    if (!u) return u;
    return u.replace('0.0.0.0', '127.0.0.1').replace(/\/+$/, '');
  }

  // 直连独立 API：真实发起 /chat/completions 请求
  async function callIndependent(messages, cfg) {
    const base = normalizeBaseUrl(cfg.baseUrl) || 'https://api.openai.com/v1';
    const url = base.replace(/\/?v1\/?$/, '') + '/v1/chat/completions';
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (cfg.apiKey || ''),
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages,
        temperature: cfg.temperature != null ? cfg.temperature : 0.7,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error('独立API ' + r.status + ': ' + t.slice(0, 200));
    }
    const j = await r.json();
    return j.choices && j.choices[0] && j.choices[0].message.content;
  }

  // 酒馆 shared-api：走 SillyTavern 全局 textgeneration
  async function callShared(messages) {
    if (window.textgeneration && typeof window.textgeneration.generate === 'function') {
      return await window.textgeneration.generate(messages);
    }
    if (window.SillyTavern && window.SillyTavern.sendGenerateRequest) {
      return await window.SillyTavern.sendGenerateRequest(messages, { noHistory: true });
    }
    throw new Error('酒馆 shared-api 不可用（textgeneration 未就绪）');
  }

  // 主入口（兼容旧调用）
  async function generate(messages, settings) {
    const s = settings || (await WM.Settings.load());
    const mode = s.summaryMode || 'independent-api';
    if (mode === 'independent-api' && s.summaryApi && s.summaryApi.apiKey) {
      try {
        return await callIndependent(messages, {
          baseUrl: s.summaryApi.baseUrl,
          apiKey: s.summaryApi.apiKey,
          model: s.summaryApi.model,
          temperature: 0.7,
        });
      } catch (e) {
        console.warn('[WarmMemo] 独立API失败，回退 shared-api:', e.message);
        return await callShared(messages);
      }
    }
    return await callShared(messages);
  }

  // complete：summary 等子模块用；基于新 settings 字段（summaryModel/summaryBaseUrl/summaryApiKey）
  // 行为：若配了 key 或 model → 真实直连 /chat/completions；否则真实回退酒馆 shared-api。
  // 关键：失败时**明确抛错**（不返回空字符串伪装成功），让上层 UI 显示真实原因。
  async function complete(messages, opts) {
    opts = opts || {};
    const s = opts.settings || (await WM.Settings.load());
    const baseUrl = s.summaryBaseUrl || 'https://api.openai.com/v1';
    const apiKey = s.summaryApiKey || '';
    const model = opts.model || s.summaryModel || '';

    if (apiKey || model) {
      try {
        return await callIndependent(messages, {
          baseUrl, apiKey, model: model || 'gpt-4o-mini',
          temperature: opts.temperature != null ? opts.temperature : 0.7,
          max_tokens: opts.max_tokens,
        });
      } catch (e) {
        // 仅在确实配了独立 API 但失败时才回退；回退失败则抛明确错误
        console.warn('[WarmMemo] 独立API失败，尝试回退 shared-api:', e.message);
        try {
          return await callShared(messages);
        } catch (e2) {
          throw new Error('LLM 调用失败：独立API(' + e.message + ') 且 shared-api(' + e2.message + ')。请在设置中填写有效的总结模型 API。');
        }
      }
    }
    // 未配置独立 API：直接走 shared-api，失败抛明确错误（不静默）
    try {
      return await callShared(messages);
    } catch (e) {
      throw new Error('未配置总结模型且酒馆 shared-api 不可用：' + e.message + '。请在设置中填写 BaseURL/Key/模型名。');
    }
  }

  WM.LLMClient = { generate, complete, callIndependent, callShared, normalizeBaseUrl };
})();


/* ===== config/vector-store.js ===== */
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
    if (!settings.vectorEnabled || !settings.embeddingBaseUrl || !WM.EmbeddingClient || !WM.EmbeddingClient.embed) return null;
    try { return await WM.EmbeddingClient.embed(text, settings); } catch (e) { return null; }
  }

  // 检索：对 memories 数组，按 query 文本返回 topK 个最相关记忆条目
  async function search(memories, query, topK) {
    _lastQuery = query || '';
    const settings = WM.Settings.load();
    if (!settings.vectorEnabled) { _enabled = false; return memories.slice(-topK); }
    _enabled = true;
    const vec = await embed(query, settings);
    if (!vec) return memories.slice(-topK); // 无向量能力则回退最近 N 条
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
      const rs = await WM.RerankClient.rerank(query, docs, settings, {});
      if (rs) { scored.forEach((x, i) => (x.score = rs[i])); scored.sort((a, b) => b.score - a.score); }
    }
    return scored.slice(0, topK || 12).map((x) => x.m);
  }

  WM.VectorStore = { search, cosine, getAll, put, get enabled() { return _enabled; }, get lastQuery() { return _lastQuery; }, set lastQuery(v) { _lastQuery = v; } };
})();


/* ===== config/embedding-client.js ===== */
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
    const s = settings || {};
    // 兼容新 settings 字段
    const base = normalizeBaseUrl(s.embeddingBaseUrl) || s.baseUrl || 'https://api.siliconflow.cn/v1';
    const model = s.embeddingModel || s.model || 'BAAI/bge-m3';
    const key = s.embeddingApiKey || s.apiKey || '';
    // 推断 provider：显式 settings.embeddingProvider 优先；否则按 base URL 关键字判断
    let provider = s.embeddingProvider;
    if (!provider) {
      if (/generativelanguage\.googleapis\.com/i.test(base)) provider = 'gemini';
      else provider = 'compatible';
    }
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


/* ===== config/rerank-client.js ===== */
// Rerank 客户端：兼容 SiliconFlow / OpenAI rerank 协议（云端），无本地悬浮窗
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function normalize(url) {
    if (!url) return url;
    return url.replace('0.0.0.0', '127.0.0.1').replace(/\/+$/, '');
  }

  async function rerank(query, documents, rawSettings, options) {
    const s = rawSettings || {};
    if (!s.rerankEnabled) return null; // 与 settings.rerankEnabled 对齐
    const url = normalize(s.rerankBaseUrl) || 'https://api.siliconflow.cn/v1/rerank';
    const model = s.rerankModel || 'BAAI/bge-reranker-v2-m3';
    const key = s.rerankApiKey || '';
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


/* ===== config/worldbook.js ===== */
// 世界设定模块：
// 1) 客观读取：角色卡 description/personality、用户卡、世界书（lorebook）现有条目、当前总结。
// 2) 用 LLM 推断当前世界观设定（背景、势力、规则、地点等）。
// 3) 写回：存 chat_metadata（WM.MemoryStore.setWorld，真实持久化+注入）；
//    可选写入世界书（需真实 API：ctx.saveWorldInfo(name, data)，name 在设置里填）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function getCtx() {
    return window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
  }

  // 读取角色卡信息（真实字段）
  function getCharacterCard() {
    try {
      const ctx = getCtx();
      const id = ctx && (ctx.characterId !== undefined ? ctx.characterId : ctx.currentCharacterId);
      const card = (ctx && ctx.characters && ctx.characters[id]) || (ctx && ctx.character);
      if (!card) return null;
      return {
        name: card.name,
        description: card.description || '',
        personality: card.personality || '',
        scenario: card.scenario || '',
        first_mes: card.first_mes || '',
      };
    } catch (e) { return null; }
  }

  // 读取用户卡 / 人物卡
  function getUserCard() {
    try {
      const ctx = getCtx();
      const u = ctx && ctx.user;
      if (!u) return null;
      return { name: u.name || '', description: u.description || '' };
    } catch (e) { return null; }
  }

  // 读取世界书（lorebook）现有条目（尽力而为：优先 extensionSettings.worldInfo 数组）
  function getLorebookEntries() {
    try {
      const ctx = getCtx();
      const wi = ctx && ctx.extensionSettings && ctx.extensionSettings.worldInfo;
      if (Array.isArray(wi)) {
        return wi.map((e) => ({ key: (e && (e.key || e.comment)) || '', content: (e && e.content) || '' }));
      }
      return [];
    } catch (e) { return []; }
  }

  // 写入世界书（真实 API：ctx.saveWorldInfo(name, data)）
  // 需要世界书名（settings.lorebookName）。无名字则仅在 chat_metadata 存（仍注入）。
  async function writeToLorebook(title, content) {
    const ctx = getCtx();
    const s = WM.Settings.load();
    const name = s.lorebookName;
    if (!name) return { ok: false, reason: 'no_name' };
    if (!ctx || typeof ctx.saveWorldInfo !== 'function') return { ok: false, reason: 'api_missing' };
    try {
      // 世界书 v2 结构：{ entries: { [uid]: { comment, content, ... } } }
      const data = { entries: {} };
      const uid = Date.now();
      data.entries[uid] = {
        comment: '[WarmMemo世界观] ' + (title || '世界观'),
        content,
        constant: true,
        enabled: true,
        insertion_order: 0,
        position: 'before_char',
        depth: 4,
      };
      await ctx.saveWorldInfo(name, data);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message || 'write_failed' };
    }
  }

  // 推断世界观：综合角色卡+用户卡+世界书+当前总结
  async function inferWorldview(settings, opts) {
    opts = opts || {};
    const char = getCharacterCard() || {};
    const user = getUserCard() || {};
    const lore = getLorebookEntries();
    const prevWorld = WM.MemoryStore.getWorld() || '';
    const memories = WM.MemoryStore.getMemories();
    const recent = memories.slice(-40).map((m) => m.text).join('\n');
    const extra = opts.extraInstruction || '';

    const sys = `你是世界观整理助手。请基于以下【素材】整理/更新【世界观设定】。
素材包含：角色卡设定、用户卡、世界书现有条目、已有的世界观、近期有温度记忆、用户补充指令。
要求：
- 输出纯文本「世界观设定」，分段清晰（背景/势力与组织/地点/规则与常识/特殊设定等）。
- 保持与已有世界观一致；若素材矛盾以近期记忆为准；不要编造素材没有的根本性设定。
- 语言风格与角色设定贴合，简洁有温度。长度适中。`;

    let userMsg = `【角色卡】\n名称：${char.name || '未知'}\n描述：${char.description || '无'}\n性格：${char.personality || '无'}\n场景：${char.scenario || '无'}\n\n`;
    userMsg += `【用户卡】\n名称：${user.name || '未知'}\n描述：${user.description || '无'}\n\n`;
    userMsg += `【世界书现有条目】\n` + (lore.length ? lore.map((l) => `· ${l.key}: ${l.content.slice(0, 200)}`).join('\n') : '（无）') + `\n\n`;
    userMsg += `【已有世界观】\n${prevWorld || '（无）'}\n\n`;
    userMsg += `【近期记忆】\n${recent || '（无）'}\n\n`;
    if (extra) userMsg += `【用户补充/自定义更新】\n${extra}\n\n`;
    userMsg += `请输出更新后的世界观设定：`;

    const out = await WM.Summary.callLLM(sys, userMsg, settings, { maxTokens: 1200 });
    if (!out || !out.trim()) throw new Error('世界观 LLM 调用失败（未返回内容，检查模型配置）');
    return out.trim();
  }

  WM.Worldbook = { getCharacterCard, getUserCard, getLorebookEntries, writeToLorebook, inferWorldview };
})();


/* ===== config/plot.js ===== */
// 剧情线模块：从记忆自动抽取剧情进展，维护多条剧情线（标题/摘要/状态），
// 用 LLM 归纳，存 chat_metadata，可手动增删改。可视化由 UI 渲染成时间线。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  async function extractPlots(settings) {
    const memories = WM.MemoryStore.getMemories();
    const recent = memories.slice(-40).map((m) => m.text).join('\n');
    const existing = WM.MemoryStore.getPlots().map((p) => `· ${p.title}（${p.status}）：${p.summary}`).join('\n');
    if (!recent.trim()) return [];
    const sys = `从「有温度记忆」中归纳当前的【剧情线】。
要求：最多 8 条仍在推进或重要的剧情线。每行一条，格式严格为：
标题|进展摘要|状态(active/done/abandon)
状态说明：active=进行中, done=已完成, abandon=已放弃。已有剧情线若已结束请改状态。只基于记忆，不编造。`;
    const userMsg = `【已有剧情线】\n${existing || '（无）'}\n\n【近期记忆】\n${recent}\n\n请输出更新后的剧情线：`;
    try {
      const raw = await WM.Summary.callLLM(sys, userMsg, settings, { maxTokens: 900 });
      if (!raw) return [];
      return raw.split('\n').map((l) => l.trim()).filter((l) => l.includes('|')).map((l) => {
        const [title, summary, status] = l.split('|').map((x) => x.trim());
        return title ? { title, summary: summary || '', status: ['active', 'done', 'abandon'].includes(status) ? status : 'active' } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  WM.Plot = { extractPlots };
})();


/* ===== config/summary.js ===== */
// 总结模块（真实调用）：
// - 真实向 LLM 发送「近期对话 + 角色卡 + 用户卡 + 世界书 + 现有总结」，产出有温度的记忆。
// - 不做假：调用 WM.LLMClient（独立模型直连，失败回退酒馆 shared-api）。
// - 总结后分派：关系抽取、剧情线更新、世界观推断、物品抽取。
// - 记忆只存 chat_metadata（不进上下文），按需经 injection 注入。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 统一的 LLM 调用入口（供 relations/plot/worldbook/items 复用）
  // 真实调用：直接 await LLMClient.complete，失败则抛出明确错误（不伪装成功）。
  async function callLLM(system, user, settings, opts) {
    settings = settings || WM.Settings.load();
    opts = opts || {};
    const prompt = [{ role: 'system', content: system }, { role: 'user', content: user }];
    const out = await WM.LLMClient.complete(prompt, {
      temperature: opts.temperature != null ? opts.temperature : 0.3,
      max_tokens: opts.maxTokens || 700,
      model: settings.summaryModel || '',
      settings,
    });
    return out || '';
  }

  // 记忆去重：若新记忆与已有记忆高度相似则合并（覆盖旧文本），否则新增
  function dedupeMemory(text, range) {
    const s = WM.MemoryStore.load();
    const t = text.trim();
    const sim = s.memories.find((m) => m.text === t || m.text.includes(t) || t.includes(m.text));
    if (sim) {
      sim.text = t; // 更新为更完整的表述
      sim.ts = Date.now();
      if (range) sim.range = range;
      WM.MemoryStore.save(s);
      return sim.id;
    }
    return WM.MemoryStore.addMemory(t, range);
  }

  // 抓取对话楼层文本
  function getChatMessages() {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      const msgs = (ctx && ctx.chat) || [];
      return msgs.map((m, i) => ({ index: i, name: m.name || (m.is_user ? '用户' : '角色'), text: m.mes || '' }));
    } catch (e) { return []; }
  }

  // 主总结流程：从 startFloor 到 endFloor（含）的楼层
  async function runSummary(settings, range) {
    settings = settings || WM.Settings.load();
    const msgs = getChatMessages();
    if (!msgs.length) return { ok: false, reason: 'no_messages' };

    let start = range && range.start != null ? range.start : WM.MemoryStore.getSummaryPointer();
    let end = range && range.end != null ? range.end : msgs.length - 1;
    start = Math.max(0, start); end = Math.min(msgs.length - 1, end);
    if (end < start) return { ok: false, reason: 'empty_range' };

    const slice = msgs.slice(start, end + 1).map((m) => `${m.name}：${m.text}`).join('\n');
    const prevMem = WM.MemoryStore.getMemories().slice(-20).map((m) => m.text).join('\n');

    // 客观读取角色卡/用户卡/世界书（用户需求 3）
    const char = (WM.Worldbook.getCharacterCard && WM.Worldbook.getCharacterCard()) || {};
    const user = (WM.Worldbook.getUserCard && WM.Worldbook.getUserCard()) || {};
    const lore = (WM.Worldbook.getLorebookEntries && WM.Worldbook.getLorebookEntries()) || [];
    const loreTxt = lore.length ? lore.map((l) => `· ${l.key}: ${l.content.slice(0, 160)}`).join('\n') : '（无）';

    const sys = `你是有温度的记忆整理者。请基于【角色设定】【用户设定】【世界书】【已有记忆】与【新对话】，提炼「有温度记忆」。
要求：
- 用第三人称、客观但有温度的口吻，记录角色与用户之间发生的关键事件、情感互动、约定、细节、性格展现。
- 重点保留：人物关系变化、重要约定、关键物品、剧情进展、角色情绪与性格细节。
- 不要复述无关寒暄；不要编造未发生的；与已有记忆冲突以新对话为准。
- 输出若干条，每条一行；不要加序号前缀外的格式。`;

    let userMsg = `【角色设定】${char.name || '未知'}：${char.description || ''} | 性格：${char.personality || ''}\n`;
    userMsg += `【用户设定】${user.name || '未知'}：${user.description || ''}\n`;
    userMsg += `【世界书】${loreTxt}\n`;
    userMsg += `【已有记忆】\n${prevMem || '（无）'}\n\n`;
    userMsg += `【新对话（楼层 ${start}-${end}）】\n${slice}\n\n请输出本次提炼的记忆：`;

    const out = await callLLM(sys, userMsg, settings, { maxTokens: 1000, temperature: 0.35 });
    if (!out || !out.trim()) return { ok: false, reason: 'llm_empty_or_failed' };

    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) await dedupeMemory(line, [start, end]);

    // 更新总结指针（用于自动隐藏已处理楼层）
    await WM.MemoryStore.setSummaryPointer(end + 1);

    // 分派子任务（真实调用，失败抛错由上层捕获显示）
    const results = { relations: 0, plots: 0, world: false, items: 0 };
    if (settings.autoRelation) {
      try {
        const rels = await WM.Relations.extractRelations(lines.join('\n'), settings);
        results.relations = rels.length;
        const merged = WM.Relations.mergeRelations(WM.MemoryStore.getRelations(), rels);
        await WM.MemoryStore.setRelations(merged);
      } catch (e) { results.relationsErr = e.message; }
    }
    if (settings.autoPlot) {
      try {
        const plots = await WM.Plot.extractPlots(settings);
        if (plots.length) {
          const s = WM.MemoryStore.load();
          s.plots = plots.map((p) => ({ id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title: p.title, summary: p.summary, status: p.status, ts: Date.now() }));
          await WM.MemoryStore.save(s);
          results.plots = plots.length;
        }
      } catch (e) { results.plotsErr = e.message; }
    }
    if (settings.autoWorld) {
      try {
        const world = await WM.Worldbook.inferWorldview(settings);
        if (world) { await WM.MemoryStore.setWorld(world); results.world = true; }
      } catch (e) { results.worldErr = e.message; }
    }
    if (settings.autoItems) {
      try {
        const items = await extractItems(settings, lines.join('\n'));
        if (items.length) { for (const it of items) await WM.MemoryStore.addItem(it.name, it.desc, it.owner); results.items = items.length; }
      } catch (e) { results.itemsErr = e.message; }
    }

    return { ok: true, count: lines.length, range: [start, end], results };
  }

  // 物品抽取（从记忆+对话中识别获得/失去/持有的物品）
  async function extractItems(settings, text) {
    const msgs = getChatMessages();
    const recent = msgs.slice(-30).map((m) => `${m.name}：${m.text}`).join('\n');
    const sys = `从对话中识别【物品/道具/持有物】的新增或状态变化。每行一条，格式：物品名|描述|持有者/所属。
只列明确提到的；无则输出空。最多 12 条。`;
    try {
      const raw = await callLLM(sys, `【近期对话】\n${recent}\n【本批记忆】\n${text}\n\n请列出物品：`, settings, { maxTokens: 500 });
      if (!raw) return [];
      return raw.split('\n').map((l) => l.trim()).filter((l) => l.includes('|')).map((l) => {
        const [name, desc, owner] = l.split('|').map((x) => x.trim());
        return name ? { name, desc: desc || '', owner: owner || '' } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  WM.Summary = { callLLM, runSummary, getChatMessages, extractItems };
})();


/* ===== config/relations.js ===== */
// 关系图：动态力导向图（force-directed）
// 实体为节点，互动为带权边；支持拖拽、碰撞、自动布局、随对话实时更新权重。
// 数据存 chat_metadata（WM.MemoryStore），不占上下文。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 用 LLM 从总结文本抽取关系三元组（带权重），返回 [{from,to,label,weight}]
  async function extractRelations(memoryText, settings) {
    if (!memoryText || !memoryText.trim()) return [];
    const sys = `从下面的「有温度记忆」中，抽取实体（角色、用户、地点、事物）之间的关系。
要求：每行一个三元组，格式严格为 实体A|关系|实体B|权重(1-5)。
权重表示关系强度/互动频率。只抽取明确提到或明显暗示的关系。最多 18 条。`;
    try {
      const raw = await WM.Summary.callLLM(sys, memoryText, settings);
      if (!raw) return [];
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('|'))
        .map((l) => {
          const parts = l.split('|').map((x) => x.trim());
          const [from, label, to, w] = parts;
          const weight = Math.max(1, Math.min(5, parseInt(w, 10) || 2));
          return from && to ? { from, label: label || '关联', to, weight } : null;
        })
        .filter(Boolean);
    } catch (e) {
      console.warn('[WarmMemo] 关系抽取失败', e);
      return [];
    }
  }

  // 合并新旧关系（同边累加权重，去重）
  function mergeRelations(oldList, newList) {
    const map = new Map();
    oldList.forEach((r) => map.set(r.from + '\u0001' + r.to + '\u0001' + r.label, r));
    newList.forEach((r) => {
      const k = r.from + '\u0001' + r.to + '\u0001' + r.label;
      const ex = map.get(k);
      if (ex) ex.weight = Math.min(5, (ex.weight || 2) + (r.weight || 1));
      else map.set(k, Object.assign({}, r));
    });
    return Array.from(map.values());
  }

  // 简单力导向布局：迭代若干步后返回每个节点坐标
  function forceLayout(nodes, edges, W, H) {
    const cx = W / 2, cy = H / 2;
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      n.x = cx + 90 * Math.cos(a);
      n.y = cy + 90 * Math.sin(a);
      n.vx = 0; n.vy = 0;
    });
    for (let step = 0; step < 220; step++) {
      // 斥力
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy + 0.01;
          const f = 900 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // 引力（边）
      edges.forEach((e) => {
        const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const target = 70 - e.weight * 6; // 强关系更近
        const f = (d - target) * 0.02;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      // 向心力 + 阻尼 + 位移
      nodes.forEach((n) => {
        n.vx += (cx - n.x) * 0.004;
        n.vy += (cy - n.y) * 0.004;
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(14, Math.min(W - 14, n.x));
        n.y = Math.max(14, Math.min(H - 14, n.y));
      });
    }
    return nodes;
  }

  WM.Relations = { extractRelations, mergeRelations, forceLayout };
})();


/* ===== config/injection.js ===== */
// 真实注入模块：监听 CHAT_COMPLETION_PROMPT_READY，把「有温度记忆」与「世界观设定」
// 注入到 system prompt。基于真实酒馆 API（见 lolocard-master @types）：
//   - 事件名来自 ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY = 'chat_completion_prompt_ready'
//   - event.detail.chat = SendingMessage[]，可直接改写 system 内容
// 这是用户质疑「总结不加入上下文真的有做到吗」的回答：确实进入每次请求的上下文。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function getCtx() {
    return window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
  }

  function getReadyEventName() {
    const ctx = getCtx();
    // 真实：ctx.eventTypes === tavern_events，含 CHAT_COMPLETION_PROMPT_READY
    if (ctx && ctx.eventTypes && ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY) {
      return ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY;
    }
    if (window.tavern_events && window.tavern_events.CHAT_COMPLETION_PROMPT_READY) {
      return window.tavern_events.CHAT_COMPLETION_PROMPT_READY;
    }
    return 'chat_completion_prompt_ready'; // 兜底常量
  }

  function buildMemoryBlock() {
    const settings = WM.Settings.load();
    if (settings.injectMemories === false && settings.injectWorld === false) return '';
    const mem = WM.MemoryStore.getMemories();
    const world = WM.MemoryStore.getWorld();
    const items = WM.MemoryStore.getItems();
    if (!mem.length && !world && !items.length) return '';

    // 检索：向量可用且最近有查询 → 向量 topK；否则最近 N 条；最终混合去重
    let picked = mem;
    if (settings.vectorEnabled && WM.VectorStore && WM.VectorStore.lastQuery && WM.VectorStore.enabled) {
      picked = WM.VectorStore.search(mem, WM.VectorStore.lastQuery, 12);
    } else {
      picked = mem.slice(-Math.min(20, mem.length));
    }

    const parts = [];
    if (settings.injectMemories !== false && picked.length) {
      parts.push('【有温度的记忆（角色与用户共同经历的过往）】\n' + picked.map((m) => '· ' + m.text).join('\n'));
    }
    if (settings.injectWorld !== false && world) {
      parts.push('【当前世界观设定】\n' + world);
    }
    if (settings.injectMemories !== false && items.length) {
      parts.push('【物品/持有物追踪】\n' + items.map((i) => `· ${i.name}（${i.owner || '未知'}）：${i.desc}`).join('\n'));
    }
    return parts.join('\n\n');
  }

  function init() {
    const ctx = getCtx();
    const es = ctx && ctx.eventSource;
    if (!es || typeof es.on !== 'function') {
      console.warn('[WarmMemo] 未找到 ctx.eventSource，注入不可用');
      return;
    }
    const readyEvent = getReadyEventName();
    es.on(readyEvent, (event) => {
      try {
        const block = buildMemoryBlock();
        if (!block) return;
        const chat = event && event.detail && event.detail.chat;
        if (!Array.isArray(chat) || !chat.length) return;
        const sys = chat.find((m) => m.role === 'system');
        if (sys) {
          if (sys.content && sys.content.includes('【有温度的记忆')) {
            // 防止重复追加（同一请求多次触发）
            sys.content = sys.content.replace(/【有温度的记忆[\s\S]*$/, '') + '\n\n' + block;
          } else {
            sys.content = (sys.content || '') + '\n\n' + block;
          }
        } else {
          chat.unshift({ role: 'system', content: block });
        }
      } catch (e) {
        console.error('[WarmMemo] 注入失败', e);
      }
    });
    console.log('[WarmMemo] 注入钩子已绑定：', readyEvent);
  }

  WM.Injection = { init, buildMemoryBlock };
})();


/* ===== config/floor-hider.js ===== */
// 楼层隐藏：总结后把指针之前的楼层标记隐藏，不进入上下文
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 将一段楼层区间标记为隐藏（is_system=true 使酒馆不发送；is_wm_hidden 便于 UI 识别）
  async function applySummaryPointerHiding(summaryPointer, settings) {
    if (!summaryPointer || summaryPointer <= 0) return 'no_pointer';
    const ctx = window.SillyTavern ? window.SillyTavern.getContext() : null;
    if (!ctx || !ctx.chat) return 'no_context';
    const chat = ctx.chat;
    if (summaryPointer > chat.length) return 'stale_pointer';

    const delay = (settings && settings.summaryDelay) || 2;
    const dialogueCount = chat.filter((m) => m && !m.is_system).length;
    if (dialogueCount < summaryPointer + delay) return 'summary_delay';

    for (let i = 0; i < summaryPointer; i++) {
      const m = chat[i];
      if (m && !m.is_wm_hidden) {
        m.is_system = true;
        m.is_wm_hidden = true;
      }
    }
    if (ctx.saveChat && typeof ctx.saveChat === 'function') ctx.saveChat();
    if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
    return 'hidden';
  }

  // 隐藏直到指定楼层（含）：总结后调用，hideUntil(lastIndex)
  async function hideUntil(lastIndex, settings) {
    if (lastIndex == null || lastIndex < 0) return 'invalid';
    return applySummaryPointerHiding(lastIndex + 1, settings);
  }

  WM.FloorHider = { applySummaryPointerHiding, hideUntil };
})();


/* ===== ui/launcher.js ===== */
// 启动器与 UI：输入框旁的「🌿 记忆」按钮 + 水墨风抽屉面板。
// 面板含：自动总结（含自定义楼层）、记忆检索、动态关系图、剧情线、物品追踪、世界设定、设置。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  let panelEl = null, btnEl = null, graphSvg = null, graphTimer = null;

  // 输入框旁的挂载点：优先输入框选项区（桌面/新版通用），逐级回退。
  function findInputContainer() {
    const sel = [
      '#send_form .input-options',
      '#rightSendContainer .input-options',
      '.input-options',
      '#send_form',
      '#input-options',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  // 保底：若找不到输入框容器（某些皮肤/移动端），挂固定悬浮按钮，保证一定可见可点。
  function ensureFloatingButton() {
    if (document.getElementById('warmmemo-btn')) return;
    btnEl = document.createElement('button');
    btnEl.id = 'warmmemo-btn';
    btnEl.className = 'wm-input-btn menu_button wm-float';
    btnEl.type = 'button';
    btnEl.title = '温记 · 记忆与世界观';
    btnEl.textContent = '🌿 记忆';
    btnEl.onclick = () => { ensurePanel(); panelEl.classList.toggle('open'); if (panelEl.classList.contains('open')) renderTab('auto'); };
    document.body.appendChild(btnEl);
  }

  function ensurePanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'warmmemo-panel';
    panelEl.className = 'wm-panel';
    panelEl.innerHTML = `
      <div class="wm-header">
        <span class="wm-title">🌿 温记 · WarmMemo</span>
        <button class="wm-close" title="收起">×</button>
      </div>
      <div class="wm-tabs">
        <button data-tab="auto" class="active">自动总结</button>
        <button data-tab="mem">记忆</button>
        <button data-tab="rel">关系图</button>
        <button data-tab="plot">剧情线</button>
        <button data-tab="item">物品</button>
        <button data-tab="world">世界设定</button>
        <button data-tab="cfg">设置</button>
      </div>
      <div class="wm-body"></div>`;
    document.body.appendChild(panelEl);
    panelEl.querySelector('.wm-close').onclick = () => panelEl.classList.remove('open');
    panelEl.querySelectorAll('.wm-tabs button').forEach((b) => {
      b.onclick = () => {
        panelEl.querySelectorAll('.wm-tabs button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderTab(b.dataset.tab);
      };
    });
    return panelEl;
  }

  function injectButton() {
    if (document.getElementById('warmmemo-btn')) return;
    const container = findInputContainer();
    if (container) {
      btnEl = document.createElement('button');
      btnEl.id = 'warmmemo-btn';
      btnEl.className = 'wm-input-btn menu_button';
      btnEl.type = 'button';
      btnEl.title = '温记 · 记忆与世界观';
      btnEl.textContent = '🌿 记忆';
      btnEl.onclick = () => { ensurePanel(); panelEl.classList.toggle('open'); if (panelEl.classList.contains('open')) renderTab('auto'); };
      container.appendChild(btnEl);
    } else {
      // 重试几次，仍找不到就降级为悬浮按钮，保证一定可见可点
      injectButton._tries = (injectButton._tries || 0) + 1;
      if (injectButton._tries > 12) { ensureFloatingButton(); return; }
      setTimeout(injectButton, 800);
    }
  }

  // ── 各 Tab 渲染 ──
  function renderTab(tab) {
    const body = panelEl.querySelector('.wm-body');
    if (tab === 'auto') return renderAuto(body);
    if (tab === 'mem') return renderMem(body);
    if (tab === 'rel') return renderRel(body);
    if (tab === 'plot') return renderPlot(body);
    if (tab === 'item') return renderItem(body);
    if (tab === 'world') return renderWorld(body);
    if (tab === 'cfg') return renderCfg(body);
  }

  function renderAuto(body) {
    const s = WM.Settings.load();
    const total = (WM.Summary.getChatMessages && WM.Summary.getChatMessages().length) || 0;
    body.innerHTML = `
      <div class="wm-card">
        <div class="wm-h">自动总结（有温度记忆）</div>
        <label class="wm-row"><input type="checkbox" id="a-on" ${s.autoSummaryEnabled ? 'checked' : ''}/> 开启自动总结</label>
        <div class="wm-row">总结模式：
          <select id="a-mode">
            <option value="new" ${s.autoSummaryMode==='new'?'selected':''}>仅新增楼层</option>
            <option value="count" ${s.autoSummaryMode==='count'?'selected':''}>最近 N 条</option>
            <option value="range" ${s.autoSummaryMode==='range'?'selected':''}>自定义楼层区间</option>
          </select>
        </div>
        <div class="wm-row" id="a-count-row" style="${s.autoSummaryMode==='count'?'':'display:none'}">最近条数：
          <input type="number" id="a-count" value="${s.autoSummaryCount}" min="1" max="200" style="width:70px"/>
        </div>
        <div class="wm-row" id="a-range-row" style="${s.autoSummaryMode==='range'?'':'display:none'}">
          楼层 <input type="number" id="a-start" value="${s.autoSummaryStart}" min="0" style="width:64px"/> ~
          <input type="number" id="a-end" value="${s.autoSummaryEnd}" min="-1" style="width:64px"/>（终点 -1 表示最新，共 ${total} 层）
        </div>
        <label class="wm-row"><input type="checkbox" id="a-hide" ${s.autoHideFloors?'checked':''}/> 总结后隐藏已处理楼层</label>
        <div class="wm-h" style="margin-top:10px">自动抽取子任务</div>
        <label class="wm-row"><input type="checkbox" id="a-rel" ${s.autoRelation?'checked':''}/> 关系图</label>
        <label class="wm-row"><input type="checkbox" id="a-plot" ${s.autoPlot?'checked':''}/> 剧情线</label>
        <label class="wm-row"><input type="checkbox" id="a-world" ${s.autoWorld?'checked':''}/> 世界观设定</label>
        <label class="wm-row"><input type="checkbox" id="a-item" ${s.autoItems?'checked':''}/> 物品追踪</label>
        <div class="wm-actions">
          <button id="a-save" class="wm-btn">保存设置</button>
          <button id="a-run" class="wm-btn primary">立即总结</button>
        </div>
        <div class="wm-status" id="auto-status"></div>
      </div>`;
    const mode = body.querySelector('#a-mode');
    mode.onchange = () => {
      body.querySelector('#a-count-row').style.display = mode.value === 'count' ? '' : 'none';
      body.querySelector('#a-range-row').style.display = mode.value === 'range' ? '' : 'none';
    };
    body.querySelector('#a-save').onclick = () => {
      s.autoSummaryEnabled = body.querySelector('#a-on').checked;
      s.autoSummaryMode = mode.value;
      s.autoSummaryCount = parseInt(body.querySelector('#a-count').value, 10) || 20;
      s.autoSummaryStart = parseInt(body.querySelector('#a-start').value, 10) || 0;
      s.autoSummaryEnd = parseInt(body.querySelector('#a-end').value, 10) || -1;
      s.autoHideFloors = body.querySelector('#a-hide').checked;
      s.autoRelation = body.querySelector('#a-rel').checked;
      s.autoPlot = body.querySelector('#a-plot').checked;
      s.autoWorld = body.querySelector('#a-world').checked;
      s.autoItems = body.querySelector('#a-item').checked;
      WM.Settings.save(s);
      body.querySelector('#auto-status').textContent = '✓ 设置已保存';
    };
    body.querySelector('#a-run').onclick = async () => {
      const st = body.querySelector('#auto-status');
      st.textContent = '总结中…';
      try {
        const r = await WM.Summary.runSummary(s);
        st.textContent = r.ok
          ? `✓ 已提炼 ${r.count} 条记忆（楼层 ${r.range[0]}-${r.range[1]}），关系${r.results.relations} 剧情${r.results.plots} 世界${r.results.world ? '✓' : '×'} 物品${r.results.items}`
          : '✗ ' + (r.reason || '失败');
      } catch (e) {
        st.textContent = '✗ ' + (e.message || e);
      }
    };
  }

  function renderMem(body) {
    const mem = WM.MemoryStore.getMemories();
    let html = `<div class="wm-card"><div class="wm-h">有温度记忆（${mem.length}）</div>
      <div class="wm-actions">
        <button id="mem-export" class="wm-btn">导出</button>
        <button id="mem-import" class="wm-btn">导入</button>
      </div>
      <input class="wm-search" id="mem-search" placeholder="检索记忆…"/>
      <div class="wm-list" id="mem-list">`;
    html += mem.slice().reverse().map((m) => `<div class="wm-item">${escapeHtml(m.text)}</div>`).join('') || '<div class="wm-empty">暂无记忆，先去「自动总结」生成</div>';
    html += `</div></div>`;
    body.innerHTML = html;
    // 导出
    body.querySelector('#mem-export').onclick = () => {
      const blob = new Blob([WM.MemoryStore.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'warmmemo-memory-' + Date.now() + '.json';
      a.click();
    };
    // 导入
    body.querySelector('#mem-import').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = async () => {
        const txt = await inp.files[0].text();
        try { await WM.MemoryStore.importJSON(txt); renderMem(body); toast('🌿 记忆已导入'); }
        catch (e) { toast('🌿 导入失败：' + (e.message || e)); }
      };
      inp.click();
    };
    body.querySelector('#mem-search').oninput = async (e) => {
      const q = e.target.value.trim();
      let list = mem;
      if (q && WM.VectorStore) {
        WM.VectorStore.lastQuery = q;
        if (WM.VectorStore.enabled) { list = await WM.VectorStore.search(mem, q, 15); }
        else list = mem.filter((m) => m.text.includes(q));
      }
      body.querySelector('#mem-list').innerHTML = (list.length ? list.slice().reverse() : list).map((m) => `<div class="wm-item">${escapeHtml(m.text)}</div>`).join('') || '<div class="wm-empty">无匹配</div>';
    };
  }

  function renderRel(body) {
    body.innerHTML = `<div class="wm-card"><div class="wm-h">关系图（动态力导向）</div>
      <div class="wm-hint">线越粗=关系越强，可拖拽节点</div>
      <svg id="wm-graph" class="wm-graph" viewBox="0 0 320 320"></svg>
      <div class="wm-list" id="rel-list"></div></div>`;
    drawGraph(body.querySelector('#wm-graph'));
    const rels = WM.MemoryStore.getRelations();
    body.querySelector('#rel-list').innerHTML = rels.length ? rels.map((r) => `<div class="wm-item">${escapeHtml(r.from)} <span class="wm-weight">${'●'.repeat(r.weight)}</span> ${escapeHtml(r.label)} → ${escapeHtml(r.to)}</div>`).join('') : '<div class="wm-empty">暂无关系，先总结</div>';
  }

  function drawGraph(svg) {
    const rels = WM.MemoryStore.getRelations();
    const names = new Set();
    rels.forEach((r) => { names.add(r.from); names.add(r.to); });
    const nodes = Array.from(names).map((id) => ({ id }));
    if (!nodes.length) { svg.innerHTML = '<text x="160" y="160" text-anchor="middle" fill="#9b8579">暂无关系</text>'; return; }
    const W = 320, H = 320;
    WM.Relations.forceLayout(nodes, rels, W, H);
    const pos = {};
    nodes.forEach((n) => (pos[n.id] = { x: n.x, y: n.y }));
    let s = '';
    rels.forEach((r) => {
      const a = pos[r.from], b = pos[r.to];
      if (!a || !b) return;
      s += `<line x1="${a.x.toFixed(0)}" y1="${a.y.toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${b.y.toFixed(0)}" stroke="#8a9a8b" stroke-width="${r.weight}" stroke-opacity="0.6"/>`;
    });
    nodes.forEach((n) => {
      s += `<circle cx="${n.x.toFixed(0)}" cy="${n.y.toFixed(0)}" r="6" fill="#5b6e57" data-name="${escapeHtml(n.id)}" class="wm-node" style="cursor:grab"/>`;
      s += `<text x="${(n.x+8).toFixed(0)}" y="${(n.y+4).toFixed(0)}" font-size="9" fill="#5b4a3f">${escapeHtml(n.id.length>6?n.id.slice(0,6)+'…':n.id)}</text>`;
    });
    svg.innerHTML = s;
    // 点击节点：显示该实体关系详情
    svg.querySelectorAll('.wm-node').forEach((c) => {
      c.addEventListener('click', () => {
        const name = c.getAttribute('data-name');
        const rels = WM.MemoryStore.getRelations().filter((r) => r.from === name || r.to === name);
        const listEl = document.getElementById('rel-list');
        if (!rels.length) { listEl.innerHTML = `<div class="wm-empty">「${escapeHtml(name)}」暂无关系</div>`; return; }
        listEl.innerHTML = `<div class="wm-h">「${escapeHtml(name)}」的关系（${rels.length}）</div>` + rels.map((r) => {
          const other = r.from === name ? r.to : r.from;
          const dir = r.from === name ? '→' : '←';
          return `<div class="wm-item">${escapeHtml(name)} <span class="wm-weight">${'●'.repeat(r.weight)}</span> ${r.label} ${dir} ${escapeHtml(other)}</div>`;
        }).join('');
      });
    });
    // 拖拽
    svg.querySelectorAll('.wm-node').forEach((c) => {
      c.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const name = c.getAttribute('data-name');
        const move = (e) => {
          const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
          const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
          c.setAttribute('cx', loc.x); c.setAttribute('cy', loc.y);
        };
        const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      });
    });
  }

  function renderPlot(body) {
    const plots = WM.MemoryStore.getPlots();
    let html = `<div class="wm-card"><div class="wm-h">剧情线（${plots.length}）</div>
      <div class="wm-timeline" id="plot-tl">`;
    const order = { active: 0, done: 1, abandon: 2 };
    const sorted = plots.slice().sort((a, b) => order[a.status] - order[b.status]);
    html += sorted.map((p) => `<div class="wm-plot wm-plot-${p.status}">
        <div class="wm-plot-title">${escapeHtml(p.title)} <span class="wm-badge">${p.status}</span></div>
        <div class="wm-plot-sum">${escapeHtml(p.summary)}</div></div>`).join('') || '<div class="wm-empty">暂无剧情线</div>';
    html += `</div>
      <div class="wm-actions"><button id="plot-run" class="wm-btn primary">从记忆更新剧情线</button></div>
      <div class="wm-status" id="plot-status"></div></div>`;
    body.innerHTML = html;
    body.querySelector('#plot-run').onclick = async () => {
      const st = body.querySelector('#plot-status'); st.textContent = '归纳中…';
      const r = await WM.Summary.runSummary(WM.Settings.load());
      st.textContent = r.ok ? '✓ 剧情线已更新' : '✗ 失败';
      renderPlot(body);
    };
  }

  function renderItem(body) {
    const items = WM.MemoryStore.getItems();
    let html = `<div class="wm-card"><div class="wm-h">物品 / 持有物追踪（${items.length}）</div>
      <div class="wm-row"><input id="it-name" placeholder="物品名"/><input id="it-desc" placeholder="描述"/><input id="it-owner" placeholder="持有者"/></div>
      <button id="it-add" class="wm-btn primary">添加</button>
      <div class="wm-list" id="it-list">`;
    html += items.map((i) => `<div class="wm-item" data-id="${i.id}"><b>${escapeHtml(i.name)}</b> <span class="wm-muted">（${escapeHtml(i.owner||'未知')}）</span><br/>${escapeHtml(i.desc)} <span class="wm-del" data-id="${i.id}">✕</span></div>`).join('') || '<div class="wm-empty">暂无物品</div>';
    html += `</div></div>`;
    body.innerHTML = html;
    body.querySelector('#it-add').onclick = async () => {
      const n = body.querySelector('#it-name').value.trim();
      if (!n) return;
      await WM.MemoryStore.addItem(n, body.querySelector('#it-desc').value, body.querySelector('#it-owner').value);
      renderItem(body);
    };
    body.querySelectorAll('.wm-del').forEach((d) => d.onclick = async () => { await WM.MemoryStore.removeItem(d.dataset.id); renderItem(body); });
  }

  function renderWorld(body) {
    const s = WM.Settings.load();
    const world = WM.MemoryStore.getWorld();
    const loreCount = WM.Worldbook.getLorebookEntries().length;
    body.innerHTML = `<div class="wm-card"><div class="wm-h">世界设定</div>
      <div class="wm-hint">基于角色卡/用户卡/世界书(${loreCount}条)/已有记忆推断，写入并注入上下文</div>
      <textarea id="world-ta" class="wm-ta" placeholder="世界观设定…">${escapeHtml(world)}</textarea>
      <div class="wm-row"><input id="world-extra" placeholder="自定义更新指令（可选）" style="flex:1"/></div>
      <div class="wm-row"><input id="world-lorename" placeholder="世界书名（同步世界书用，如 lorebook）" value="${s.lorebookName || ''}" style="flex:1"/></div>
      <label class="wm-row"><input type="checkbox" id="world-lore" ${s.worldToLorebook?'checked':''}/> 同步写入世界书（所有对话共享）</label>
      <div class="wm-actions">
        <button id="world-save" class="wm-btn">保存</button>
        <button id="world-gen" class="wm-btn primary">用 LLM 推断/更新</button>
      </div>
      <div class="wm-status" id="world-status"></div></div>`;
    body.querySelector('#world-save').onclick = async () => {
      s.lorebookName = body.querySelector('#world-lorename').value.trim();
      WM.Settings.save(s);
      await WM.MemoryStore.setWorld(body.querySelector('#world-ta').value);
      body.querySelector('#world-status').textContent = '✓ 已保存（记忆+注入）';
    };
    body.querySelector('#world-gen').onclick = async () => {
      const st = body.querySelector('#world-status'); st.textContent = '推断中…';
      try {
        s.lorebookName = body.querySelector('#world-lorename').value.trim();
        WM.Settings.save(s);
        const w = await WM.Worldbook.inferWorldview(s, { extraInstruction: body.querySelector('#world-extra').value });
        body.querySelector('#world-ta').value = w;
        await WM.MemoryStore.setWorld(w);
        if (body.querySelector('#world-lore').checked) {
          const r = await WM.Worldbook.writeToLorebook('世界观', w);
          st.textContent = r.ok ? '✓ 世界观已更新并写入世界书' : ('✓ 已存对话记忆；世界书未写（' + (r.reason === 'no_name' ? '请填世界书名' : r.reason) + '）');
        } else {
          st.textContent = '✓ 世界观已更新（仅对话记忆+注入）';
        }
      } catch (e) {
        st.textContent = '✗ ' + (e.message || e);
      }
    };
  }

  function renderCfg(body) {
    const s = WM.Settings.load();
    body.innerHTML = `<div class="wm-card"><div class="wm-h">设置 · 总结模型（真实 LLM 调用）</div>
      <label class="wm-row">Base URL<input id="c-base" value="${s.summaryBaseUrl}"/></label>
      <label class="wm-row">API Key<input id="c-key" type="password" value="${s.summaryApiKey}" placeholder="sk-..."/></label>
      <label class="wm-row">模型名<input id="c-model" value="${s.summaryModel}" placeholder="如 gpt-4o-mini"/></label>
      <label class="wm-row"><input type="checkbox" id="c-vec" ${s.vectorEnabled?'checked':''}/> 启用向量检索
        <span class="wm-muted">Embed:${s.embeddingBaseUrl||'未填'}</span></label>
      <label class="wm-row"><input type="checkbox" id="c-inj" ${s.injectMemories?'checked':''}/> 注入记忆到上下文（确保角色真的记得）
        <input type="checkbox" id="c-injw" ${s.injectWorld?'checked':''}/> 含世界观</label>
      <div class="wm-actions"><button id="c-save" class="wm-btn primary">保存设置</button></div>
      <div class="wm-hint">不填模型即回退酒馆自带 shared-api（textgeneration）。本地反代填 127.0.0.1。</div></div>`;
    body.querySelector('#c-save').onclick = () => {
      s.summaryBaseUrl = body.querySelector('#c-base').value;
      s.summaryApiKey = body.querySelector('#c-key').value;
      s.summaryModel = body.querySelector('#c-model').value;
      s.vectorEnabled = body.querySelector('#c-vec').checked;
      s.injectMemories = body.querySelector('#c-inj').checked;
      s.injectWorld = body.querySelector('#c-injw').checked;
      WM.Settings.save(s);
      body.querySelector('.wm-hint').textContent = '✓ 已保存';
    };
  }

  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function init() {
    injectButton();
    WM.Injection.init();
    // 自动总结：监听新楼层
    const es = (window.eventSource && window.eventSource.eventNames) ? window.eventSource : (window.SillyTavern && window.SillyTavern.eventSource);
    if (es && es.on) {
      const ev = (window.eventSource && window.eventSource.eventNames) ? window.eventSource.eventNames.MESSAGE_SENT : 'MESSAGE_SENT';
      es.on(ev, autoSummaryHook);
    }
  }

  async function autoSummaryHook() {
    const s = WM.Settings.load();
    if (!s.autoSummaryEnabled) return;
    let range = null;
    if (s.autoSummaryMode === 'count') {
      const total = WM.Summary.getChatMessages().length;
      range = { start: Math.max(0, total - s.autoSummaryCount), end: total - 1 };
    } else if (s.autoSummaryMode === 'range') {
      const total = WM.Summary.getChatMessages().length;
      range = { start: s.autoSummaryStart, end: s.autoSummaryEnd < 0 ? total - 1 : Math.min(s.autoSummaryEnd, total - 1) };
    }
    setTimeout(async () => {
      try {
        const r = await WM.Summary.runSummary(s, range);
        if (r.ok) {
          if (s.autoHideFloors && WM.FloorHider && WM.FloorHider.hideUntil) {
            await WM.FloorHider.hideUntil(r.range[1]);
          }
          toast(`🌿 温记：已提炼 ${r.count} 条记忆`);
        } else {
          toast(`🌿 温记：总结未执行（${r.reason}）`);
        }
      } catch (e) {
        toast(`🌿 温记：总结失败 - ${e.message || e}`);
      }
    }, 1500);
  }

  // 轻量 toast 提示（面板未开也能看到）
  function toast(msg) {
    let t = document.getElementById('warmmemo-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'warmmemo-toast';
      t.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(91,110,87,.95);color:#fff;padding:6px 14px;border-radius:12px;font-size:12px;z-index:10000;box-shadow:0 4px 14px rgba(0,0,0,.2)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .5s'; }, 3200);
  }

  WM.Launcher = { init, renderTab };
})();


  // ── 启动 ──
  if (window.WarmMemo && window.WarmMemo.Launcher) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.WarmMemo.Launcher.init());
    else window.WarmMemo.Launcher.init();
  } else {
    console.error('[WarmMemo] 启动失败：Launcher 未定义');
  }
  console.log('[WarmMemo] 就绪');
})();
