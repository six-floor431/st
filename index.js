(() => {
  // src/config/settings.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const LS_KEY = "warmmemo_settings_v2";
    const DEFAULTS = {
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
      // 'new'=只总结新增楼层, 'range'=按区间, 'count'=最近N条, 'floor'=按楼层区间(1-20,21-40...)
      autoSummaryCount: 20,
      // count 模式：最近 N 条
      autoSummaryStart: 0,
      // range 模式：起始楼层
      autoSummaryEnd: -1,
      // range 模式：-1 表示到最新
      autoSummaryFloor: 20,
      // floor 模式：每多少层触发一段（1-20,21-40,...）
      autoHideFloors: true,
      // 总结后隐藏已处理楼层
      autoSummaryParallel: true,
      // 总结后并行调用关系/剧情/世界观/物品（带失败重试）
      // 各自动子任务开关
      autoRelation: true,
      autoPlot: true,
      autoWorld: true,
      autoItems: true,
      // 总结时剔除「标签包裹」的内容，规则可自定义，每条规则可同时启用多重形态（多重存在）：
      // wrap=true        => 成对/相同包裹删中间（需 close）
      // singleBefore=true => 残缺单标签「删标签之前、留之后」
      // singleAfter=true  => 残缺单标签「删标签之后、留之前」
      tagStripRules: [
        { name: "think", open: "<think>", close: "</think>", wrap: true, singleBefore: true, singleAfter: false, enabled: true }
      ],
      worldToLorebook: true,
      // 是否把世界观/总结/物品/关系拆分写入世界书条目（默认开启，实现条目隔离）
      // 统一的 LLM 调用配置（所有功能共用这一个）：
      //   source: 'local'  => 用酒馆当前源（shared-api），无需额外配置
      //   source: 'custom' => 用 custom_api 切换：优先填「代理预设名」(proxyPreset)，
      //                       否则填 apiUrl/apiKey/model 直连（全部交给酒馆 generate 处理，
      //                       不再自造 fetch，以复用酒馆的源管理/模型列表/流式等能力）
      // 该配置在设置面板可一键「测试连接」验证 API 可用。
      llmConfig: {
        source: "local",
        proxyPreset: "",
        apiUrl: "",
        apiKey: "",
        model: "",
        maxTokens: 700
        // 输出 token 上限：所有功能共用，模型会在该上限内尽量输出完整内容
      },
      // 预设前置：拼在我们自己可编辑的提示词「之前」
      //   mode: 'none'   => 不使用
      //   mode: 'import' => 用 importText 作为前置（用户自己粘贴/编辑）
      //   mode: 'preset' => 调用酒馆里已经保存的预设（presetName），取其 enabled 且有内容的提示词作为前置
      presetPrefix: {
        mode: "none",
        importText: "",
        presetName: ""
      },
      lorebookName: "WarmMemo",
      // 世界书名（可自定义；绑定到当前角色卡实现数据隔离）
      // 接管酒馆内置向量与重排序（开启后用我们自己的 VectorStore + Rerank 召回世界书条目）
      takeoverEmbedding: false,
      // 接管向量检索：开启后注入用我们自己的 embedding 相似度召回
      takeoverRerank: false,
      // 接管重排序：开启后对世界书召回结果做 rerank 重排
      injectMemories: true,
      // 是否注入记忆到上下文
      injectWorld: true,
      // 扩展自带提示词（均可编辑）。保留 {{变量}} 占位符，运行时被真实数据替换：
      //   {{recent}} 最近对话   {{historySummary}} 历史总结   {{relations}} 关系
      //   {{plot}} 剧情线   {{worldview}} 世界观   {{current}} 当前对话   {{title}} 聊天标题
      prompts: {
        summary: "\u4F60\u662F\u6211\u7684\u4E13\u5C5E\u8BB0\u5F55\u5458\u3002\u8BF7\u57FA\u4E8E\u300C\u6700\u8FD1\u5BF9\u8BDD\u300D\uFF0C\u6309\u300C\u65F6\u95F4\u987A\u5E8F\u300D\u63D0\u70BC\u51FA\u300C\u5173\u952E\u4E8B\u5B9E\u3001\u7EA6\u5B9A\u3001\u72B6\u6001\u53D8\u5316\u3001\u4EBA\u540D/\u5730\u70B9/\u7EC4\u7EC7\u3001\u672A\u5B8C\u6210\u7684\u627F\u8BFA\u6216\u5F85\u529E\u300D\u3002\u4E0D\u8981\u7F16\u9020\uFF0C\u4E0D\u786E\u5B9A\u5C31\u5199\u201C\u672A\u77E5\u201D\u3002\u4EC5\u8F93\u51FA\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\uFF0C\u4E0D\u8D85\u8FC7 12 \u6761\u3002\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}",
        relations: "\u4F60\u662F\u5173\u7CFB\u5206\u6790\u5E08\u3002\u8BF7\u57FA\u4E8E\u300C\u5386\u53F2\u603B\u7ED3\u300D\u548C\u300C\u6700\u8FD1\u5BF9\u8BDD\u300D\uFF0C\u5206\u6790\u300C\u6211\uFF08\u7528\u6237\uFF09\u4E0E\u89D2\u8272\u4E4B\u95F4\u300D\u7684\u5173\u7CFB\u72B6\u6001\u3001\u4EB2\u5BC6\u5EA6\u3001\u5F20\u529B\u3001\u672A\u89E3\u5FC3\u7ED3\u3002\u8F93\u51FA\u7ED3\u6784\u5316\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u5386\u53F2\u603B\u7ED3\u3011\n{{historySummary}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}",
        plot: "\u4F60\u662F\u5267\u60C5\u68B3\u7406\u8005\u3002\u8BF7\u57FA\u4E8E\u300C\u5173\u7CFB\u300D\u548C\u300C\u6700\u8FD1\u5BF9\u8BDD\u300D\uFF0C\u68B3\u7406\u5F53\u524D\u5267\u60C5\u4E3B\u7EBF\u3001\u652F\u7EBF\u3001\u60AC\u5FF5\u4E0E\u4E0B\u4E00\u6B65\u53EF\u80FD\u53D1\u5C55\u3002\u8F93\u51FA\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u5173\u7CFB\u3011\n{{relations}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}",
        worldview: "\u4F60\u662F\u4E16\u754C\u89C2\u63D0\u70BC\u8005\u3002\u8BF7\u57FA\u4E8E\u300C\u5267\u60C5\u7EBF\u300D\u548C\u300C\u6700\u8FD1\u5BF9\u8BDD\u300D\uFF0C\u62BD\u53D6\u672C\u4E16\u754C\u7684\u5173\u952E\u8BBE\u5B9A\uFF1A\u5730\u70B9\u3001\u52BF\u529B\u3001\u89C4\u5219\u3001\u7269\u54C1\u3001\u6982\u5FF5\u3002\u8F93\u51FA\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u5267\u60C5\u7EBF\u3011\n{{plot}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}",
        itemExtract: "\u4F60\u662F\u7269\u54C1\u8BB0\u5F55\u5458\u3002\u8BF7\u57FA\u4E8E\u300C\u6700\u8FD1\u5BF9\u8BDD\u300D\uFF0C\u62BD\u53D6\u672C\u6BB5\u51FA\u73B0\u7684\u300C\u5177\u4F53\u7269\u54C1/\u9053\u5177/\u4FE1\u7269/\u88C5\u5907\u300D\uFF1A\u540D\u79F0\u3001\u63CF\u8FF0\u3001\u5F53\u524D\u6301\u6709\u8005\u3002\u6BCF\u884C\u4E00\u6761\uFF0C\u683C\u5F0F\uFF1A\u7269\u54C1\u540D\uFF5C\u63CF\u8FF0\uFF5C\u6301\u6709\u8005\u3002\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}"
      }
    };
    function load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return Object.assign({}, DEFAULTS);
        const s = Object.assign({}, DEFAULTS, JSON.parse(raw));
        if (!s.llmConfig) {
          s.llmConfig = { source: "local", proxyPreset: "", apiUrl: "", apiKey: "", model: "" };
          const profiles = s.llmProfiles;
          if (profiles && profiles.summary) {
            s.llmConfig = Object.assign(s.llmConfig, profiles.summary);
          } else if (s.summaryBaseUrl || s.summaryApiKey || s.summaryModel) {
            s.llmConfig = {
              source: s.summaryBaseUrl || s.summaryApiKey ? "custom" : "local",
              proxyPreset: "",
              apiUrl: s.summaryBaseUrl || "",
              apiKey: s.summaryApiKey || "",
              model: s.summaryModel || ""
            };
          }
        }
        return s;
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

  // src/config/errlog.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const FIELD = "warm_memo_errors_v1";
    const MAX = 200;
    function getMeta() {
      const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
      const md = ctx && ctx.chatMetadata;
      if (md && typeof md === "object" && !Array.isArray(md)) return md;
      return null;
    }
    function load() {
      const md = getMeta();
      const raw = md && md[FIELD];
      if (!raw) return [];
      try {
        return Array.isArray(raw) ? raw : Array.isArray(raw.list) ? raw.list : [];
      } catch (e) {
        return [];
      }
    }
    async function persist(list) {
      const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
      if (!ctx || !ctx.updateChatMetadata) {
        console.error("[WarmMemo] \u9519\u8BEF\u65E5\u5FD7\u65E0\u6CD5\u6301\u4E45\u5316\uFF1A\u65E0 updateChatMetadata");
        return;
      }
      try {
        ctx.updateChatMetadata({ [FIELD]: list.slice(-MAX) }, false);
        if (typeof ctx.saveMetadata === "function") await ctx.saveMetadata();
      } catch (e) {
        console.error("[WarmMemo] \u9519\u8BEF\u65E5\u5FD7\u6301\u4E45\u5316\u5931\u8D25", e);
      }
    }
    async function add(scope, err, extra) {
      const item = {
        id: "err_" + Date.now() + "_" + Math.floor(Math.random() * 1e3),
        ts: Date.now(),
        scope: scope || "unknown",
        message: err && err.message ? err.message : String(err || "\u672A\u77E5\u9519\u8BEF"),
        stack: err && err.stack ? String(err.stack).slice(0, 2e3) : "",
        extra: extra || null
      };
      const list = load();
      list.push(item);
      if (list.length > MAX) list.splice(0, list.length - MAX);
      await persist(list);
      console.error("[WarmMemo][" + (scope || "unknown") + "]", item.message, item.extra || "");
      return item;
    }
    function get() {
      return load().slice().reverse();
    }
    async function clear() {
      await persist([]);
    }
    function last() {
      const l = load();
      return l.length ? l[l.length - 1] : null;
    }
    WM.ErrLog = { add, get, clear, last };
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
          sourceId: "item::" + it.name,
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
      addItem,
      removeItem,
      getItems,
      updateItem,
      addPlot,
      updatePlot,
      removePlot,
      getPlots,
      setWorld,
      getWorld,
      setRelations,
      getRelations,
      dispatchLorebook,
      setSummaryPointer,
      getSummaryPointer,
      exportJSON,
      importJSON
    };
  })();

  // src/config/llm-client.js
  (function() {
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function getGenerateRaw() {
      if (typeof window.generateRaw === "function") return window.generateRaw;
      try {
        const ST = window.SillyTavern;
        if (ST && typeof ST.getContext === "function") {
          const ctx = ST.getContext();
          if (ctx && typeof ctx.generateRaw === "function") return ctx.generateRaw;
        }
        if (ST && typeof ST.generateRaw === "function") return ST.generateRaw;
      } catch (e) {
      }
      return null;
    }
    function buildCustomApi(p) {
      if (!p) return void 0;
      const api = {};
      if (p.proxyPreset) api.proxy_preset = p.proxyPreset.trim();
      if (p.apiUrl) api.apiurl = p.apiUrl.trim();
      if (p.apiKey) api.key = p.apiKey.trim();
      if (p.model) api.model = p.model.trim();
      return api.proxy_preset || api.apiurl || api.model ? api : void 0;
    }
    function getPresetNamesFn() {
      if (typeof window.getPresetNames === "function") return window.getPresetNames;
      if (window.tavern_events && typeof window.tavern_events.getPresetNames === "function") return window.tavern_events.getPresetNames;
      return null;
    }
    function getPresetFn() {
      if (typeof window.getPreset === "function") return window.getPreset;
      if (window.tavern_events && typeof window.tavern_events.getPreset === "function") return window.tavern_events.getPreset;
      return null;
    }
    function listPresetNames() {
      const f = getPresetNamesFn();
      if (typeof f !== "function") return [];
      try {
        return f() || [];
      } catch (e) {
        return [];
      }
    }
    function mapRole(r) {
      if (r === 1) return "user";
      if (r === 2) return "assistant";
      return "system";
    }
    function getPresetPromptItems(name) {
      if (!name) return [];
      const getPreset = getPresetFn();
      if (typeof getPreset !== "function") return [];
      let preset;
      try {
        preset = getPreset(name);
      } catch (e) {
        return [];
      }
      const prompts = preset && preset.prompts || [];
      return prompts.filter((p) => p && p.enabled !== false && p.content && String(p.content).trim().length > 0).map((p) => ({ role: mapRole(p.role), content: String(p.content) }));
    }
    function resolvePrefix(settings) {
      const pp = settings && settings.presetPrefix || null;
      if (!pp || pp.mode === "none") return [];
      if (pp.mode === "import") {
        const t = (pp.importText || "").trim();
        return t ? [{ role: "system", content: t }] : [];
      }
      if (pp.mode === "preset") {
        return getPresetPromptItems(pp.presetName);
      }
      return [];
    }
    async function complete(messages, opts) {
      opts = opts || {};
      const profile = opts.profile || { source: "local" };
      const gr = getGenerateRaw();
      if (!gr) {
        throw new Error("\u9152\u9986 generateRaw \u63A5\u53E3\u4E0D\u53EF\u7528\uFF08\u8BF7\u786E\u8BA4\u5728\u9152\u9986\u73AF\u5883\u4E2D\u8FD0\u884C\uFF0C\u4E14\u6269\u5C55\u5DF2\u6B63\u786E\u52A0\u8F7D\uFF09");
      }
      const ordered_prompts = (messages || []).map((m) => ({ role: m.role || "user", content: m.content || "" }));
      const maxTokens = opts.maxTokens || profile.maxTokens || 512;
      const config = {
        ordered_prompts,
        should_stream: false,
        max_new_tokens: maxTokens,
        // 低温度保证输出稳定、准确；让模型在 maxTokens 限制内完整输出
        temperature: opts.temperature != null ? opts.temperature : profile.temperature != null ? profile.temperature : 0.3
      };
      if (profile.source === "custom") {
        const custom_api = buildCustomApi(profile);
        if (!custom_api) {
          throw new Error("\u81EA\u5B9A\u4E49\u6765\u6E90\u672A\u914D\u7F6E\uFF08\u9700\u586B\u4EE3\u7406\u9884\u8BBE\u6216 URL/Key/\u6A21\u578B\uFF09");
        }
        config.custom_api = custom_api;
      }
      const out = await gr(config);
      const text = typeof out === "string" ? out : out && out.reply ? out.reply : String(out || "");
      return text ? String(text).trim() : "";
    }
    async function testConnection(opts) {
      opts = opts || {};
      const profile = opts.profile || { source: "local" };
      try {
        const out = await complete(
          [{ role: "user", content: "\u8BF7\u56DE\u590D\uFF1A\u4F60\u597D" }],
          { profile, maxTokens: 16, temperature: 0.1 }
        );
        if (out && String(out).trim().length > 0) {
          return { success: true, detail: "\u8FDE\u901A\uFF0C\u8FD4\u56DE\uFF1A" + String(out).trim().slice(0, 30) };
        }
        return { success: false, error: "\u8FD4\u56DE\u4E3A\u7A7A" };
      } catch (e) {
        return { success: false, error: String(e && e.message ? e.message : e) };
      }
    }
    WM.LLMClient = { complete, testConnection, buildCustomApi, getGenerateRaw, resolvePrefix, getPresetPromptItems, listPresetNames };
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
      const h = helper();
      return !!h && typeof h.getWorldbookNames === "function" && typeof h.getWorldbook === "function";
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
        if (typeof helper().rebindCharWorldbooks === "function") {
          const cur = await helper().getCharWorldbookNames("current");
          const additional = Array.isArray(cur.additional) ? cur.additional.slice() : [];
          if (!additional.includes(name)) {
            additional.push(name);
            await helper().rebindCharWorldbooks("current", { primary: cur.primary || null, additional });
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
        const entries = await helper().getWorldbook(name);
        return (entries || []).map((e, i) => ({ uid: String(e.uid != null ? e.uid : i), entry: e }));
      } catch (e) {
        return [];
      }
    }
    function buildEntry(opts) {
      const isSelective = opts.strategy === "selective";
      return {
        name: opts.title || "",
        enabled: true,
        content: opts.content,
        // 激活策略（真实结构：type / keys / keys_secondary / scan_depth）
        strategy: {
          type: isSelective ? "selective" : "constant",
          keys: opts.keys && opts.keys.length ? opts.keys : [],
          keys_secondary: { logic: "and_any", keys: [] },
          scan_depth: "same_as_global"
        },
        position: {
          type: "after_author_note",
          // 真实枚举：作者注释之后
          role: "system",
          depth: 1,
          order: 100
        },
        probability: 100,
        // 递归：禁止条目互相递归激活，避免爆量
        recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
        effect: { sticky: null, cooldown: null, delay: null },
        extra: extraOf(opts.sourceId)
      };
    }
    async function writeEntry(opts) {
      if (!opts || !opts.content || !opts.content.trim()) return null;
      const ok = await ensureLorebook();
      if (!ok) return null;
      const name = targetName();
      const sourceId = opts.sourceId || [opts.kind, opts.title].join("::");
      const entry = buildEntry(Object.assign({ sourceId }, opts));
      try {
        const existing = await listEntries();
        const hit = existing.find((x) => x.entry.extra && x.entry.extra.warmMemo && x.entry.extra.sourceId === sourceId);
        if (hit) {
          const uid = Number(hit.uid);
          await helper().updateWorldbookWith(name, (wb) => {
            return wb.map((e) => String(e.uid) === hit.uid ? Object.assign({}, e, entry, { uid: e.uid }) : e);
          });
          return hit.uid;
        } else {
          const res = await helper().createWorldbookEntries(name, [entry]);
          const created = res && res.new_entries ? res.new_entries : [];
          if (created.length) return String(created[0].uid != null ? created[0].uid : created[0].id);
          return "new";
        }
      } catch (e) {
        console.warn("[WarmMemo] writeEntry \u5931\u8D25:", e);
        return null;
      }
    }
    async function removeEntry(sourceId) {
      if (!available() || !sourceId) return;
      const name = targetName();
      try {
        await helper().deleteWorldbookEntries(name, (e) => !!(e.extra && e.extra.warmMemo && e.extra.sourceId === sourceId));
      } catch (e) {
        console.warn("[WarmMemo] removeEntry \u5931\u8D25:", e);
      }
    }
    async function clearAll() {
      if (!available()) return;
      const name = targetName();
      try {
        await helper().deleteWorldbookEntries(name, (e) => !!(e.extra && e.extra.warmMemo));
      } catch (e) {
        console.warn("[WarmMemo] clearAll \u5931\u8D25:", e);
      }
    }
    async function writeSummary(dateLabel, content) {
      return writeEntry({ kind: "summary", sourceId: "summary::" + dateLabel, title: "\u603B\u7ED3\xB7" + dateLabel, content, strategy: "constant" });
    }
    async function writeItem(itemName, content) {
      return writeEntry({ kind: "item", sourceId: "item::" + itemName, title: "\u7269\u54C1\xB7" + itemName, content, keys: [itemName], strategy: "selective" });
    }
    async function writeRelation(person, content, keys) {
      return writeEntry({ kind: "relation", sourceId: "relation::" + person, title: "\u5173\u7CFB\xB7" + person, content, keys: keys && keys.length ? keys : [person], strategy: "constant" });
    }
    async function writeWorld(content) {
      return writeEntry({ kind: "world", sourceId: "world::main", title: "\u4E16\u754C\u89C2\u8BBE\u5B9A", content, strategy: "constant" });
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
      const plots = (WM.MemoryStore && WM.MemoryStore.getPlots ? WM.MemoryStore.getPlots() : []).map((p) => `\xB7 ${p.title}\uFF1A${p.summary}`).join("\n");
      const tpl = settings && settings.prompts && settings.prompts.worldview || "\u4F60\u662F\u4E16\u754C\u89C2\u63D0\u70BC\u8005\u3002\u8BF7\u57FA\u4E8E\u3010\u5267\u60C5\u7EBF\u3011\u548C\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u62BD\u53D6\u672C\u4E16\u754C\u7684\u5173\u952E\u8BBE\u5B9A\uFF1A\u5730\u70B9\u3001\u52BF\u529B\u3001\u89C4\u5219\u3001\u7269\u54C1\u3001\u6982\u5FF5\u3002\u8F93\u51FA\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u5267\u60C5\u7EBF\u3011\n{{plot}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}";
      const sys = WM.Summary.fillTemplate(tpl, { plot: plots, recent: "" });
      const userMsg = `\u3010\u89D2\u8272\u8BBE\u5B9A\u3011${char.name || "\u672A\u77E5"}\uFF1A${char.description || ""}
\u3010\u7528\u6237\u8BBE\u5B9A\u3011${user.name || "\u672A\u77E5"}\uFF1A${user.description || ""}
\u3010\u5DF2\u6709\u4E16\u754C\u89C2\u3011${prev || "\uFF08\u65E0\uFF09"}
\u8BF7\u8F93\u51FA\u4E16\u754C\u89C2\u8BBE\u5B9A\uFF1A`;
      if (!WM.Summary || !WM.Summary.callLLM) return prev;
      const out = await WM.Summary.callLLM(sys, userMsg, settings, { temperature: 0.4 });
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
      const tpl = settings && settings.prompts && settings.prompts.plot || "\u4F60\u662F\u5267\u60C5\u68B3\u7406\u8005\u3002\u8BF7\u57FA\u4E8E\u3010\u5173\u7CFB\u3011\u548C\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u68B3\u7406\u5F53\u524D\u5267\u60C5\u4E3B\u7EBF\u3001\u652F\u7EBF\u3001\u60AC\u5FF5\u4E0E\u4E0B\u4E00\u6B65\u53EF\u80FD\u53D1\u5C55\u3002\u8F93\u51FA\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u5173\u7CFB\u3011\n{{relations}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}";
      const sys = WM.Summary.fillTemplate(tpl, { recent, relations: existing });
      const userMsg = `\u3010\u5DF2\u6709\u5267\u60C5\u7EBF\u3011
${existing || "\uFF08\u65E0\uFF09"}

\u3010\u8FD1\u671F\u8BB0\u5FC6\u3011
${recent}

\u8BF7\u8F93\u51FA\u66F4\u65B0\u540E\u7684\u5267\u60C5\u7EBF\uFF1A`;
      try {
        const raw = await WM.Summary.callLLM(sys, userMsg, settings, {});
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
    function fillTemplate(tpl, data) {
      if (!tpl) return "";
      return String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, function(_, k) {
        return data && data[k] != null ? String(data[k]) : "";
      });
    }
    function getRecentMessages(n) {
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
        const chat = ctx && ctx.chat;
        if (!Array.isArray(chat)) return [];
        const sliced = chat.slice(-(n || 40));
        return sliced.map((m) => ({
          role: m.is_user ? "user" : "assistant",
          content: m.mes || "",
          name: m.name || ""
        }));
      } catch (e) {
        return [];
      }
    }
    function toMessages(msgs) {
      return msgs.map((m) => ({
        role: m.role,
        content: (m.name ? "\u3010" + m.name + "\u3011" : "") + m.content
      }));
    }
    async function callLLM(systemText, userText, settings, opts) {
      opts = opts || {};
      const maxRetry = opts.maxRetry != null ? opts.maxRetry : 3;
      let lastErr = null;
      for (let attempt = 1; attempt <= maxRetry; attempt++) {
        try {
          const out = await WM.LLMClient.complete(systemText, userText, settings, opts);
          const text = out && out.trim && out.trim() || "";
          if (!text) throw new Error("\u6A21\u578B\u8FD4\u56DE\u7A7A\u5185\u5BB9");
          return text;
        } catch (e) {
          lastErr = e;
          if (attempt < maxRetry) {
            if (WM.ErrLog) await WM.ErrLog.add("llm", e, { phase: opts.phase || "unknown", attempt, willRetry: true });
            await new Promise((r) => setTimeout(r, 1e3));
          }
        }
      }
      if (WM.ErrLog) await WM.ErrLog.add("llm", lastErr || new Error("\u672A\u77E5LLM\u5931\u8D25"), { phase: opts.phase || "unknown", attempt: maxRetry, willRetry: false });
      throw lastErr || new Error("LLM \u8C03\u7528\u5931\u8D25");
    }
    async function triggerSummary(settings) {
      settings = settings || {};
      const auto = settings.autoSummaryMode || "new";
      if (!settings.autoSummaryEnabled) return false;
      let range, total;
      const msgs = getRecentMessages(1e3);
      total = msgs.length;
      if (auto === "new") {
        const ptr = WM.MemoryStore.getSummaryPointer();
        if (ptr >= total) return false;
        range = [ptr + 1, total];
      } else if (auto === "count") {
        const win = Math.max(5, settings.autoSummaryCount || 20);
        const from = Math.max(0, total - win);
        range = [from + 1, total];
      } else if (auto === "range") {
        const start = Math.max(1, settings.autoSummaryStart || 1);
        let end = settings.autoSummaryEnd;
        if (end == null || end < 0) end = total;
        end = Math.min(end, total);
        if (start > end) return false;
        range = [start, end];
      } else if (auto === "floor") {
        const floor = Math.max(1, settings.autoSummaryFloor || 20);
        const ptr = WM.MemoryStore.getSummaryPointer();
        const segEnd = Math.floor(ptr / floor) * floor + floor;
        if (total < segEnd) return false;
        const start = ptr + 1;
        const end = Math.min(total, segEnd);
        range = [start, end];
      } else {
        return false;
      }
      const recent = msgs.slice(range[0] - 1, range[1]);
      if (!recent.length) return false;
      const histSummaries = (WM.MemoryStore.getSummaries() || []).map((s) => `\xB7 ${s.title}\uFF1A${s.text}`).join("\n");
      const relationsText = (WM.MemoryStore.getRelations() || []).map((r) => `\xB7 ${r.from} \u2192 ${r.to}\uFF1A${r.label || ""}`).join("\n");
      const plotsText = (WM.MemoryStore.getPlots() || []).map((p) => `\xB7 ${p.title}\uFF1A${p.summary}`).join("\n");
      const summaryTpl = settings.prompts && settings.prompts.summary;
      const sys = fillTemplate(summaryTpl, { recent: recent.map((m) => (m.name ? "\u3010" + m.name + "\u3011" : "") + m.content).join("\n"), historySummary: histSummaries });
      let summaryText = "";
      try {
        summaryText = await callLLM(sys, "\u8BF7\u8F93\u51FA\u8FD9\u6BB5\u5BF9\u8BDD\u7684\u603B\u7ED3\uFF1A", settings, { temperature: 0.3, phase: "summary" });
        await WM.MemoryStore.addSummary(summaryText, "summary", "\u697C\u5C42 " + range[0] + "-" + range[1]);
        await WM.MemoryStore.setSummaryPointer(range[1]);
      } catch (e) {
        if (WM.ErrLog) await WM.ErrLog.add("summary", e, { range });
        WM.UI && WM.UI.toast && WM.UI.toast("\u603B\u7ED3\u5931\u8D25\uFF1A" + (e.message || e), "error");
        return { ok: false, range, reason: e && e.message ? e.message : String(e) };
      }
      const tasks = [];
      const labels = [];
      tasks.push((async () => {
        const tpl = settings.prompts && settings.prompts.relations;
        const s = fillTemplate(tpl, { recent: recent.map((m) => (m.name ? "\u3010" + m.name + "\u3011" : "") + m.content).join("\n"), historySummary: histSummaries });
        const out = await callLLM(s, "\u8BF7\u8F93\u51FA\u89D2\u8272\u4E4B\u95F4\u7684\u5173\u7CFB\uFF08\u6BCF\u884C \u4EBA\u7269A \u2192 \u4EBA\u7269B\uFF1A\u5173\u7CFB\uFF09\uFF1A", settings, { temperature: 0.3, phase: "relations" });
        let parsed = [];
        try {
          const arr = JSON.parse(out);
          if (Array.isArray(arr)) parsed = arr;
        } catch (e) {
          parsed = out.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
            const m = l.match(/^(.*?)\s*[→\-–>]\s*(.*?)[:：]\s*(.*)$/);
            return m ? { from: m[1].trim(), to: m[2].trim(), label: m[3].trim() } : { from: l, to: "", label: "" };
          });
        }
        await WM.MemoryStore.setRelations(parsed);
        return { kind: "relations", ok: true };
      })());
      labels.push("relations");
      tasks.push((async () => {
        const tpl = settings.prompts && settings.prompts.plot;
        const s = fillTemplate(tpl, { recent: recent.map((m) => (m.name ? "\u3010" + m.name + "\u3011" : "") + m.content).join("\n"), historySummary: histSummaries, relations: relationsText });
        const out = await callLLM(s, "\u8BF7\u8F93\u51FA\u5F53\u524D\u5267\u60C5\u7EBF\uFF08\u6807\u9898\uFF5C\u6458\u8981\uFF0C\u6BCF\u884C\u4E00\u6761\uFF09\uFF1A", settings, { temperature: 0.4, phase: "plot" });
        const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const ln of lines) {
          const idx = ln.indexOf("\uFF5C");
          const idx2 = ln.indexOf("|");
          const sep = idx >= 0 ? idx : idx2;
          if (sep >= 0) await WM.MemoryStore.addPlot(ln.slice(0, sep).trim(), ln.slice(sep + 1).trim(), "active");
          else await WM.MemoryStore.addPlot(ln, "", "active");
        }
        return { kind: "plot", ok: true };
      })());
      labels.push("plot");
      tasks.push((async () => {
        const world = await WM.Worldbook.inferWorldview(settings, { recent });
        if (world && world.trim()) await WM.MemoryStore.setWorld(world);
        return { kind: "worldview", ok: true };
      })());
      labels.push("worldview");
      tasks.push((async () => {
        const tpl = settings.prompts && settings.prompts.itemExtract;
        if (!tpl) return { kind: "items", ok: true, skipped: true };
        const s = fillTemplate(tpl, { recent: recent.map((m) => (m.name ? "\u3010" + m.name + "\u3011" : "") + m.content).join("\n") });
        const out = await callLLM(s, "\u8BF7\u8F93\u51FA\u672C\u6BB5\u51FA\u73B0\u7684\u7269\u54C1\uFF08\u6BCF\u884C \u7269\u54C1\u540D\uFF5C\u63CF\u8FF0\uFF5C\u6301\u6709\u8005\uFF09\uFF1A", settings, { temperature: 0.3, phase: "items" });
        const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const ln of lines) {
          const parts = ln.split(/[｜|]/);
          if (parts[0] && parts[0].trim()) await WM.MemoryStore.addItem(parts[0].trim(), parts[1] ? parts[1].trim() : "", parts[2] ? parts[2].trim() : "");
        }
        return { kind: "items", ok: true };
      })());
      labels.push("items");
      const results = await Promise.allSettled(tasks);
      const failures = [];
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          const scope = labels[i];
          failures.push({ scope, err: r.reason });
          if (WM.ErrLog) WM.ErrLog.add(scope, r.reason, { range }).catch(() => {
          });
        }
      });
      if (failures.length === results.length && failures.length > 0) {
        const reason = failures.map((f) => "\u3010" + f.scope + "\u3011" + (f.err && f.err.message ? f.err.message : f.err)).join("\uFF1B\n");
        if (WM.ErrLog) await WM.ErrLog.add("pipeline", new Error("\u6240\u6709\u5E76\u884C\u4EFB\u52A1\u5931\u8D25"), { range, reason });
        WM.UI && WM.UI.toast && WM.UI.toast("\u63D0\u70BC\u5168\u90E8\u5931\u8D25\uFF0C\u89C1\u300C\u9519\u8BEF\u62A5\u544A\u300D\uFF1A\n" + reason, "error");
      } else if (failures.length > 0) {
        const reason = failures.map((f) => "\u3010" + f.scope + "\u3011" + (f.err && f.err.message ? f.err.message : f.err)).join("\uFF1B");
        WM.UI && WM.UI.toast && WM.UI.toast("\u90E8\u5206\u63D0\u70BC\u5931\u8D25\uFF1A" + reason, "warn");
      }
      if (WM.UI && WM.UI.refresh) WM.UI.refresh();
      return {
        ok: true,
        range,
        count: recent.length,
        results: {
          relations: (WM.MemoryStore.getRelations() || []).length,
          plots: (WM.MemoryStore.getPlots() || []).length,
          world: !!(WM.MemoryStore.getWorld() || "").trim(),
          items: (WM.MemoryStore.getItems ? WM.MemoryStore.getItems() : []).length
        }
      };
    }
    WM.Summary = { fillTemplate, callLLM, triggerSummary, runSummary: triggerSummary, getRecentMessages, toMessages };
  })();

  // src/config/relations.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    async function extractRelations(memoryText, settings) {
      if (!memoryText || !memoryText.trim()) return [];
      const tpl = settings && settings.prompts && settings.prompts.relations || "\u4ECE\u4E0B\u9762\u7684\u300C\u6709\u6E29\u5EA6\u8BB0\u5FC6\u300D\u4E2D\uFF0C\u62BD\u53D6\u5B9E\u4F53\uFF08\u89D2\u8272\u3001\u7528\u6237\u3001\u5730\u70B9\u3001\u4E8B\u7269\uFF09\u4E4B\u95F4\u7684\u5173\u7CFB\u3002\n\u8981\u6C42\uFF1A\u6BCF\u884C\u4E00\u4E2A\u4E09\u5143\u7EC4\uFF0C\u683C\u5F0F\u4E25\u683C\u4E3A \u5B9E\u4F53A|\u5173\u7CFB|\u5B9E\u4F53B|\u6743\u91CD(1-5)\u3002\n\u6743\u91CD\u8868\u793A\u5173\u7CFB\u5F3A\u5EA6/\u4E92\u52A8\u9891\u7387\u3002\u53EA\u62BD\u53D6\u660E\u786E\u63D0\u5230\u6216\u660E\u663E\u6697\u793A\u7684\u5173\u7CFB\u3002\u6700\u591A 18 \u6761\u3002\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}";
      const sys = WM.Summary.fillTemplate(tpl, { recent: memoryText, historySummary: memoryText });
      try {
        const raw = await WM.Summary.callLLM(sys, memoryText, settings, {});
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
        const relText = p.label || p.relation || p.rel || "\u5173\u8054";
        pushRel(p.from, p.to, relText);
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
      if (wbOk && settings.worldToLorebook !== false) {
        return memBlock;
      }
      const parts = [memBlock];
      if (settings.injectWorld !== false && candidates.length) {
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
    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      if (r.width < 4 && r.height < 4) return false;
      return r.bottom > 0 && r.top < (window.innerHeight || 9999);
    }
    function injectButton() {
      if (document.getElementById("warmmemo-btn")) return;
      const container = findInputContainer();
      if (container && isVisible(container)) {
        btnEl = document.createElement("button");
        btnEl.id = "warmmemo-btn";
        btnEl.className = "wm-input-btn menu_button";
        btnEl.type = "button";
        btnEl.title = "\u6E29\u8BB0 \xB7 \u8BB0\u5FC6\u4E0E\u4E16\u754C\u89C2";
        btnEl.textContent = "\u{1F33F} \u8BB0\u5FC6";
        btnEl.onclick = openPanel;
        container.appendChild(btnEl);
        if (!isVisible(btnEl)) {
          btnEl.remove();
          btnEl = null;
          ensureFloatingButton();
        }
      } else {
        ensureFloatingButton();
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
            <option value="floor" ${s.autoSummaryMode === "floor" ? "selected" : ""}>\u6309\u697C\u5C42\u533A\u95F4\uFF081-20,21-40\u2026\uFF09</option>
          </select>
        </div>
        <div class="wm-row" id="a-count-row" style="${s.autoSummaryMode === "count" ? "" : "display:none"}">\u6700\u8FD1\u6761\u6570\uFF1A
          <input type="number" id="a-count" value="${s.autoSummaryCount}" min="1" max="200" style="width:70px"/>
        </div>
        <div class="wm-row" id="a-range-row" style="${s.autoSummaryMode === "range" ? "" : "display:none"}">
          \u697C\u5C42 <input type="number" id="a-start" value="${s.autoSummaryStart}" min="0" style="width:64px"/> ~
          <input type="number" id="a-end" value="${s.autoSummaryEnd}" min="-1" style="width:64px"/>\uFF08\u7EC8\u70B9 -1 \u8868\u793A\u6700\u65B0\uFF0C\u5171 ${total} \u5C42\uFF09
        </div>
        <div class="wm-row" id="a-floor-row" style="${s.autoSummaryMode === "floor" ? "" : "display:none"}">
          \u6BCF <input type="number" id="a-floor" value="${s.autoSummaryFloor}" min="1" max="500" style="width:64px"/> \u5C42\u81EA\u52A8\u603B\u7ED3\u4E00\u6BB5\uFF08\u5982\u586B 20\uFF1A1-20\u300121-40\u300141-60\u2026\uFF09
        </div>
        <label class="wm-row"><input type="checkbox" id="a-hide" ${s.autoHideFloors ? "checked" : ""}/> \u603B\u7ED3\u540E\u9690\u85CF\u5DF2\u5904\u7406\u697C\u5C42</label>
        <details class="wm-fold" open>
          <summary>\u6807\u7B7E\u8FC7\u6EE4\uFF08\u603B\u7ED3\u65F6\u5254\u9664\u6807\u7B7E\u5305\u88F9\u5185\u5BB9\uFF09</summary>
          <div class="wm-hint">\u53EF\u81EA\u5B9A\u4E49\u591A\u6761\u89C4\u5219\uFF0C\u540C\u4E00\u6807\u7B7E\u4E5F\u80FD\u300C\u591A\u91CD\u5B58\u5728\u300D\uFF1A\u52FE\u9009\u591A\u79CD\u5F62\u6001\u540C\u65F6\u751F\u6548\u3002\u2460<b>\u5305\u88F9</b>\uFF1A\u6210\u5BF9/\u76F8\u540C\u6807\u7B7E\u5220\u4E2D\u95F4\uFF08\u5982 &lt;think&gt;\u2026&lt;/think&gt;\uFF09\uFF1B\u2461<b>\u5355\u6807\u7B7E-\u7559\u4E4B\u540E</b>\uFF1A\u53EA\u6709\u5F00\u6807\u7B7E\u65F6\u5220\u5176<b>\u4E4B\u524D</b>\uFF1B\u2462<b>\u5355\u6807\u7B7E-\u7559\u4E4B\u524D</b>\uFF1A\u53EA\u6709\u5F00\u6807\u7B7E\u65F6\u5220\u5176<b>\u4E4B\u540E</b>\u3002</div>
          <div id="tag-rules"></div>
          <div class="wm-row"><button id="tag-add" class="wm-btn">+ \u65B0\u589E\u6807\u7B7E\u89C4\u5219</button></div>
        </details>
        <details class="wm-fold" open>
          <summary>\u81EA\u52A8\u62BD\u53D6\u5B50\u4EFB\u52A1</summary>
          <label class="wm-row"><input type="checkbox" id="a-rel" ${s.autoRelation ? "checked" : ""}/> \u5173\u7CFB\u56FE</label>
          <label class="wm-row"><input type="checkbox" id="a-plot" ${s.autoPlot ? "checked" : ""}/> \u5267\u60C5\u7EBF</label>
          <label class="wm-row"><input type="checkbox" id="a-world" ${s.autoWorld ? "checked" : ""}/> \u4E16\u754C\u89C2\u8BBE\u5B9A</label>
          <label class="wm-row"><input type="checkbox" id="a-item" ${s.autoItems ? "checked" : ""}/> \u7269\u54C1\u8FFD\u8E2A</label>
        </details>
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
        body.querySelector("#a-floor-row").style.display = mode.value === "floor" ? "" : "none";
      };
      function renderTagRules() {
        const box = body.querySelector("#tag-rules");
        const rules = s.tagStripRules || (s.tagStripRules = []);
        box.innerHTML = rules.map((r, i) => `
        <div class="wm-tag-rule" data-idx="${i}" style="margin:8px 0;padding:6px;border:1px solid #d8cfbf;border-radius:6px">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="checkbox" class="t-on" ${r.enabled ? "checked" : ""} title="\u542F\u7528\u6574\u6761"/>
            <input class="t-open" value="${escapeHtml(r.open || "")}" placeholder="\u5F00\u6807\u7B7E\u5982 &lt;think&gt;" style="flex:1;min-width:80px"/>
            <span>\u2026</span>
            <input class="t-close" value="${escapeHtml(r.close || "")}" placeholder="\u95ED\u6807\u7B7E\uFF08\u7559\u7A7A\u53EF\u4E0D\u586B\uFF09" style="flex:1;min-width:80px"/>
            <button class="t-del wm-btn" style="padding:2px 8px">\u5220</button>
          </div>
          <div style="display:flex;gap:14px;margin-top:6px;font-size:12px;flex-wrap:wrap">
            <label><input type="checkbox" class="t-wrap" ${r.wrap ? "checked" : ""}/> \u5305\u88F9(\u5220\u4E2D\u95F4)</label>
            <label><input type="checkbox" class="t-sb" ${r.singleBefore ? "checked" : ""}/> \u5355\u6807\u7B7E-\u7559\u4E4B\u540E(\u5220\u524D)</label>
            <label><input type="checkbox" class="t-sa" ${r.singleAfter ? "checked" : ""}/> \u5355\u6807\u7B7E-\u7559\u4E4B\u524D(\u5220\u540E)</label>
          </div>
        </div>`).join("");
        box.querySelectorAll(".t-del").forEach((btn) => {
          btn.onclick = () => {
            const idx = parseInt(btn.closest(".wm-tag-rule").dataset.idx, 10);
            s.tagStripRules.splice(idx, 1);
            renderTagRules();
          };
        });
      }
      renderTagRules();
      body.querySelector("#tag-add").onclick = () => {
        s.tagStripRules = s.tagStripRules || [];
        s.tagStripRules.push({ name: "new", open: "<new>", close: "</new>", wrap: true, singleBefore: true, singleAfter: false, enabled: true });
        renderTagRules();
      };
      body.querySelector("#a-save").onclick = () => {
        s.autoSummaryEnabled = body.querySelector("#a-on").checked;
        s.autoSummaryMode = mode.value;
        s.autoSummaryCount = parseInt(body.querySelector("#a-count").value, 10) || 20;
        s.autoSummaryFloor = parseInt(body.querySelector("#a-floor").value, 10) || 20;
        s.autoSummaryStart = parseInt(body.querySelector("#a-start").value, 10) || 0;
        s.autoSummaryEnd = parseInt(body.querySelector("#a-end").value, 10) || -1;
        s.autoHideFloors = body.querySelector("#a-hide").checked;
        s.autoRelation = body.querySelector("#a-rel").checked;
        s.autoPlot = body.querySelector("#a-plot").checked;
        s.autoWorld = body.querySelector("#a-world").checked;
        s.autoItems = body.querySelector("#a-item").checked;
        s.tagStripRules = Array.from(body.querySelectorAll("#tag-rules .wm-tag-rule")).map((row) => {
          const close = row.querySelector(".t-close").value.trim();
          return {
            name: (row.querySelector(".t-open").value.match(/<([^>\s/]+)/) || [, ""])[1] || "rule",
            open: row.querySelector(".t-open").value.trim(),
            close,
            wrap: row.querySelector(".t-wrap") ? row.querySelector(".t-wrap").checked : false,
            singleBefore: row.querySelector(".t-sb") ? row.querySelector(".t-sb").checked : false,
            singleAfter: row.querySelector(".t-sa") ? row.querySelector(".t-sa").checked : false,
            enabled: row.querySelector(".t-on").checked
          };
        }).filter((r) => r.open);
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
    function relTime(ts) {
      if (!ts) return "";
      const d = Date.now() - ts;
      if (d < 6e4) return "\u521A\u521A";
      if (d < 36e5) return Math.floor(d / 6e4) + " \u5206\u949F\u524D";
      if (d < 864e5) return Math.floor(d / 36e5) + " \u5C0F\u65F6\u524D";
      if (d < 864e5 * 30) return Math.floor(d / 864e5) + " \u5929\u524D";
      const dt = new Date(ts);
      return dt.getMonth() + 1 + "/" + dt.getDate();
    }
    function renderMem(body) {
      const mem = WM.MemoryStore.getMemories();
      let html = `<div class="wm-card"><div class="wm-h">\u6709\u6E29\u5EA6\u8BB0\u5FC6\uFF08${mem.length}\uFF09</div>
      <div class="wm-hint">\u5168\u90E8\u8BB0\u5FC6\u6309\u65F6\u95F4\u5012\u5E8F\u76F4\u63A5\u5217\u51FA\uFF0C\u6EDA\u8F6E / \u624B\u6307\u5373\u53EF\u5212\u52A8\u6D4F\u89C8</div>
      <div class="wm-actions">
        <button id="mem-export" class="wm-btn">\u5BFC\u51FA</button>
        <button id="mem-import" class="wm-btn">\u5BFC\u5165</button>
      </div>
      <div class="wm-list" id="mem-list">`;
      html += mem.slice().reverse().map((m) => `<div class="wm-item">${m.ts ? `<span class="wm-ts">${relTime(m.ts)}</span>` : ""}${escapeHtml(m.text)}</div>`).join("") || '<div class="wm-empty">\u6682\u65E0\u8BB0\u5FC6\uFF0C\u5148\u53BB\u300C\u81EA\u52A8\u603B\u7ED3\u300D\u751F\u6210</div>';
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
        s += `<line x1="${a.x.toFixed(0)}" y1="${a.y.toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${b.y.toFixed(0)}" stroke="var(--wm-jade)" stroke-width="${r.weight}" stroke-opacity="0.6" class="wm-edge"/>`;
      });
      nodes.forEach((n) => {
        s += `<circle cx="${n.x.toFixed(0)}" cy="${n.y.toFixed(0)}" r="6" fill="var(--wm-jade)" data-name="${escapeHtml(n.id)}" class="wm-node" style="cursor:grab"/>`;
        s += `<text x="${(n.x + 8).toFixed(0)}" y="${(n.y + 4).toFixed(0)}" font-size="9" fill="var(--wm-ink-soft)">${escapeHtml(n.id.length > 6 ? n.id.slice(0, 6) + "\u2026" : n.id)}</text>`;
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
    async function renderWorld(body) {
      const settings = WM.Settings.load();
      const world = WM.MemoryStore.getWorld();
      let charName = "";
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext() || null;
        charName = ctx && (ctx.name1 || ctx.characters && ctx.character_card && ctx.character_card.data && ctx.character_card.data.name) || "";
      } catch (e) {
        charName = "";
      }
      let loreCount = 0;
      try {
        loreCount = WM.Worldbook.listEntries ? (await WM.Worldbook.listEntries()).length : 0;
      } catch (e) {
        loreCount = 0;
      }
      body.innerHTML = `<div class="wm-card"><div class="wm-h">\u4E16\u754C\u8BBE\u5B9A \xB7 ${escapeHtml(charName || "\u5F53\u524D\u89D2\u8272\u5361")}</div>
      <div class="wm-hint">\u8FD9\u662F\u672C\u5F20\u89D2\u8272\u5361\u7684\u4E16\u754C\u8BBE\u5B9A\uFF0C\u76F4\u63A5\u4E66\u5199\u5E76\u4FDD\u5B58\uFF0C\u4F1A\u81EA\u52A8\u6CE8\u5165\u4E0A\u4E0B\u6587${loreCount ? `\uFF08\u5DF2\u540C\u6B65\u4E16\u754C\u4E66 ${loreCount} \u6761\uFF09` : ""}</div>
      <textarea id="world-ta" class="wm-ta" placeholder="\u76F4\u63A5\u5199\u4E0B\u5F53\u524D\u89D2\u8272\u5361\u7684\u4E16\u754C\u89C2\u8BBE\u5B9A\uFF0C\u4F8B\u5982\uFF1A\u5927\u9646\u540D\u3001\u52BF\u529B\u3001\u89C4\u5219\u3001\u65F6\u95F4\u7EBF\u2026\u2026">${escapeHtml(world)}</textarea>
      <div class="wm-row"><input id="world-extra" placeholder="\u8BA9 AI \u5E2E\u4F60\u6DA6\u8272/\u8865\u5168\u7684\u6307\u4EE4\uFF08\u53EF\u9009\uFF0C\u7559\u7A7A\u5219\u4E0D\u6539\u5199\uFF09" style="flex:1"/></div>
      <div class="wm-row"><input id="world-lorename" placeholder="\u4E16\u754C\u4E66\u540D\uFF08\u540C\u6B65\u4E16\u754C\u4E66\u7528\uFF0C\u5982 lorebook\uFF09" value="${settings.lorebookName || ""}" style="flex:1"/></div>
      <label class="wm-row"><input type="checkbox" id="world-lore" ${settings.worldToLorebook ? "checked" : ""}/> \u540C\u6B65\u5199\u5165\u4E16\u754C\u4E66\uFF08\u6240\u6709\u5BF9\u8BDD\u5171\u4EAB\uFF09</label>
      <div class="wm-actions">
        <button id="world-save" class="wm-btn primary">\u4FDD\u5B58\u8BBE\u5B9A</button>
        <button id="world-gen" class="wm-btn">AI \u6DA6\u8272\u8865\u5168</button>
      </div>
      <div class="wm-status" id="world-status"></div></div>`;
      body.querySelector("#world-save").onclick = async () => {
        settings.lorebookName = body.querySelector("#world-lorename").value.trim();
        WM.Settings.save(settings);
        await WM.MemoryStore.setWorld(body.querySelector("#world-ta").value);
        body.querySelector("#world-status").textContent = "\u2713 \u5DF2\u4FDD\u5B58\uFF08\u6CE8\u5165\u5F53\u524D\u89D2\u8272\u5361\u4E0A\u4E0B\u6587\uFF09";
      };
      body.querySelector("#world-gen").onclick = async () => {
        const st = body.querySelector("#world-status");
        st.textContent = "\u6DA6\u8272\u4E2D\u2026";
        try {
          settings.lorebookName = body.querySelector("#world-lorename").value.trim();
          WM.Settings.save(settings);
          const w = await WM.Worldbook.inferWorldview(settings, { extraInstruction: body.querySelector("#world-extra").value });
          body.querySelector("#world-ta").value = w;
          await WM.MemoryStore.setWorld(w);
          if (body.querySelector("#world-lore").checked) {
            await WM.Worldbook.writeWorld(w);
            st.textContent = "\u2713 \u5DF2\u6DA6\u8272\u5E76\u5199\u5165\u4E16\u754C\u4E66\uFF08\u72EC\u7ACB\u6761\u76EE\uFF09";
          } else {
            st.textContent = "\u2713 \u5DF2\u6DA6\u8272\uFF08\u4EC5\u5F53\u524D\u89D2\u8272\u5361\u8BB0\u5FC6+\u6CE8\u5165\uFF09";
          }
        } catch (e) {
          st.textContent = "\u2717 " + (e.message || e);
        }
      };
    }
    function renderPaneLlm(s) {
      const c = s.llmConfig || { source: "local", proxyPreset: "", apiUrl: "", apiKey: "", model: "" };
      const pp = s.presetPrefix || { mode: "none", importText: "", presetName: "" };
      const prompts = s.prompts || {};
      let presetNames = [];
      try {
        presetNames = WM.LLMClient && WM.LLMClient.listPresetNames ? WM.LLMClient.listPresetNames() : [];
      } catch (e) {
        presetNames = [];
      }
      const promptEditors = [
        { key: "summary", title: "\u603B\u7ED3\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{recent}}", def: "\u4F60\u662F\u6211\u7684\u4E13\u5C5E\u8BB0\u5F55\u5458\u3002\u8BF7\u57FA\u4E8E\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u6309\u65F6\u95F4\u987A\u5E8F\u63D0\u70BC\u5173\u952E\u4E8B\u5B9E\u3001\u7EA6\u5B9A\u3001\u72B6\u6001\u53D8\u5316\u3001\u4EBA\u540D/\u5730\u70B9/\u7EC4\u7EC7\u3001\u672A\u5B8C\u6210\u5F85\u529E\u3002\u8F93\u51FA\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}" },
        { key: "relations", title: "\u5173\u7CFB\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{historySummary}} {{recent}}", def: "\u4F60\u662F\u5173\u7CFB\u5206\u6790\u5E08\u3002\u8BF7\u57FA\u4E8E\u3010\u5386\u53F2\u603B\u7ED3\u3011\u548C\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u5206\u6790\u300C\u6211\uFF08\u7528\u6237\uFF09\u4E0E\u89D2\u8272\u4E4B\u95F4\u300D\u7684\u5173\u7CFB\u72B6\u6001\u3001\u4EB2\u5BC6\u5EA6\u3001\u5F20\u529B\u3001\u672A\u89E3\u5FC3\u7ED3\u3002\u8F93\u51FA\u7ED3\u6784\u5316\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u5386\u53F2\u603B\u7ED3\u3011\n{{historySummary}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}" },
        { key: "plot", title: "\u5267\u60C5\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{relations}} {{recent}}", def: "\u4F60\u662F\u5267\u60C5\u68B3\u7406\u8005\u3002\u8BF7\u57FA\u4E8E\u3010\u5173\u7CFB\u3011\u548C\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u68B3\u7406\u5F53\u524D\u5267\u60C5\u4E3B\u7EBF\u3001\u652F\u7EBF\u3001\u60AC\u5FF5\u4E0E\u4E0B\u4E00\u6B65\u53EF\u80FD\u53D1\u5C55\u3002\u8F93\u51FA\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u5173\u7CFB\u3011\n{{relations}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}" },
        { key: "worldview", title: "\u4E16\u754C\u89C2\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{plot}} {{recent}}", def: "\u4F60\u662F\u4E16\u754C\u89C2\u63D0\u70BC\u8005\u3002\u8BF7\u57FA\u4E8E\u3010\u5267\u60C5\u7EBF\u3011\u548C\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u62BD\u53D6\u672C\u4E16\u754C\u7684\u5173\u952E\u8BBE\u5B9A\uFF1A\u5730\u70B9\u3001\u52BF\u529B\u3001\u89C4\u5219\u3001\u7269\u54C1\u3001\u6982\u5FF5\u3002\u8F93\u51FA\u6761\u76EE\uFF0C\u6BCF\u6761\u4E00\u884C\u3002\n\n\u3010\u5267\u60C5\u7EBF\u3011\n{{plot}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}" }
      ];
      const promptHtml = promptEditors.map((p) => `
      <div style="margin:8px 0">
        <div class="wm-h" style="margin:4px 0">${p.title}</div>
        <div class="wm-hint">\u5360\u4F4D\u7B26\uFF1A${p.holder}\uFF08\u8FD0\u884C\u65F6\u81EA\u52A8\u66FF\u6362\u4E3A\u771F\u5B9E\u6570\u636E\uFF09</div>
        <textarea id="pprompt-${p.key}" rows="${p.key === "summary" ? 4 : 3}" style="width:100%;font-family:monospace;font-size:12px">${escapeHtml(prompts[p.key] != null ? prompts[p.key] : p.def)}</textarea>
      </div>`).join("");
      return `
      <div class="wm-card"><div class="wm-h">LLM \u8C03\u7528\u914D\u7F6E\uFF08\u7EDF\u4E00\uFF09</div>
        <div class="wm-hint">\u6240\u6709\u529F\u80FD\uFF08\u603B\u7ED3/\u5173\u7CFB/\u5267\u60C5/\u4E16\u754C\u89C2/\u7269\u54C1\uFF09\u5171\u7528\u8FD9\u4E00\u4E2A LLM \u914D\u7F6E\u3002\u9009\u62E9 <b>\u672C\u5730\u9152\u9986</b> \u5373\u7528\u9152\u9986\u5F53\u524D\u5BF9\u8BDD\u6E90\uFF1B\u9009\u62E9 <b>\u81EA\u5B9A\u4E49\u914D\u7F6E</b> \u53EF\u6307\u5B9A\u4EE3\u7406\u9884\u8BBE\u6216\u72EC\u7ACB API\u3002\u914D\u5B8C\u53EF\u70B9\u300C\u6D4B\u8BD5\u8FDE\u63A5\u300D\u9A8C\u8BC1\u53EF\u7528\u6027\u3002</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0">
          <span class="wm-h" style="margin:0">\u8C03\u7528\u6765\u6E90</span>
          <select id="llm-src" title="\u8C03\u7528\u6765\u6E90">
            <option value="local" ${c.source === "local" ? "selected" : ""}>\u672C\u5730\u9152\u9986(\u5F53\u524D\u6E90)</option>
            <option value="custom" ${c.source === "custom" ? "selected" : ""}>\u81EA\u5B9A\u4E49\u914D\u7F6E</option>
          </select>
        </div>
        <div id="llm-custom" style="${c.source === "custom" ? "" : "display:none"};margin-top:6px">
          <label class="wm-row">\u4EE3\u7406\u9884\u8BBE\u540D<input id="llm-preset" value="${escapeHtml(c.proxyPreset)}" placeholder="\u7559\u7A7A\u5219\u586B\u4E0B\u65B9 URL\uFF08\u9152\u9986\u4EE3\u7406\u9884\u8BBE\u540D\uFF09"/></label>
          <label class="wm-row">API URL<input id="llm-url" value="${escapeHtml(c.apiUrl)}" placeholder="https://api.openai.com/v1"/></label>
          <label class="wm-row">API Key<input id="llm-key" type="password" value="${escapeHtml(c.apiKey)}" placeholder="sk-..."/></label>
          <label class="wm-row">\u6A21\u578B\u540D<input id="llm-model" value="${escapeHtml(c.model)}" placeholder="\u5982 gpt-4o-mini"/></label>
          <label class="wm-row">\u8F93\u51FA Token \u4E0A\u9650<input id="llm-maxtok" type="number" min="50" max="4000" step="50" value="${Number(c.maxTokens) || 700}" title="\u9650\u5236\u6A21\u578B\u8F93\u51FA\u957F\u5EA6\uFF0C\u6240\u6709\u529F\u80FD\u5171\u7528\u6B64\u4E0A\u9650"/> <span class="wm-hint" style="margin:0">\u6240\u6709\u529F\u80FD\uFF08\u603B\u7ED3/\u5173\u7CFB/\u5267\u60C5/\u4E16\u754C\u89C2\uFF09\u5171\u7528\uFF0C\u6A21\u578B\u4F1A\u5728\u8BE5\u8303\u56F4\u5185\u5B8C\u6574\u8F93\u51FA</span></label>
        </div>
        <div class="wm-divider"></div>
        <div class="wm-h" style="margin-top:0">\u9884\u8BBE\u524D\u7F6E\uFF08\u62FC\u5728\u6211\u4EEC\u63D0\u793A\u8BCD\u4E4B\u524D\uFF09</div>
        <div class="wm-hint">\u53EF\u9009\u3002\u5F00\u542F\u540E\uFF0C\u4F1A\u5728\u6211\u4EEC\u81EA\u5DF1\u7F16\u5199\u7684\u63D0\u793A\u8BCD<b>\u524D\u9762</b>\u62FC\u63A5\u4E00\u6BB5\u300C\u524D\u7F6E\u300D\u3002<b>\u5BFC\u5165</b>\uFF1A\u76F4\u63A5\u7C98\u8D34/\u7F16\u8F91\u6587\u672C\uFF1B<b>\u8C03\u7528\u9152\u9986\u9884\u8BBE</b>\uFF1A\u76F4\u63A5\u5F15\u7528\u9152\u9986\u91CC\u5DF2\u4FDD\u5B58\u7684\u9884\u8BBE\uFF08\u53D6\u5176\u542F\u7528\u7684\u63D0\u793A\u8BCD\uFF09\u3002</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:6px 0">
          <label><input type="radio" name="pp-mode" value="none" ${pp.mode === "none" ? "checked" : ""}/> \u4E0D\u4F7F\u7528</label>
          <label><input type="radio" name="pp-mode" value="import" ${pp.mode === "import" ? "checked" : ""}/> \u5BFC\u5165\u6587\u672C</label>
          <label><input type="radio" name="pp-mode" value="preset" ${pp.mode === "preset" ? "checked" : ""}/> \u8C03\u7528\u9152\u9986\u9884\u8BBE</label>
        </div>
        <div id="pp-import" style="${pp.mode === "import" ? "" : "display:none"};margin-top:6px">
          <label class="wm-row" style="flex-direction:column;align-items:stretch">\u524D\u7F6E\u6587\u672C\uFF08\u53EF\u7F16\u8F91\uFF09
            <textarea id="pp-import-text" rows="4" style="width:100%;font-family:monospace">${escapeHtml(pp.importText || "")}</textarea>
          </label>
        </div>
        <div id="pp-preset" style="${pp.mode === "preset" ? "" : "display:none"};margin-top:6px">
          <label class="wm-row">\u9152\u9986\u5DF2\u4FDD\u5B58\u9884\u8BBE
            <select id="pp-preset-name">
              ${(presetNames || []).map((n) => `<option value="${escapeHtml(n)}" ${n === pp.presetName ? "selected" : ""}>${escapeHtml(n)}</option>`).join("") || '<option value="">\uFF08\u65E0\u53EF\u7528\u9884\u8BBE\uFF09</option>'}
            </select>
          </label>
        </div>
        <div class="wm-divider"></div>
        <div class="wm-h" style="margin-top:0">\u6269\u5C55\u63D0\u793A\u8BCD\uFF08\u5747\u53EF\u7F16\u8F91\uFF09</div>
        <div class="wm-hint">\u4E0B\u9762\u56DB\u5957\u63D0\u793A\u8BCD\u8D1F\u8D23\u300C\u603B\u7ED3 / \u5173\u7CFB / \u5267\u60C5 / \u4E16\u754C\u89C2\u300D\u7684\u5177\u4F53\u5199\u6CD5\uFF0C<b>\u76F4\u63A5\u6539\u5373\u53EF\u751F\u6548</b>\u3002\u53EF\u4FDD\u7559 <code>{{recent}}</code> \u7B49\u5360\u4F4D\u7B26\uFF0C\u8FD0\u884C\u65F6\u4F1A\u81EA\u52A8\u66FF\u6362\u6210\u771F\u5B9E\u6570\u636E\u3002</div>
        ${promptHtml}
      </div>`;
    }
    function renderCfg(body) {
      const s = WM.Settings.load();
      const tabs = [
        { key: "llm", label: "LLM \u8C03\u7528" },
        { key: "mem", label: "\u8BB0\u5FC6\u4E0E\u6CE8\u5165" },
        { key: "vec", label: "\u5411\u91CF\u4E0E\u91CD\u6392" },
        { key: "lore", label: "\u4E16\u754C\u4E66" },
        { key: "err", label: "\u9519\u8BEF\u62A5\u544A" }
      ];
      const active = WM._cfgTab || "llm";
      body.innerHTML = `
      <div class="wm-subtabs" id="cfg-tabs">
        ${tabs.map((t) => `<button data-tab="${t.key}" class="${t.key === active ? "active" : ""}">${t.label}</button>`).join("")}
      </div>
      <div id="cfg-pane">${renderPaneLlm(s)}</div>
      <div class="wm-actions" style="margin-top:12px">
        <button id="c-test" class="wm-btn">\u6D4B\u8BD5\u8FDE\u63A5</button>
        <button id="c-save" class="wm-btn primary">\u4FDD\u5B58\u8BBE\u7F6E</button>
      </div>
      <div id="c-test-result" class="wm-test-box"></div>`;
      body.querySelector("#cfg-tabs").querySelectorAll("button").forEach((btn) => {
        btn.onclick = () => {
          const key = btn.dataset.tab;
          syncPaneToSettings(body, s);
          WM._cfgTab = key;
          body.querySelectorAll("#cfg-tabs button").forEach((b) => b.classList.toggle("active", b === btn));
          const pane = body.querySelector("#cfg-pane");
          if (key === "llm") pane.innerHTML = renderPaneLlm(s);
          else if (key === "mem") pane.innerHTML = renderPaneMemory(s);
          else if (key === "vec") pane.innerHTML = renderPaneVector(s);
          else if (key === "lore") pane.innerHTML = renderPaneLore(s);
          else if (key === "err") pane.innerHTML = renderPaneErrors(s);
          bindPaneEvents(body, s);
        };
      });
      bindPaneEvents(body, s);
      const srcSel = body.querySelector("#llm-src");
      const customBox = body.querySelector("#llm-custom");
      if (srcSel && customBox) {
        customBox.style.display = srcSel.value === "custom" ? "" : "none";
        srcSel.onchange = () => {
          customBox.style.display = srcSel.value === "custom" ? "" : "none";
        };
      }
      const ppImport = body.querySelector("#pp-import");
      const ppPreset = body.querySelector("#pp-preset");
      const syncPp = () => {
        const m = (body.querySelector('input[name="pp-mode"]:checked') || {}).value || "none";
        if (ppImport) ppImport.style.display = m === "import" ? "" : "none";
        if (ppPreset) ppPreset.style.display = m === "preset" ? "" : "none";
      };
      body.querySelectorAll('input[name="pp-mode"]').forEach((r) => {
        r.onchange = syncPp;
      });
      syncPp();
    }
    function syncPaneToSettings(body, s) {
      const q = (sel) => body.querySelector(sel);
      if (q("#llm-src")) {
        s.llmConfig = {
          source: q("#llm-src").value,
          proxyPreset: q("#llm-preset").value.trim(),
          apiUrl: q("#llm-url").value.trim(),
          apiKey: q("#llm-key").value.trim(),
          model: q("#llm-model").value.trim(),
          maxTokens: Math.max(50, parseInt(q("#llm-maxtok").value, 10) || 700)
        };
        s.presetPrefix = {
          mode: (q('input[name="pp-mode"]:checked') || {}).value || "none",
          importText: q("#pp-import-text") ? q("#pp-import-text").value : "",
          presetName: q("#pp-preset-name") ? q("#pp-preset-name").value : ""
        };
        s.prompts = {
          summary: q("#pprompt-summary") ? q("#pprompt-summary").value : s.prompts.summary,
          relations: q("#pprompt-relations") ? q("#pprompt-relations").value : s.prompts.relations,
          plot: q("#pprompt-plot") ? q("#pprompt-plot").value : s.prompts.plot,
          worldview: q("#pprompt-worldview") ? q("#pprompt-worldview").value : s.prompts.worldview
        };
      }
      if (q("#c-vec")) {
        s.vectorEnabled = q("#c-vec").checked;
        s.rerankEnabled = q("#c-rerank").checked;
        s.injectMemories = q("#c-inj").checked;
        s.injectWorld = q("#c-injw").checked;
      }
      if (q("#c-emb-url")) {
        s.embeddingBaseUrl = q("#c-emb-url").value;
        s.embeddingApiKey = q("#c-emb-key").value;
        s.embeddingModel = q("#c-emb-model").value;
        s.rerankBaseUrl = q("#c-rk-url").value;
        s.rerankApiKey = q("#c-rk-key").value;
        s.rerankModel = q("#c-rk-model").value;
        s.takeoverEmbedding = q("#c-take-emb").checked;
        s.takeoverRerank = q("#c-take-re").checked;
      }
      if (q("#c-lore")) {
        s.lorebookName = q("#c-lore").value.trim();
        s.worldToLorebook = q("#c-wlore").checked;
      }
    }
    function bindPaneEvents(body, s) {
      const pane = body.querySelector("#cfg-pane");
      if (pane) pane.querySelectorAll("input, textarea, select").forEach((el) => {
        el.addEventListener("change", () => syncPaneToSettings(body, s));
        el.addEventListener("input", () => syncPaneToSettings(body, s));
      });
      const srcSel = body.querySelector("#llm-src");
      const customBox = body.querySelector("#llm-custom");
      if (srcSel && customBox) srcSel.onchange = () => {
        customBox.style.display = srcSel.value === "custom" ? "" : "none";
      };
      const ppImport = body.querySelector("#pp-import");
      const ppPreset = body.querySelector("#pp-preset");
      body.querySelectorAll('input[name="pp-mode"]').forEach((r) => {
        r.onchange = () => {
          const m = (body.querySelector('input[name="pp-mode"]:checked') || {}).value || "none";
          if (ppImport) ppImport.style.display = m === "import" ? "" : "none";
          if (ppPreset) ppPreset.style.display = m === "preset" ? "" : "none";
        };
      });
      const saveBtn = body.querySelector("#c-save");
      if (saveBtn) saveBtn.onclick = () => {
        syncPaneToSettings(body, s);
        WM.Settings.save(s);
        if (WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook();
        toast("\u{1F33F} \u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
      };
      const testBtn = body.querySelector("#c-test");
      if (testBtn) testBtn.onclick = async () => {
        syncPaneToSettings(body, s);
        const box = body.querySelector("#c-test-result");
        const tmpLlm = s.llmConfig || { source: "local" };
        const tmp = Object.assign({}, s);
        box.innerHTML = '<div class="wm-test-item">\u23F3 \u6D4B\u8BD5\u4E2D\u2026</div>';
        const rows = [];
        const add = (name, r, detail) => {
          const ok = r && r.success;
          rows.push(`<div class="wm-test-item ${ok ? "wm-ok" : "wm-bad"}">${ok ? "\u2705" : "\u274C"} ${name}${ok ? "\uFF1A" + (detail || "") : "\uFF1A" + (r && r.error || "\u5931\u8D25")}</div>`);
        };
        try {
          const r = await WM.LLMClient.testConnection({ profile: tmpLlm });
          add("LLM(" + (tmpLlm.source === "local" ? "\u672C\u5730\u9152\u9986" : "\u81EA\u5B9A\u4E49") + ")", r, "");
        } catch (e) {
          add("LLM(\u7EDF\u4E00\u914D\u7F6E)", { success: false }, String(e.message || e));
        }
        try {
          const wbOk = WM.Worldbook && WM.Worldbook.available && WM.Worldbook.available();
          if (wbOk) {
            const b = await WM.Worldbook.ensureLorebook();
            add("\u4E16\u754C\u4E66(\u9152\u9986)", { success: b }, b ? "\u5DF2\u5C31\u7EEA\uFF1A" + WM.Worldbook.targetName() : "");
          } else add("\u4E16\u754C\u4E66(\u9152\u9986)", { success: false }, "TavernHelper \u4E0D\u53EF\u7528");
        } catch (e) {
          add("\u4E16\u754C\u4E66(\u9152\u9986)", { success: false }, String(e.message || e));
        }
        try {
          if (tmp.embeddingBaseUrl || tmp.embeddingApiKey || tmp.embeddingModel)
            add("Embedding(\u5411\u91CF)", await WM.EmbeddingClient.testConnection(tmp), "");
          else add("Embedding(\u5411\u91CF)", { success: true }, "\u672A\u586B\uFF0C\u8DF3\u8FC7\uFF08\u53EF\u7559\u7A7A\u7528\u9152\u9986\u5185\u7F6E\uFF09");
        } catch (e) {
          add("Embedding(\u5411\u91CF)", { success: false }, String(e.message || e));
        }
        try {
          if (tmp.rerankEnabled || tmp.rerankBaseUrl || tmp.rerankApiKey || tmp.rerankModel)
            add("Rerank(\u91CD\u6392)", await WM.RerankClient.testConnection(tmp), "");
          else add("Rerank(\u91CD\u6392)", { success: true }, "\u672A\u586B\uFF0C\u8DF3\u8FC7\uFF08\u53EF\u7559\u7A7A\u7528\u9152\u9986\u5185\u7F6E\uFF09");
        } catch (e) {
          add("Rerank(\u91CD\u6392)", { success: false }, String(e.message || e));
        }
        box.innerHTML = rows.join("");
      };
    }
    function renderPaneMemory(s) {
      return `<div class="wm-card">
      <div class="wm-h">\u8BB0\u5FC6\u4E0E\u6CE8\u5165</div>
      <div class="wm-hint">\u63A7\u5236\u8BB0\u5FC6\u5982\u4F55\u88AB\u68C0\u7D22\u3001\u91CD\u6392\u5E8F\u5E76\u6CE8\u5165\u5230\u5BF9\u8BDD\u4E0A\u4E0B\u6587\u4E2D\uFF0C\u8BA9\u89D2\u8272\u771F\u6B63\u300C\u8BB0\u5F97\u300D\u3002</div>
      <label class="wm-row"><input type="checkbox" id="c-vec" ${s.vectorEnabled ? "checked" : ""}/> \u542F\u7528\u5411\u91CF\u68C0\u7D22</label>
      <label class="wm-row"><input type="checkbox" id="c-rerank" ${s.rerankEnabled ? "checked" : ""}/> \u542F\u7528\u91CD\u6392\u5E8F(Rerank)</label>
      <label class="wm-row"><input type="checkbox" id="c-inj" ${s.injectMemories ? "checked" : ""}/> \u6CE8\u5165\u8BB0\u5FC6\u5230\u4E0A\u4E0B\u6587\uFF08\u786E\u4FDD\u89D2\u8272\u771F\u7684\u8BB0\u5F97\uFF09</label>
      <label class="wm-row"><input type="checkbox" id="c-injw" ${s.injectWorld ? "checked" : ""}/> \u6CE8\u5165\u65F6\u542B\u4E16\u754C\u89C2</label>
      <div class="wm-hint">\u5411\u91CF / \u91CD\u6392\u7684\u5177\u4F53\u670D\u52A1\u914D\u7F6E\u5728\u300C\u5411\u91CF\u4E0E\u91CD\u6392\u300D\u9762\u677F\u3002</div>
    </div>`;
    }
    function renderPaneVector(s) {
      return `<div class="wm-card">
      <div class="wm-h">Embedding\uFF08\u5411\u91CF\uFF09\u914D\u7F6E</div>
      <label class="wm-row">Base URL<input id="c-emb-url" value="${s.embeddingBaseUrl}" placeholder="https://api.openai.com/v1"/></label>
      <label class="wm-row">API Key<input id="c-emb-key" type="password" value="${s.embeddingApiKey}" placeholder="\u53EF\u9009"/></label>
      <label class="wm-row">\u6A21\u578B<input id="c-emb-model" value="${s.embeddingModel}" placeholder="text-embedding-3-small"/></label>
      <div class="wm-h">Rerank\uFF08\u91CD\u6392\u5E8F\uFF09\u914D\u7F6E</div>
      <label class="wm-row">Base URL<input id="c-rk-url" value="${s.rerankBaseUrl}" placeholder="https://api.siliconflow.cn/v1/rerank"/></label>
      <label class="wm-row">API Key<input id="c-rk-key" type="password" value="${s.rerankApiKey}" placeholder="\u53EF\u9009"/></label>
      <label class="wm-row">\u6A21\u578B<input id="c-rk-model" value="${s.rerankModel}" placeholder="BAAI/bge-reranker-v2-m3"/></label>
      <div class="wm-divider"></div>
      <div class="wm-h">\u63A5\u7BA1\u9152\u9986\u5411\u91CF / \u91CD\u6392\u5E8F</div>
      <label class="wm-row"><input type="checkbox" id="c-take-emb" ${s.takeoverEmbedding ? "checked" : ""}/> \u63A5\u7BA1\u5411\u91CF\u68C0\u7D22\uFF08\u7528\u6211\u4EEC\u81EA\u5DF1\u7684\u5411\u91CF\u53EC\u56DE\u4E16\u754C\u4E66\u6761\u76EE\uFF09</label>
      <label class="wm-row"><input type="checkbox" id="c-take-re" ${s.takeoverRerank ? "checked" : ""}/> \u63A5\u7BA1\u91CD\u6392\u5E8F\uFF08\u7528\u6211\u4EEC\u81EA\u5DF1\u7684 Rerank \u91CD\u6392\u53EC\u56DE\u7ED3\u679C\uFF09</label>
    </div>`;
    }
    function renderPaneLore(s) {
      return `<div class="wm-card">
      <div class="wm-h">\u4E16\u754C\u4E66\uFF08\u6570\u636E\u6309\u89D2\u8272\u5361\u9694\u79BB\uFF09</div>
      <div class="wm-hint">\u8BB0\u5FC6\u3001\u5173\u7CFB\u3001\u5267\u60C5\u4F1A\u6309\u5F53\u524D\u89D2\u8272\u5361\u5199\u5165\u5BF9\u5E94\u4E16\u754C\u4E66\uFF0C\u4E92\u4E0D\u4E32\u6863\u3002</div>
      <label class="wm-row">\u4E16\u754C\u4E66\u540D<input id="c-lore" value="${s.lorebookName}" placeholder="WarmMemo"/></label>
      <label class="wm-row"><input type="checkbox" id="c-wlore" ${s.worldToLorebook ? "checked" : ""}/> \u62C6\u5206\u5199\u5165\u4E16\u754C\u4E66\u6761\u76EE\uFF08\u603B\u7ED3/\u7269\u54C1/\u5173\u7CFB\u5404\u81EA\u72EC\u7ACB\u6761\u76EE\uFF09</label>
    </div>`;
    }
    function renderPaneErrors(s) {
      const list = WM.ErrLog && WM.ErrLog.get ? WM.ErrLog.get() : [];
      let pane = `<div class="wm-card">
      <div class="wm-h">\u{1F41E} \u9519\u8BEF\u4E0E\u5F02\u5E38\u62A5\u544A</div>
      <div class="wm-hint">\u6240\u6709\u529F\u80FD\uFF08\u603B\u7ED3/\u5173\u7CFB/\u5267\u60C5/\u4E16\u754C\u89C2/\u7269\u54C1/\u4E16\u754C\u4E66\u7B49\uFF09\u8FD0\u884C\u65F6\u629B\u51FA\u7684\u9519\u8BEF\u4E0E\u5F02\u5E38\u90FD\u4F1A\u81EA\u52A8\u8BB0\u5F55\u5728\u6B64\uFF0C\u4FBF\u4E8E\u6392\u67E5\u3002</div>`;
      if (!list.length) {
        pane += `<div class="wm-row wm-muted">\u5F53\u524D\u5BF9\u8BDD\u6682\u65E0\u8BB0\u5F55\u7684\u9519\u8BEF\u3002</div>`;
      } else {
        pane += `<div class="wm-row wm-muted">\u5171 ${list.length} \u6761\uFF08\u6700\u65B0\u5728\u524D\uFF09\u3002</div>`;
        pane += `<div class="wm-err-list">`;
        for (const it of list) {
          const t = new Date(it.ts);
          const time = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
          pane += `<details class="wm-fold wm-err-item">
          <summary><span class="wm-err-scope">[${escapeHtml(it.scope)}]</span> ${escapeHtml(it.message)} <span class="wm-ts">${time}</span></summary>
          ${it.extra ? `<div class="wm-err-extra">\u4E0A\u4E0B\u6587\uFF1A${escapeHtml(JSON.stringify(it.extra))}</div>` : ""}
          ${it.stack ? `<pre class="wm-err-stack">${escapeHtml(it.stack)}</pre>` : ""}
        </details>`;
        }
        pane += `</div>`;
        pane += `<div class="wm-row"><button id="err-clear" class="wm-btn">\u6E05\u7A7A\u672C\u62A5\u544A</button></div>`;
      }
      pane += `</div>`;
      setTimeout(() => {
        const btn = document.getElementById("err-clear");
        if (btn) btn.onclick = async () => {
          if (WM.ErrLog && WM.ErrLog.clear) {
            await WM.ErrLog.clear();
            renderCfg(s);
          }
        };
      }, 0);
      return pane;
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
        const names = window.eventSource && window.eventSource.eventNames ? window.eventSource.eventNames : {};
        const evReceived = names.MESSAGE_RECEIVED || "MESSAGE_RECEIVED";
        const evSent = names.MESSAGE_SENT || "MESSAGE_SENT";
        es.on(evReceived, autoSummaryHook);
        es.on(evSent, autoSummaryHook);
      }
    }
    let _lastAutoAt = 0;
    async function autoSummaryHook() {
      const s = WM.Settings.load();
      if (!s.autoSummaryEnabled) return;
      const now = Date.now();
      if (now - _lastAutoAt < 1200) return;
      _lastAutoAt = now;
      setTimeout(async () => {
        try {
          const r = await WM.Summary.triggerSummary(s);
          if (r && r.ok) {
            if (s.autoHideFloors && WM.FloorHider && WM.FloorHider.hideUntil) {
              await WM.FloorHider.hideUntil(r.range[1]);
            }
            toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u5DF2\u63D0\u70BC ${r.count} \u6761\u8BB0\u5FC6\uFF08\u697C\u5C42 ${r.range[0]}-${r.range[1]}\uFF09`);
          } else if (r && !r.ok) {
            toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u603B\u7ED3\u672A\u6267\u884C\uFF08${r.reason}\uFF09`);
          }
        } catch (e) {
          toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u603B\u7ED3\u5931\u8D25 - ${e.message || e}`);
        }
      }, 400);
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
    WM.Launcher = { init, renderTab, renderCfg, renderWorld, renderAuto, renderMem, renderRel, renderItem, renderPlot };
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
