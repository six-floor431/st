(() => {
  // src/config/settings.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const LS_KEY = "warmmemo_settings_v2";
    const DEFAULTS = {
      summaryModel: "",
      summaryBaseUrl: "https://api.openai.com/v1",
      summaryApiKey: "",
      showMemoryButton: true,
      autoUpdate: true,
      vectorEnabled: false,
      embeddingBaseUrl: "",
      embeddingApiKey: "",
      embeddingModel: "text-embedding-3-small",
      rerankEnabled: false,
      rerankBaseUrl: "",
      rerankApiKey: "",
      rerankModel: "",
      // 自动总结楼层设置（自定义）
      autoSummaryEnabled: true,
      // 是否开启自动总结
      autoSummaryMode: "new",
      // 'new'=只总结新增楼层, 'range'=按区间, 'count'=最近N条
      autoSummaryCount: 20,
      // count 模式：最近 N 条
      autoSummaryStart: 0,
      // range 模式：起始楼层
      autoSummaryEnd: -1,
      // range 模式：-1 表示到最新
      autoHideFloors: true,
      // 总结后隐藏已处理楼层
      // 各自动子任务开关
      autoRelation: true,
      autoPlot: true,
      autoWorld: true,
      autoItems: true,
      worldToLorebook: true,
      // 是否把世界观/总结/物品/关系拆分写入世界书条目（默认开启，实现条目隔离）
      lorebookName: "WarmMemo",
      // 世界书名（可自定义；绑定到当前角色卡实现数据隔离）
      // 接管酒馆内置向量与重排序（开启后用我们自己的 VectorStore + Rerank 召回世界书条目）
      takeoverEmbedding: false,
      // 接管向量检索：开启后注入用我们自己的 embedding 相似度召回
      takeoverRerank: false,
      // 接管重排序：开启后对世界书召回结果做 rerank 重排
      injectMemories: true,
      // 是否注入记忆到上下文
      injectWorld: true
    };
    function load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return Object.assign({}, DEFAULTS);
        return Object.assign({}, DEFAULTS, JSON.parse(raw));
      } catch (e) {
        return Object.assign({}, DEFAULTS);
      }
    }
    function save(s) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(s));
      } catch (e) {
      }
    }
    WM.Settings = { load, save, DEFAULTS };
  })();

  // src/config/storage.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const DB_NAME = "warm_memo";
    const STORE = "kv";
    let _db = null;
    function openDB() {
      return new Promise((resolve) => {
        if (!("indexedDB" in window)) return resolve(null);
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
      _db = _db || await openDB();
      if (_db) {
        return new Promise((resolve) => {
          const tx = _db.transaction(STORE, "readonly");
          const rq = tx.objectStore(STORE).get(key);
          rq.onsuccess = () => resolve(rq.result !== void 0 ? rq.result : fallback);
          rq.onerror = () => resolve(fallback);
        });
      }
      try {
        const v = localStorage.getItem("wm:" + key);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    }
    async function set(key, value) {
      _db = _db || await openDB();
      if (_db) {
        return new Promise((resolve) => {
          const tx = _db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      }
      try {
        localStorage.setItem("wm:" + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    }
    WM.Storage = { get, set, openDB };
  })();

  // src/config/memory-store.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const FIELD = "warm_memo_v2";
    function emptyStore() {
      return {
        version: 2,
        memories: [],
        // [{id, text, ts, range:[start,end], vector?:number[]}]
        summaries: [],
        // 每段总结/剧情摘要独立存档 [{id, kind:'summary'|'plot', title, text, ts}]
        items: [],
        // 物品追踪 [{id, name, desc, owner, ts}]
        plots: [],
        // 剧情线 [{id, title, summary, ts, status:'active'|'done'|'abandon'}]
        world: "",
        // 世界观设定文本
        relations: [],
        // 关系边 [{from,to,label,weight}]
        summaryPointer: 0
        // 已总结到的楼层索引（用于自动隐藏）
      };
    }
    function getMetadata() {
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      const md = ctx && ctx.chatMetadata;
      if (md && typeof md === "object" && !Array.isArray(md)) return md;
      return null;
    }
    function activeChatId() {
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext();
        return ctx && ctx.chatId || null;
      } catch (e) {
        return null;
      }
    }
    function load() {
      const md = getMetadata();
      const raw = md && md[FIELD];
      if (!raw) return emptyStore();
      try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        const base = emptyStore();
        return Object.assign(base, obj);
      } catch (e) {
        return emptyStore();
      }
    }
    async function save(store) {
      const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
      if (!ctx || !ctx.updateChatMetadata) return false;
      try {
        ctx.updateChatMetadata({ [FIELD]: store }, false);
        if (typeof ctx.saveMetadata === "function") await ctx.saveMetadata();
        else if (typeof ctx.saveChat === "function") await ctx.saveChat();
        if (WM.Worldbook && WM.Settings && WM.Settings.load().worldToLorebook !== false) {
          dispatchLorebook().catch((e) => console.warn("[WarmMemo] \u4E16\u754C\u4E66\u540C\u6B65\u5931\u8D25", e));
        }
        return true;
      } catch (e) {
        console.error("[WarmMemo] \u4FDD\u5B58\u8BB0\u5FC6\u5931\u8D25", e);
        return false;
      }
    }
    async function addMemory(text, range) {
      const s = load();
      const id = "mem_" + Date.now() + "_" + Math.floor(Math.random() * 1e3);
      s.memories.push({ id, text: String(text).trim(), ts: Date.now(), range: range || null });
      if (s.memories.length > 400) s.memories = s.memories.slice(-400);
      await save(s);
      return id;
    }
    function getMemories() {
      return load().memories;
    }
    async function addSummary(text, kind, title) {
      const s = load();
      const id = "sm_" + Date.now() + "_" + Math.floor(Math.random() * 1e3);
      s.summaries.push({
        id,
        kind: kind || "summary",
        title: title || (/* @__PURE__ */ new Date()).toLocaleString("zh-CN"),
        text: String(text).trim(),
        ts: Date.now()
      });
      if (s.summaries.length > 300) s.summaries = s.summaries.slice(-300);
      await save(s);
      return id;
    }
    async function removeSummary(id) {
      const s = load();
      s.summaries = s.summaries.filter((x) => x.id !== id);
      await save(s);
    }
    function getSummaries() {
      return load().summaries;
    }
    async function dispatchLorebook() {
      if (!WM.Worldbook) return;
      const s = load();
      const settings = WM.Settings.load();
      if (settings.worldToLorebook === false) return;
      for (const sm of s.summaries) {
        await WM.Worldbook.writeEntry({
          kind: sm.kind === "plot" ? "summary" : "summary",
          sourceId: "summary::" + sm.id,
          title: (sm.kind === "plot" ? "\u5267\u60C5\u6458\u8981\xB7" : "\u603B\u7ED3\xB7") + sm.title,
          content: sm.text,
          strategy: "constant"
        });
      }
      for (const it of s.items) {
        if (!it.name) continue;
        await WM.Worldbook.writeEntry({
          kind: "item",
          sourceId: "item::" + it.id,
          title: "\u7269\u54C1\xB7" + it.name,
          content: `\u7269\u54C1\uFF1A${it.name}${it.owner ? "\uFF08\u6301\u6709\u8005\uFF1A" + it.owner + "\uFF09" : ""}
${it.desc || ""}`.trim(),
          keys: [it.name],
          strategy: "selective"
        });
      }
      const groups = WM.Relations && WM.Relations.groupByPerson ? WM.Relations.groupByPerson({ pairs: s.relations }) : [];
      for (const g of groups) {
        await WM.Worldbook.writeEntry({
          kind: "relation",
          sourceId: "relation::" + g.person,
          title: "\u5173\u7CFB\xB7" + g.person,
          content: `${g.person}\u7684\u5173\u7CFB\uFF1A${g.text}`,
          keys: g.keys,
          strategy: "constant"
        });
      }
      if (s.world && s.world.trim()) {
        await WM.Worldbook.writeEntry({
          kind: "world",
          sourceId: "world::main",
          title: "\u4E16\u754C\u89C2\u8BBE\u5B9A",
          content: s.world,
          strategy: "constant"
        });
      }
    }
    async function addItem(name, desc, owner) {
      const s = load();
      s.items.push({ id: "it_" + Date.now(), name: String(name).trim(), desc: String(desc || "").trim(), owner: String(owner || "").trim(), ts: Date.now() });
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
    function getItems() {
      return load().items;
    }
    async function addPlot(title, summary, status) {
      const s = load();
      s.plots.push({ id: "pl_" + Date.now(), title: String(title).trim(), summary: String(summary || "").trim(), status: status || "active", ts: Date.now() });
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
    function getPlots() {
      return load().plots;
    }
    async function setWorld(text) {
      const s = load();
      s.world = String(text || "").trim();
      await save(s);
    }
    function getWorld() {
      return load().world;
    }
    async function setRelations(rels) {
      const s = load();
      s.relations = rels || [];
      await save(s);
    }
    function getRelations() {
      return load().relations;
    }
    async function setSummaryPointer(idx) {
      const s = load();
      s.summaryPointer = idx;
      await save(s);
    }
    function getSummaryPointer() {
      return load().summaryPointer || 0;
    }
    function exportJSON() {
      const s = load();
      return JSON.stringify({ type: "warmmemo_v2", exportedAt: Date.now(), data: s }, null, 2);
    }
    async function importJSON(text) {
      const obj = JSON.parse(text);
      const data = obj && obj.data ? obj.data : obj;
      const base = emptyStore();
      const merged = Object.assign(base, data);
      await save(merged);
      return true;
    }
    WM.MemoryStore = {
      FIELD,
      emptyStore,
      load,
      save,
      addMemory,
      getMemories,
      addSummary,
      removeSummary,
      getSummaries,
      dispatchLorebook,
      addPlot,
      updatePlot,
      removePlot,
      getPlots,
      setWorld,
      getWorld,
      setRelations,
      getRelations,
      setSummaryPointer,
      getSummaryPointer,
      exportJSON,
      importJSON
    };
  })();

  // src/config/llm-client.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function normalizeBaseUrl(u) {
      if (!u) return u;
      return u.replace("0.0.0.0", "127.0.0.1").replace(/\/+$/, "");
    }
    async function callIndependent(messages, cfg) {
      const base = normalizeBaseUrl(cfg.baseUrl) || "https://api.openai.com/v1";
      const url = base.replace(/\/?v1\/?$/, "") + "/v1/chat/completions";
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + (cfg.apiKey || "")
        },
        body: JSON.stringify({
          model: cfg.model || "gpt-4o-mini",
          messages,
          temperature: cfg.temperature != null ? cfg.temperature : 0.7
        })
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error("\u72EC\u7ACBAPI " + r.status + ": " + t.slice(0, 200));
      }
      const j = await r.json();
      return j.choices && j.choices[0] && j.choices[0].message.content;
    }
    async function callShared(messages) {
      if (window.textgeneration && typeof window.textgeneration.generate === "function") {
        return await window.textgeneration.generate(messages);
      }
      if (window.SillyTavern && window.SillyTavern.sendGenerateRequest) {
        return await window.SillyTavern.sendGenerateRequest(messages, { noHistory: true });
      }
      throw new Error("\u9152\u9986 shared-api \u4E0D\u53EF\u7528\uFF08textgeneration \u672A\u5C31\u7EEA\uFF09");
    }
    async function generate(messages, settings) {
      const s = settings || await WM.Settings.load();
      const mode = s.summaryMode || "independent-api";
      if (mode === "independent-api" && s.summaryApi && s.summaryApi.apiKey) {
        try {
          return await callIndependent(messages, {
            baseUrl: s.summaryApi.baseUrl,
            apiKey: s.summaryApi.apiKey,
            model: s.summaryApi.model,
            temperature: 0.7
          });
        } catch (e) {
          console.warn("[WarmMemo] \u72EC\u7ACBAPI\u5931\u8D25\uFF0C\u56DE\u9000 shared-api:", e.message);
          return await callShared(messages);
        }
      }
      return await callShared(messages);
    }
    async function complete(messages, opts) {
      opts = opts || {};
      const s = opts.settings || await WM.Settings.load();
      const baseUrl = s.summaryBaseUrl || "https://api.openai.com/v1";
      const apiKey = s.summaryApiKey || "";
      const model = opts.model || s.summaryModel || "";
      if (apiKey || model) {
        try {
          return await callIndependent(messages, {
            baseUrl,
            apiKey,
            model: model || "gpt-4o-mini",
            temperature: opts.temperature != null ? opts.temperature : 0.7,
            max_tokens: opts.max_tokens
          });
        } catch (e) {
          console.warn("[WarmMemo] \u72EC\u7ACBAPI\u5931\u8D25\uFF0C\u5C1D\u8BD5\u56DE\u9000 shared-api:", e.message);
          try {
            return await callShared(messages);
          } catch (e2) {
            throw new Error("LLM \u8C03\u7528\u5931\u8D25\uFF1A\u72EC\u7ACBAPI(" + e.message + ") \u4E14 shared-api(" + e2.message + ")\u3002\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199\u6709\u6548\u7684\u603B\u7ED3\u6A21\u578B API\u3002");
          }
        }
      }
      try {
        return await callShared(messages);
      } catch (e) {
        throw new Error("\u672A\u914D\u7F6E\u603B\u7ED3\u6A21\u578B\u4E14\u9152\u9986 shared-api \u4E0D\u53EF\u7528\uFF1A" + e.message + "\u3002\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 BaseURL/Key/\u6A21\u578B\u540D\u3002");
      }
    }
    WM.LLMClient = { generate, complete, callIndependent, callShared, normalizeBaseUrl };
  })();

  // src/config/vector-store.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const DB = "warm_memo_vec";
    const STORE = "vectors";
    let _db = null;
    let _enabled = false;
    let _lastQuery = "";
    function open() {
      return new Promise((resolve) => {
        if (!("indexedDB" in window)) return resolve(null);
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
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
    async function getAll() {
      _db = _db || await open();
      if (_db) {
        return new Promise((res) => {
          const tx = _db.transaction(STORE, "readonly");
          const out = [];
          tx.objectStore(STORE).openCursor().onsuccess = (e) => {
            const cur = e.target.result;
            if (cur) {
              out.push(cur.value);
              cur.continue();
            } else res(out);
          };
          tx.onerror = () => res([]);
        });
      }
      return Object.values(WM._vecMem || {});
    }
    async function put(rec) {
      _db = _db || await open();
      if (_db) return new Promise((res) => {
        const tx = _db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      });
      (WM._vecMem = WM._vecMem || {})[rec.id] = rec;
      return true;
    }
    async function embed(text, settings) {
      settings = settings || WM.Settings.load();
      if (!settings.vectorEnabled || !settings.embeddingBaseUrl || !WM.EmbeddingClient || !WM.EmbeddingClient.embed) return null;
      try {
        return await WM.EmbeddingClient.embed(text, settings);
      } catch (e) {
        return null;
      }
    }
    async function search(memories, query, topK) {
      _lastQuery = query || "";
      const settings = WM.Settings.load();
      if (!settings.vectorEnabled) {
        _enabled = false;
        return memories.slice(-topK);
      }
      _enabled = true;
      const vec = await embed(query, settings);
      if (!vec) return memories.slice(-topK);
      const stored = await getAll();
      const map = {};
      stored.forEach((r) => map[r.id] = r.vector);
      for (const m of memories) {
        if (!map[m.id]) {
          const v = await embed(m.text, settings);
          if (v) {
            await put({ id: m.id, text: m.text, vector: v, ts: Date.now() });
            map[m.id] = v;
          }
        }
      }
      let scored = memories.map((m) => ({ m, score: map[m.id] ? cosine(vec, map[m.id]) : -1 })).filter((x) => x.score > 0.1).sort((a, b) => b.score - a.score);
      if (settings.rerankEnabled && WM.RerankClient && WM.RerankClient.rerank) {
        const docs = scored.map((x) => x.m.text);
        const rs = await WM.RerankClient.rerank(query, docs, settings, {});
        if (rs) {
          scored.forEach((x, i) => x.score = rs[i]);
          scored.sort((a, b) => b.score - a.score);
        }
      }
      return scored.slice(0, topK || 12).map((x) => x.m);
    }
    WM.VectorStore = { search, cosine, getAll, put, get enabled() {
      return _enabled;
    }, get lastQuery() {
      return _lastQuery;
    }, set lastQuery(v) {
      _lastQuery = v;
    } };
  })();

  // src/config/embedding-client.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const PROVIDERS = {
      compatible: { label: "\u517C\u5BB9 OpenAI", defBase: "", defModel: "text-embedding-3-small" },
      openai: { label: "OpenAI", defBase: "https://api.openai.com/v1", defModel: "text-embedding-3-small" },
      siliconflow: { label: "SiliconFlow", defBase: "https://api.siliconflow.cn/v1", defModel: "BAAI/bge-m3" },
      gemini: { label: "Gemini", defBase: "https://generativelanguage.googleapis.com/v1beta", defModel: "text-embedding-004" },
      local: { label: "\u672C\u5730\u53CD\u4EE3", defBase: "http://127.0.0.1:11434/v1", defModel: "nomic-embed-text" }
    };
    function normalizeBaseUrl(u) {
      if (!u) return u;
      return u.replace("0.0.0.0", "127.0.0.1").replace(/\/+$/, "");
    }
    function resolveOpenAiUrl(base) {
      base = normalizeBaseUrl(base) || "";
      return base.replace(/\/?v1\/?$/, "") + "/v1/embeddings";
    }
    function resolveGeminiUrl(base, model) {
      base = normalizeBaseUrl(base) || "";
      return base + "/models/" + model + ":embedContent";
    }
    async function embed(texts, settings) {
      const s = settings || {};
      const base = normalizeBaseUrl(s.embeddingBaseUrl) || s.baseUrl || "https://api.siliconflow.cn/v1";
      const model = s.embeddingModel || s.model || "BAAI/bge-m3";
      const key = s.embeddingApiKey || s.apiKey || "";
      let provider = s.embeddingProvider;
      if (!provider) {
        if (/generativelanguage\.googleapis\.com/i.test(base)) provider = "gemini";
        else provider = "compatible";
      }
      const input = Array.isArray(texts) ? texts : [texts];
      if (provider === "gemini") {
        const out = [];
        for (const t of input) {
          const url2 = resolveGeminiUrl(base, model);
          const r2 = await fetch(url2, {
            method: "POST",
            headers: Object.assign({ "Content-Type": "application/json" }, key ? { "x-goog-api-key": key } : {}),
            body: JSON.stringify({ content: { parts: [{ text: t }] } })
          });
          const j2 = await r2.json();
          out.push(j2.embedding && (j2.embedding.values || j2.embedding) || []);
        }
        return out.length === 1 ? out[0] : out;
      }
      const url = resolveOpenAiUrl(base);
      const r = await fetch(url, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, key ? { Authorization: "Bearer " + key } : {}),
        body: JSON.stringify({ model, input })
      });
      const j = await r.json();
      if (!j.data) throw new Error("embedding \u8FD4\u56DE\u5F02\u5E38: " + JSON.stringify(j).slice(0, 200));
      const vecs = j.data.map((d) => d.embedding);
      return Array.isArray(texts) ? vecs : vecs[0];
    }
    async function testConnection(settings) {
      try {
        const v = await embed("test", settings);
        return { success: true, dimension: Array.isArray(v) ? v.length : 0 };
      } catch (e) {
        return { success: false, error: String(e.message || e) };
      }
    }
    WM.EmbeddingClient = { PROVIDERS, embed, testConnection, normalizeBaseUrl };
  })();

  // src/config/rerank-client.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function normalize(url) {
      if (!url) return url;
      return url.replace("0.0.0.0", "127.0.0.1").replace(/\/+$/, "");
    }
    async function rerank(query, documents, rawSettings, options) {
      const s = rawSettings || {};
      if (!s.rerankEnabled) return null;
      const url = normalize(s.rerankBaseUrl) || "https://api.siliconflow.cn/v1/rerank";
      const model = s.rerankModel || "BAAI/bge-reranker-v2-m3";
      const key = s.rerankApiKey || "";
      const docs = (documents || []).filter((d) => d && String(d).trim());
      if (!docs.length) return [];
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), s.timeoutMs || 3e3);
      try {
        const r = await fetch(url, {
          method: "POST",
          signal: ctrl.signal,
          headers: Object.assign({ "Content-Type": "application/json" }, key ? { Authorization: "Bearer " + key } : {}),
          body: JSON.stringify({
            model,
            query,
            documents: docs,
            top_n: docs.length,
            return_documents: false
          })
        });
        const j = await r.json();
        const scoreMap = {};
        (j.results || []).forEach((it) => {
          scoreMap[it.index] = it.relevance_score;
        });
        return docs.map((_, i) => scoreMap[i] != null ? scoreMap[i] : 0);
      } catch (e) {
        console.warn("[WarmMemo] rerank \u5931\u8D25\uFF0C\u56DE\u9000\u539F\u5E8F", e);
        return docs.map(() => 0);
      } finally {
        clearTimeout(timer);
      }
    }
    async function testConnection(rawSettings) {
      try {
        const scores = await rerank("test", ["a", "b"], rawSettings, { topN: 2 });
        return { success: Array.isArray(scores) };
      } catch (e) {
        return { success: false, error: String(e.message || e) };
      }
    }
    WM.RerankClient = { rerank, testConnection };
  })();

  // src/config/worldbook.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function helper() {
      return window.TavernHelper;
    }
    function available() {
      return typeof helper() !== "undefined";
    }
    function targetName() {
      const s = WM.Settings && WM.Settings.load ? WM.Settings.load() : {};
      return s.lorebookName && s.lorebookName.trim() || "WarmMemo";
    }
    async function ensureLorebook() {
      if (!available()) return false;
      const name = targetName();
      try {
        const names = await helper().getWorldbookNames();
        if (!names.includes(name)) {
          await helper().createWorldbook(name, []);
        }
        if (helper().rebindCharWorldbooks) {
          const cur = await helper().getCharWorldbookNames("current");
          if (!cur.includes(name)) {
            await helper().rebindCharWorldbooks([...cur, name], "current");
          }
        }
        return true;
      } catch (e) {
        console.warn("[WarmMemo] ensureLorebook \u5931\u8D25:", e);
        return false;
      }
    }
    function extraOf(sourceId) {
      return { warmMemo: true, sourceId: sourceId || "" };
    }
    async function listEntries() {
      if (!available()) return [];
      const name = targetName();
      try {
        const entries = await helper().getWorldbookEntries(name);
        return (entries || []).map((e, i) => ({ uid: String(e.uid != null ? e.uid : i), entry: e }));
      } catch (e) {
        return [];
      }
    }
    async function writeEntry(opts) {
      if (!opts || !opts.content || !opts.content.trim()) return null;
      const ok = await ensureLorebook();
      if (!ok) return null;
      const name = targetName();
      const sourceId = opts.sourceId || [opts.kind, opts.title].join("::");
      const entry = {
        content: opts.content,
        comment: opts.title || opts.kind,
        name: opts.title || "",
        enabled: true,
        position: opts.position || "before_prompt",
        // 默认在提示词之前
        // 触发策略
        strategy: {
          type: opts.strategy === "selective" ? "selective" : "constant",
          depth: 1,
          useExcept: false,
          tokens: 512,
          keys: opts.keys && opts.keys.length ? opts.keys : [],
          order: 100
        },
        excludeRecursion: false,
        preventRecursion: false,
        delayUntilRecursion: false,
        probability: 100,
        useProbability: false,
        extra: extraOf(sourceId)
      };
      try {
        const existing = await listEntries();
        const hit = existing.find((x) => x.entry.extra && x.entry.extra.warmMemo && x.entry.extra.sourceId === sourceId);
        if (hit) {
          const merged = Object.assign({}, x_merge(hit.entry), entry);
          await helper().updateWorldbookEntry(name, hit.uid, merged);
          return hit.uid;
        } else {
          const created = await helper().createWorldbookEntries(name, [entry]);
          if (Array.isArray(created) && created.length) return String(created[0].uid != null ? created[0].uid : created[0].id);
          return "new";
        }
      } catch (e) {
        console.warn("[WarmMemo] writeEntry \u5931\u8D25:", e);
        return null;
      }
    }
    function x_merge(base) {
      return Object.assign({}, base);
    }
    async function removeEntry(sourceId) {
      if (!available() || !sourceId) return;
      const name = targetName();
      try {
        const existing = await listEntries();
        const hit = existing.find((x) => x.entry.extra && x.entry.extra.warmMemo && x.entry.extra.sourceId === sourceId);
        if (hit) await helper().deleteWorldbookEntry(name, hit.uid);
      } catch (e) {
        console.warn("[WarmMemo] removeEntry \u5931\u8D25:", e);
      }
    }
    async function clearAll() {
      if (!available()) return;
      const name = targetName();
      try {
        const existing = await listEntries();
        for (const x of existing) {
          if (x.entry.extra && x.entry.extra.warmMemo) await helper().deleteWorldbookEntry(name, x.uid);
        }
      } catch (e) {
        console.warn("[WarmMemo] clearAll \u5931\u8D25:", e);
      }
    }
    async function writeSummary(dateLabel, content) {
      return writeEntry({ kind: "summary", title: "\u603B\u7ED3\xB7" + dateLabel, content, strategy: "constant" });
    }
    async function writeItem(itemName, content) {
      return writeEntry({ kind: "item", title: "\u7269\u54C1\xB7" + itemName, content, keys: [itemName], strategy: "selective" });
    }
    async function writeRelation(person, content, keys) {
      return writeEntry({ kind: "relation", title: "\u5173\u7CFB\xB7" + person, content, keys: keys && keys.length ? keys : [person], strategy: "constant" });
    }
    async function writeWorld(content) {
      return writeEntry({ kind: "world", title: "\u4E16\u754C\u89C2\u8BBE\u5B9A", content, strategy: "constant" });
    }
    function getCtx() {
      return window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
    }
    function getCharacterCard() {
      try {
        const ctx = getCtx();
        const c = ctx && ctx.characterCard;
        if (c) return { name: c.name, description: c.description, personality: c.personality };
        const chat = ctx && ctx.chat;
        const last = chat && chat.find((m) => !m.is_user);
        return { name: last && last.name || ctx && ctx.name2 || "", description: last && last.mes || "" };
      } catch (e) {
        return {};
      }
    }
    function getUserCard() {
      try {
        const ctx = getCtx();
        const u = ctx && ctx.user;
        if (u) return { name: u.name, description: u.description };
        return { name: ctx && ctx.name1 || "\u7528\u6237", description: "" };
      } catch (e) {
        return {};
      }
    }
    async function getLorebookEntries() {
      const list = await listEntries();
      return list.map((x) => ({ key: x.entry.name || x.entry.comment || "", content: x.entry.content || "" }));
    }
    async function inferWorldview(settings, opts) {
      settings = settings || WM.Settings && WM.Settings.load || {};
      const char = getCharacterCard();
      const user = getUserCard();
      const prev = WM.MemoryStore ? WM.MemoryStore.getWorld() : "";
      const sys = `\u4F60\u662F\u4E16\u754C\u89C2\u6574\u7406\u8005\u3002\u57FA\u4E8E\u3010\u89D2\u8272\u8BBE\u5B9A\u3011\u3010\u7528\u6237\u8BBE\u5B9A\u3011\u4E0E\u3010\u5DF2\u6709\u4E16\u754C\u89C2\u3011\uFF0C\u63A8\u65AD\u5E76\u8865\u5168\u5F53\u524D\u6545\u4E8B\u7684\u4E16\u754C\u89C2\u8BBE\u5B9A\u3002
\u8981\u6C42\uFF1A\u5BA2\u89C2\u3001\u7D27\u51D1\uFF0C\u6DB5\u76D6\u65F6\u4EE3/\u5730\u70B9/\u52BF\u529B/\u89C4\u5219/\u5173\u952E\u8BBE\u5B9A\u3002\u4E0E\u5DF2\u6709\u4E0D\u51B2\u7A81\u5219\u5408\u5E76\u3002\u6700\u591A 600 \u5B57\u3002
${opts && opts.extraInstruction ? "\u989D\u5916\u6307\u4EE4\uFF1A" + opts.extraInstruction : ""}`;
      const userMsg = `\u3010\u89D2\u8272\u8BBE\u5B9A\u3011${char.name || "\u672A\u77E5"}\uFF1A${char.description || ""}
\u3010\u7528\u6237\u8BBE\u5B9A\u3011${user.name || "\u672A\u77E5"}\uFF1A${user.description || ""}
\u3010\u5DF2\u6709\u4E16\u754C\u89C2\u3011${prev || "\uFF08\u65E0\uFF09"}
\u8BF7\u8F93\u51FA\u4E16\u754C\u89C2\u8BBE\u5B9A\uFF1A`;
      if (!WM.Summary || !WM.Summary.callLLM) return prev;
      const out = await WM.Summary.callLLM(sys, userMsg, settings, { maxTokens: 700, temperature: 0.4 });
      return out && out.trim() ? out.trim() : prev;
    }
    WM.Worldbook = {
      available,
      ensureLorebook,
      writeEntry,
      removeEntry,
      clearAll,
      listEntries,
      getLorebookEntries,
      writeSummary,
      writeItem,
      writeRelation,
      writeWorld,
      targetName,
      getCharacterCard,
      getUserCard,
      inferWorldview
    };
  })();

  // src/config/plot.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    async function extractPlots(settings) {
      const memories = WM.MemoryStore.getMemories();
      const recent = memories.slice(-40).map((m) => m.text).join("\n");
      const existing = WM.MemoryStore.getPlots().map((p) => `\xB7 ${p.title}\uFF08${p.status}\uFF09\uFF1A${p.summary}`).join("\n");
      if (!recent.trim()) return [];
      const sys = `\u4ECE\u300C\u6709\u6E29\u5EA6\u8BB0\u5FC6\u300D\u4E2D\u5F52\u7EB3\u5F53\u524D\u7684\u3010\u5267\u60C5\u7EBF\u3011\u3002
\u8981\u6C42\uFF1A\u6700\u591A 8 \u6761\u4ECD\u5728\u63A8\u8FDB\u6216\u91CD\u8981\u7684\u5267\u60C5\u7EBF\u3002\u6BCF\u884C\u4E00\u6761\uFF0C\u683C\u5F0F\u4E25\u683C\u4E3A\uFF1A
\u6807\u9898|\u8FDB\u5C55\u6458\u8981|\u72B6\u6001(active/done/abandon)
\u72B6\u6001\u8BF4\u660E\uFF1Aactive=\u8FDB\u884C\u4E2D, done=\u5DF2\u5B8C\u6210, abandon=\u5DF2\u653E\u5F03\u3002\u5DF2\u6709\u5267\u60C5\u7EBF\u82E5\u5DF2\u7ED3\u675F\u8BF7\u6539\u72B6\u6001\u3002\u53EA\u57FA\u4E8E\u8BB0\u5FC6\uFF0C\u4E0D\u7F16\u9020\u3002`;
      const userMsg = `\u3010\u5DF2\u6709\u5267\u60C5\u7EBF\u3011
${existing || "\uFF08\u65E0\uFF09"}

\u3010\u8FD1\u671F\u8BB0\u5FC6\u3011
${recent}

\u8BF7\u8F93\u51FA\u66F4\u65B0\u540E\u7684\u5267\u60C5\u7EBF\uFF1A`;
      try {
        const raw = await WM.Summary.callLLM(sys, userMsg, settings, { maxTokens: 900 });
        if (!raw) return [];
        return raw.split("\n").map((l) => l.trim()).filter((l) => l.includes("|")).map((l) => {
          const [title, summary, status] = l.split("|").map((x) => x.trim());
          return title ? { title, summary: summary || "", status: ["active", "done", "abandon"].includes(status) ? status : "active" } : null;
        }).filter(Boolean);
      } catch (e) {
        return [];
      }
    }
    WM.Plot = { extractPlots };
  })();

  // src/config/summary.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    async function callLLM(system, user, settings, opts) {
      settings = settings || WM.Settings.load();
      opts = opts || {};
      const prompt = [{ role: "system", content: system }, { role: "user", content: user }];
      const out = await WM.LLMClient.complete(prompt, {
        temperature: opts.temperature != null ? opts.temperature : 0.3,
        max_tokens: opts.maxTokens || 700,
        model: settings.summaryModel || "",
        settings
      });
      return out || "";
    }
    function dedupeMemory(text, range) {
      const s = WM.MemoryStore.load();
      const t = text.trim();
      const sim = s.memories.find((m) => m.text === t || m.text.includes(t) || t.includes(m.text));
      if (sim) {
        sim.text = t;
        sim.ts = Date.now();
        if (range) sim.range = range;
        WM.MemoryStore.save(s);
        return sim.id;
      }
      return WM.MemoryStore.addMemory(t, range);
    }
    function getChatMessages() {
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext();
        const msgs = ctx && ctx.chat || [];
        return msgs.map((m, i) => ({ index: i, name: m.name || (m.is_user ? "\u7528\u6237" : "\u89D2\u8272"), text: m.mes || "" }));
      } catch (e) {
        return [];
      }
    }
    async function runSummary(settings, range) {
      settings = settings || WM.Settings.load();
      const msgs = getChatMessages();
      if (!msgs.length) return { ok: false, reason: "no_messages" };
      let start = range && range.start != null ? range.start : WM.MemoryStore.getSummaryPointer();
      let end = range && range.end != null ? range.end : msgs.length - 1;
      start = Math.max(0, start);
      end = Math.min(msgs.length - 1, end);
      if (end < start) return { ok: false, reason: "empty_range" };
      const slice = msgs.slice(start, end + 1).map((m) => `${m.name}\uFF1A${m.text}`).join("\n");
      const prevMem = WM.MemoryStore.getMemories().slice(-20).map((m) => m.text).join("\n");
      const char = WM.Worldbook.getCharacterCard && WM.Worldbook.getCharacterCard() || {};
      const user = WM.Worldbook.getUserCard && WM.Worldbook.getUserCard() || {};
      const lore = WM.Worldbook.getLorebookEntries && WM.Worldbook.getLorebookEntries() || [];
      const loreTxt = lore.length ? lore.map((l) => `\xB7 ${l.key}: ${l.content.slice(0, 160)}`).join("\n") : "\uFF08\u65E0\uFF09";
      const sys = `\u4F60\u662F\u6709\u6E29\u5EA6\u7684\u8BB0\u5FC6\u6574\u7406\u8005\u3002\u8BF7\u57FA\u4E8E\u3010\u89D2\u8272\u8BBE\u5B9A\u3011\u3010\u7528\u6237\u8BBE\u5B9A\u3011\u3010\u4E16\u754C\u4E66\u3011\u3010\u5DF2\u6709\u8BB0\u5FC6\u3011\u4E0E\u3010\u65B0\u5BF9\u8BDD\u3011\uFF0C\u63D0\u70BC\u300C\u6709\u6E29\u5EA6\u8BB0\u5FC6\u300D\u3002
\u8981\u6C42\uFF1A
- \u7528\u7B2C\u4E09\u4EBA\u79F0\u3001\u5BA2\u89C2\u4F46\u6709\u6E29\u5EA6\u7684\u53E3\u543B\uFF0C\u8BB0\u5F55\u89D2\u8272\u4E0E\u7528\u6237\u4E4B\u95F4\u53D1\u751F\u7684\u5173\u952E\u4E8B\u4EF6\u3001\u60C5\u611F\u4E92\u52A8\u3001\u7EA6\u5B9A\u3001\u7EC6\u8282\u3001\u6027\u683C\u5C55\u73B0\u3002
- \u91CD\u70B9\u4FDD\u7559\uFF1A\u4EBA\u7269\u5173\u7CFB\u53D8\u5316\u3001\u91CD\u8981\u7EA6\u5B9A\u3001\u5173\u952E\u7269\u54C1\u3001\u5267\u60C5\u8FDB\u5C55\u3001\u89D2\u8272\u60C5\u7EEA\u4E0E\u6027\u683C\u7EC6\u8282\u3002
- \u4E0D\u8981\u590D\u8FF0\u65E0\u5173\u5BD2\u6684\uFF1B\u4E0D\u8981\u7F16\u9020\u672A\u53D1\u751F\u7684\uFF1B\u4E0E\u5DF2\u6709\u8BB0\u5FC6\u51B2\u7A81\u4EE5\u65B0\u5BF9\u8BDD\u4E3A\u51C6\u3002
- \u8F93\u51FA\u82E5\u5E72\u6761\uFF0C\u6BCF\u6761\u4E00\u884C\uFF1B\u4E0D\u8981\u52A0\u5E8F\u53F7\u524D\u7F00\u5916\u7684\u683C\u5F0F\u3002`;
      let userMsg = `\u3010\u89D2\u8272\u8BBE\u5B9A\u3011${char.name || "\u672A\u77E5"}\uFF1A${char.description || ""} | \u6027\u683C\uFF1A${char.personality || ""}
`;
      userMsg += `\u3010\u7528\u6237\u8BBE\u5B9A\u3011${user.name || "\u672A\u77E5"}\uFF1A${user.description || ""}
`;
      userMsg += `\u3010\u4E16\u754C\u4E66\u3011${loreTxt}
`;
      userMsg += `\u3010\u5DF2\u6709\u8BB0\u5FC6\u3011
${prevMem || "\uFF08\u65E0\uFF09"}

`;
      userMsg += `\u3010\u65B0\u5BF9\u8BDD\uFF08\u697C\u5C42 ${start}-${end}\uFF09\u3011
${slice}

\u8BF7\u8F93\u51FA\u672C\u6B21\u63D0\u70BC\u7684\u8BB0\u5FC6\uFF1A`;
      const out = await callLLM(sys, userMsg, settings, { maxTokens: 1e3, temperature: 0.35 });
      if (!out || !out.trim()) return { ok: false, reason: "llm_empty_or_failed" };
      const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) await dedupeMemory(line, [start, end]);
      const dateLabel = (/* @__PURE__ */ new Date()).toLocaleString("zh-CN");
      await WM.MemoryStore.addSummary(out, "summary", dateLabel);
      await WM.MemoryStore.setSummaryPointer(end + 1);
      const results = { relations: 0, plots: 0, world: false, items: 0 };
      if (settings.autoRelation) {
        try {
          const rels = await WM.Relations.extractRelations(lines.join("\n"), settings);
          results.relations = rels.length;
          const merged = WM.Relations.mergeRelations(WM.MemoryStore.getRelations(), rels);
          await WM.MemoryStore.setRelations(merged);
        } catch (e) {
          results.relationsErr = e.message;
        }
      }
      if (settings.autoPlot) {
        try {
          const plots = await WM.Plot.extractPlots(settings);
          if (plots.length) {
            const s = WM.MemoryStore.load();
            s.plots = plots.map((p) => ({ id: "pl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), title: p.title, summary: p.summary, status: p.status, ts: Date.now() }));
            await WM.MemoryStore.save(s);
            for (const p of plots) await WM.MemoryStore.addSummary(p.summary, "plot", p.title);
            results.plots = plots.length;
          }
        } catch (e) {
          results.plotsErr = e.message;
        }
      }
      if (settings.autoWorld) {
        try {
          const world = await WM.Worldbook.inferWorldview(settings);
          if (world) {
            await WM.MemoryStore.setWorld(world);
            results.world = true;
          }
        } catch (e) {
          results.worldErr = e.message;
        }
      }
      if (settings.autoItems) {
        try {
          const items = await extractItems(settings, lines.join("\n"));
          if (items.length) {
            for (const it of items) await WM.MemoryStore.addItem(it.name, it.desc, it.owner);
            results.items = items.length;
          }
        } catch (e) {
          results.itemsErr = e.message;
        }
      }
      return { ok: true, count: lines.length, range: [start, end], results };
    }
    async function extractItems(settings, text) {
      const msgs = getChatMessages();
      const recent = msgs.slice(-30).map((m) => `${m.name}\uFF1A${m.text}`).join("\n");
      const sys = `\u4ECE\u5BF9\u8BDD\u4E2D\u8BC6\u522B\u3010\u7269\u54C1/\u9053\u5177/\u6301\u6709\u7269\u3011\u7684\u65B0\u589E\u6216\u72B6\u6001\u53D8\u5316\u3002\u6BCF\u884C\u4E00\u6761\uFF0C\u683C\u5F0F\uFF1A\u7269\u54C1\u540D|\u63CF\u8FF0|\u6301\u6709\u8005/\u6240\u5C5E\u3002
\u53EA\u5217\u660E\u786E\u63D0\u5230\u7684\uFF1B\u65E0\u5219\u8F93\u51FA\u7A7A\u3002\u6700\u591A 12 \u6761\u3002`;
      try {
        const raw = await callLLM(sys, `\u3010\u8FD1\u671F\u5BF9\u8BDD\u3011
${recent}
\u3010\u672C\u6279\u8BB0\u5FC6\u3011
${text}

\u8BF7\u5217\u51FA\u7269\u54C1\uFF1A`, settings, { maxTokens: 500 });
        if (!raw) return [];
        return raw.split("\n").map((l) => l.trim()).filter((l) => l.includes("|")).map((l) => {
          const [name, desc, owner] = l.split("|").map((x) => x.trim());
          return name ? { name, desc: desc || "", owner: owner || "" } : null;
        }).filter(Boolean);
      } catch (e) {
        return [];
      }
    }
    WM.Summary = { callLLM, runSummary, getChatMessages, extractItems };
  })();

  // src/config/relations.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    async function extractRelations(memoryText, settings) {
      if (!memoryText || !memoryText.trim()) return [];
      const sys = `\u4ECE\u4E0B\u9762\u7684\u300C\u6709\u6E29\u5EA6\u8BB0\u5FC6\u300D\u4E2D\uFF0C\u62BD\u53D6\u5B9E\u4F53\uFF08\u89D2\u8272\u3001\u7528\u6237\u3001\u5730\u70B9\u3001\u4E8B\u7269\uFF09\u4E4B\u95F4\u7684\u5173\u7CFB\u3002
\u8981\u6C42\uFF1A\u6BCF\u884C\u4E00\u4E2A\u4E09\u5143\u7EC4\uFF0C\u683C\u5F0F\u4E25\u683C\u4E3A \u5B9E\u4F53A|\u5173\u7CFB|\u5B9E\u4F53B|\u6743\u91CD(1-5)\u3002
\u6743\u91CD\u8868\u793A\u5173\u7CFB\u5F3A\u5EA6/\u4E92\u52A8\u9891\u7387\u3002\u53EA\u62BD\u53D6\u660E\u786E\u63D0\u5230\u6216\u660E\u663E\u6697\u793A\u7684\u5173\u7CFB\u3002\u6700\u591A 18 \u6761\u3002`;
      try {
        const raw = await WM.Summary.callLLM(sys, memoryText, settings);
        if (!raw) return [];
        return raw.split("\n").map((l) => l.trim()).filter((l) => l.includes("|")).map((l) => {
          const parts = l.split("|").map((x) => x.trim());
          const [from, label, to, w] = parts;
          const weight = Math.max(1, Math.min(5, parseInt(w, 10) || 2));
          return from && to ? { from, label: label || "\u5173\u8054", to, weight } : null;
        }).filter(Boolean);
      } catch (e) {
        console.warn("[WarmMemo] \u5173\u7CFB\u62BD\u53D6\u5931\u8D25", e);
        return [];
      }
    }
    function mergeRelations(oldList, newList) {
      const map = /* @__PURE__ */ new Map();
      oldList.forEach((r) => map.set(r.from + "" + r.to + "" + r.label, r));
      newList.forEach((r) => {
        const k = r.from + "" + r.to + "" + r.label;
        const ex = map.get(k);
        if (ex) ex.weight = Math.min(5, (ex.weight || 2) + (r.weight || 1));
        else map.set(k, Object.assign({}, r));
      });
      return Array.from(map.values());
    }
    function forceLayout(nodes, edges, W, H) {
      const cx = W / 2, cy = H / 2;
      nodes.forEach((n, i) => {
        const a = i / nodes.length * Math.PI * 2;
        n.x = cx + 90 * Math.cos(a);
        n.y = cy + 90 * Math.sin(a);
        n.vx = 0;
        n.vy = 0;
      });
      for (let step = 0; step < 220; step++) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            let dx = a.x - b.x, dy = a.y - b.y;
            let d2 = dx * dx + dy * dy + 0.01;
            const f = 900 / d2;
            const d = Math.sqrt(d2);
            const fx = dx / d * f, fy = dy / d * f;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
        edges.forEach((e) => {
          const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
          if (!a || !b) return;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const target = 70 - e.weight * 6;
          const f = (d - target) * 0.02;
          const fx = dx / d * f, fy = dy / d * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        });
        nodes.forEach((n) => {
          n.vx += (cx - n.x) * 4e-3;
          n.vy += (cy - n.y) * 4e-3;
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(14, Math.min(W - 14, n.x));
          n.y = Math.max(14, Math.min(H - 14, n.y));
        });
      }
      return nodes;
    }
    function groupByPerson(relations) {
      if (!relations || !Array.isArray(relations.pairs)) return [];
      const map = {};
      const pushRel = (person, other, rel) => {
        if (!person || !other) return;
        (map[person] = map[person] || []).push({ other, rel });
      };
      for (const p of relations.pairs) {
        if (!p.from || !p.to) continue;
        pushRel(p.from, p.to, p.label);
        pushRel(p.to, p.from, p.label);
      }
      return Object.keys(map).map((person) => {
        const lines = map[person].map((x) => `\u4E0E${x.other}\u662F${x.rel}`);
        return { person, keys: [person], text: lines.join("\u3001") };
      });
    }
    WM.Relations = { extractRelations, mergeRelations, forceLayout, groupByPerson };
  })();

  // src/config/injection.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function getCtx() {
      return window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
    }
    function getReadyEventName() {
      const ctx = getCtx();
      if (ctx && ctx.eventTypes && ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY) {
        return ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY;
      }
      if (window.tavern_events && window.tavern_events.CHAT_COMPLETION_PROMPT_READY) {
        return window.tavern_events.CHAT_COMPLETION_PROMPT_READY;
      }
      return "chat_completion_prompt_ready";
    }
    function collectCandidates() {
      const s = WM.MemoryStore.load();
      const cands = [];
      s.summaries.forEach((sm) => cands.push({ id: sm.id, type: sm.kind === "plot" ? "\u5267\u60C5\u6458\u8981" : "\u603B\u7ED3", text: sm.title + "\n" + sm.text }));
      s.items.forEach((it) => cands.push({ id: it.id, type: "\u7269\u54C1", text: `\u7269\u54C1\uFF1A${it.name}${it.owner ? "\uFF08\u6301\u6709\u8005\uFF1A" + it.owner + "\uFF09" : ""}
${it.desc || ""}` }));
      const groups = WM.Relations && WM.Relations.groupByPerson ? WM.Relations.groupByPerson({ pairs: s.relations }) : [];
      groups.forEach((g) => cands.push({ id: "relation::" + g.person, type: "\u5173\u7CFB", text: g.person + "\u7684\u5173\u7CFB\uFF1A" + g.text }));
      if (s.world && s.world.trim()) cands.push({ id: "world::main", type: "\u4E16\u754C\u89C2", text: s.world });
      return cands;
    }
    function buildMemoryBlock() {
      const settings = WM.Settings.load();
      if (settings.injectMemories === false && settings.injectWorld === false) return "";
      const mem = WM.MemoryStore.getMemories();
      let memBlock = "";
      if (settings.injectMemories !== false && mem.length) {
        let picked = mem;
        if (settings.vectorEnabled && WM.VectorStore && WM.VectorStore.lastQuery && WM.VectorStore.enabled) {
          picked = WM.VectorStore.search(mem, WM.VectorStore.lastQuery, 12);
        } else {
          picked = mem.slice(-Math.min(20, mem.length));
        }
        memBlock = "\u3010\u6709\u6E29\u5EA6\u7684\u8BB0\u5FC6\uFF08\u89D2\u8272\u4E0E\u7528\u6237\u5171\u540C\u7ECF\u5386\u7684\u8FC7\u5F80\uFF09\u3011\n" + picked.map((m) => "\xB7 " + (m.text || "")).join("\n");
      }
      const wbOk = WM.Worldbook && WM.Worldbook.available();
      const candidates = collectCandidates();
      if (settings.takeoverEmbedding && settings.vectorEnabled && WM.VectorStore) {
        const q = WM.VectorStore.lastQuery || "";
        const ranked = q ? WM.VectorStore.search(candidates, q, settings.injectTopK || 8) : candidates.slice(-(settings.injectTopK || 8));
        const parts2 = [memBlock];
        if (settings.injectMemories !== false && ranked.length) {
          parts2.push("\u3010\u6E29\u8BB0\u53EC\u56DE\uFF08\u5411\u91CF\u63A5\u7BA1\uFF09\u3011\n" + ranked.map((c) => "\xB7 [" + c.type + "] " + c.text).join("\n"));
        }
        return parts2.filter(Boolean).join("\n\n");
      }
      if (wbOk) {
        return memBlock;
      }
      const parts = [memBlock];
      if (settings.injectMemories !== false && settings.injectWorld !== false && candidates.length) {
        parts.push("\u3010\u6E29\u8BB0\u5185\u5BB9\uFF08\u4E16\u754C\u4E66\u4E0D\u53EF\u7528\uFF0C\u5DF2\u515C\u5E95\u6CE8\u5165\uFF09\u3011\n" + candidates.map((c) => "\xB7 [" + c.type + "] " + c.text).join("\n"));
      }
      return parts.filter(Boolean).join("\n\n");
    }
    function init() {
      const ctx = getCtx();
      const es = ctx && ctx.eventSource;
      if (!es || typeof es.on !== "function") {
        console.warn("[WarmMemo] \u672A\u627E\u5230 ctx.eventSource\uFF0C\u6CE8\u5165\u4E0D\u53EF\u7528");
        return;
      }
      const readyEvent = getReadyEventName();
      es.on(readyEvent, (event) => {
        try {
          const block = buildMemoryBlock();
          if (!block) return;
          const chat = event && event.detail && event.detail.chat;
          if (!Array.isArray(chat) || !chat.length) return;
          const sys = chat.find((m) => m.role === "system");
          if (sys) {
            if (sys.content && sys.content.includes("\u3010\u6709\u6E29\u5EA6\u7684\u8BB0\u5FC6")) {
              sys.content = sys.content.replace(/【有温度的记忆[\s\S]*$/, "") + "\n\n" + block;
            } else if (sys.content && sys.content.includes("\u3010\u6E29\u8BB0")) {
              sys.content = sys.content.replace(/【温记[\s\S]*$/, "") + "\n\n" + block;
            } else {
              sys.content = (sys.content || "") + "\n\n" + block;
            }
          } else {
            chat.unshift({ role: "system", content: block });
          }
        } catch (e) {
          console.error("[WarmMemo] \u6CE8\u5165\u5931\u8D25", e);
        }
      });
      console.log("[WarmMemo] \u6CE8\u5165\u94A9\u5B50\u5DF2\u7ED1\u5B9A\uFF1A", readyEvent);
    }
    WM.Injection = { init, buildMemoryBlock, collectCandidates };
  })();

  // src/config/floor-hider.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    async function applySummaryPointerHiding(summaryPointer, settings) {
      if (!summaryPointer || summaryPointer <= 0) return "no_pointer";
      const ctx = window.SillyTavern ? window.SillyTavern.getContext() : null;
      if (!ctx || !ctx.chat) return "no_context";
      const chat = ctx.chat;
      if (summaryPointer > chat.length) return "stale_pointer";
      const delay = settings && settings.summaryDelay || 2;
      const dialogueCount = chat.filter((m) => m && !m.is_system).length;
      if (dialogueCount < summaryPointer + delay) return "summary_delay";
      for (let i = 0; i < summaryPointer; i++) {
        const m = chat[i];
        if (m && !m.is_wm_hidden) {
          m.is_system = true;
          m.is_wm_hidden = true;
        }
      }
      if (ctx.saveChat && typeof ctx.saveChat === "function") ctx.saveChat();
      if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
      return "hidden";
    }
    async function hideUntil(lastIndex, settings) {
      if (lastIndex == null || lastIndex < 0) return "invalid";
      return applySummaryPointerHiding(lastIndex + 1, settings);
    }
    WM.FloorHider = { applySummaryPointerHiding, hideUntil };
  })();

  // src/ui/launcher.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    let panelEl = null, btnEl = null, graphSvg = null, graphTimer = null;
    function findInputContainer() {
      const sel = [
        "#send_form .input-options",
        "#rightSendContainer .input-options",
        ".input-options",
        "#send_form",
        "#input-options"
      ];
      for (const s of sel) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      return null;
    }
    function ensureFloatingButton() {
      if (document.getElementById("warmmemo-btn")) return;
      btnEl = document.createElement("button");
      btnEl.id = "warmmemo-btn";
      btnEl.className = "wm-input-btn menu_button wm-float";
      btnEl.type = "button";
      btnEl.title = "\u6E29\u8BB0 \xB7 \u8BB0\u5FC6\u4E0E\u4E16\u754C\u89C2";
      btnEl.textContent = "\u{1F33F} \u8BB0\u5FC6";
      btnEl.onclick = openPanel;
      document.body.appendChild(btnEl);
    }
    function isNarrowScreen() {
      return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    }
    function ensurePanel() {
      if (panelEl) return panelEl;
      let overlay = document.getElementById("warmmemo-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "warmmemo-overlay";
        overlay.className = "wm-overlay";
        overlay.onclick = (e) => {
          if (e.target === overlay) closePanel();
        };
        document.body.appendChild(overlay);
      }
      panelEl = document.createElement("div");
      panelEl.id = "warmmemo-panel";
      panelEl.className = "wm-panel";
      panelEl.innerHTML = `
      <div class="wm-header">
        <span class="wm-title">\u{1F33F} \u6E29\u8BB0 \xB7 WarmMemo</span>
        <div class="wm-controls">
          <button class="wm-ctrl" id="wm-max" title="\u5168\u5C4F/\u8FD8\u539F">\u2922</button>
          <button class="wm-ctrl wm-close" title="\u6536\u8D77">\xD7</button>
        </div>
      </div>
      <div class="wm-tabs">
        <button data-tab="auto" class="active">\u81EA\u52A8\u603B\u7ED3</button>
        <button data-tab="mem">\u8BB0\u5FC6</button>
        <button data-tab="rel">\u5173\u7CFB\u56FE</button>
        <button data-tab="plot">\u5267\u60C5\u7EBF</button>
        <button data-tab="item">\u7269\u54C1</button>
        <button data-tab="world">\u4E16\u754C\u8BBE\u5B9A</button>
        <button data-tab="cfg">\u8BBE\u7F6E</button>
      </div>
      <div class="wm-body"></div>`;
      overlay.appendChild(panelEl);
      panelEl.querySelector(".wm-close").onclick = closePanel;
      panelEl.querySelector("#wm-max").onclick = () => {
        panelEl.classList.toggle("wm-maximized");
        if (panelEl.classList.contains("wm-maximized")) renderTab(currentTab);
      };
      panelEl.querySelectorAll(".wm-tabs button").forEach((b) => {
        b.onclick = () => {
          panelEl.querySelectorAll(".wm-tabs button").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          renderTab(b.dataset.tab);
        };
      });
      if (isNarrowScreen()) panelEl.classList.add("wm-maximized");
      return panelEl;
    }
    let currentTab = "auto";
    function closePanel() {
      if (panelEl) panelEl.classList.remove("open", "wm-maximized");
      const ov = document.getElementById("warmmemo-overlay");
      if (ov) ov.classList.remove("open");
    }
    function openPanel() {
      ensurePanel();
      const ov = document.getElementById("warmmemo-overlay");
      if (ov) ov.classList.add("open");
      panelEl.classList.add("open");
      if (isNarrowScreen()) panelEl.classList.add("wm-maximized");
      renderTab(currentTab);
    }
    function injectButton() {
      if (document.getElementById("warmmemo-btn")) return;
      const container = findInputContainer();
      if (container) {
        btnEl = document.createElement("button");
        btnEl.id = "warmmemo-btn";
        btnEl.className = "wm-input-btn menu_button";
        btnEl.type = "button";
        btnEl.title = "\u6E29\u8BB0 \xB7 \u8BB0\u5FC6\u4E0E\u4E16\u754C\u89C2";
        btnEl.textContent = "\u{1F33F} \u8BB0\u5FC6";
        btnEl.onclick = openPanel;
        container.appendChild(btnEl);
      } else {
        injectButton._tries = (injectButton._tries || 0) + 1;
        if (injectButton._tries > 12) {
          ensureFloatingButton();
          return;
        }
        setTimeout(injectButton, 800);
      }
    }
    function renderTab(tab) {
      currentTab = tab || "auto";
      const body = panelEl.querySelector(".wm-body");
      if (tab === "auto") return renderAuto(body);
      if (tab === "mem") return renderMem(body);
      if (tab === "rel") return renderRel(body);
      if (tab === "plot") return renderPlot(body);
      if (tab === "item") return renderItem(body);
      if (tab === "world") return renderWorld(body);
      if (tab === "cfg") return renderCfg(body);
    }
    function renderAuto(body) {
      const s = WM.Settings.load();
      const total = WM.Summary.getChatMessages && WM.Summary.getChatMessages().length || 0;
      body.innerHTML = `
      <div class="wm-card">
        <div class="wm-h">\u81EA\u52A8\u603B\u7ED3\uFF08\u6709\u6E29\u5EA6\u8BB0\u5FC6\uFF09</div>
        <label class="wm-row"><input type="checkbox" id="a-on" ${s.autoSummaryEnabled ? "checked" : ""}/> \u5F00\u542F\u81EA\u52A8\u603B\u7ED3</label>
        <div class="wm-row">\u603B\u7ED3\u6A21\u5F0F\uFF1A
          <select id="a-mode">
            <option value="new" ${s.autoSummaryMode === "new" ? "selected" : ""}>\u4EC5\u65B0\u589E\u697C\u5C42</option>
            <option value="count" ${s.autoSummaryMode === "count" ? "selected" : ""}>\u6700\u8FD1 N \u6761</option>
            <option value="range" ${s.autoSummaryMode === "range" ? "selected" : ""}>\u81EA\u5B9A\u4E49\u697C\u5C42\u533A\u95F4</option>
          </select>
        </div>
        <div class="wm-row" id="a-count-row" style="${s.autoSummaryMode === "count" ? "" : "display:none"}">\u6700\u8FD1\u6761\u6570\uFF1A
          <input type="number" id="a-count" value="${s.autoSummaryCount}" min="1" max="200" style="width:70px"/>
        </div>
        <div class="wm-row" id="a-range-row" style="${s.autoSummaryMode === "range" ? "" : "display:none"}">
          \u697C\u5C42 <input type="number" id="a-start" value="${s.autoSummaryStart}" min="0" style="width:64px"/> ~
          <input type="number" id="a-end" value="${s.autoSummaryEnd}" min="-1" style="width:64px"/>\uFF08\u7EC8\u70B9 -1 \u8868\u793A\u6700\u65B0\uFF0C\u5171 ${total} \u5C42\uFF09
        </div>
        <label class="wm-row"><input type="checkbox" id="a-hide" ${s.autoHideFloors ? "checked" : ""}/> \u603B\u7ED3\u540E\u9690\u85CF\u5DF2\u5904\u7406\u697C\u5C42</label>
        <div class="wm-h" style="margin-top:10px">\u81EA\u52A8\u62BD\u53D6\u5B50\u4EFB\u52A1</div>
        <label class="wm-row"><input type="checkbox" id="a-rel" ${s.autoRelation ? "checked" : ""}/> \u5173\u7CFB\u56FE</label>
        <label class="wm-row"><input type="checkbox" id="a-plot" ${s.autoPlot ? "checked" : ""}/> \u5267\u60C5\u7EBF</label>
        <label class="wm-row"><input type="checkbox" id="a-world" ${s.autoWorld ? "checked" : ""}/> \u4E16\u754C\u89C2\u8BBE\u5B9A</label>
        <label class="wm-row"><input type="checkbox" id="a-item" ${s.autoItems ? "checked" : ""}/> \u7269\u54C1\u8FFD\u8E2A</label>
        <div class="wm-actions">
          <button id="a-save" class="wm-btn">\u4FDD\u5B58\u8BBE\u7F6E</button>
          <button id="a-run" class="wm-btn primary">\u7ACB\u5373\u603B\u7ED3</button>
        </div>
        <div class="wm-status" id="auto-status"></div>
      </div>`;
      const mode = body.querySelector("#a-mode");
      mode.onchange = () => {
        body.querySelector("#a-count-row").style.display = mode.value === "count" ? "" : "none";
        body.querySelector("#a-range-row").style.display = mode.value === "range" ? "" : "none";
      };
      body.querySelector("#a-save").onclick = () => {
        s.autoSummaryEnabled = body.querySelector("#a-on").checked;
        s.autoSummaryMode = mode.value;
        s.autoSummaryCount = parseInt(body.querySelector("#a-count").value, 10) || 20;
        s.autoSummaryStart = parseInt(body.querySelector("#a-start").value, 10) || 0;
        s.autoSummaryEnd = parseInt(body.querySelector("#a-end").value, 10) || -1;
        s.autoHideFloors = body.querySelector("#a-hide").checked;
        s.autoRelation = body.querySelector("#a-rel").checked;
        s.autoPlot = body.querySelector("#a-plot").checked;
        s.autoWorld = body.querySelector("#a-world").checked;
        s.autoItems = body.querySelector("#a-item").checked;
        WM.Settings.save(s);
        body.querySelector("#auto-status").textContent = "\u2713 \u8BBE\u7F6E\u5DF2\u4FDD\u5B58";
      };
      body.querySelector("#a-run").onclick = async () => {
        const st = body.querySelector("#auto-status");
        st.textContent = "\u603B\u7ED3\u4E2D\u2026";
        try {
          const r = await WM.Summary.runSummary(s);
          st.textContent = r.ok ? `\u2713 \u5DF2\u63D0\u70BC ${r.count} \u6761\u8BB0\u5FC6\uFF08\u697C\u5C42 ${r.range[0]}-${r.range[1]}\uFF09\uFF0C\u5173\u7CFB${r.results.relations} \u5267\u60C5${r.results.plots} \u4E16\u754C${r.results.world ? "\u2713" : "\xD7"} \u7269\u54C1${r.results.items}` : "\u2717 " + (r.reason || "\u5931\u8D25");
        } catch (e) {
          st.textContent = "\u2717 " + (e.message || e);
        }
      };
    }
    function renderMem(body) {
      const mem = WM.MemoryStore.getMemories();
      let html = `<div class="wm-card"><div class="wm-h">\u6709\u6E29\u5EA6\u8BB0\u5FC6\uFF08${mem.length}\uFF09</div>
      <div class="wm-actions">
        <button id="mem-export" class="wm-btn">\u5BFC\u51FA</button>
        <button id="mem-import" class="wm-btn">\u5BFC\u5165</button>
      </div>
      <input class="wm-search" id="mem-search" placeholder="\u68C0\u7D22\u8BB0\u5FC6\u2026"/>
      <div class="wm-list" id="mem-list">`;
      html += mem.slice().reverse().map((m) => `<div class="wm-item">${escapeHtml(m.text)}</div>`).join("") || '<div class="wm-empty">\u6682\u65E0\u8BB0\u5FC6\uFF0C\u5148\u53BB\u300C\u81EA\u52A8\u603B\u7ED3\u300D\u751F\u6210</div>';
      html += `</div></div>`;
      body.innerHTML = html;
      body.querySelector("#mem-export").onclick = () => {
        const blob = new Blob([WM.MemoryStore.exportJSON()], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "warmmemo-memory-" + Date.now() + ".json";
        a.click();
      };
      body.querySelector("#mem-import").onclick = () => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "application/json";
        inp.onchange = async () => {
          const txt = await inp.files[0].text();
          try {
            await WM.MemoryStore.importJSON(txt);
            renderMem(body);
            toast("\u{1F33F} \u8BB0\u5FC6\u5DF2\u5BFC\u5165");
          } catch (e) {
            toast("\u{1F33F} \u5BFC\u5165\u5931\u8D25\uFF1A" + (e.message || e));
          }
        };
        inp.click();
      };
      body.querySelector("#mem-search").oninput = async (e) => {
        const q = e.target.value.trim();
        let list = mem;
        if (q && WM.VectorStore) {
          WM.VectorStore.lastQuery = q;
          if (WM.VectorStore.enabled) {
            list = await WM.VectorStore.search(mem, q, 15);
          } else list = mem.filter((m) => m.text.includes(q));
        }
        body.querySelector("#mem-list").innerHTML = (list.length ? list.slice().reverse() : list).map((m) => `<div class="wm-item">${escapeHtml(m.text)}</div>`).join("") || '<div class="wm-empty">\u65E0\u5339\u914D</div>';
      };
    }
    function renderRel(body) {
      body.innerHTML = `<div class="wm-card"><div class="wm-h">\u5173\u7CFB\u56FE\uFF08\u52A8\u6001\u529B\u5BFC\u5411\uFF09</div>
      <div class="wm-hint">\u7EBF\u8D8A\u7C97=\u5173\u7CFB\u8D8A\u5F3A\uFF0C\u53EF\u62D6\u62FD\u8282\u70B9</div>
      <svg id="wm-graph" class="wm-graph" viewBox="0 0 320 320"></svg>
      <div class="wm-list" id="rel-list"></div></div>`;
      drawGraph(body.querySelector("#wm-graph"));
      const rels = WM.MemoryStore.getRelations();
      body.querySelector("#rel-list").innerHTML = rels.length ? rels.map((r) => `<div class="wm-item">${escapeHtml(r.from)} <span class="wm-weight">${"\u25CF".repeat(r.weight)}</span> ${escapeHtml(r.label)} \u2192 ${escapeHtml(r.to)}</div>`).join("") : '<div class="wm-empty">\u6682\u65E0\u5173\u7CFB\uFF0C\u5148\u603B\u7ED3</div>';
    }
    function drawGraph(svg) {
      const rels = WM.MemoryStore.getRelations();
      const names = /* @__PURE__ */ new Set();
      rels.forEach((r) => {
        names.add(r.from);
        names.add(r.to);
      });
      const nodes = Array.from(names).map((id) => ({ id }));
      if (!nodes.length) {
        svg.innerHTML = '<text x="160" y="160" text-anchor="middle" fill="#9b8579">\u6682\u65E0\u5173\u7CFB</text>';
        return;
      }
      const W = 320, H = 320;
      WM.Relations.forceLayout(nodes, rels, W, H);
      const pos = {};
      nodes.forEach((n) => pos[n.id] = { x: n.x, y: n.y });
      let s = "";
      rels.forEach((r) => {
        const a = pos[r.from], b = pos[r.to];
        if (!a || !b) return;
        s += `<line x1="${a.x.toFixed(0)}" y1="${a.y.toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${b.y.toFixed(0)}" stroke="#8a9a8b" stroke-width="${r.weight}" stroke-opacity="0.6"/>`;
      });
      nodes.forEach((n) => {
        s += `<circle cx="${n.x.toFixed(0)}" cy="${n.y.toFixed(0)}" r="6" fill="#5b6e57" data-name="${escapeHtml(n.id)}" class="wm-node" style="cursor:grab"/>`;
        s += `<text x="${(n.x + 8).toFixed(0)}" y="${(n.y + 4).toFixed(0)}" font-size="9" fill="#5b4a3f">${escapeHtml(n.id.length > 6 ? n.id.slice(0, 6) + "\u2026" : n.id)}</text>`;
      });
      svg.innerHTML = s;
      svg.querySelectorAll(".wm-node").forEach((c) => {
        c.addEventListener("click", () => {
          const name = c.getAttribute("data-name");
          const rels2 = WM.MemoryStore.getRelations().filter((r) => r.from === name || r.to === name);
          const listEl = document.getElementById("rel-list");
          if (!rels2.length) {
            listEl.innerHTML = `<div class="wm-empty">\u300C${escapeHtml(name)}\u300D\u6682\u65E0\u5173\u7CFB</div>`;
            return;
          }
          listEl.innerHTML = `<div class="wm-h">\u300C${escapeHtml(name)}\u300D\u7684\u5173\u7CFB\uFF08${rels2.length}\uFF09</div>` + rels2.map((r) => {
            const other = r.from === name ? r.to : r.from;
            const dir = r.from === name ? "\u2192" : "\u2190";
            return `<div class="wm-item">${escapeHtml(name)} <span class="wm-weight">${"\u25CF".repeat(r.weight)}</span> ${r.label} ${dir} ${escapeHtml(other)}</div>`;
          }).join("");
        });
      });
      svg.querySelectorAll(".wm-node").forEach((c) => {
        c.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const name = c.getAttribute("data-name");
          const move = (e) => {
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
            c.setAttribute("cx", loc.x);
            c.setAttribute("cy", loc.y);
          };
          const up = () => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", up);
          };
          document.addEventListener("mousemove", move);
          document.addEventListener("mouseup", up);
        });
      });
    }
    function renderPlot(body) {
      const plots = WM.MemoryStore.getPlots();
      let html = `<div class="wm-card"><div class="wm-h">\u5267\u60C5\u7EBF\uFF08${plots.length}\uFF09</div>
      <div class="wm-timeline" id="plot-tl">`;
      const order = { active: 0, done: 1, abandon: 2 };
      const sorted = plots.slice().sort((a, b) => order[a.status] - order[b.status]);
      html += sorted.map((p) => `<div class="wm-plot wm-plot-${p.status}">
        <div class="wm-plot-title">${escapeHtml(p.title)} <span class="wm-badge">${p.status}</span></div>
        <div class="wm-plot-sum">${escapeHtml(p.summary)}</div></div>`).join("") || '<div class="wm-empty">\u6682\u65E0\u5267\u60C5\u7EBF</div>';
      html += `</div>
      <div class="wm-actions"><button id="plot-run" class="wm-btn primary">\u4ECE\u8BB0\u5FC6\u66F4\u65B0\u5267\u60C5\u7EBF</button></div>
      <div class="wm-status" id="plot-status"></div></div>`;
      body.innerHTML = html;
      body.querySelector("#plot-run").onclick = async () => {
        const st = body.querySelector("#plot-status");
        st.textContent = "\u5F52\u7EB3\u4E2D\u2026";
        const r = await WM.Summary.runSummary(WM.Settings.load());
        st.textContent = r.ok ? "\u2713 \u5267\u60C5\u7EBF\u5DF2\u66F4\u65B0" : "\u2717 \u5931\u8D25";
        renderPlot(body);
      };
    }
    function renderItem(body) {
      const items = WM.MemoryStore.getItems();
      let html = `<div class="wm-card"><div class="wm-h">\u7269\u54C1 / \u6301\u6709\u7269\u8FFD\u8E2A\uFF08${items.length}\uFF09</div>
      <div class="wm-row"><input id="it-name" placeholder="\u7269\u54C1\u540D"/><input id="it-desc" placeholder="\u63CF\u8FF0"/><input id="it-owner" placeholder="\u6301\u6709\u8005"/></div>
      <button id="it-add" class="wm-btn primary">\u6DFB\u52A0</button>
      <div class="wm-list" id="it-list">`;
      html += items.map((i) => `<div class="wm-item" data-id="${i.id}"><b>${escapeHtml(i.name)}</b> <span class="wm-muted">\uFF08${escapeHtml(i.owner || "\u672A\u77E5")}\uFF09</span><br/>${escapeHtml(i.desc)} <span class="wm-del" data-id="${i.id}">\u2715</span></div>`).join("") || '<div class="wm-empty">\u6682\u65E0\u7269\u54C1</div>';
      html += `</div></div>`;
      body.innerHTML = html;
      body.querySelector("#it-add").onclick = async () => {
        const n = body.querySelector("#it-name").value.trim();
        if (!n) return;
        await WM.MemoryStore.addItem(n, body.querySelector("#it-desc").value, body.querySelector("#it-owner").value);
        renderItem(body);
      };
      body.querySelectorAll(".wm-del").forEach((d) => d.onclick = async () => {
        await WM.MemoryStore.removeItem(d.dataset.id);
        renderItem(body);
      });
    }
    function renderWorld(body) {
      const s = WM.Settings.load();
      const world = WM.MemoryStore.getWorld();
      const loreCount = WM.Worldbook.listEntries ? WM.Worldbook.listEntries().length : 0;
      body.innerHTML = `<div class="wm-card"><div class="wm-h">\u4E16\u754C\u8BBE\u5B9A</div>
      <div class="wm-hint">\u57FA\u4E8E\u89D2\u8272\u5361/\u7528\u6237\u5361/\u4E16\u754C\u4E66(${loreCount}\u6761)/\u5DF2\u6709\u8BB0\u5FC6\u63A8\u65AD\uFF0C\u5199\u5165\u5E76\u6CE8\u5165\u4E0A\u4E0B\u6587</div>
      <textarea id="world-ta" class="wm-ta" placeholder="\u4E16\u754C\u89C2\u8BBE\u5B9A\u2026">${escapeHtml(world)}</textarea>
      <div class="wm-row"><input id="world-extra" placeholder="\u81EA\u5B9A\u4E49\u66F4\u65B0\u6307\u4EE4\uFF08\u53EF\u9009\uFF09" style="flex:1"/></div>
      <div class="wm-row"><input id="world-lorename" placeholder="\u4E16\u754C\u4E66\u540D\uFF08\u540C\u6B65\u4E16\u754C\u4E66\u7528\uFF0C\u5982 lorebook\uFF09" value="${s.lorebookName || ""}" style="flex:1"/></div>
      <label class="wm-row"><input type="checkbox" id="world-lore" ${s.worldToLorebook ? "checked" : ""}/> \u540C\u6B65\u5199\u5165\u4E16\u754C\u4E66\uFF08\u6240\u6709\u5BF9\u8BDD\u5171\u4EAB\uFF09</label>
      <div class="wm-actions">
        <button id="world-save" class="wm-btn">\u4FDD\u5B58</button>
        <button id="world-gen" class="wm-btn primary">\u7528 LLM \u63A8\u65AD/\u66F4\u65B0</button>
      </div>
      <div class="wm-status" id="world-status"></div></div>`;
      body.querySelector("#world-save").onclick = async () => {
        s.lorebookName = body.querySelector("#world-lorename").value.trim();
        WM.Settings.save(s);
        await WM.MemoryStore.setWorld(body.querySelector("#world-ta").value);
        body.querySelector("#world-status").textContent = "\u2713 \u5DF2\u4FDD\u5B58\uFF08\u8BB0\u5FC6+\u6CE8\u5165\uFF09";
      };
      body.querySelector("#world-gen").onclick = async () => {
        const st = body.querySelector("#world-status");
        st.textContent = "\u63A8\u65AD\u4E2D\u2026";
        try {
          s.lorebookName = body.querySelector("#world-lorename").value.trim();
          WM.Settings.save(s);
          const w = await WM.Worldbook.inferWorldview(s, { extraInstruction: body.querySelector("#world-extra").value });
          body.querySelector("#world-ta").value = w;
          await WM.MemoryStore.setWorld(w);
          if (body.querySelector("#world-lore").checked) {
            await WM.Worldbook.writeWorld(w);
            st.textContent = "\u2713 \u4E16\u754C\u89C2\u5DF2\u66F4\u65B0\u5E76\u5199\u5165\u4E16\u754C\u4E66\uFF08\u72EC\u7ACB\u6761\u76EE\uFF09";
          } else {
            st.textContent = "\u2713 \u4E16\u754C\u89C2\u5DF2\u66F4\u65B0\uFF08\u4EC5\u5BF9\u8BDD\u8BB0\u5FC6+\u6CE8\u5165\uFF09";
          }
        } catch (e) {
          st.textContent = "\u2717 " + (e.message || e);
        }
      };
    }
    function renderCfg(body) {
      const s = WM.Settings.load();
      body.innerHTML = `<div class="wm-card"><div class="wm-h">\u8BBE\u7F6E \xB7 \u603B\u7ED3\u6A21\u578B\uFF08\u771F\u5B9E LLM \u8C03\u7528\uFF09</div>
      <label class="wm-row">Base URL<input id="c-base" value="${s.summaryBaseUrl}"/></label>
      <label class="wm-row">API Key<input id="c-key" type="password" value="${s.summaryApiKey}" placeholder="sk-..."/></label>
      <label class="wm-row">\u6A21\u578B\u540D<input id="c-model" value="${s.summaryModel}" placeholder="\u5982 gpt-4o-mini"/></label>
      <label class="wm-row"><input type="checkbox" id="c-vec" ${s.vectorEnabled ? "checked" : ""}/> \u542F\u7528\u5411\u91CF\u68C0\u7D22
        <span class="wm-muted">Embed:${s.embeddingBaseUrl || "\u672A\u586B"}</span></label>
      <label class="wm-row"><input type="checkbox" id="c-rerank" ${s.rerankEnabled ? "checked" : ""}/> \u542F\u7528\u91CD\u6392\u5E8F(Rerank)</label>
      <label class="wm-row"><input type="checkbox" id="c-inj" ${s.injectMemories ? "checked" : ""}/> \u6CE8\u5165\u8BB0\u5FC6\u5230\u4E0A\u4E0B\u6587\uFF08\u786E\u4FDD\u89D2\u8272\u771F\u7684\u8BB0\u5F97\uFF09
        <input type="checkbox" id="c-injw" ${s.injectWorld ? "checked" : ""}/> \u542B\u4E16\u754C\u89C2</label>
      <div class="wm-divider"></div>
      <div class="wm-h">\u4E16\u754C\u4E66\uFF08\u6570\u636E\u6309\u89D2\u8272\u5361\u9694\u79BB\uFF09</div>
      <label class="wm-row">\u4E16\u754C\u4E66\u540D<input id="c-lore" value="${s.lorebookName}" placeholder="WarmMemo"/></label>
      <label class="wm-row"><input type="checkbox" id="c-wlore" ${s.worldToLorebook ? "checked" : ""}/> \u62C6\u5206\u5199\u5165\u4E16\u754C\u4E66\u6761\u76EE\uFF08\u603B\u7ED3/\u7269\u54C1/\u5173\u7CFB\u5404\u81EA\u72EC\u7ACB\u6761\u76EE\uFF09</label>
      <div class="wm-divider"></div>
      <div class="wm-h">\u63A5\u7BA1\u9152\u9986\u5411\u91CF / \u91CD\u6392\u5E8F</div>
      <label class="wm-row"><input type="checkbox" id="c-take-emb" ${s.takeoverEmbedding ? "checked" : ""}/> \u63A5\u7BA1\u5411\u91CF\u68C0\u7D22\uFF08\u7528\u6211\u4EEC\u81EA\u5DF1\u7684\u5411\u91CF\u53EC\u56DE\u4E16\u754C\u4E66\u6761\u76EE\uFF09</label>
      <label class="wm-row"><input type="checkbox" id="c-take-re" ${s.takeoverRerank ? "checked" : ""}/> \u63A5\u7BA1\u91CD\u6392\u5E8F\uFF08\u7528\u6211\u4EEC\u81EA\u5DF1\u7684 Rerank \u91CD\u6392\u53EC\u56DE\u7ED3\u679C\uFF09</label>
      <div class="wm-actions"><button id="c-save" class="wm-btn primary">\u4FDD\u5B58\u8BBE\u7F6E</button></div>
      <div class="wm-hint">\u4E0D\u586B\u6A21\u578B\u5373\u56DE\u9000\u9152\u9986\u81EA\u5E26 shared-api\uFF08textgeneration\uFF09\u3002\u672C\u5730\u53CD\u4EE3\u586B 127.0.0.1\u3002</div></div>`;
      body.querySelector("#c-save").onclick = () => {
        s.summaryBaseUrl = body.querySelector("#c-base").value;
        s.summaryApiKey = body.querySelector("#c-key").value;
        s.summaryModel = body.querySelector("#c-model").value;
        s.vectorEnabled = body.querySelector("#c-vec").checked;
        s.rerankEnabled = body.querySelector("#c-rerank").checked;
        s.injectMemories = body.querySelector("#c-inj").checked;
        s.injectWorld = body.querySelector("#c-injw").checked;
        s.lorebookName = body.querySelector("#c-lore").value.trim();
        s.worldToLorebook = body.querySelector("#c-wlore").checked;
        s.takeoverEmbedding = body.querySelector("#c-take-emb").checked;
        s.takeoverRerank = body.querySelector("#c-take-re").checked;
        WM.Settings.save(s);
        if (WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook();
        body.querySelector(".wm-hint").textContent = "\u2713 \u5DF2\u4FDD\u5B58\uFF08\u4E16\u754C\u4E66\u5DF2\u7ED1\u5B9A\u5F53\u524D\u89D2\u8272\u5361\uFF09";
      };
    }
    function escapeHtml(t) {
      return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }
    function init() {
      injectButton();
      if (WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook().catch((e) => console.warn("[WarmMemo] \u4E16\u754C\u4E66\u7ED1\u5B9A\u5931\u8D25", e));
      WM.Injection.init();
      const es = window.eventSource && window.eventSource.eventNames ? window.eventSource : window.SillyTavern && window.SillyTavern.eventSource;
      if (es && es.on) {
        const ev = window.eventSource && window.eventSource.eventNames ? window.eventSource.eventNames.MESSAGE_SENT : "MESSAGE_SENT";
        es.on(ev, autoSummaryHook);
      }
    }
    async function autoSummaryHook() {
      const s = WM.Settings.load();
      if (!s.autoSummaryEnabled) return;
      let range = null;
      if (s.autoSummaryMode === "count") {
        const total = WM.Summary.getChatMessages().length;
        range = { start: Math.max(0, total - s.autoSummaryCount), end: total - 1 };
      } else if (s.autoSummaryMode === "range") {
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
            toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u5DF2\u63D0\u70BC ${r.count} \u6761\u8BB0\u5FC6`);
          } else {
            toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u603B\u7ED3\u672A\u6267\u884C\uFF08${r.reason}\uFF09`);
          }
        } catch (e) {
          toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u603B\u7ED3\u5931\u8D25 - ${e.message || e}`);
        }
      }, 1500);
    }
    function toast(msg) {
      let t = document.getElementById("warmmemo-toast");
      if (!t) {
        t = document.createElement("div");
        t.id = "warmmemo-toast";
        t.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(91,110,87,.95);color:#fff;padding:6px 14px;border-radius:12px;font-size:12px;z-index:10000;box-shadow:0 4px 14px rgba(0,0,0,.2)";
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = "1";
      clearTimeout(t._timer);
      t._timer = setTimeout(() => {
        t.style.opacity = "0";
        t.style.transition = "opacity .5s";
      }, 3200);
    }
    WM.Launcher = { init, renderTab };
  })();

  // src/index.js
  if (window.WarmMemo && window.WarmMemo.Launcher) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.WarmMemo.Launcher.init());
    else window.WarmMemo.Launcher.init();
  } else {
    console.error("[WarmMemo] \u542F\u52A8\u5931\u8D25\uFF1ALauncher \u672A\u5B9A\u4E49");
  }
  console.log("[WarmMemo] \u5C31\u7EEA");
})();
