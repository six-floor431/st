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
      // 向量(Embedding)配置：直接填 Base URL 自适应任意 OpenAI 兼容/本地反代服务（不再选厂家）
      embeddingBaseUrl: "",
      // 任意 Base URL：如 http://127.0.0.1:8080/vec/v1/embeddings、https://api.siliconflow.cn/v1、https://xxx.openai.azure.com
      embeddingApiKey: "",
      embeddingModel: "text-embedding-3-small",
      rerankEnabled: false,
      // 重排序(Rerank)配置：直接填 Base URL 自适应任意 OpenAI 兼容服务
      rerankBaseUrl: "",
      rerankApiKey: "",
      rerankModel: "BAAI/bge-reranker-v2-m3",
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
      //   直接按填写的 Base URL 走 OpenAI 兼容 /chat/completions 协议请求，
      //   不再依赖酒馆的 generateRaw / generate（已彻底移除"本地酒馆源"调用路径）。
      //   只发送我们自己的自定义提示词（system + user），不携带酒馆预设/角色卡/聊天历史。
      //   该配置在设置面板可一键「测试连接」验证 API 可用。
      llmConfig: {
        source: "local",
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
        plot: "\u4F60\u662F\u5267\u60C5\u68B3\u7406\u8005\u3002\u8BF7\u57FA\u4E8E\u300C\u5173\u7CFB\u300D\u548C\u300C\u6700\u8FD1\u5BF9\u8BDD\u300D\uFF0C\u68B3\u7406\u8FD9\u4E00\u6BB5\u53D1\u751F\u7684\u5267\u60C5\u3002\n\n\u6BCF\u884C\u4E00\u6761\uFF0C\u4E25\u683C\u7528\u7AD6\u7EBF\u5206\u9694\uFF0C\u683C\u5F0F\uFF1A\n\u65F6\u95F4\uFF5C\u6807\u9898\uFF5C\u5185\u5BB9\uFF5C\u72B6\u6001\n\n\u8BF4\u660E\uFF1A\n- \u65F6\u95F4\uFF1A\u5267\u60C5\u5185\u7684\u65F6\u95F4\u70B9\uFF08\u5982\u300C\u7B2C\u4E09\u65E5\u6E05\u6668\u300D\u300C\u5EFA\u5143\u4E03\u5E74\u6625\u300D\uFF09\u3002\u82E5\u5BF9\u8BDD\u672A\u63D0\u53CA\uFF0C\u5199\u300C\u672A\u6807\u6CE8\u300D\u3002\n- \u6807\u9898\uFF1A\u8FD9\u6BB5\u5267\u60C5\u7684\u7B80\u77ED\u547D\u540D\uFF0C\u4E0D\u8D85\u8FC7 15 \u5B57\u3002\n- \u5185\u5BB9\uFF1A\u8FD9\u6BB5\u5267\u60C5\u53D1\u751F\u4E86\u4EC0\u4E48\uFF0C\u4E00\u5230\u4E24\u53E5\u8BDD\u3002\n- \u72B6\u6001\uFF1A\u53EA\u80FD\u586B \u8FDB\u884C\u4E2D / \u5DF2\u5B8C\u7ED3 / \u5DF2\u5E9F\u5F03 \u4E09\u8005\u4E4B\u4E00\u3002\n\n\u4E0D\u8981\u8F93\u51FA\u8868\u5934\uFF0C\u4E0D\u8981\u7F16\u53F7\uFF0C\u4E0D\u8981\u989D\u5916\u8BF4\u660E\u3002\u6700\u591A 8 \u6761\u3002\n\n\u3010\u5173\u7CFB\u3011\n{{relations}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}",
        worldview: '\u4F60\u662F\u4E16\u754C\u89C2\u63D0\u70BC\u8005\u3002\u8BF7\u57FA\u4E8E\u3010\u5267\u60C5\u7EBF\u3011\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u63D0\u70BC\u8FD9\u4E2A\u6545\u4E8B\u6240\u5904\u4E16\u754C\u672C\u8EAB\u7684\u300C\u5E95\u5C42\u89C4\u5219\u8BBE\u5B9A\u300D\u3002\n\n\u4E25\u683C\u6309\u4EE5\u4E0B\u683C\u5F0F\u8F93\u51FA\uFF0C\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u591A\u4F59\u8BF4\u660E\uFF1A\n\n\u4E16\u754C\u540D\uFF1A\uFF08\u8FD9\u4E2A\u4E16\u754C/\u5927\u9646/\u57CE\u5E02\u53EB\u4EC0\u4E48\uFF0C\u6CA1\u6709\u5C31\u8D77\u4E00\u4E2A\u8D34\u5207\u7684\uFF09\n\u4E16\u754C\u7C7B\u578B\uFF1A\uFF08\u7528\u4E00\u4E2A\u8BCD\u6982\u62EC\uFF0C\u5982\uFF1A\u4FEE\u4ED9\u4E16\u754C\u3001\u8D5B\u535A\u670B\u514B\u3001\u84B8\u6C7D\u670B\u514B\u3001\u73B0\u4EE3\u90FD\u5E02\u3001\u5251\u4E0E\u9B54\u6CD5\uFF09\n\u7B80\u8FF0\uFF1A\uFF08\u4E00\u5230\u4E24\u53E5\u8BDD\u8BF4\u660E\u8FD9\u662F\u4E2A\u4EC0\u4E48\u6837\u7684\u4E16\u754C\uFF09\n\n## \u8BBE\u5B9A\u6807\u9898\u4E00\n\uFF08\u56F4\u7ED5"\u4E16\u754C\u7C7B\u578B"\u5C55\u5F00\u7684\u5177\u4F53\u89C4\u5219\u4E0E\u6CD5\u5219\u3002\u4F8B\u5982\u4FEE\u4ED9\u4E16\u754C\u5C31\u5199\u4FEE\u70BC\u4F53\u7CFB\u7684\u5883\u754C\u5212\u5206\u3001\u7075\u6C14\u8FD0\u884C\u6CD5\u5219\uFF1B\u8D5B\u535A\u670B\u514B\u5C31\u5199\u4E49\u4F53\u6539\u9020\u89C4\u5219\u3001\u4F01\u4E1A\u4E0E\u8D22\u9600\u7684\u8FD0\u884C\u6CD5\u5219\uFF09\n\n## \u8BBE\u5B9A\u6807\u9898\u4E8C\n\uFF08\u5185\u5BB9\uFF09\n\n\u8981\u6C42\uFF1A\n1. \u300C\u4E16\u754C\u8BBE\u5B9A\u300D\u53EA\u5199\u4E16\u754C\u672C\u8EAB\u7684\u901A\u7528\u89C4\u5219\u3001\u6CD5\u5219\u3001\u5386\u53F2\u80CC\u666F\u3001\u529B\u91CF\u4F53\u7CFB\uFF0C\u7EDD\u4E0D\u5199\u5355\u4E2A\u5177\u4F53\u7269\u54C1\u3001\u5355\u4E2A\u5177\u4F53\u89D2\u8272\u59D3\u540D\u3001\u5355\u4E2A\u5177\u4F53\u5730\u70B9\u540D\u79F0\u3002\n2. \u300C\u4E16\u754C\u7C7B\u578B\u300D\u51B3\u5B9A\u4E86\u4E0B\u9762\u5199\u4EC0\u4E48\u3002\u4FEE\u4ED9\u4E16\u754C\u5C31\u5FC5\u987B\u5199\u4FEE\u70BC\u4F53\u7CFB\u3001\u7075\u6C14\u3001\u6CD5\u5219\u7B49\uFF0C\u4E0D\u8981\u5199\u65E0\u5173\u5185\u5BB9\u3002\n3. \u6BCF\u6761\u8BBE\u5B9A\u8981\u5177\u4F53\u3001\u53EF\u88AB\u540E\u7EED\u5267\u60C5\u5F15\u7528\uFF0C\u4E0D\u8981\u7A7A\u6CDB\u3002\n4. \u8F93\u51FA 3-6 \u6761\u8BBE\u5B9A\u6761\u76EE\u3002\n\n\u3010\u5267\u60C5\u7EBF\u3011\n{{plot}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}',
        itemExtract: "\u4F60\u662F\u7269\u54C1\u8BB0\u5F55\u5458\u3002\u7269\u54C1\u5FC5\u987B\u4E0E\u300C\u89D2\u8272\u300D\u548C\u300C\u5267\u60C5\u300D\u4EA7\u751F\u5173\u8054\uFF0C\u5B64\u7ACB\u7684\u666E\u901A\u9053\u5177\u4E0D\u8981\u8BB0\u5F55\u3002\n\n\u8BF7\u57FA\u4E8E\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u62BD\u53D6\u672C\u6BB5\u51FA\u73B0\u7684\u5177\u6709\u5267\u60C5\u610F\u4E49\u7684\u7269\u54C1/\u9053\u5177/\u4FE1\u7269/\u88C5\u5907\u3002\n\n\u6BCF\u884C\u4E00\u6761\uFF0C\u4E25\u683C\u7528\u7AD6\u7EBF\u5206\u9694\uFF0C\u683C\u5F0F\uFF1A\n\u7269\u54C1\u540D\uFF5C\u4F5C\u7528\uFF5C\u6301\u6709\u8005\uFF5C\u5173\u8054\u5267\u60C5\uFF5C\u6765\u5386\n\n\u8BF4\u660E\uFF1A\n- \u7269\u54C1\u540D\uFF1A\u7269\u54C1\u7684\u540D\u79F0\u3002\n- \u4F5C\u7528\uFF1A\u8FD9\u4EF6\u7269\u54C1\u6709\u4EC0\u4E48\u7528\u9014\u3001\u6548\u679C\u6216\u8C61\u5F81\u610F\u4E49\uFF08\u5FC5\u586B\uFF0C\u4E0D\u53EF\u5199\u300C\u65E0\u300D\uFF09\u3002\n- \u6301\u6709\u8005\uFF1A\u73B0\u5728\u5728\u54EA\u4E2A\u89D2\u8272\u624B\u4E0A\u3002\u5FC5\u987B\u662F\u3010\u5267\u60C5\u7EBF\u3011\u6216\u5BF9\u8BDD\u4E2D\u51FA\u73B0\u8FC7\u7684\u89D2\u8272\u540D\uFF1B\u786E\u5B9E\u4E0D\u660E\u5199\u300C\u672A\u77E5\u300D\u3002\n- \u5173\u8054\u5267\u60C5\uFF1A\u8FD9\u4EF6\u7269\u54C1\u7275\u6D89\u5230\u54EA\u6761\u5267\u60C5\u7EBF\uFF0C\u8BF7\u4ECE\u4E0B\u9762\u3010\u5DF2\u77E5\u5267\u60C5\u7EBF\u3011\u7684\u6807\u9898\u4E2D\u6311\u9009\uFF0C\u53EF\u591A\u4E2A\u7528\u987F\u53F7\u5206\u9694\uFF1B\u90FD\u4E0D\u6CBE\u8FB9\u5199\u300C\u65E0\u300D\u3002\n- \u6765\u5386\uFF1A\u4ECE\u54EA\u91CC\u83B7\u5F97\u7684\uFF0C\u4E0D\u660E\u5199\u300C\u672A\u77E5\u300D\u3002\n\n\u5224\u65AD\u6807\u51C6\uFF1A\u53EA\u8BB0\u5F55\u6EE1\u8DB3\u4EE5\u4E0B\u4EFB\u4E00\u6761\u4EF6\u7684\u7269\u54C1\u2014\u2014\n(a) \u88AB\u67D0\u4E2A\u89D2\u8272\u660E\u786E\u6301\u6709\u6216\u4E89\u593A\uFF1B\n(b) \u63A8\u52A8\u4E86\u67D0\u6761\u5267\u60C5\u7EBF\u7684\u53D1\u5C55\uFF1B\n(c) \u662F\u89D2\u8272\u5173\u7CFB\u6216\u8EAB\u4EFD\u7684\u4FE1\u7269\u3002\n\n\u4E0D\u8981\u8F93\u51FA\u8868\u5934\uFF0C\u4E0D\u8981\u7F16\u53F7\uFF0C\u4E0D\u8981\u989D\u5916\u8BF4\u660E\u3002\u6700\u591A 8 \u6761\u3002\n\n\u3010\u5DF2\u77E5\u5267\u60C5\u7EBF\u3011\n{{plot}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}"
      }
    };
    function load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return Object.assign({}, DEFAULTS);
        const s = Object.assign({}, DEFAULTS, JSON.parse(raw));
        if (!s.llmConfig) {
          s.llmConfig = { source: "local", apiUrl: "", apiKey: "", model: "" };
          const profiles = s.llmProfiles;
          if (profiles && profiles.summary) {
            s.llmConfig = Object.assign(s.llmConfig, profiles.summary);
          } else if (s.summaryBaseUrl || s.summaryApiKey || s.summaryModel) {
            s.llmConfig = {
              source: s.summaryBaseUrl || s.summaryApiKey ? "custom" : "local",
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
    function exportJSON() {
      const list = load();
      return JSON.stringify({ type: "warmmemo_errors", exportedAt: Date.now(), count: list.length, items: list }, null, 2);
    }
    function toText() {
      const list = load();
      if (!list.length) return "\uFF08\u6682\u65E0\u9519\u8BEF\u8BB0\u5F55\uFF09";
      return list.slice().reverse().map((it) => {
        const t = new Date(it.ts).toLocaleString("zh-CN");
        let s = `[${it.scope}] ${t}
${it.message}`;
        if (it.extra) s += `
\u4E0A\u4E0B\u6587: ${JSON.stringify(it.extra)}`;
        if (it.stack) s += `
\u6808: ${it.stack}`;
        return s;
      }).join("\n\n" + "-".repeat(40) + "\n\n");
    }
    WM.ErrLog = { add, get, clear, last, exportJSON, toText };
  })();

  // src/config/debug-log.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const MAX = 30;
    const store = {
      llm: [],
      embedding: [],
      rerank: []
    };
    function push(kind, entry) {
      const arr = store[kind] || (store[kind] = []);
      arr.push(Object.assign({ ts: Date.now() }, entry));
      while (arr.length > MAX) arr.shift();
    }
    function logRequest(kind, data) {
      push(kind, { dir: "request", data });
    }
    function logResponse(kind, data) {
      push(kind, { dir: "response", data });
    }
    function logError(kind, data) {
      push(kind, { dir: "error", data });
    }
    function get(kind) {
      return (store[kind] || []).slice();
    }
    function clear(kind) {
      if (kind) store[kind] = [];
      else {
        store.llm = [];
        store.embedding = [];
        store.rerank = [];
      }
    }
    WM.DebugLog = { logRequest, logResponse, logError, get, clear, MAX };
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
        // 物品：name=名称 / desc=作用 / owner=持有者；relatedPlots 关联剧情线，origin 来历
        items: [],
        // [{id, name, desc, owner, relatedPlots:[], origin, ts}]
        // 剧情线：time=剧情内时间（最左列显示），ts=记录时间戳（排序兜底）
        plots: [],
        // [{id, title, summary, time, ts, status:'active'|'done'|'abandon'}]
        world: "",
        // 世界观设定文本（旧版兼容 / 也作为「世界简述」）
        worldMeta: { name: "", kind: "", desc: "" },
        // 世界名 / 世界类型 / 一句话简述
        worldSections: [],
        // 分条设定 [{id, title, body, ts}]
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
        const s = Object.assign(base, obj);
        if (!s.worldMeta || typeof s.worldMeta !== "object") s.worldMeta = { name: "", kind: "", desc: "" };
        if (!Array.isArray(s.worldSections)) s.worldSections = [];
        s.items = (Array.isArray(s.items) ? s.items : []).map((it) => Object.assign(
          { id: "it_" + Math.random().toString(36).slice(2), name: "", desc: "", owner: "", relatedPlots: [], origin: "", ts: Date.now() },
          it,
          { relatedPlots: Array.isArray(it && it.relatedPlots) ? it.relatedPlots : [] }
        ));
        s.plots = (Array.isArray(s.plots) ? s.plots : []).map((p) => Object.assign(
          { id: "pl_" + Math.random().toString(36).slice(2), title: "", summary: "", time: "", status: "active", ts: Date.now() },
          p
        ));
        return s;
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
    let _dispatching = null;
    let _dispatchPending = false;
    async function dispatchLorebook() {
      if (_dispatching) {
        _dispatchPending = true;
        return _dispatching;
      }
      _dispatching = (async () => {
        try {
          do {
            _dispatchPending = false;
            await doDispatch();
          } while (_dispatchPending);
        } finally {
          _dispatching = null;
        }
      })();
      return _dispatching;
    }
    async function doDispatch() {
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
      const plotTitleById = {};
      for (const p of s.plots) plotTitleById[p.id] = p.title;
      for (const it of s.items) {
        if (!it.name) continue;
        const relNames = (it.relatedPlots || []).map((pid) => plotTitleById[pid] || pid).filter(Boolean);
        const lines = [`\u7269\u54C1\uFF1A${it.name}`];
        if (it.desc) lines.push(`\u4F5C\u7528\uFF1A${it.desc}`);
        if (it.owner) lines.push(`\u6301\u6709\u8005\uFF1A${it.owner}`);
        if (it.origin) lines.push(`\u6765\u5386\uFF1A${it.origin}`);
        if (relNames.length) lines.push(`\u5173\u8054\u5267\u60C5\uFF1A${relNames.join("\u3001")}`);
        const keys = [it.name];
        if (it.owner) keys.push(it.owner);
        for (const n of relNames) keys.push(n);
        await WM.Worldbook.writeEntry({
          kind: "item",
          sourceId: "item::" + it.id,
          title: "\u7269\u54C1\xB7" + it.name,
          content: lines.join("\n"),
          keys: Array.from(new Set(keys.filter(Boolean))),
          strategy: "selective"
        });
      }
      for (const p of s.plots) {
        if (!p.title && !p.summary) continue;
        const lines = [];
        if (p.time) lines.push(`\u65F6\u95F4\uFF1A${p.time}`);
        if (p.summary) lines.push(p.summary);
        const stat = p.status === "done" ? "\u5DF2\u5B8C\u7ED3" : p.status === "abandon" ? "\u5DF2\u5E9F\u5F03" : "\u8FDB\u884C\u4E2D";
        lines.push(`\u72B6\u6001\uFF1A${stat}`);
        await WM.Worldbook.writeEntry({
          kind: "plot",
          sourceId: "plot::" + p.id,
          title: "\u5267\u60C5\xB7" + (p.title || p.time || p.id),
          content: lines.join("\n"),
          keys: [p.title].filter(Boolean),
          strategy: p.status === "active" ? "constant" : "selective"
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
      const wm = s.worldMeta || {};
      const headLines = [];
      if (wm.name) headLines.push(`\u4E16\u754C\u540D\uFF1A${wm.name}`);
      if (wm.kind) headLines.push(`\u4E16\u754C\u7C7B\u578B\uFF1A${wm.kind}`);
      if (wm.desc) headLines.push(wm.desc);
      if (!headLines.length && s.world && s.world.trim()) headLines.push(s.world.trim());
      if (headLines.length) {
        await WM.Worldbook.writeEntry({
          kind: "world",
          sourceId: "world::main",
          title: "\u4E16\u754C\u89C2\xB7" + (wm.name || "\u603B\u7EB2"),
          content: headLines.join("\n"),
          strategy: "constant"
        });
      }
      for (const w of s.worldSections || []) {
        if (!w.title && !w.body) continue;
        await WM.Worldbook.writeEntry({
          kind: "world",
          sourceId: "worldsec::" + w.id,
          title: "\u8BBE\u5B9A\xB7" + (w.title || w.id),
          content: `${w.title ? w.title + "\n" : ""}${w.body || ""}`.trim(),
          keys: [w.title].filter(Boolean),
          strategy: "selective"
        });
      }
      if (WM.Worldbook.pruneByPrefix) {
        await WM.Worldbook.pruneByPrefix("item::", s.items.map((x) => "item::" + x.id));
        await WM.Worldbook.pruneByPrefix("plot::", s.plots.map((x) => "plot::" + x.id));
        await WM.Worldbook.pruneByPrefix("worldsec::", (s.worldSections || []).map((x) => "worldsec::" + x.id));
        await WM.Worldbook.pruneByPrefix("summary::", s.summaries.map((x) => "summary::" + x.id));
      }
    }
    function normItem(o) {
      return {
        name: String(o && o.name || "").trim(),
        desc: String(o && o.desc || "").trim(),
        owner: String(o && o.owner || "").trim(),
        origin: String(o && o.origin || "").trim(),
        relatedPlots: Array.isArray(o && o.relatedPlots) ? o.relatedPlots.filter(Boolean).map(String) : []
      };
    }
    async function addItem(a, desc, owner) {
      const s = load();
      const data = a && typeof a === "object" ? normItem(a) : normItem({ name: a, desc, owner });
      const id = "it_" + Date.now() + "_" + Math.floor(Math.random() * 1e3);
      s.items.push(Object.assign({ id, ts: Date.now() }, data));
      await save(s);
      return id;
    }
    async function updateItem(id, patch) {
      const s = load();
      const it = s.items.find((x) => x.id === id);
      if (!it) return false;
      Object.assign(it, patch || {});
      if (patch && "relatedPlots" in patch) it.relatedPlots = Array.isArray(patch.relatedPlots) ? patch.relatedPlots.map(String) : [];
      await save(s);
      return true;
    }
    async function removeItem(id) {
      const s = load();
      s.items = s.items.filter((x) => x.id !== id);
      await save(s);
    }
    function getItems() {
      return load().items;
    }
    function normPlot(o) {
      return {
        title: String(o && o.title || "").trim(),
        summary: String(o && o.summary || "").trim(),
        time: String(o && o.time || "").trim(),
        status: o && o.status || "active"
      };
    }
    async function addPlot(a, summary, status) {
      const s = load();
      const data = a && typeof a === "object" ? normPlot(a) : normPlot({ title: a, summary, status });
      const id = "pl_" + Date.now() + "_" + Math.floor(Math.random() * 1e3);
      s.plots.push(Object.assign({ id, ts: Date.now() }, data));
      await save(s);
      return id;
    }
    async function updatePlot(id, patch) {
      const s = load();
      const p = s.plots.find((x) => x.id === id);
      if (!p) return false;
      Object.assign(p, patch || {});
      await save(s);
      return true;
    }
    async function removePlot(id) {
      const s = load();
      s.plots = s.plots.filter((x) => x.id !== id);
      await save(s);
    }
    function getPlots() {
      return load().plots;
    }
    function getPlotsSorted() {
      const list = load().plots.slice();
      return list.map((p, i) => ({ p, i })).sort((A, B) => {
        const d = (B.p.ts || 0) - (A.p.ts || 0);
        return d !== 0 ? d : B.i - A.i;
      }).map((x) => x.p);
    }
    async function setWorld(text) {
      const s = load();
      s.world = String(text || "").trim();
      await save(s);
    }
    function getWorld() {
      return load().world;
    }
    function getWorldMeta() {
      const m = load().worldMeta || {};
      return { name: m.name || "", kind: m.kind || "", desc: m.desc || "" };
    }
    async function setWorldMeta(patch) {
      const s = load();
      s.worldMeta = Object.assign({ name: "", kind: "", desc: "" }, s.worldMeta || {}, patch || {});
      s.worldMeta.name = String(s.worldMeta.name || "").trim();
      s.worldMeta.kind = String(s.worldMeta.kind || "").trim();
      s.worldMeta.desc = String(s.worldMeta.desc || "").trim();
      await save(s);
    }
    function getWorldSections() {
      return load().worldSections || [];
    }
    async function addWorldSection(title, body) {
      const s = load();
      const id = "ws_" + Date.now() + "_" + Math.floor(Math.random() * 1e3);
      s.worldSections.push({ id, title: String(title || "").trim(), body: String(body || "").trim(), ts: Date.now() });
      await save(s);
      return id;
    }
    async function updateWorldSection(id, patch) {
      const s = load();
      const w = s.worldSections.find((x) => x.id === id);
      if (!w) return false;
      Object.assign(w, patch || {});
      await save(s);
      return true;
    }
    async function removeWorldSection(id) {
      const s = load();
      s.worldSections = s.worldSections.filter((x) => x.id !== id);
      await save(s);
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
    async function clearAll() {
      await save(emptyStore());
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
        const chat = ctx && ctx.chat;
        if (chat && Array.isArray(chat)) {
          let changed = false;
          for (const m of chat) {
            if (m && m.is_wm_hidden) {
              m.is_wm_hidden = false;
              m.is_system = false;
              changed = true;
            }
          }
          if (changed) {
            if (typeof ctx.saveChat === "function") await ctx.saveChat();
            if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
          }
        }
      } catch (e) {
        console.warn("[WarmMemo] \u6E05\u7A7A\u65F6\u6062\u590D\u9690\u85CF\u697C\u5C42\u5931\u8D25", e);
      }
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
      getPlotsSorted,
      setWorld,
      getWorld,
      getWorldMeta,
      setWorldMeta,
      getWorldSections,
      addWorldSection,
      updateWorldSection,
      removeWorldSection,
      setRelations,
      getRelations,
      dispatchLorebook,
      setSummaryPointer,
      getSummaryPointer,
      exportJSON,
      importJSON,
      clearAll
    };
  })();

  // src/config/tag-filter.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function applyRule(text, r) {
      if (!r || !r.open) return text;
      const open = r.open;
      let out = text;
      if (r.wrap) {
        const close = r.close && r.close.trim() || open;
        const oRe = escapeRegExp(open);
        const cRe = escapeRegExp(close);
        const re = new RegExp(oRe + "[\\s\\S]*?" + cRe, "g");
        out = out.replace(re, "");
      }
      if (r.singleBefore) {
        const idx = out.indexOf(open);
        if (idx >= 0) out = out.slice(idx + open.length);
      }
      if (r.singleAfter) {
        const idx = out.indexOf(open);
        if (idx >= 0) out = out.slice(0, idx);
      }
      return out;
    }
    function strip(text, rules) {
      if (!text) return text;
      if (!Array.isArray(rules) || !rules.length) return text;
      let out = String(text);
      for (const r of rules) {
        if (r && r.enabled !== false && r.open) {
          try {
            out = applyRule(out, r);
          } catch (e) {
          }
        }
      }
      return out.replace(/\n{3,}/g, "\n\n");
    }
    WM.TagFilter = { strip, applyRule, escapeRegExp };
  })();

  // src/config/llm-client.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function normalizeBaseUrl(u) {
      if (!u) return "";
      return String(u).replace("0.0.0.0", "127.0.0.1").replace(/\/+$/, "");
    }
    function resolveUrl(p) {
      const base = normalizeBaseUrl(p && p.apiUrl) || "";
      if (!base) return "";
      if (/chat\/completions$/i.test(base)) return base;
      if (/\/v1\/chat$/i.test(base)) return base + "/completions";
      if (/\/v1\/?$/i.test(base)) return base + "/chat/completions";
      return base + "/chat/completions";
    }
    async function complete(a, b, c, d) {
      let messages, opts;
      if (typeof b === "string") {
        messages = [{ role: "system", content: a || "" }, { role: "user", content: b || "" }];
        opts = Object.assign({}, d || {}, c && c.llmConfig ? { profile: c.llmConfig } : {});
      } else {
        messages = a || [];
        opts = b || {};
      }
      opts = opts || {};
      const profile = opts.profile || {};
      const url = resolveUrl(profile);
      if (!url) {
        throw new Error("\u672A\u914D\u7F6E LLM Base URL\uFF08\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 apiUrl\uFF0C\u5982 https://api.openai.com/v1\uFF09");
      }
      const maxTokens = opts.maxTokens || profile.maxTokens || 700;
      const temperature = opts.temperature != null ? opts.temperature : profile.temperature != null ? profile.temperature : 0.3;
      const body = {
        model: profile.model || "",
        messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "system", content: String(m.content || "") })),
        max_tokens: maxTokens,
        temperature
      };
      const headers = { "Content-Type": "application/json" };
      if (profile.apiKey) headers["Authorization"] = "Bearer " + profile.apiKey;
      if (WM.DebugLog) {
        WM.DebugLog.logRequest("llm", {
          url,
          model: body.model,
          messages: body.messages,
          max_tokens: maxTokens,
          temperature
        });
      }
      let res;
      try {
        res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      } catch (netErr) {
        const msg = String(netErr && netErr.message ? netErr.message : netErr);
        if (WM.DebugLog) WM.DebugLog.logError("llm", { url, error: msg });
        throw new Error("[LLM \u8BF7\u6C42\u5931\u8D25] \u5730\u5740\uFF1A" + url + "\uFF5C" + msg);
      }
      const rawText = await res.text();
      if (!res.ok) {
        if (WM.DebugLog) WM.DebugLog.logError("llm", { url, httpStatus: res.status, response: rawText.slice(0, 500) });
        throw new Error("[LLM HTTP " + res.status + "] \u5730\u5740\uFF1A" + url + "\uFF5C\u54CD\u5E94\uFF1A" + rawText.slice(0, 500));
      }
      let j;
      let parseErr = null;
      try {
        j = JSON.parse(rawText);
      } catch (e) {
        parseErr = e;
        j = null;
      }
      let text = extractText(j, rawText);
      if (WM.DebugLog) {
        WM.DebugLog.logResponse("llm", {
          url,
          model: j && j.model || body.model,
          output: String(text || ""),
          usage: j && j.usage,
          finish_reason: j && j.choices && j.choices[0] && j.choices[0].finish_reason,
          rawPreview: rawText.slice(0, 600)
        });
      }
      if (!text) {
        const hint = parseErr ? "\u8FD4\u56DE\u975E JSON\uFF08" + String(parseErr.message) + "\uFF09" : "\u54CD\u5E94\u4F53\u5DF2\u6536\u5230\u4F46\u63D0\u53D6\u4E0D\u5230\u6587\u672C\u5185\u5BB9";
        throw new Error("[LLM \u8FD4\u56DE\u4E3A\u7A7A] " + hint + "\uFF5C\u539F\u59CB\u54CD\u5E94\u524D500\u5B57\uFF1A" + rawText.slice(0, 500));
      }
      return String(text).trim();
    }
    function extractText(j, rawText) {
      if (j == null) {
        return extractFromSSE(rawText);
      }
      let t = "";
      let reasoning = "";
      if (j.choices && j.choices[0]) {
        const m = j.choices[0].message || {};
        t = m.content || j.choices[0].text || "";
        reasoning = m.reasoning_content || "";
      } else if (j.candidates && j.candidates[0]) {
        const c = j.candidates[0];
        const parts = c.content && c.content.parts || [];
        t = parts.map((p) => p.text || "").join("");
      } else if (typeof j === "string") {
        t = j;
      }
      if (t) return String(t).trim();
      if (reasoning) return String(reasoning).trim();
      return extractFromSSE(rawText);
    }
    function extractFromSSE(rawText) {
      if (!rawText) return "";
      const lines = rawText.split("\n");
      let acc = "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const o = JSON.parse(payload);
          const c = o.choices && o.choices[0] || {};
          const txt = c.message && c.message.content || c.text || c.delta && c.delta.content || "";
          if (txt) acc += txt;
        } catch (e) {
        }
      }
      return acc.trim();
    }
    async function testConnection(opts) {
      opts = opts || {};
      const profile = opts.profile || {};
      const timeoutMs = 2e4;
      const guard = new Promise((_, reject) => setTimeout(() => reject(new Error("\u6D4B\u8BD5\u8D85\u65F6\uFF08" + timeoutMs / 1e3 + "s \u65E0\u54CD\u5E94\uFF09")), timeoutMs));
      const ver = window.WarmMemo && window.WarmMemo.version || "?";
      try {
        const out = await Promise.race([
          complete(
            [
              { role: "system", content: "\u4F60\u662F\u4E00\u4E2A\u8FDE\u901A\u6027\u6D4B\u8BD5\u5DE5\u5177\u3002\u53EA\u8F93\u51FA\u6307\u4EE4\u8981\u6C42\u7684\u5185\u5BB9\uFF0C\u4E0D\u8981\u56DE\u7B54\u4EFB\u4F55\u5176\u5B83\u95EE\u9898\u3002" },
              { role: "user", content: "[WarmMemo\u6D4B\u8BD5\u8FDE\u63A5]\u8BF7\u53EA\u56DE\u590D\u300C\u6210\u529F\u300D\u4E24\u4E2A\u5B57\uFF0C\u4E0D\u8981\u56DE\u590D\u5176\u5B83\u4EFB\u4F55\u5185\u5BB9\u3002" }
            ],
            { profile, maxTokens: 60, temperature: 0 }
          ),
          guard
        ]);
        if (out && String(out).trim().length > 0) {
          return { success: true, detail: "\u8FDE\u901A[v" + ver + "]\uFF0C\u8FD4\u56DE\uFF1A" + String(out).trim().slice(0, 30) };
        }
        return { success: false, error: "\u8FD4\u56DE\u4E3A\u7A7A" };
      } catch (e) {
        return { success: false, error: String(e && e.message ? e.message : e) };
      }
    }
    WM.LLMClient = { complete, testConnection, resolveUrl, normalizeBaseUrl };
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
      if (!settings.vectorEnabled || !WM.EmbeddingClient || !WM.EmbeddingClient.embed) return null;
      if (!settings.embeddingBaseUrl) return null;
      try {
        return await WM.EmbeddingClient.embed(text, settings);
      } catch (e) {
        return null;
      }
    }
    async function embedBatch(texts, settings) {
      const list = (texts || []).filter((t) => t && String(t).trim());
      if (!list.length) return [];
      const out = new Array(texts.length).fill(null);
      const vecs = await embed(list, settings);
      if (Array.isArray(vecs)) {
        let k = 0;
        for (let i = 0; i < texts.length; i++) {
          if (texts[i] && String(texts[i]).trim()) {
            out[i] = vecs[k++];
          }
        }
      }
      return out;
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
      if (!vec) {
        try {
          console.log("[WarmMemo] \u5411\u91CF\u672A\u542F\u7528/\u4E0D\u53EF\u7528\uFF0C\u68C0\u7D22\u56DE\u9000\u4E3A\u6700\u8FD1 N \u6761");
        } catch (e) {
        }
        return memories.slice(-topK);
      }
      try {
        console.log("[WarmMemo] \u5DF2\u771F\u6B63\u8C03\u7528\u5411\u91CF embed\uFF0C\u7EF4\u5EA6=", vec.length);
      } catch (e) {
      }
      const stored = await getAll();
      const map = {};
      stored.forEach((r) => map[r.id] = r.vector);
      const missing = memories.filter((m) => m && m.id != null && (!map[m.id] || map[m.id].length !== vec.length));
      if (missing.length) {
        const vecs = await embedBatch(missing.map((m) => m.text), settings);
        for (let i = 0; i < missing.length; i++) {
          if (vecs[i]) {
            await put({ id: missing[i].id, text: missing[i].text, vector: vecs[i], ts: Date.now() });
            map[missing[i].id] = vecs[i];
          }
        }
      }
      let scored = memories.map((m) => ({ m, score: map[m.id] && map[m.id].length === vec.length ? cosine(vec, map[m.id]) : -1 })).sort((a, b) => b.score - a.score);
      const strong = scored.filter((x) => x.score > 0.1);
      if (strong.length) scored = strong;
      if ((settings.rerankEnabled || settings.takeoverRerank) && WM.RerankClient && WM.RerankClient.rerank) {
        const docs = scored.map((x) => x.m.text);
        try {
          console.log("[WarmMemo] \u5DF2\u771F\u6B63\u8C03\u7528\u91CD\u6392\u5E8F rerank\uFF0C\u6587\u6863\u6570=", docs.length);
        } catch (e) {
        }
        const rs = await WM.RerankClient.rerank(query, docs, settings, {});
        if (rs && rs.length === docs.length && rs.some((x) => x > 0)) {
          scored.forEach((x, i) => x.score = rs[i]);
          scored.sort((a, b) => b.score - a.score);
        } else {
          try {
            console.log("[WarmMemo] rerank \u672A\u8FD4\u56DE\u6709\u6548\u5206\u6570\uFF0C\u4FDD\u7559\u4F59\u5F26\u76F8\u4F3C\u5EA6\u6392\u5E8F");
          } catch (e) {
          }
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
    function buildEmbedUrl(rawPath) {
      let u = normalizeBaseUrl(rawPath) || "";
      if (!u) return "";
      let query = "";
      const qi = u.indexOf("?");
      if (qi >= 0) {
        query = u.slice(qi);
        u = u.slice(0, qi);
      }
      if (/v1\/embeddings$/i.test(u)) {
      } else if (/\/v1\/?$/i.test(u)) u += "/embeddings";
      else if (/\/embeddings$/i.test(u)) {
      } else if (/\/vec\/?$/i.test(u)) u += "/v1/embeddings";
      else if (/\/vec\/v1\/?$/i.test(u)) u += "/embeddings";
      else u += "/v1/embeddings";
      return u + query;
    }
    function resolveOpenAiUrl(base) {
      base = normalizeBaseUrl(base) || "";
      return base.replace(/\/?v1\/?$/, "") + "/v1/embeddings";
    }
    function resolveGeminiUrl(base, model) {
      base = normalizeBaseUrl(base) || "";
      return base + "/models/" + model + ":embedContent";
    }
    function isGetMode(urlOrPath) {
      return /[?&]method=GET/i.test(urlOrPath || "") || /[?&]get=1\b/i.test(urlOrPath || "");
    }
    function resolveEmbedUrl(s) {
      const base = normalizeBaseUrl(s.embeddingBaseUrl) || s.baseUrl || "";
      if (!base) return { url: "", provider: "compatible", model: s.embeddingModel || "" };
      if (/generativelanguage\.googleapis\.com/i.test(base)) {
        return { url: base, provider: "gemini", model: s.embeddingModel || s.model || "text-embedding-004" };
      }
      return { url: buildEmbedUrl(base), provider: "compatible", model: s.embeddingModel || s.model || "BAAI/bge-m3" };
    }
    async function embed(texts, settings) {
      const s = settings || {};
      const info = resolveEmbedUrl(s);
      const base = info.url;
      const model = info.model;
      const key = s.embeddingApiKey || s.apiKey || "";
      const provider = info.provider;
      const input = Array.isArray(texts) ? texts : [texts];
      WM._lastEmbedResolve = { source: s.embeddingSource, url: base, model, provider };
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
      const url = base;
      const useGet = isGetMode(url);
      const headers = Object.assign({ "Content-Type": "application/json" }, key ? { Authorization: "Bearer " + key } : {});
      let finalUrl = url;
      let body;
      if (useGet) {
        const q = new URL(finalUrl, location.href);
        q.searchParams.set("model", model);
        if (!Array.isArray(texts)) q.searchParams.set("input", texts);
        finalUrl = q.toString();
      } else {
        body = JSON.stringify({ model, input });
      }
      const reqTrace = { url: finalUrl, method: useGet ? "GET" : "POST", model, bodyPreview: body ? body.slice(0, 400) : "(\u65E0body)" };
      WM._lastEmbedReq = reqTrace;
      if (WM.DebugLog) WM.DebugLog.logRequest("embedding", reqTrace);
      try {
        console.log("[WarmMemo] Embedding \u5B9E\u9645\u8BF7\u6C42\uFF1A", reqTrace);
      } catch (e) {
      }
      let r;
      try {
        r = await fetch(finalUrl, {
          method: useGet ? "GET" : "POST",
          headers: useGet ? Object.assign({}, headers, { "Content-Type": "application/x-www-form-urlencoded" }) : headers,
          body
        });
      } catch (netErr) {
        const msg = String(netErr && netErr.message ? netErr.message : netErr);
        const isCors = /Failed to fetch|NetworkError|Cross-Origin|CORS|blocked by CORS/i.test(msg);
        const hint = isCors ? "\u8FD9\u662F\u6D4F\u89C8\u5668\u5C42\u9762\u7684\u8DE8\u57DF/CORS \u62E6\u622A\uFF08\u4E0D\u662F\u540E\u7AEF\u95EE\u9898\uFF09\u3002\u8BF7\u786E\u8BA4\uFF1A\u2460\u5730\u5740\u662F\u540C\u6E90\u4EE3\u7406\uFF08\u5982 http://localhost:8080/vec/v1/embeddings\uFF09\u800C\u975E\u76F4\u8FDE 127.0.0.1:11434\uFF1B\u2461\u53CD\u4EE3\u5DF2\u8FD4\u56DE access-control-allow-origin \u5934\u3002" : "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A" + msg + "\u3002";
        if (WM.DebugLog) WM.DebugLog.logError("embedding", { url: finalUrl, error: hint });
        throw new Error("[Embedding \u8BF7\u6C42\u5931\u8D25] \u5B9E\u9645\u8BF7\u6C42\u5730\u5740\uFF1A" + finalUrl + "\uFF5C" + hint);
      }
      const rawText = await r.text();
      if (!r.ok) {
        if (WM.DebugLog) WM.DebugLog.logError("embedding", { url: finalUrl, httpStatus: r.status, response: rawText.slice(0, 400) });
        throw new Error("[Embedding HTTP " + r.status + "] \u8BF7\u6C42\u5730\u5740\uFF1A" + finalUrl + "\uFF5C\u54CD\u5E94\uFF1A" + rawText.slice(0, 200));
      }
      let j;
      try {
        j = JSON.parse(rawText);
      } catch (e) {
        throw new Error("embedding \u8FD4\u56DE\u975E JSON\uFF08HTTP " + r.status + "\uFF09\uFF1A" + rawText.slice(0, 200));
      }
      if (!j.data) throw new Error("embedding \u8FD4\u56DE\u5F02\u5E38\uFF08\u7F3A\u5C11 data \u5B57\u6BB5\uFF09\uFF1A" + rawText.slice(0, 200));
      if (WM.DebugLog) WM.DebugLog.logResponse("embedding", { url: finalUrl, httpStatus: r.status, dimension: Array.isArray(j.data) && j.data[0] && j.data[0].embedding ? j.data[0].embedding.length : 0, responsePreview: rawText.slice(0, 400) });
      const vecs = j.data.map((d) => d.embedding);
      return Array.isArray(texts) ? vecs : vecs[0];
    }
    async function testConnection(settings) {
      const ver = window.WarmMemo && window.WarmMemo.version || "?";
      try {
        const v = await embed("test", settings);
        return { success: true, dimension: Array.isArray(v) ? v.length : 0, version: ver, resolve: WM._lastEmbedResolve, request: WM._lastEmbedReq };
      } catch (e) {
        return { success: false, error: String(e.message || e), version: ver, resolve: WM._lastEmbedResolve, request: WM._lastEmbedReq };
      }
    }
    WM.EmbeddingClient = { PROVIDERS, embed, testConnection, normalizeBaseUrl, resolveEmbedUrl };
  })();

  // src/config/rerank-client.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function normalize(url) {
      if (!url) return url;
      return url.replace("0.0.0.0", "127.0.0.1").replace(/\/+$/, "");
    }
    function buildRerankUrl(rawPath) {
      let u = normalize(rawPath) || "";
      if (!u) return "";
      let query = "";
      const qi = u.indexOf("?");
      if (qi >= 0) {
        query = u.slice(qi);
        u = u.slice(0, qi);
      }
      if (/v1\/rerank$/i.test(u)) {
      } else if (/\/v1\/?$/i.test(u)) u += "/rerank";
      else if (/\/rerank$/i.test(u)) {
      } else if (/\/vec\/?$/i.test(u)) u += "/v1/rerank";
      else if (/\/vec\/v1\/?$/i.test(u)) u += "/rerank";
      else u += "/v1/rerank";
      return u + query;
    }
    function isGetMode(urlOrPath) {
      return /[?&]method=GET/i.test(urlOrPath || "") || /[?&]get=1\b/i.test(urlOrPath || "");
    }
    function resolveRerankUrl(s) {
      return buildRerankUrl(normalize(s.rerankBaseUrl) || "");
    }
    async function rerank(query, documents, rawSettings, options) {
      const s = rawSettings || {};
      if (!s.rerankEnabled) return null;
      const url = resolveRerankUrl(s);
      const model = s.rerankModel || "BAAI/bge-reranker-v2-m3";
      const key = s.rerankApiKey || "";
      const docs = (documents || []).filter((d) => d && String(d).trim());
      if (!docs.length) return [];
      const useGet = isGetMode(url);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), s.timeoutMs || 3e3);
      try {
        let finalUrl = url;
        let body;
        const headers = Object.assign({ "Content-Type": "application/json" }, key ? { Authorization: "Bearer " + key } : {});
        if (useGet) {
          const q = new URL(finalUrl, location.href);
          q.searchParams.set("model", model);
          q.searchParams.set("query", query);
          docs.forEach((d, i) => q.searchParams.set("documents[" + i + "]", d));
          q.searchParams.set("top_n", String(docs.length));
          finalUrl = q.toString();
        } else {
          body = JSON.stringify({
            model,
            query,
            documents: docs,
            top_n: docs.length,
            return_documents: false
          });
        }
        if (WM.DebugLog) {
          WM.DebugLog.logRequest("rerank", {
            url: finalUrl,
            method: useGet ? "GET" : "POST",
            model,
            query,
            documents: docs,
            top_n: docs.length,
            bodyPreview: body ? body.slice(0, 400) : "(GET, \u53C2\u6570\u5728 query)"
          });
        }
        let r;
        try {
          r = await fetch(finalUrl, {
            method: useGet ? "GET" : "POST",
            signal: ctrl.signal,
            headers: useGet ? Object.assign({}, headers, { "Content-Type": "application/x-www-form-urlencoded" }) : headers,
            body
          });
        } catch (netErr) {
          const msg = String(netErr && netErr.message ? netErr.message : netErr);
          const isCors = /Failed to fetch|NetworkError|Cross-Origin|CORS/i.test(msg);
          const hint = (isCors ? "\u8BF7\u6C42\u88AB\u6D4F\u89C8\u5668\u62E6\u622A\uFF08\u7591\u4F3C\u8DE8\u57DF/CORS\uFF0C\u6216\u53CD\u4EE3\u672A\u8FD4\u56DE CORS \u5934\uFF09\u3002" : "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A" + msg + "\u3002") + " \u82E5\u4F60\u586B\u7684\u662F http://127.0.0.1:xxxx \u76F4\u8FDE\u672C\u5730\u670D\u52A1\uFF0C\u8BF7\u6539\u7528\u540C\u6E90\u4EE3\u7406\u5730\u5740\uFF08\u5982 http://localhost:8080/vec/v1/rerank\uFF09\u3002";
          if (WM.DebugLog) WM.DebugLog.logError("rerank", { url: finalUrl, error: hint });
          throw new Error(hint);
        }
        const rawText = await r.text();
        if (!r.ok) {
          if (WM.DebugLog) WM.DebugLog.logError("rerank", { url: finalUrl, httpStatus: r.status, response: rawText.slice(0, 400) });
          throw new Error("rerank \u670D\u52A1\u8FD4\u56DE HTTP " + r.status + "\uFF1A" + rawText.slice(0, 200));
        }
        let j;
        try {
          j = JSON.parse(rawText);
        } catch (e) {
          if (WM.DebugLog) WM.DebugLog.logError("rerank", { url: finalUrl, error: "\u8FD4\u56DE\u975E JSON", response: rawText.slice(0, 400) });
          throw new Error("rerank \u8FD4\u56DE\u975E JSON\uFF08HTTP " + r.status + "\uFF09\uFF1A" + rawText.slice(0, 200));
        }
        const scoreMap = {};
        (j.results || []).forEach((it) => {
          scoreMap[it.index] = it.relevance_score;
        });
        const scores = docs.map((_, i) => scoreMap[i] != null ? scoreMap[i] : 0);
        if (WM.DebugLog) WM.DebugLog.logResponse("rerank", { url: finalUrl, httpStatus: r.status, scores, responsePreview: rawText.slice(0, 400) });
        return scores;
      } catch (e) {
        console.warn("[WarmMemo] rerank \u5931\u8D25\uFF0C\u8FD4\u56DE null\uFF08\u7531\u8C03\u7528\u65B9\u4FDD\u7559\u539F\u6392\u5E8F\uFF09", e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
    async function testConnection(rawSettings) {
      try {
        const s = Object.assign({}, rawSettings, { rerankEnabled: true });
        const scores = await rerank("test", ["a", "b"], s, { topN: 2 });
        if (scores === null) return { success: false, error: "rerank \u8FD4\u56DE null\uFF08\u670D\u52A1\u4E0D\u53EF\u8FBE\u6216\u5730\u5740/\u5B57\u6BB5\u9519\u8BEF\uFF09" };
        return { success: Array.isArray(scores) && scores.length === 2 };
      } catch (e) {
        return { success: false, error: String(e.message || e) };
      }
    }
    WM.RerankClient = { rerank, testConnection, resolveRerankUrl };
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
    async function pruneByPrefix(prefix, keepIds) {
      if (!available() || !prefix) return;
      const name = targetName();
      const keep = new Set(Array.isArray(keepIds) ? keepIds : []);
      try {
        await helper().deleteWorldbookEntries(name, (e) => {
          const ex = e && e.extra;
          if (!ex || !ex.warmMemo || !ex.sourceId) return false;
          if (String(ex.sourceId).indexOf(prefix) !== 0) return false;
          return !keep.has(String(ex.sourceId));
        });
      } catch (e) {
        console.warn("[WarmMemo] pruneByPrefix \u5931\u8D25:", e);
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
    function parseWorldview(text) {
      if (!text || !String(text).trim()) return null;
      const lines = String(text).replace(/\r\n/g, "\n").split("\n");
      const out = { name: "", kind: "", desc: "", sections: [] };
      let cur = null;
      const descBuf = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          if (cur) cur.body.push("");
          continue;
        }
        let m = line.match(/^#{1,6}\s*(.+?)\s*$/) || line.match(/^【(.+?)】\s*$/) || line.match(/^「(.+?)」\s*$/);
        if (m) {
          cur = { title: m[1].trim(), body: [] };
          out.sections.push(cur);
          continue;
        }
        m = line.match(/^(?:世界名(?:称)?|世界)\s*[:：]\s*(.+)$/);
        if (m && !cur) {
          out.name = m[1].trim();
          continue;
        }
        m = line.match(/^世界类型\s*[:：]\s*(.+)$/);
        if (m && !cur) {
          out.kind = m[1].trim();
          continue;
        }
        m = line.match(/^(?:简述|世界简述|概述)\s*[:：]\s*(.+)$/);
        if (m && !cur) {
          descBuf.push(m[1].trim());
          continue;
        }
        if (cur) cur.body.push(line);
        else descBuf.push(line);
      }
      out.desc = descBuf.join("\n").trim();
      const ENTITY_NOISE = /(物品|道具|物件|武器|装备|信物|角色|人物|地点|场所|城市|城镇|村庄|村落|门派|宗门|势力|公会|家族|国家|组织|帮派|商店|店铺|NPC|具体人名)/;
      out.sections = out.sections.map((s) => ({ title: s.title, body: s.body.join("\n").trim() })).filter((s) => s.title || s.body).filter((s) => !(s.title && ENTITY_NOISE.test(s.title) && /[:：·]/.test(s.title)));
      if (!out.name && !out.kind && !out.desc && !out.sections.length) return null;
      return out;
    }
    async function inferWorldview(settings, opts) {
      settings = settings || WM.Settings && WM.Settings.load && WM.Settings.load() || {};
      const char = getCharacterCard();
      const user = getUserCard();
      const store = WM.MemoryStore;
      const prevMeta = store && store.getWorldMeta ? store.getWorldMeta() : { name: "", kind: "", desc: "" };
      const prevSecs = store && store.getWorldSections ? store.getWorldSections() : [];
      const prev = store ? store.getWorld() : "";
      const plots = (store && store.getPlots ? store.getPlots() : []).map((p) => `\xB7 ${p.time ? "[" + p.time + "] " : ""}${p.title}\uFF1A${p.summary}`).join("\n");
      const items = (store && store.getItems ? store.getItems() : []).map((i) => `\xB7 ${i.name}\uFF08\u6301\u6709\u8005\uFF1A${i.owner || "\u672A\u77E5"}\uFF09\uFF1A${i.desc || ""}`).join("\n");
      const tpl = settings && settings.prompts && settings.prompts.worldview || DEFAULT_WORLDVIEW_PROMPT;
      const sys = WM.Summary.fillTemplate(tpl, { plot: plots, recent: "", items });
      const known = [
        prevMeta.name ? `\u4E16\u754C\u540D\uFF1A${prevMeta.name}` : "",
        prevMeta.kind ? `\u4E16\u754C\u7C7B\u578B\uFF1A${prevMeta.kind}` : "",
        prevMeta.desc ? `\u7B80\u8FF0\uFF1A${prevMeta.desc}` : "",
        ...prevSecs.map((w) => `## ${w.title}
${w.body}`)
      ].filter(Boolean).join("\n");
      const userMsg = `\u3010\u89D2\u8272\u8BBE\u5B9A\u3011${char.name || "\u672A\u77E5"}\uFF1A${char.description || ""}
\u3010\u7528\u6237\u8BBE\u5B9A\u3011${user.name || "\u672A\u77E5"}\uFF1A${user.description || ""}
\u3010\u5267\u60C5\u7EBF\u3011
${plots || "\uFF08\u65E0\uFF09"}
\u3010\u5DF2\u77E5\u7269\u54C1\u3011
${items || "\uFF08\u65E0\uFF09"}
\u3010\u5DF2\u6709\u4E16\u754C\u89C2\u3011
${known || prev || "\uFF08\u65E0\uFF09"}
${opts && opts.extraInstruction ? "\u3010\u989D\u5916\u8981\u6C42\u3011" + opts.extraInstruction + "\n" : ""}\u8BF7\u6309\u89C4\u5B9A\u683C\u5F0F\u8F93\u51FA\u4E16\u754C\u8BBE\u5B9A\uFF1A`;
      if (!WM.Summary || !WM.Summary.callLLM) return prev;
      const out = await WM.Summary.callLLM(sys, userMsg, settings, { temperature: 0.4 });
      return out && out.trim() ? out.trim() : prev;
    }
    const DEFAULT_WORLDVIEW_PROMPT = `\u4F60\u662F\u4E16\u754C\u89C2\u63D0\u70BC\u8005\u3002\u8BF7\u57FA\u4E8E\u3010\u5267\u60C5\u7EBF\u3011\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u63D0\u70BC\u8FD9\u4E2A\u6545\u4E8B\u6240\u5904\u4E16\u754C\u672C\u8EAB\u7684\u300C\u5E95\u5C42\u89C4\u5219\u8BBE\u5B9A\u300D\u3002

\u4E25\u683C\u6309\u4EE5\u4E0B\u683C\u5F0F\u8F93\u51FA\uFF0C\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u591A\u4F59\u8BF4\u660E\uFF1A

\u4E16\u754C\u540D\uFF1A\uFF08\u8FD9\u4E2A\u4E16\u754C/\u5927\u9646/\u57CE\u5E02\u53EB\u4EC0\u4E48\uFF0C\u6CA1\u6709\u5C31\u8D77\u4E00\u4E2A\u8D34\u5207\u7684\uFF09
\u4E16\u754C\u7C7B\u578B\uFF1A\uFF08\u7528\u4E00\u4E2A\u8BCD\u6982\u62EC\uFF0C\u5982\uFF1A\u4FEE\u4ED9\u4E16\u754C\u3001\u8D5B\u535A\u670B\u514B\u3001\u84B8\u6C7D\u670B\u514B\u3001\u73B0\u4EE3\u90FD\u5E02\u3001\u5251\u4E0E\u9B54\u6CD5\uFF09
\u7B80\u8FF0\uFF1A\uFF08\u4E00\u5230\u4E24\u53E5\u8BDD\u8BF4\u660E\u8FD9\u662F\u4E2A\u4EC0\u4E48\u6837\u7684\u4E16\u754C\uFF09

## \u8BBE\u5B9A\u6807\u9898\u4E00
\uFF08\u56F4\u7ED5"\u4E16\u754C\u7C7B\u578B"\u5C55\u5F00\u7684\u5177\u4F53\u89C4\u5219\u4E0E\u6CD5\u5219\u3002\u4F8B\u5982\u4FEE\u4ED9\u4E16\u754C\u5C31\u5199\u4FEE\u70BC\u4F53\u7CFB\u7684\u5883\u754C\u5212\u5206\u3001\u7075\u6C14\u8FD0\u884C\u6CD5\u5219\uFF1B\u8D5B\u535A\u670B\u514B\u5C31\u5199\u4E49\u4F53\u6539\u9020\u89C4\u5219\u3001\u4F01\u4E1A\u4E0E\u8D22\u9600\u7684\u8FD0\u884C\u6CD5\u5219\uFF09

## \u8BBE\u5B9A\u6807\u9898\u4E8C
\uFF08\u5185\u5BB9\uFF09

\u8981\u6C42\uFF1A
1. \u300C\u4E16\u754C\u8BBE\u5B9A\u300D\u53EA\u5199\u4E16\u754C\u672C\u8EAB\u7684\u901A\u7528\u89C4\u5219\u3001\u6CD5\u5219\u3001\u5386\u53F2\u80CC\u666F\u3001\u529B\u91CF\u4F53\u7CFB\uFF0C\u7EDD\u4E0D\u5199\u5355\u4E2A\u5177\u4F53\u7269\u54C1\u3001\u5355\u4E2A\u5177\u4F53\u89D2\u8272\u59D3\u540D\u3001\u5355\u4E2A\u5177\u4F53\u5730\u70B9\u540D\u79F0\u3002
2. \u300C\u4E16\u754C\u7C7B\u578B\u300D\u51B3\u5B9A\u4E86\u4E0B\u9762\u5199\u4EC0\u4E48\u3002\u4FEE\u4ED9\u4E16\u754C\u5C31\u5FC5\u987B\u5199\u4FEE\u70BC\u4F53\u7CFB\u3001\u7075\u6C14\u3001\u6CD5\u5219\u7B49\uFF0C\u4E0D\u8981\u5199\u65E0\u5173\u5185\u5BB9\u3002
3. \u6BCF\u6761\u8BBE\u5B9A\u8981\u5177\u4F53\u3001\u53EF\u88AB\u540E\u7EED\u5267\u60C5\u5F15\u7528\uFF0C\u4E0D\u8981\u7A7A\u6CDB\u3002
4. \u8F93\u51FA 3-6 \u6761\u8BBE\u5B9A\u6761\u76EE\u3002

\u3010\u5267\u60C5\u7EBF\u3011
{{plot}}

\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011
{{recent}}`;
    WM.Worldbook = {
      available,
      ensureLorebook,
      writeEntry,
      removeEntry,
      clearAll,
      pruneByPrefix,
      listEntries,
      getLorebookEntries,
      writeSummary,
      writeItem,
      writeRelation,
      writeWorld,
      targetName,
      getCharacterCard,
      getUserCard,
      inferWorldview,
      parseWorldview,
      DEFAULT_WORLDVIEW_PROMPT
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
    function buildDialogue(msgs, settings) {
      const rules = settings && settings.tagStripRules || [];
      return msgs.map((m) => {
        const raw = (m.name ? "\u3010" + m.name + "\u3011" : "") + (m.content || "");
        return WM.TagFilter && WM.TagFilter.strip ? WM.TagFilter.strip(raw, rules) : raw;
      }).join("\n");
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
            const backoff = Math.min(1e3 * Math.pow(2, attempt - 1), 8e3);
            if (WM.ErrLog) await WM.ErrLog.add("llm", e, { phase: opts.phase || "unknown", attempt, willRetry: true, backoffMs: backoff });
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      }
      if (WM.ErrLog) await WM.ErrLog.add("llm", lastErr || new Error("\u672A\u77E5LLM\u5931\u8D25"), { phase: opts.phase || "unknown", attempt: maxRetry, willRetry: false });
      throw lastErr || new Error("LLM \u8C03\u7528\u5931\u8D25");
    }
    let _summarizing = false;
    function isSummarizing() {
      return _summarizing;
    }
    async function triggerSummary(settings, opts) {
      opts = opts || {};
      settings = settings || {};
      if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
        try {
          const fresh = WM.Settings && WM.Settings.load && WM.Settings.load();
          if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh;
        } catch (e) {
        }
      }
      const auto = settings.autoSummaryMode || "new";
      if (!settings.autoSummaryEnabled) return { ok: false, reason: "\u81EA\u52A8\u603B\u7ED3\u672A\u5F00\u542F" };
      if (_summarizing) return { ok: false, reason: "\u4E0A\u4E00\u6BB5\u603B\u7ED3\u4ECD\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u5019" };
      _summarizing = true;
      let range, total;
      try {
        const msgs = getRecentMessages(1e3);
        total = msgs.length;
        if (!total) return { ok: false, range: [0, 0], reason: "\u5F53\u524D\u5BF9\u8BDD\u6CA1\u6709\u53EF\u603B\u7ED3\u7684\u697C\u5C42\uFF08\u8BF7\u5148\u6709\u5BF9\u8BDD\u5185\u5BB9\uFF09" };
        if (opts.forceAll) {
          range = [1, total];
        } else if (auto === "new") {
          const ptr = WM.MemoryStore.getSummaryPointer();
          if (ptr >= total) return { ok: false, range: [ptr + 1, total], reason: "\u6CA1\u6709\u65B0\u589E\u697C\u5C42\u9700\u8981\u603B\u7ED3\uFF08\u5DF2\u603B\u7ED3\u5230\u6700\u65B0\uFF09" };
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
          if (start > end) return { ok: false, range: [start, end], reason: "\u533A\u95F4\u8D77\u59CB\u5927\u4E8E\u7ED3\u675F" };
          range = [start, end];
        } else if (auto === "floor") {
          const floor = Math.max(1, settings.autoSummaryFloor || 20);
          const ptr = WM.MemoryStore.getSummaryPointer();
          const segEnd = Math.floor(ptr / floor) * floor + floor;
          if (opts.forceEnd) {
            if (ptr >= total) return { ok: false, range: [ptr + 1, total], reason: "\u5DF2\u5168\u90E8\u603B\u7ED3\u5B8C\uFF0C\u65E0\u65B0\u589E\u697C\u5C42" };
            if (total < segEnd) range = [ptr + 1, total];
            else range = [ptr + 1, Math.min(total, segEnd)];
          } else {
            if (total < segEnd) return { ok: false, range: [ptr + 1, Math.min(total, segEnd)], reason: "\u5C1A\u672A\u6512\u6EE1\u4E00\u6BB5\uFF0C\u6682\u4E0D\u603B\u7ED3" };
            range = [ptr + 1, Math.min(total, segEnd)];
          }
        } else {
          return { ok: false, range: [0, 0], reason: "\u672A\u77E5\u7684\u81EA\u52A8\u603B\u7ED3\u6A21\u5F0F\uFF1A" + auto };
        }
        const recent = msgs.slice(range[0] - 1, range[1]);
        if (!recent.length) return { ok: false, range, reason: "\u8BA1\u7B97\u51FA\u7684\u603B\u7ED3\u533A\u95F4\u4E3A\u7A7A" };
        const histSummaries = (WM.MemoryStore.getSummaries() || []).map((s) => `\xB7 ${s.title}\uFF1A${s.text}`).join("\n");
        const relationsText = (WM.MemoryStore.getRelations() || []).map((r) => `\xB7 ${r.from} \u2192 ${r.to}\uFF1A${r.label || ""}`).join("\n");
        const plotsText = (WM.MemoryStore.getPlots() || []).map((p) => `\xB7 ${p.title}\uFF1A${p.summary}`).join("\n");
        const summaryTpl = settings.prompts && settings.prompts.summary;
        const sys = fillTemplate(summaryTpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries });
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
          const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries });
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
          const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries, relations: relationsText });
          const out = await callLLM(s, "\u8BF7\u8F93\u51FA\u672C\u6BB5\u5267\u60C5\uFF08\u6BCF\u884C \u65F6\u95F4\uFF5C\u6807\u9898\uFF5C\u5185\u5BB9\uFF5C\u72B6\u6001\uFF09\uFF1A", settings, { temperature: 0.4, phase: "plot" });
          function normStatus(raw) {
            if (!raw) return "active";
            const t = String(raw).replace(/[【】\[\]（）()]/g, "").trim();
            if (/^(已完结|完结|已完成|结束|完结了|告一段落|已结束|收尾|落幕)$/.test(t)) return "done";
            if (/^(已废弃|废弃|放弃|停止|作废|取消|烂尾|搁置)$/.test(t)) return "abandon";
            if (/^(进行中|进行|未完|未完结|持续|发展中|连载|连载中)$/.test(t)) return "active";
            if (/(完结|完成|结束|告一段落)/.test(t)) return "done";
            if (/(废弃|放弃|停止|作废|取消)/.test(t)) return "abandon";
            return "active";
          }
          const lines = out.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !/^(时间\s*[｜|]\s*标题|[-=]{3,})/.test(l));
          for (const ln of lines) {
            const parts = ln.replace(/^[\s\-*·]+/, "").split(/[｜|]/).map((x) => x.trim());
            if (!parts.length) continue;
            if (parts.length >= 4) {
              const time = /^(未标注|无|未知|-)$/.test(parts[0]) ? "" : parts[0];
              await WM.MemoryStore.addPlot({
                time,
                title: parts[1] || "",
                summary: parts[2] || "",
                status: normStatus(parts[3])
              });
            } else if (parts.length === 3) {
              await WM.MemoryStore.addPlot({ title: parts[0], summary: parts[1], status: normStatus(parts[2]) });
            } else if (parts.length === 2) {
              await WM.MemoryStore.addPlot({ title: parts[0], summary: parts[1], status: "active" });
            } else if (parts[0]) {
              await WM.MemoryStore.addPlot({ title: parts[0], summary: "", status: "active" });
            }
          }
          return { kind: "plot", ok: true };
        })());
        labels.push("plot");
        if (settings.autoWorld !== false) {
          tasks.push((async () => {
            const world = await WM.Worldbook.inferWorldview(settings, { recent });
            if (!world || !world.trim()) return { kind: "worldview", ok: true, skipped: true };
            const parsed = WM.Worldbook.parseWorldview ? WM.Worldbook.parseWorldview(world) : null;
            if (parsed) {
              const cur = WM.MemoryStore.getWorldMeta ? WM.MemoryStore.getWorldMeta() : {};
              await WM.MemoryStore.setWorldMeta({
                name: parsed.name || cur.name || "",
                kind: parsed.kind || cur.kind || "",
                desc: parsed.desc || cur.desc || ""
              });
              for (const sec of parsed.sections) {
                const exist = (WM.MemoryStore.getWorldSections() || []).find((x) => x.title === sec.title);
                if (exist) await WM.MemoryStore.updateWorldSection(exist.id, { body: sec.body });
                else await WM.MemoryStore.addWorldSection(sec.title, sec.body);
              }
            } else {
              await WM.MemoryStore.setWorld(world);
            }
            return { kind: "worldview", ok: true };
          })());
          labels.push("worldview");
        }
        if (settings.autoItems !== false) {
          tasks.push((async () => {
            const tpl = settings.prompts && settings.prompts.itemExtract;
            if (!tpl) return { kind: "items", ok: true, skipped: true };
            const knownPlots = (WM.MemoryStore.getPlots() || []).map((p) => `\xB7 ${p.title || p.time || p.id}`).join("\n") || "\uFF08\u65E0\uFF09";
            const s = fillTemplate(tpl, {
              recent: buildDialogue(recent, settings),
              plot: knownPlots
            });
            const out = await callLLM(s, "\u8BF7\u8F93\u51FA\u672C\u6BB5\u51FA\u73B0\u7684\u7269\u54C1\uFF08\u6BCF\u884C \u7269\u54C1\u540D\uFF5C\u4F5C\u7528\uFF5C\u6301\u6709\u8005\uFF5C\u5173\u8054\u5267\u60C5\uFF5C\u6765\u5386\uFF09\uFF1A", settings, { temperature: 0.3, phase: "items" });
            const lines = out.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !/^(物品名\s*[｜|]|[-=]{3,})/.test(l));
            const allPlots = WM.MemoryStore.getPlots() || [];
            const blank = (v) => !v || /^(无|未知|未标注|-|—)$/.test(v);
            for (const ln of lines) {
              const parts = ln.replace(/^[\s\-*·]+/, "").split(/[｜|]/).map((x) => x.trim());
              const name = parts[0];
              if (!name) continue;
              const relIds = [];
              if (!blank(parts[3])) {
                for (const t of parts[3].split(/[、,，/]/).map((x) => x.trim()).filter(Boolean)) {
                  const hit = allPlots.find((p) => p.title === t) || allPlots.find((p) => p.title && (p.title.includes(t) || t.includes(p.title)));
                  if (hit) relIds.push(hit.id);
                }
              }
              const exist = (WM.MemoryStore.getItems() || []).find((x) => x.name === name);
              const data = {
                name,
                desc: blank(parts[1]) ? exist ? exist.desc : "" : parts[1],
                owner: blank(parts[2]) ? exist ? exist.owner : "" : parts[2],
                origin: blank(parts[4]) ? exist ? exist.origin : "" : parts[4],
                relatedPlots: relIds.length ? relIds : exist ? exist.relatedPlots : []
              };
              if (exist) await WM.MemoryStore.updateItem(exist.id, data);
              else await WM.MemoryStore.addItem(data);
            }
            return { kind: "items", ok: true };
          })());
          labels.push("items");
        }
        const results = await Promise.allSettled(tasks);
        const failures = [];
        const successes = [];
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            const scope = labels[i];
            failures.push({ scope, err: r.reason });
            if (WM.ErrLog) WM.ErrLog.add(scope, r.reason, { range }).catch(() => {
            });
          } else if (r.value && !r.value.skipped) {
            successes.push(r.value.kind);
          }
        });
        if (failures.length === results.length && failures.length > 0) {
          const reason = failures.map((f) => "\u3010" + f.scope + "\u3011" + (f.err && f.err.message ? f.err.message : f.err)).join("\uFF1B\n");
          if (WM.ErrLog) await WM.ErrLog.add("pipeline", new Error("\u6240\u6709\u5E76\u884C\u4EFB\u52A1\u5931\u8D25"), { range, reason });
          WM.UI && WM.UI.toast && WM.UI.toast("\u63D0\u70BC\u5168\u90E8\u5931\u8D25\uFF0C\u89C1\u300C\u9519\u8BEF\u62A5\u544A\u300D\uFF1A\n" + reason, "error");
        } else if (failures.length > 0) {
          const okList = successes.join("\u3001") || "\u65E0";
          const failList = failures.map((f) => f.scope).join("\u3001");
          const detail = "\u6210\u529F\uFF1A" + okList + "\uFF1B\u5931\u8D25\uFF1A" + failList;
          if (WM.ErrLog) await WM.ErrLog.add("pipeline", new Error("\u90E8\u5206\u5E76\u884C\u4EFB\u52A1\u5931\u8D25"), { range, ok: successes, fail: failures.map((f) => f.scope), detail }).catch(() => {
          });
          WM.UI && WM.UI.toast && WM.UI.toast("\u90E8\u5206\u63D0\u70BC\u5931\u8D25 \u2192 " + detail, "warn");
        }
        if (WM.UI && WM.UI.refresh) WM.UI.refresh();
        return {
          ok: true,
          range,
          count: recent.length,
          partial: failures.length > 0,
          successes,
          failures: failures.map((f) => f.scope),
          results: {
            relations: (WM.MemoryStore.getRelations() || []).length,
            plots: (WM.MemoryStore.getPlots() || []).length,
            world: !!(WM.MemoryStore.getWorld() || "").trim(),
            items: (WM.MemoryStore.getItems ? WM.MemoryStore.getItems() : []).length
          }
        };
      } finally {
        _summarizing = false;
      }
    }
    WM.Summary = { fillTemplate, callLLM, triggerSummary, runSummary: triggerSummary, getRecentMessages, toMessages, isSummarizing };
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
          const w = Number.isFinite(e.weight) ? e.weight : 2;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const target = 70 - w * 6;
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
      const hasBad = nodes.some((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y));
      if (hasBad) {
        nodes.forEach((n, i) => {
          const a = i / nodes.length * Math.PI * 2;
          n.x = cx + 110 * Math.cos(a);
          n.y = cy + 110 * Math.sin(a);
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
      const plotTitle = {};
      (s.plots || []).forEach((p) => {
        plotTitle[p.id] = p.title || p.time || p.id;
      });
      (s.plots || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).forEach((p) => {
        if (!p.title && !p.summary) return;
        const stat = p.status === "done" ? "\u5DF2\u5B8C\u7ED3" : p.status === "abandon" ? "\u5DF2\u5E9F\u5F03" : "\u8FDB\u884C\u4E2D";
        cands.push({ id: p.id, type: "\u5267\u60C5", text: `${p.time ? "[" + p.time + "] " : ""}${p.title || ""}\uFF08${stat}\uFF09
${p.summary || ""}`.trim() });
      });
      (s.items || []).forEach((it) => {
        const rel = (it.relatedPlots || []).map((pid) => plotTitle[pid]).filter(Boolean);
        const lines = [`\u7269\u54C1\uFF1A${it.name}`];
        if (it.desc) lines.push(`\u4F5C\u7528\uFF1A${it.desc}`);
        if (it.owner) lines.push(`\u6301\u6709\u8005\uFF1A${it.owner}`);
        if (it.origin) lines.push(`\u6765\u5386\uFF1A${it.origin}`);
        if (rel.length) lines.push(`\u5173\u8054\u5267\u60C5\uFF1A${rel.join("\u3001")}`);
        cands.push({ id: it.id, type: "\u7269\u54C1", text: lines.join("\n") });
      });
      const groups = WM.Relations && WM.Relations.groupByPerson ? WM.Relations.groupByPerson({ pairs: s.relations }) : [];
      groups.forEach((g) => cands.push({ id: "relation::" + g.person, type: "\u5173\u7CFB", text: g.person + "\u7684\u5173\u7CFB\uFF1A" + g.text }));
      const wm = s.worldMeta || {};
      const head = [];
      if (wm.name) head.push(`\u4E16\u754C\u540D\uFF1A${wm.name}`);
      if (wm.kind) head.push(`\u4E16\u754C\u7C7B\u578B\uFF1A${wm.kind}`);
      if (wm.desc) head.push(wm.desc);
      if (!head.length && s.world && s.world.trim()) head.push(s.world.trim());
      if (head.length) cands.push({ id: "world::main", type: "\u4E16\u754C\u89C2", text: head.join("\n") });
      (s.worldSections || []).forEach((w) => {
        if (!w.title && !w.body) return;
        cands.push({ id: w.id, type: "\u4E16\u754C\u8BBE\u5B9A", text: `${w.title ? w.title + "\n" : ""}${w.body || ""}`.trim() });
      });
      return cands;
    }
    async function buildMemoryBlock() {
      const settings = WM.Settings.load();
      if (settings.injectMemories === false && settings.injectWorld === false) return "";
      const mem = WM.MemoryStore.getMemories();
      let memBlock = "";
      if (settings.injectMemories !== false && mem.length) {
        let picked = mem;
        if (settings.vectorEnabled && WM.VectorStore && WM.VectorStore.lastQuery && WM.VectorStore.enabled) {
          picked = await WM.VectorStore.search(mem, WM.VectorStore.lastQuery, 12);
        } else {
          picked = mem.slice(-Math.min(20, mem.length));
        }
        memBlock = "\u3010\u6709\u6E29\u5EA6\u7684\u8BB0\u5FC6\uFF08\u89D2\u8272\u4E0E\u7528\u6237\u5171\u540C\u7ECF\u5386\u7684\u8FC7\u5F80\uFF09\u3011\n" + picked.map((m) => "\xB7 " + (m.text || "")).join("\n");
      }
      const wbOk = WM.Worldbook && WM.Worldbook.available();
      const candidates = collectCandidates();
      if (settings.takeoverEmbedding && settings.vectorEnabled && WM.VectorStore) {
        const q = WM.VectorStore.lastQuery || "";
        const ranked = q ? await WM.VectorStore.search(candidates, q, settings.injectTopK || 8) : candidates.slice(-(settings.injectTopK || 8));
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
      es.on(readyEvent, async (event) => {
        try {
          const evtChat = event && event.detail && event.detail.chat;
          if (Array.isArray(evtChat) && evtChat.length) {
            const userMsgs = evtChat.filter((m) => m && m.role === "user");
            const lastUser = userMsgs.length ? userMsgs[userMsgs.length - 1].content : "";
            if (lastUser && WM.VectorStore) WM.VectorStore.lastQuery = String(lastUser).slice(0, 2e3);
          }
          const block = await buildMemoryBlock();
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
        <button data-tab="dbg">\u8C03\u8BD5</button>
        <button data-tab="clear" class="wm-tab-danger">\u6E05\u7A7A\u6570\u636E</button>
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
      if (tab === "dbg") return renderDebug(body);
      if (tab === "clear") return renderClear(body);
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
          const fresh = WM.Settings.load();
          const r = await WM.Summary.runSummary(fresh, { forceAll: true });
          if (r && r.ok) {
            st.textContent = `\u2713 \u5DF2\u63D0\u70BC ${r.count} \u6761\u8BB0\u5FC6\uFF08\u697C\u5C42 ${r.range[0]}-${r.range[1]}\uFF09\uFF0C\u5173\u7CFB${r.results.relations} \u5267\u60C5${r.results.plots} \u4E16\u754C${r.results.world ? "\u2713" : "\xD7"} \u7269\u54C1${r.results.items}`;
          } else {
            st.textContent = "\u2717 " + (r && r.reason ? r.reason : "\u5931\u8D25");
          }
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
      const mem = WM.MemoryStore.getMemories().map((m) => ({ ts: m.ts, kind: "\u8BB0\u5FC6", text: m.text }));
      const sums = (WM.MemoryStore.getSummaries() || []).map((s) => ({ ts: s.ts, kind: s.kind === "plot" ? "\u5267\u60C5\u6458\u8981" : "\u603B\u7ED3", text: s.text, title: s.title }));
      const all = mem.concat(sums).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      let html = `<div class="wm-card"><div class="wm-h">\u6709\u6E29\u5EA6\u8BB0\u5FC6\uFF08${all.length}\uFF09</div>
      <div class="wm-hint">\u5305\u542B\u624B\u52A8\u8BB0\u5FC6\u4E0E\u6BCF\u6B21\u300C\u603B\u7ED3\u300D\u751F\u6210\u7684\u53D9\u4E8B\uFF08\u6309\u771F\u5B9E\u89C6\u89D2\u8BB0\u5F55\u4E8B\u60C5\u7684\u5F00\u59CB\u3001\u7ECF\u8FC7\u3001\u7ED3\u679C\uFF09\u3002\u6309\u65F6\u95F4\u5012\u5E8F\u6392\u5217\u3002</div>
      <div class="wm-actions">
        <button id="mem-export" class="wm-btn">\u5BFC\u51FA</button>
        <button id="mem-import" class="wm-btn">\u5BFC\u5165</button>
      </div>
      <div class="wm-list" id="mem-list">`;
      html += all.length ? all.map((m) => `<div class="wm-item"><div class="wm-item-head"><span class="wm-tag">${escapeHtml(m.kind || "\u8BB0\u5FC6")}</span>${m.ts ? `<span class="wm-ts">${relTime(m.ts)}</span>` : ""}</div>${escapeHtml(m.text)}</div>`).join("") : '<div class="wm-empty">\u6682\u65E0\u8BB0\u5FC6\uFF0C\u5148\u53BB\u300C\u81EA\u52A8\u603B\u7ED3\u300D\u751F\u6210</div>';
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
    function getUserName() {
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
        if (ctx) {
          if (ctx.user && ctx.user.name) return ctx.user.name;
          if (ctx.name1) return ctx.name1;
          const um = (ctx.chat || []).find((m) => m.is_user && m.name);
          if (um) return um.name;
        }
      } catch (e) {
      }
      return "\u7528\u6237";
    }
    function drawGraph(svg) {
      const rels = WM.MemoryStore.getRelations();
      const names = /* @__PURE__ */ new Set();
      rels.forEach((r) => {
        if (r.from) names.add(r.from);
        if (r.to) names.add(r.to);
      });
      const nodes = Array.from(names).map((id) => ({ id }));
      if (!nodes.length) {
        svg.innerHTML = '<text x="160" y="160" text-anchor="middle" fill="#9b8579">\u6682\u65E0\u5173\u7CFB</text>';
        return;
      }
      const W = 320, H = 320, cx = W / 2, cy = H / 2;
      const user = getUserName();
      const degree = {};
      rels.forEach((r) => {
        degree[r.from] = (degree[r.from] || 0) + 1;
        degree[r.to] = (degree[r.to] || 0) + 1;
      });
      let center = nodes.find((n) => n.id === user);
      if (!center) {
        let best = null, bestD = -1;
        nodes.forEach((n) => {
          if ((degree[n.id] || 0) > bestD) {
            bestD = degree[n.id] || 0;
            best = n;
          }
        });
        center = best || nodes[0];
      }
      const adj = {};
      rels.forEach((r) => {
        (adj[r.from] = adj[r.from] || []).push(r.to);
        (adj[r.to] = adj[r.to] || []).push(r.from);
      });
      const dist = { [center.id]: 0 };
      const q = [center.id];
      while (q.length) {
        const cur = q.shift();
        (adj[cur] || []).forEach((nb) => {
          if (dist[nb] == null) {
            dist[nb] = dist[cur] + 1;
            q.push(nb);
          }
        });
      }
      nodes.forEach((n) => {
        if (dist[n.id] == null) dist[n.id] = 99;
      });
      const pos = {};
      pos[center.id] = { x: cx, y: cy };
      const rings = {};
      nodes.forEach((n) => {
        if (n.id === center.id) return;
        const d = Math.min(dist[n.id], 3);
        (rings[d] = rings[d] || []).push(n);
      });
      const ringRadius = { 1: 95, 2: 140, 3: 150 };
      Object.keys(rings).forEach((d) => {
        const arr = rings[d];
        const R = ringRadius[d] || 150;
        arr.forEach((n, i) => {
          const a = i / arr.length * Math.PI * 2 - Math.PI / 2;
          pos[n.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
        });
      });
      let s = "";
      rels.forEach((r) => {
        const a = pos[r.from], b = pos[r.to];
        if (!a || !b) return;
        const w = Number.isFinite(r.weight) ? r.weight : 2;
        const isUserEdge = r.from === center.id || r.to === center.id;
        s += `<line x1="${a.x.toFixed(0)}" y1="${a.y.toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${b.y.toFixed(0)}" stroke="var(--wm-jade)" stroke-width="${Math.min(w, 6)}" stroke-opacity="${isUserEdge ? 0.85 : 0.45}" class="wm-edge"/>`;
      });
      nodes.forEach((n) => {
        const isCenter = n.id === center.id;
        s += `<circle cx="${pos[n.id].x.toFixed(0)}" cy="${pos[n.id].y.toFixed(0)}" r="${isCenter ? 9 : 6}" fill="${isCenter ? "var(--wm-rose)" : "var(--wm-jade)"}" data-name="${escapeHtml(n.id)}" class="wm-node" style="cursor:grab"/>`;
        const lbl = n.id.length > 6 ? n.id.slice(0, 6) + "\u2026" : n.id;
        s += `<text x="${(pos[n.id].x + (isCenter ? 11 : 8)).toFixed(0)}" y="${(pos[n.id].y + 4).toFixed(0)}" font-size="${isCenter ? 10 : 9}" fill="var(--wm-ink-soft)" ${isCenter ? 'font-weight="bold"' : ""}>${escapeHtml(lbl)}</text>`;
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
    function openModal(opts) {
      return new Promise((resolve) => {
        const fields = opts.fields || [];
        const mask = document.createElement("div");
        mask.className = "wm-modal-mask";
        const fieldHtml = fields.map((f) => {
          const v = f.value == null ? "" : String(f.value);
          let ctrl;
          if (f.type === "textarea") {
            ctrl = `<textarea id="wmf-${f.key}" placeholder="${escapeHtml(f.placeholder || "")}">${escapeHtml(v)}</textarea>`;
          } else if (f.type === "select") {
            ctrl = `<select id="wmf-${f.key}">${(f.options || []).map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === v ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>`;
          } else if (f.type === "multiselect") {
            ctrl = `<select id="wmf-${f.key}" multiple size="${Math.min(5, Math.max(2, (f.options || []).length))}">${(f.options || []).map((o) => `<option value="${escapeHtml(o.value)}" ${Array.isArray(f.value) && f.value.map(String).includes(String(o.value)) ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>`;
          } else {
            ctrl = `<input type="text" id="wmf-${f.key}" value="${escapeHtml(v)}" placeholder="${escapeHtml(f.placeholder || "")}"/>`;
          }
          return `<div class="wm-field"><label for="wmf-${f.key}">${escapeHtml(f.label)}</label>${ctrl}${f.hint ? `<div class="wm-field-hint">${escapeHtml(f.hint)}</div>` : ""}</div>`;
        }).join("");
        mask.innerHTML = `<div class="wm-modal" role="dialog" aria-modal="true">
        <div class="wm-modal-head">
          <div class="wm-modal-title">${escapeHtml(opts.title || "")}</div>
          <button class="wm-ctrl" data-act="x" aria-label="\u5173\u95ED">\xD7</button>
        </div>
        <div class="wm-modal-body">${fieldHtml}</div>
        <div class="wm-modal-foot">
          <button class="wm-btn" data-act="cancel">\u53D6\u6D88</button>
          <button class="wm-btn primary" data-act="ok">${escapeHtml(opts.okText || "\u4FDD\u5B58")}</button>
        </div>
      </div>`;
        document.body.appendChild(mask);
        const close = (val) => {
          if (mask.parentNode) mask.parentNode.removeChild(mask);
          resolve(val);
        };
        const collect = () => {
          const out = {};
          for (const f of fields) {
            const el = mask.querySelector("#wmf-" + f.key);
            if (!el) continue;
            if (f.type === "multiselect") out[f.key] = Array.from(el.selectedOptions || []).map((o) => o.value);
            else out[f.key] = el.value;
          }
          return out;
        };
        mask.querySelector('[data-act="x"]').onclick = () => close(null);
        mask.querySelector('[data-act="cancel"]').onclick = () => close(null);
        mask.querySelector('[data-act="ok"]').onclick = () => close(collect());
        mask.addEventListener("mousedown", (e) => {
          if (e.target === mask) close(null);
        });
        const onKey = (e) => {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", onKey);
            close(null);
          }
        };
        document.addEventListener("keydown", onKey);
        setTimeout(() => {
          const first = mask.querySelector(".wm-modal-body input, .wm-modal-body textarea, .wm-modal-body select");
          if (first) first.focus();
        }, 30);
      });
    }
    const PLOT_STATUS = [
      { value: "active", label: "\u8FDB\u884C\u4E2D" },
      { value: "done", label: "\u5DF2\u5B8C\u7ED3" },
      { value: "abandon", label: "\u5DF2\u5E9F\u5F03" }
    ];
    function statusLabel(v) {
      const h = PLOT_STATUS.find((x) => x.value === v);
      return h ? h.label : "\u8FDB\u884C\u4E2D";
    }
    function fmtTs(ts) {
      if (!ts) return "";
      try {
        const d = new Date(ts);
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
      } catch (e) {
        return "";
      }
    }
    function renderPlot(body) {
      const plots = WM.MemoryStore.getPlotsSorted ? WM.MemoryStore.getPlotsSorted() : WM.MemoryStore.getPlots().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const rows = plots.map((p) => {
        const recTime = fmtTs(p.ts);
        const mainTime = p.time || recTime.split(" ")[0] || "\u672A\u6807\u6CE8";
        const subTime = p.time ? recTime : recTime.split(" ")[1] || "";
        return `<div class="wm-plot wm-plot-${p.status}" data-id="${p.id}">
        <div class="wm-plot-time">
          <div class="wm-plot-time-main">${escapeHtml(mainTime)}</div>
          ${subTime ? `<div class="wm-plot-time-sub">${escapeHtml(subTime)}</div>` : ""}
        </div>
        <div class="wm-plot-body">
          <div class="wm-plot-head">
            <span class="wm-plot-title">${escapeHtml(p.title || "\uFF08\u672A\u547D\u540D\uFF09")}</span>
            <span class="wm-badge">${escapeHtml(statusLabel(p.status))}</span>
          </div>
          <div class="wm-plot-sum">${escapeHtml(p.summary || "")}</div>
          <div class="wm-plot-acts">
            <button class="wm-btn" data-act="edit" data-id="${p.id}">\u7F16\u8F91</button>
            <button class="wm-btn" data-act="del" data-id="${p.id}">\u5220\u9664</button>
          </div>
        </div>
      </div>`;
      }).join("");
      body.innerHTML = `<div class="wm-card">
      <div class="wm-h">\u5267\u60C5\u7EBF\uFF08${plots.length}\uFF09</div>
      <div class="wm-hint">\u6309\u65F6\u95F4\u5012\u5E8F\u6392\u5217\uFF0C\u6700\u65B0\u7684\u5728\u6700\u4E0A\u9762\uFF1B\u5DE6\u4FA7\u4E3A\u65F6\u95F4\uFF0C\u53F3\u4FA7\u4E3A\u5185\u5BB9\u3002\u6240\u6709\u6539\u52A8\u4F1A\u540C\u6B65\u5230\u5F53\u524D\u8BB0\u5FC6\u4E16\u754C\u4E66\u3002</div>
      <div class="wm-actions">
        <button data-act="plot-add" class="wm-btn primary">\uFF0B \u6DFB\u52A0\u5267\u60C5</button>
        <button data-act="plot-run" class="wm-btn">\u4ECE\u8BB0\u5FC6\u66F4\u65B0\u5267\u60C5\u7EBF</button>
      </div>
      <div class="wm-timeline">${rows || '<div class="wm-empty">\u6682\u65E0\u5267\u60C5\u7EBF</div>'}</div>
      <div class="wm-status"></div></div>`;
      const plotFields = (p) => [
        { key: "time", label: "\u65F6\u95F4\uFF08\u5267\u60C5\u5185\u65F6\u95F4\uFF0C\u663E\u793A\u5728\u6700\u5DE6\u4FA7\uFF09", value: p && p.time || "", placeholder: "\u5982\uFF1A\u7B2C\u4E09\u65E5\u6E05\u6668 / \u5EFA\u5143\u4E03\u5E74\u6625" },
        { key: "title", label: "\u6807\u9898", value: p && p.title || "", placeholder: "\u8FD9\u6BB5\u5267\u60C5\u53EB\u4EC0\u4E48" },
        { key: "summary", label: "\u5185\u5BB9", type: "textarea", value: p && p.summary || "", placeholder: "\u8FD9\u6BB5\u5267\u60C5\u53D1\u751F\u4E86\u4EC0\u4E48" },
        { key: "status", label: "\u72B6\u6001", type: "select", value: p && p.status || "active", options: PLOT_STATUS }
      ];
      const plotAdd = body.querySelector('[data-act="plot-add"]');
      if (plotAdd) plotAdd.onclick = async () => {
        const r = await openModal({ title: "\u6DFB\u52A0\u5267\u60C5", fields: plotFields(null), okText: "\u6DFB\u52A0" });
        if (!r) return;
        if (!r.title.trim() && !r.summary.trim()) {
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u6807\u9898\u548C\u5185\u5BB9\u4E0D\u80FD\u90FD\u4E3A\u7A7A");
          return;
        }
        await WM.MemoryStore.addPlot(r);
        toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u5267\u60C5\u5DF2\u6DFB\u52A0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
        renderPlot(body);
      };
      const plotRun = body.querySelector('[data-act="plot-run"]');
      if (plotRun) plotRun.onclick = async () => {
        const st = body.querySelector(".wm-status");
        if (st) st.textContent = "\u5F52\u7EB3\u4E2D\u2026";
        const r = await WM.Summary.runSummary(WM.Settings.load());
        if (st) st.textContent = r && r.ok ? "\u2713 \u5267\u60C5\u7EBF\u5DF2\u66F4\u65B0" : "\u2717 \u5931\u8D25";
        renderPlot(body);
      };
      body.querySelectorAll('[data-act="edit"]').forEach((b) => {
        b.onclick = async () => {
          const p = WM.MemoryStore.getPlots().find((x) => x.id === b.dataset.id);
          if (!p) return;
          const r = await openModal({ title: "\u7F16\u8F91\u5267\u60C5", fields: plotFields(p), okText: "\u4FDD\u5B58" });
          if (!r) return;
          await WM.MemoryStore.updatePlot(p.id, r);
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u5267\u60C5\u5DF2\u66F4\u65B0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderPlot(body);
        };
      });
      body.querySelectorAll('[data-act="del"]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm("\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u5267\u60C5\uFF1F\u4E16\u754C\u4E66\u4E2D\u7684\u5BF9\u5E94\u6761\u76EE\u4E5F\u4F1A\u4E00\u5E76\u79FB\u9664\u3002")) return;
          await WM.MemoryStore.removePlot(b.dataset.id);
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u5267\u60C5\u5DF2\u5220\u9664\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderPlot(body);
        };
      });
    }
    function renderItem(body) {
      const items = WM.MemoryStore.getItems();
      const plots = WM.MemoryStore.getPlots();
      const plotTitle = {};
      for (const p of plots) plotTitle[p.id] = p.title || p.time || p.id;
      const cards = items.map((i) => {
        const rel = (i.relatedPlots || []).map((pid) => plotTitle[pid]).filter(Boolean);
        return `<div class="wm-item-card" data-id="${i.id}">
        <div class="wm-item-name">${escapeHtml(i.name || "\uFF08\u672A\u547D\u540D\uFF09")}${i.origin ? `<span class="wm-tag">\u6765\u5386\uFF1A${escapeHtml(i.origin)}</span>` : ""}</div>
        <div class="wm-item-effect">${escapeHtml(i.desc || "\uFF08\u672A\u586B\u5199\u4F5C\u7528\uFF09")}</div>
        <div class="wm-item-owner">
          <span><b>\u6301\u6709\u8005\uFF1A</b>${escapeHtml(i.owner || "\u672A\u77E5")}</span>
          ${rel.length ? `<span><b>\u5173\u8054\u5267\u60C5\uFF1A</b>${escapeHtml(rel.join("\u3001"))}</span>` : ""}
        </div>
        <div class="wm-item-acts">
          <button class="wm-btn" data-act="edit" data-id="${i.id}">\u7F16\u8F91</button>
          <button class="wm-btn" data-act="del" data-id="${i.id}">\u5220\u9664</button>
        </div>
      </div>`;
      }).join("");
      body.innerHTML = `<div class="wm-card">
      <div class="wm-h">\u7269\u54C1 / \u6301\u6709\u7269\u8FFD\u8E2A\uFF08${items.length}\uFF09</div>
      <div class="wm-hint">\u5361\u7247\u81EA\u4E0A\u800C\u4E0B\u4E3A\uFF1A\u7269\u54C1\u540D\u79F0 \u2192 \u7269\u54C1\u4F5C\u7528 \u2192 \u6301\u6709\u8005\u3002\u7269\u54C1\u4F1A\u5173\u8054\u5230\u89D2\u8272\u4E0E\u5267\u60C5\u7EBF\uFF0C\u6539\u52A8\u5373\u540C\u6B65\u5F53\u524D\u8BB0\u5FC6\u4E16\u754C\u4E66\u3002</div>
      <div class="wm-actions"><button data-act="it-add" class="wm-btn primary">\uFF0B \u6DFB\u52A0\u7269\u54C1</button></div>
      <div class="wm-item-list">${cards || '<div class="wm-empty">\u6682\u65E0\u7269\u54C1\uFF0C\u70B9\u4E0A\u65B9\u300C\u6DFB\u52A0\u7269\u54C1\u300D\u65B0\u5EFA</div>'}</div>
    </div>`;
      const itemFields = (it) => [
        { key: "name", label: "\u7269\u54C1\u540D\u79F0", value: it && it.name || "", placeholder: "\u5982\uFF1A\u9752\u7389\u846B\u82A6" },
        { key: "desc", label: "\u7269\u54C1\u4F5C\u7528", type: "textarea", value: it && it.desc || "", placeholder: "\u8FD9\u4EF6\u7269\u54C1\u6709\u4EC0\u4E48\u7528\u9014 / \u6548\u679C" },
        { key: "owner", label: "\u6301\u6709\u8005\uFF08\u89D2\u8272\u540D\uFF09", value: it && it.owner || "", placeholder: "\u73B0\u5728\u5728\u8C01\u624B\u4E0A" },
        { key: "origin", label: "\u6765\u5386\uFF08\u53EF\u9009\uFF09", value: it && it.origin || "", placeholder: "\u4ECE\u54EA\u6765\u7684" },
        {
          key: "relatedPlots",
          label: "\u5173\u8054\u5267\u60C5\u7EBF\uFF08\u53EF\u591A\u9009\uFF09",
          type: "multiselect",
          value: it && it.relatedPlots || [],
          options: plots.map((p) => ({ value: p.id, label: p.title || p.time || p.id })),
          hint: plots.length ? "\u6309\u4F4F Ctrl / Cmd \u53EF\u591A\u9009" : "\u6682\u65E0\u5267\u60C5\u7EBF\uFF0C\u53EF\u5148\u5230\u300C\u5267\u60C5\u7EBF\u300D\u9875\u6DFB\u52A0"
        }
      ];
      const addBtn = body.querySelector('[data-act="it-add"]');
      if (addBtn) addBtn.onclick = async () => {
        const r = await openModal({ title: "\u6DFB\u52A0\u7269\u54C1", fields: itemFields(null), okText: "\u6DFB\u52A0" });
        if (!r) return;
        if (!r.name.trim()) {
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u7269\u54C1\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
          return;
        }
        await WM.MemoryStore.addItem(r);
        toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u7269\u54C1\u5DF2\u6DFB\u52A0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
        renderItem(body);
      };
      body.querySelectorAll('[data-act="edit"]').forEach((b) => {
        b.onclick = async () => {
          const it = WM.MemoryStore.getItems().find((x) => x.id === b.dataset.id);
          if (!it) return;
          const r = await openModal({ title: "\u7F16\u8F91\u7269\u54C1", fields: itemFields(it), okText: "\u4FDD\u5B58" });
          if (!r) return;
          if (!r.name.trim()) {
            toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u7269\u54C1\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
            return;
          }
          await WM.MemoryStore.updateItem(it.id, r);
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u7269\u54C1\u5DF2\u66F4\u65B0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderItem(body);
        };
      });
      body.querySelectorAll('[data-act="del"]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm("\u786E\u5B9A\u5220\u9664\u8FD9\u4E2A\u7269\u54C1\uFF1F\u4E16\u754C\u4E66\u4E2D\u7684\u5BF9\u5E94\u6761\u76EE\u4E5F\u4F1A\u4E00\u5E76\u79FB\u9664\u3002")) return;
          await WM.MemoryStore.removeItem(b.dataset.id);
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u7269\u54C1\u5DF2\u5220\u9664\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderItem(body);
        };
      });
    }
    async function renderWorld(body) {
      const settings = WM.Settings.load();
      const meta = WM.MemoryStore.getWorldMeta ? WM.MemoryStore.getWorldMeta() : { name: "", kind: "", desc: "" };
      const ENTITY_NOISE = /(物品|道具|物件|武器|装备|信物|角色|人物|地点|场所|城市|城镇|村庄|村落|门派|宗门|势力|公会|家族|国家|组织|帮派|商店|店铺|NPC|具体人名)/;
      const secs = (WM.MemoryStore.getWorldSections ? WM.MemoryStore.getWorldSections() : []).filter((w) => !(w.title && ENTITY_NOISE.test(w.title) && /[:：·]/.test(w.title)));
      let loreCount = 0;
      try {
        loreCount = WM.Worldbook.listEntries ? (await WM.Worldbook.listEntries()).length : 0;
      } catch (e) {
        loreCount = 0;
      }
      const secHtml = secs.map((w) => `<div class="wm-world-sec" data-id="${w.id}">
      <div class="wm-world-sec-title">${escapeHtml(w.title || "\uFF08\u672A\u547D\u540D\u8BBE\u5B9A\uFF09")}</div>
      <div class="wm-world-sec-body">${escapeHtml(w.body || "")}</div>
      <div class="wm-world-acts">
        <button class="wm-btn" data-act="sec-edit" data-id="${w.id}">\u7F16\u8F91</button>
        <button class="wm-btn" data-act="sec-del" data-id="${w.id}">\u5220\u9664</button>
      </div>
    </div>`).join("");
      body.innerHTML = `<div class="wm-card">
      <div class="wm-h">\u4E16\u754C\u8BBE\u5B9A</div>
      <div class="wm-hint">\u9876\u90E8\u662F\u8FD9\u4E2A\u4E16\u754C\u300C\u53EB\u4EC0\u4E48\u3001\u662F\u4EC0\u4E48\u7C7B\u578B\u300D\uFF0C\u4E0B\u9762\u6309\u6761\u76EE\u5199\u5177\u4F53\u8BBE\u5B9A\uFF08\u5982\u4FEE\u70BC\u4F53\u7CFB\u3001\u52BF\u529B\u5206\u5E03\uFF09\u3002\u6240\u6709\u6539\u52A8\u5373\u540C\u6B65\u5F53\u524D\u8BB0\u5FC6\u4E16\u754C\u4E66${loreCount ? `\uFF08\u73B0\u6709 ${loreCount} \u6761\uFF09` : ""}\u3002</div>

      <div class="wm-world-head">
        <div class="wm-world-name">${escapeHtml(meta.name || "\u672A\u547D\u540D\u4E16\u754C")}</div>
        ${meta.kind ? `<span class="wm-world-kind">${escapeHtml(meta.kind)}</span>` : ""}
        <div class="wm-world-desc">${escapeHtml(meta.desc || "\uFF08\u8FD8\u6CA1\u6709\u4E16\u754C\u7B80\u8FF0\uFF0C\u70B9\u4E0B\u65B9\u300C\u7F16\u8F91\u4E16\u754C\u300D\u8865\u5145\uFF09")}</div>
      </div>

      <div class="wm-actions">
        <button data-act="world-edit" class="wm-btn primary">\u7F16\u8F91\u4E16\u754C</button>
        <button data-act="sec-add" class="wm-btn">\uFF0B \u6DFB\u52A0\u8BBE\u5B9A\u6761\u76EE</button>
        <button data-act="world-gen" class="wm-btn">AI \u8865\u5168\u8BBE\u5B9A</button>
      </div>

      <div class="wm-h" style="margin-top:12px">\u5177\u4F53\u8BBE\u5B9A\uFF08${secs.length}\uFF09</div>
      <div class="wm-world-secs">${secHtml || '<div class="wm-empty">\u6682\u65E0\u8BBE\u5B9A\u6761\u76EE\uFF0C\u70B9\u4E0A\u65B9\u300C\u6DFB\u52A0\u8BBE\u5B9A\u6761\u76EE\u300D\u65B0\u5EFA</div>'}</div>

      <div class="wm-divider"></div>
      <div class="wm-row"><input data-act="world-lorename" placeholder="\u4E16\u754C\u4E66\u540D\uFF08\u540C\u6B65\u7528\uFF0C\u5982 WarmMemo\uFF09" value="${escapeHtml(settings.lorebookName || "")}" style="flex:1"/></div>
      <label class="wm-row"><input type="checkbox" data-act="world-lore" ${settings.worldToLorebook !== false ? "checked" : ""}/> \u540C\u6B65\u5199\u5165\u5F53\u524D\u8BB0\u5FC6\u4E16\u754C\u4E66</label>
      <div class="wm-actions"><button data-act="world-lore-save" class="wm-btn">\u4FDD\u5B58\u540C\u6B65\u8BBE\u7F6E</button></div>
      <div class="wm-status"></div>
    </div>`;
      const wEdit = body.querySelector('[data-act="world-edit"]');
      if (wEdit) wEdit.onclick = async () => {
        const r = await openModal({
          title: "\u7F16\u8F91\u4E16\u754C",
          okText: "\u4FDD\u5B58",
          fields: [
            { key: "name", label: "\u4E16\u754C\u540D\u79F0", value: meta.name, placeholder: "\u5982\uFF1A\u4E5D\u9704\u5927\u9646" },
            { key: "kind", label: "\u4E16\u754C\u7C7B\u578B", value: meta.kind, placeholder: "\u5982\uFF1A\u4FEE\u4ED9\u4E16\u754C / \u8D5B\u535A\u670B\u514B / westeros \u5F0F\u4E2D\u4E16\u7EAA" },
            { key: "desc", label: "\u4E16\u754C\u7B80\u8FF0", type: "textarea", value: meta.desc, placeholder: "\u4E00\u4E24\u53E5\u8BDD\u8BF4\u660E\u8FD9\u662F\u4E2A\u4EC0\u4E48\u6837\u7684\u4E16\u754C" }
          ]
        });
        if (!r) return;
        await WM.MemoryStore.setWorldMeta(r);
        toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u4E16\u754C\u4FE1\u606F\u5DF2\u4FDD\u5B58\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
        renderWorld(body);
      };
      const secAdd = body.querySelector('[data-act="sec-add"]');
      if (secAdd) secAdd.onclick = async () => {
        const r = await openModal({
          title: "\u6DFB\u52A0\u8BBE\u5B9A\u6761\u76EE",
          okText: "\u6DFB\u52A0",
          fields: [
            { key: "title", label: "\u8BBE\u5B9A\u540D\u79F0", value: "", placeholder: "\u5982\uFF1A\u4FEE\u70BC\u4F53\u7CFB / \u52BF\u529B\u5206\u5E03 / \u8D27\u5E01\u4E0E\u5EA6\u91CF" },
            { key: "body", label: "\u8BBE\u5B9A\u5185\u5BB9", type: "textarea", value: "", placeholder: "\u56F4\u7ED5\u8FD9\u4E2A\u4E16\u754C\u7C7B\u578B\u5C55\u5F00\u7684\u5177\u4F53\u89C4\u5219" }
          ]
        });
        if (!r) return;
        if (!r.title.trim() && !r.body.trim()) {
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u540D\u79F0\u548C\u5185\u5BB9\u4E0D\u80FD\u90FD\u4E3A\u7A7A");
          return;
        }
        await WM.MemoryStore.addWorldSection(r.title, r.body);
        toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u8BBE\u5B9A\u5DF2\u6DFB\u52A0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
        renderWorld(body);
      };
      body.querySelectorAll('[data-act="sec-edit"]').forEach((b) => {
        b.onclick = async () => {
          const w = (WM.MemoryStore.getWorldSections() || []).find((x) => x.id === b.dataset.id);
          if (!w) return;
          const r = await openModal({
            title: "\u7F16\u8F91\u8BBE\u5B9A\u6761\u76EE",
            okText: "\u4FDD\u5B58",
            fields: [
              { key: "title", label: "\u8BBE\u5B9A\u540D\u79F0", value: w.title },
              { key: "body", label: "\u8BBE\u5B9A\u5185\u5BB9", type: "textarea", value: w.body }
            ]
          });
          if (!r) return;
          await WM.MemoryStore.updateWorldSection(w.id, r);
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u8BBE\u5B9A\u5DF2\u66F4\u65B0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderWorld(body);
        };
      });
      body.querySelectorAll('[data-act="sec-del"]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm("\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u8BBE\u5B9A\uFF1F\u4E16\u754C\u4E66\u4E2D\u7684\u5BF9\u5E94\u6761\u76EE\u4E5F\u4F1A\u4E00\u5E76\u79FB\u9664\u3002")) return;
          await WM.MemoryStore.removeWorldSection(b.dataset.id);
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u8BBE\u5B9A\u5DF2\u5220\u9664\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderWorld(body);
        };
      });
      const loreSave = body.querySelector('[data-act="world-lore-save"]');
      if (loreSave) loreSave.onclick = async () => {
        const nameEl = body.querySelector('[data-act="world-lorename"]');
        const loreEl = body.querySelector('[data-act="world-lore"]');
        if (nameEl) settings.lorebookName = nameEl.value.trim();
        if (loreEl) settings.worldToLorebook = loreEl.checked;
        WM.Settings.save(settings);
        if (settings.worldToLorebook) await WM.MemoryStore.dispatchLorebook();
        const st = body.querySelector(".wm-status");
        if (st) st.textContent = "\u2713 \u540C\u6B65\u8BBE\u7F6E\u5DF2\u4FDD\u5B58";
      };
      const wGen = body.querySelector('[data-act="world-gen"]');
      if (wGen) wGen.onclick = async () => {
        const st = body.querySelector(".wm-status");
        if (st) st.textContent = "\u63A8\u65AD\u4E2D\u2026";
        try {
          const w = await WM.Worldbook.inferWorldview(settings, {});
          const parsed = WM.Worldbook.parseWorldview ? WM.Worldbook.parseWorldview(w) : null;
          if (parsed) {
            if (parsed.name || parsed.kind || parsed.desc) {
              await WM.MemoryStore.setWorldMeta({
                name: parsed.name || meta.name,
                kind: parsed.kind || meta.kind,
                desc: parsed.desc || meta.desc
              });
            }
            for (const sec of parsed.sections) {
              const exist = (WM.MemoryStore.getWorldSections() || []).find((x) => x.title === sec.title);
              if (exist) await WM.MemoryStore.updateWorldSection(exist.id, { body: sec.body });
              else await WM.MemoryStore.addWorldSection(sec.title, sec.body);
            }
            if (st) st.textContent = `\u2713 \u5DF2\u8865\u5168\uFF08${parsed.sections.length} \u6761\u8BBE\u5B9A\uFF09\u5E76\u540C\u6B65\u4E16\u754C\u4E66`;
          } else {
            await WM.MemoryStore.setWorld(w);
            if (st) st.textContent = "\u2713 \u5DF2\u8865\u5168";
          }
          renderWorld(body);
        } catch (e) {
          if (st) st.textContent = "\u2717 " + (e.message || e);
        }
      };
    }
    function renderPaneLlm(s) {
      const c = s.llmConfig || { source: "local", apiUrl: "", apiKey: "", model: "" };
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
      const promptHtml = `
      <div class="wm-subtabs lv3" data-lv3="prompts">
        ${promptEditors.map((p, i) => `<button data-ptab="${p.key}" class="${i === 0 ? "active" : ""}">${p.title.replace("\u63D0\u793A\u8BCD", "")}</button>`).join("")}
      </div>
      <div class="wm-ptabs">
        ${promptEditors.map((p, i) => `
          <div class="wm-ptab-pane" data-ptab-pane="${p.key}" style="${i === 0 ? "" : "display:none"}">
            <div class="wm-hint">\u5360\u4F4D\u7B26\uFF1A${p.holder}\uFF08\u8FD0\u884C\u65F6\u81EA\u52A8\u66FF\u6362\u4E3A\u771F\u5B9E\u6570\u636E\uFF09</div>
            <textarea id="pprompt-${p.key}" rows="${p.key === "summary" ? 4 : 3}" style="width:100%;font-family:monospace;font-size:12px">${escapeHtml(prompts[p.key] != null ? prompts[p.key] : p.def)}</textarea>
          </div>`).join("")}
      </div>`;
      return `
      <div class="wm-card"><div class="wm-h">LLM \u8C03\u7528\u914D\u7F6E\uFF08\u7EDF\u4E00\uFF09</div>
        <div class="wm-hint">\u6240\u6709\u529F\u80FD\uFF08\u603B\u7ED3/\u5173\u7CFB/\u5267\u60C5/\u4E16\u754C\u89C2/\u7269\u54C1\uFF09\u5171\u7528\u8FD9\u4E00\u4E2A LLM \u914D\u7F6E\u3002<b>\u5FC5\u987B\u586B\u5199 Base URL</b>\uFF08\u76F4\u63A5\u8C03\u7528\u8BE5\u5730\u5740\uFF0C\u81EA\u9002\u5E94 OpenAI / DeepSeek / \u706B\u5C71\u5F15\u64CE \u7B49\u4EFB\u610F OpenAI \u517C\u5BB9\u670D\u52A1\uFF0C\u65E0\u9700\u9009\u5382\u5BB6\uFF09\u3002\u914D\u5B8C\u53EF\u70B9\u300C\u6D4B\u8BD5\u8FDE\u63A5\u300D\u9A8C\u8BC1\u53EF\u7528\u6027\u3002</div>
        <div id="llm-custom" style="margin-top:6px">
          <label class="wm-row">Base URL<input id="llm-url" value="${escapeHtml(c.apiUrl)}" placeholder="https://api.openai.com/v1\u3001https://ark.cn-beijing.volces.com/api/v3\u3001https://api.deepseek.com/v1"/></label>
          <div class="wm-hint">\u76F4\u63A5\u586B\u4EFB\u610F\u5382\u5BB6\u7684 Base URL \u5373\u53EF\uFF0C\u81EA\u52A8\u6309 OpenAI \u517C\u5BB9\u534F\u8BAE\u8BF7\u6C42\uFF08\u706B\u5C71\u5F15\u64CE\u586B <code>https://ark.cn-beijing.volces.com/api/v3</code>\uFF0CDeepSeek \u586B <code>https://api.deepseek.com/v1</code>\uFF09\u3002</div>
          <label class="wm-row">API Key<input id="llm-key" type="password" value="${escapeHtml(c.apiKey)}" placeholder="sk-..."/></label>
          <label class="wm-row">\u6A21\u578B\u540D<input id="llm-model" value="${escapeHtml(c.model)}" placeholder="\u5982 gpt-4o-mini / deepseek-chat / doubao-pro"/></label>
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
    function renderDebug(body) {
      body.innerHTML = `
      <div class="wm-card">
        <div class="wm-h">\u8C03\u7528\u8C03\u8BD5\uFF08\u8BF7\u6C42 / \u7ED3\u679C\uFF09</div>
        <div class="wm-hint">\u5206\u522B\u8BB0\u5F55 LLM\u3001\u5411\u91CF(Embedding)\u3001\u91CD\u6392\u5E8F(Rerank) \u4E09\u7C7B\u8C03\u7528\u7684<b>\u8BF7\u6C42\u5185\u5BB9</b>\u4E0E<b>AI \u8FD4\u56DE\u7ED3\u679C</b>\uFF0C\u4E92\u4E0D\u6DF7\u5408\u3002\u6BCF\u6B21\u5B9E\u9645\u8C03\u7528\u81EA\u52A8\u8BB0\u5F55\uFF0C\u6700\u591A\u4FDD\u7559 ${WM.DebugLog ? WM.DebugLog.MAX : 30} \u6761\u3002</div>
        <div class="wm-debug-toolbar">
          <button class="wm-btn" data-dbg="llm">LLM</button>
          <button class="wm-btn" data-dbg="embedding">\u5411\u91CF</button>
          <button class="wm-btn" data-dbg="rerank">\u91CD\u6392\u5E8F</button>
          <button class="wm-btn wm-btn-ghost" id="dbg-clear">\u6E05\u7A7A\u5168\u90E8</button>
          <button class="wm-btn wm-btn-ghost" id="dbg-refresh">\u5237\u65B0</button>
        </div>
        <div id="dbg-llm" class="wm-debug-sec"></div>
        <div id="dbg-embedding" class="wm-debug-sec"></div>
        <div id="dbg-rerank" class="wm-debug-sec"></div>
      </div>`;
      const secs = {
        llm: body.querySelector("#dbg-llm"),
        embedding: body.querySelector("#dbg-embedding"),
        rerank: body.querySelector("#dbg-rerank")
      };
      const titles = { llm: "LLM \u8C03\u7528", embedding: "\u5411\u91CF Embedding", rerank: "\u91CD\u6392\u5E8F Rerank" };
      function fmt(v) {
        if (v === void 0) return "\u2014";
        if (typeof v === "string") return v;
        try {
          return JSON.stringify(v, null, 2);
        } catch (e) {
          return String(v);
        }
      }
      function renderSec(kind) {
        const el = secs[kind];
        const logs = WM.DebugLog ? WM.DebugLog.get(kind) : [];
        if (!logs.length) {
          el.innerHTML = `<div class="wm-debug-title">${titles[kind]}</div><div class="wm-empty">\u6682\u65E0\u8BB0\u5F55\uFF0C\u5148\u53BB\u89E6\u53D1\u4E00\u6B21\u8C03\u7528\uFF08\u5982\u70B9\u6D4B\u8BD5\u8FDE\u63A5 / \u603B\u7ED3\uFF09</div>`;
          return;
        }
        const html = logs.slice().reverse().map((e) => {
          const t = new Date(e.ts).toLocaleTimeString();
          const dirLabel = e.dir === "request" ? "\u8BF7\u6C42" : e.dir === "response" ? "\u7ED3\u679C" : "\u9519\u8BEF";
          const dirCls = e.dir === "request" ? "req" : e.dir === "response" ? "res" : "err";
          let bodyHtml = "";
          if (e.dir === "request") {
            const d = e.data || {};
            if (kind === "llm") {
              bodyHtml = "URL: " + (d.url || "") + "\n\u6A21\u578B: " + (d.model || "") + "\n\n\u3010Messages\u3011\n" + (d.messages || []).map((m) => "[" + m.role + "]\n" + m.content).join("\n\n");
            } else if (kind === "embedding") {
              bodyHtml = "URL: " + (d.url || "") + "\n\u65B9\u6CD5: " + (d.method || "POST") + "\n\u6A21\u578B: " + (d.model || "") + "\n\n\u3010\u8BF7\u6C42\u4F53\u9884\u89C8\u3011\n" + (d.bodyPreview || "");
            } else {
              bodyHtml = "URL: " + (d.url || "") + "\n\u65B9\u6CD5: " + (d.method || "POST") + "\n\u6A21\u578B: " + (d.model || "") + "\nQuery: " + (d.query || "") + "\n\n\u3010Documents\u3011\n" + (Array.isArray(d.documents) ? d.documents.join("\n") : "");
            }
          } else if (e.dir === "response") {
            const d = e.data || {};
            if (kind === "llm") {
              bodyHtml = "\u6A21\u578B: " + (d.model || "") + "\nfinish_reason: " + (d.finish_reason || "") + "\nusage: " + fmt(d.usage) + "\n\n\u3010AI \u8F93\u51FA\u3011\n" + (d.output || "");
            } else if (kind === "embedding") {
              bodyHtml = "HTTP " + (d.httpStatus || "") + "\n\u7EF4\u5EA6: " + (d.dimension || "") + "\n\n\u3010\u54CD\u5E94\u9884\u89C8\u3011\n" + (d.responsePreview || "");
            } else {
              bodyHtml = "HTTP " + (d.httpStatus || "") + "\n\n\u3010Scores\u3011\n" + fmt(d.scores) + "\n\n\u3010\u54CD\u5E94\u9884\u89C8\u3011\n" + (d.responsePreview || "");
            }
          } else {
            const d = e.data || {};
            bodyHtml = "\u9519\u8BEF: " + (d.error || "") + (d.httpStatus ? "\nHTTP " + d.httpStatus : "") + (d.response || d.responsePreview ? "\n\n" + (d.response || d.responsePreview) : "");
          }
          return `<div class="wm-debug-item ${dirCls}">
          <div class="wm-debug-meta"><span class="wm-debug-dir">${dirLabel}</span><span class="wm-debug-time">${t}</span></div>
          <pre class="wm-debug-body">${escapeHtml(bodyHtml)}</pre>
        </div>`;
        }).join("");
        el.innerHTML = `<div class="wm-debug-title">${titles[kind]}\uFF08${logs.length}\uFF09</div>` + html;
      }
      function renderAll() {
        renderSec("llm");
        renderSec("embedding");
        renderSec("rerank");
      }
      body.querySelectorAll("[data-dbg]").forEach((b) => {
        b.onclick = () => {
          body.querySelectorAll("[data-dbg]").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          Object.keys(secs).forEach((k) => {
            secs[k].style.display = k === b.dataset.dbg ? "" : "none";
          });
          renderSec(b.dataset.dbg);
        };
      });
      body.querySelector("#dbg-clear").onclick = () => {
        if (WM.DebugLog) WM.DebugLog.clear();
        renderAll();
      };
      body.querySelector("#dbg-refresh").onclick = renderAll;
      body.querySelector('[data-dbg="llm"]').classList.add("active");
      Object.keys(secs).forEach((k) => {
        secs[k].style.display = k === "llm" ? "" : "none";
      });
      renderAll();
    }
    function renderClear(body) {
      const s = WM.Settings.load();
      const msgs = WM.Summary.getChatMessages && WM.Summary.getChatMessages() || [];
      const hiddenCount = msgs.filter((m) => m && m.is_wm_hidden).length;
      body.innerHTML = `
      <div class="wm-card wm-card-danger">
        <div class="wm-h">\u6E05\u7A7A\u5F53\u524D\u89D2\u8272\u5361\u6570\u636E</div>
        <div class="wm-hint">\u6B64\u64CD\u4F5C\u5C06<b>\u6C38\u4E45\u5220\u9664</b>\u5F53\u524D\u89D2\u8272\u5361\u4E0B\u7531\u6E29\u8BB0\u8BB0\u5F55\u7684\u5168\u90E8\u6570\u636E\uFF0C<b>\u4E0D\u53EF\u8FD8\u539F</b>\uFF1A
          <ul style="margin:6px 0 0 18px;line-height:1.8">
            <li>\u8BB0\u5FC6\u6761\u76EE\u3001\u603B\u7ED3\u3001\u5173\u7CFB\u56FE\u3001\u5267\u60C5\u7EBF\u3001\u7269\u54C1\u3001\u4E16\u754C\u89C2\u8BBE\u5B9A</li>
            <li>\u603B\u7ED3\u6307\u9488\uFF08\u9690\u85CF\u697C\u5C42\u7684\u8BB0\u5F55\u4F1A\u88AB\u6E05\u9664\uFF09</li>
          </ul>
          \u6E05\u7A7A\u540E\uFF0C\u4E4B\u524D\u56E0\u603B\u7ED3\u88AB\u9690\u85CF\u7684 <b>${hiddenCount}</b> \u6761\u697C\u5C42\u5C06<b>\u6062\u590D\u663E\u793A</b>\u3002<br>
          <span style="color:var(--wm-seal)">\u6CE8\u610F\uFF1A\u5168\u5C40\u8BBE\u7F6E\uFF08\u81EA\u52A8\u603B\u7ED3\u5F00\u5173\u7B49\uFF09\u4E0D\u53D7\u5F71\u54CD\uFF0C\u4E0D\u4F1A\u56E0\u6E05\u7A7A\u800C\u7A81\u7136\u81EA\u52A8\u603B\u7ED3\u3002</span>
        </div>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
          <button id="clr-confirm" class="wm-btn wm-btn-danger">\u6211\u786E\u8BA4\uFF0C\u6E05\u7A7A\u5168\u90E8\u6570\u636E</button>
        </div>
        <div id="clr-result" class="wm-test-box" style="margin-top:10px"></div>
      </div>`;
      const btn = body.querySelector("#clr-confirm");
      const box = body.querySelector("#clr-result");
      btn.onclick = async () => {
        if (!window.confirm("\u771F\u7684\u8981\u6E05\u7A7A\u5F53\u524D\u89D2\u8272\u5361\u7684\u5168\u90E8\u6E29\u8BB0\u6570\u636E\u5417\uFF1F\n\u6B64\u64CD\u4F5C\u4E0D\u53EF\u8FD8\u539F\uFF01")) return;
        btn.disabled = true;
        box.innerHTML = '<div class="wm-test-item">\u23F3 \u6E05\u7A7A\u4E2D\u2026</div>';
        try {
          await WM.MemoryStore.clearAll();
          box.innerHTML = '<div class="wm-test-item wm-ok">\u2705 \u5DF2\u6E05\u7A7A\u5F53\u524D\u89D2\u8272\u5361\u5168\u90E8\u6E29\u8BB0\u6570\u636E\uFF0C\u88AB\u9690\u85CF\u697C\u5C42\u5DF2\u6062\u590D\u663E\u793A\u3002</div>';
          toast("\u{1F33F} \u5DF2\u6E05\u7A7A\u5F53\u524D\u89D2\u8272\u5361\u6570\u636E");
          if (WM.Relations && WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
        } catch (e) {
          box.innerHTML = '<div class="wm-test-item wm-bad">\u274C \u6E05\u7A7A\u5931\u8D25\uFF1A' + String(e && e.message ? e.message : e) + "</div>";
        } finally {
          btn.disabled = false;
        }
      };
    }
    function renderCfg(body) {
      const s = WM.Settings.load();
      const tabs = [
        { key: "llm", label: "LLM \u8C03\u7528" },
        { key: "mem", label: "\u8BB0\u5FC6\u4E0E\u6CE8\u5165" },
        { key: "vec", label: "\u5411\u91CF(Embedding)" },
        { key: "rerank", label: "\u91CD\u6392\u5E8F(Rerank)" },
        { key: "lore", label: "\u4E16\u754C\u4E66" },
        { key: "err", label: "\u9519\u8BEF\u62A5\u544A" }
      ];
      const active = WM._cfgTab || "llm";
      body.innerHTML = `
      <div class="wm-subtabs" id="cfg-tabs">
        ${tabs.map((t) => `<button data-tab="${t.key}" class="${t.key === active ? "active" : ""}">${t.label}</button>`).join("")}
      </div>
      <div id="cfg-pane">${active === "llm" ? renderPaneLlm(s) : active === "mem" ? renderPaneMemory(s) : active === "vec" ? renderPaneVector(s) : active === "rerank" ? renderPaneRerank(s) : active === "lore" ? renderPaneLore(s) : active === "err" ? renderPaneErrors(s) : renderPaneLlm(s)}</div>
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
          else if (key === "rerank") pane.innerHTML = renderPaneRerank(s);
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
    function syncPaneToSettings(body, s, scope) {
      const q = (sel) => body.querySelector(sel);
      if (!scope || scope === "llm") {
        if (q("#llm-url") !== null) {
          const apiUrl = q("#llm-url").value.trim();
          s.llmConfig = {
            source: apiUrl ? "custom" : "local",
            apiUrl,
            apiKey: q("#llm-key") ? q("#llm-key").value.trim() : "",
            model: q("#llm-model") ? q("#llm-model").value.trim() : "",
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
      }
      if (!scope || scope === "mem") {
        if (q("#c-inj")) {
          s.injectMemories = q("#c-inj").checked;
          s.injectWorld = q("#c-injw").checked;
        }
      }
      if (!scope || scope === "vec") {
        if (q("#c-vec")) {
          s.vectorEnabled = q("#c-vec").checked;
        }
        if (q("#c-emb-url") !== null) {
          s.embeddingBaseUrl = q("#c-emb-url").value;
          s.embeddingApiKey = q("#c-emb-key") ? q("#c-emb-key").value : s.embeddingApiKey;
          s.embeddingModel = q("#c-emb-model") ? q("#c-emb-model").value : s.embeddingModel;
          s.takeoverEmbedding = q("#c-take-emb") ? q("#c-take-emb").checked : s.takeoverEmbedding;
        }
      }
      if (!scope || scope === "rerank") {
        if (q("#c-rerank")) {
          s.rerankEnabled = q("#c-rerank").checked;
        }
        if (q("#c-rk-url") !== null) {
          s.rerankBaseUrl = q("#c-rk-url").value;
          s.rerankApiKey = q("#c-rk-key") ? q("#c-rk-key").value : s.rerankApiKey;
          s.rerankModel = q("#c-rk-model") ? q("#c-rk-model").value : s.rerankModel;
          s.takeoverRerank = q("#c-take-re") ? q("#c-take-re").checked : s.takeoverRerank;
        }
      }
      if (!scope || scope === "lore") {
        if (q("#c-lore")) {
          s.lorebookName = q("#c-lore").value.trim();
          s.worldToLorebook = q("#c-wlore").checked;
        }
      }
    }
    function bindPaneEvents(body, s) {
      const pane = body.querySelector("#cfg-pane");
      if (pane) pane.querySelectorAll("input, textarea, select").forEach((el) => {
        el.addEventListener("change", () => syncPaneToSettings(body, s));
        el.addEventListener("input", () => syncPaneToSettings(body, s));
      });
      const ppImport = body.querySelector("#pp-import");
      const ppPreset = body.querySelector("#pp-preset");
      body.querySelectorAll('input[name="pp-mode"]').forEach((r) => {
        r.onchange = () => {
          const m = (body.querySelector('input[name="pp-mode"]:checked') || {}).value || "none";
          if (ppImport) ppImport.style.display = m === "import" ? "" : "none";
          if (ppPreset) ppPreset.style.display = m === "preset" ? "" : "none";
        };
      });
      body.querySelectorAll(".wm-subtabs[data-lv3]").forEach((bar) => {
        const group = bar.getAttribute("data-lv3");
        const paneWrap = bar.parentElement.querySelector(".wm-ptabs");
        bar.querySelectorAll("button").forEach((btn) => {
          btn.onclick = () => {
            const key = btn.dataset.ptab;
            bar.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
            if (paneWrap) paneWrap.querySelectorAll(".wm-ptab-pane").forEach((p) => {
              p.style.display = p.getAttribute("data-ptab-pane") === key ? "" : "none";
            });
          };
        });
      });
      const saveBtn = body.querySelector("#c-save");
      if (saveBtn) saveBtn.onclick = () => {
        const scope = WM._cfgTab || "llm";
        syncPaneToSettings(body, s, scope);
        WM.Settings.save(s);
        if (scope === "lore" && WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook();
        const labelMap = { llm: "LLM \u8C03\u7528", mem: "\u8BB0\u5FC6\u4E0E\u6CE8\u5165", vec: "\u5411\u91CF(Embedding)", rerank: "\u91CD\u6392\u5E8F(Rerank)", lore: "\u4E16\u754C\u4E66", err: "\u9519\u8BEF\u62A5\u544A" };
        toast("\u{1F33F} \u5DF2\u4FDD\u5B58\u300C" + (labelMap[scope] || scope) + "\u300D\u8BBE\u7F6E");
      };
      const testBtn = body.querySelector("#c-test");
      if (testBtn) testBtn.onclick = async () => {
        const scope = WM._cfgTab || "llm";
        syncPaneToSettings(body, s, scope);
        if (body.querySelector("#llm-url") !== null) syncPaneToSettings(body, s, "llm");
        const box = body.querySelector("#c-test-result");
        const tmp = Object.assign({}, s);
        box.innerHTML = '<div class="wm-test-item">\u23F3 \u6D4B\u8BD5\u4E2D\u2026</div>';
        const rows = [];
        const add = (name, r, detail) => {
          const ok = r && r.success;
          rows.push(`<div class="wm-test-item ${ok ? "wm-ok" : "wm-bad"}">${ok ? "\u2705" : "\u274C"} ${name}${ok ? "\uFF1A" + (detail || "") : "\uFF1A" + (r && r.error || "\u5931\u8D25")}</div>`);
        };
        const testLlm = async () => {
          const tmpLlm = tmp.llmConfig || {};
          try {
            const r = await WM.LLMClient.testConnection({ profile: tmpLlm });
            add("LLM(" + (tmpLlm.apiUrl ? "\u81EA\u5B9A\u4E49 BaseURL" : "\u672A\u914D\u7F6E") + ")", r, "");
          } catch (e) {
            add("LLM(\u7EDF\u4E00\u914D\u7F6E)", { success: false }, String(e.message || e));
          }
        };
        const testWorld = async () => {
          try {
            const wbOk = WM.Worldbook && WM.Worldbook.available && WM.Worldbook.available();
            if (wbOk) {
              const b = await WM.Worldbook.ensureLorebook();
              add("\u4E16\u754C\u4E66(\u9152\u9986)", { success: b }, b ? "\u5DF2\u5C31\u7EEA\uFF1A" + WM.Worldbook.targetName() : "");
            } else add("\u4E16\u754C\u4E66(\u9152\u9986)", { success: false }, "TavernHelper \u4E0D\u53EF\u7528");
          } catch (e) {
            add("\u4E16\u754C\u4E66(\u9152\u9986)", { success: false }, String(e.message || e));
          }
        };
        const testEmb = async () => {
          try {
            const embTestable = !!(tmp.embeddingBaseUrl || tmp.embeddingApiKey || tmp.embeddingModel);
            if (embTestable) add("Embedding(\u5411\u91CF)", await WM.EmbeddingClient.testConnection(tmp), "BaseURL=" + (tmp.embeddingBaseUrl || "(\u7528APIKey/\u6A21\u578B)"));
            else add("Embedding(\u5411\u91CF)", { success: true }, "\u672A\u586B\uFF0C\u8DF3\u8FC7\uFF08\u53EF\u7559\u7A7A\u7528\u9152\u9986\u5185\u7F6E\uFF09");
          } catch (e) {
            add("Embedding(\u5411\u91CF)", { success: false }, String(e.message || e));
          }
        };
        const testRk = async () => {
          try {
            const rkTestable = !!(tmp.rerankEnabled || tmp.rerankBaseUrl || tmp.rerankApiKey || tmp.rerankModel);
            if (rkTestable) add("Rerank(\u91CD\u6392)", await WM.RerankClient.testConnection(tmp), "BaseURL=" + (tmp.rerankBaseUrl || "(\u7528APIKey/\u6A21\u578B)"));
            else add("Rerank(\u91CD\u6392)", { success: true }, "\u672A\u586B\uFF0C\u8DF3\u8FC7\uFF08\u53EF\u7559\u7A7A\u7528\u9152\u9986\u5185\u7F6E\uFF09");
          } catch (e) {
            add("Rerank(\u91CD\u6392)", { success: false }, String(e.message || e));
          }
        };
        if (scope === "llm") {
          await testLlm();
          await testWorld();
        } else if (scope === "mem") {
          await testWorld();
        } else if (scope === "vec") {
          await testEmb();
        } else if (scope === "rerank") {
          await testRk();
        } else if (scope === "lore") {
          await testWorld();
        } else {
          await testLlm();
          await testWorld();
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
      <div class="wm-hint">\u5411\u91CF / \u91CD\u6392\u7684\u5177\u4F53\u670D\u52A1\u914D\u7F6E\u5728\u300C\u5411\u91CF(Embedding)\u300D\u300C\u91CD\u6392\u5E8F(Rerank)\u300D\u4E24\u4E2A\u9762\u677F\u3002</div>
    </div>`;
    }
    function renderPaneVector(s) {
      return `<div class="wm-card">
      <div class="wm-h">Embedding\uFF08\u5411\u91CF\uFF09\u914D\u7F6E</div>
      <label class="wm-row"><input type="checkbox" id="c-vec" ${s.vectorEnabled ? "checked" : ""}/> \u542F\u7528\u5411\u91CF\u68C0\u7D22</label>
      <label class="wm-row">Base URL<input id="c-emb-url" value="${s.embeddingBaseUrl}" placeholder="http://127.0.0.1:8080/vec/v1/embeddings \u6216 https://api.siliconflow.cn/v1"/></label>
      <div class="wm-hint">\u76F4\u63A5\u586B\u4EFB\u610F\u670D\u52A1\u7684 Base URL\uFF0C\u81EA\u52A8\u9002\u914D\uFF1A<br/>\xB7 \u672C\u5730\u53CD\u4EE3/\u540C\u6E90\u4EE3\u7406\uFF1A<code>http://127.0.0.1:8080/vec</code>\uFF08\u81EA\u52A8\u8865 /v1/embeddings\uFF09<br/>\xB7 \u7845\u57FA\u6D41\u52A8\u7B49\u4E91\u7AEF\uFF1A<code>https://api.siliconflow.cn/v1</code><br/>\xB7 Gemini\uFF1A<code>https://generativelanguage.googleapis.com/v1beta</code></div>
      <label class="wm-row">API Key<input id="c-emb-key" type="password" value="${s.embeddingApiKey}" placeholder="\u53EF\u9009\uFF08\u672C\u5730\u53CD\u4EE3\u7559\u7A7A\uFF09"/></label>
      <label class="wm-row">\u6A21\u578B<input id="c-emb-model" value="${s.embeddingModel}" placeholder="text-embedding-3-small"/></label>
      <div class="wm-divider"></div>
      <label class="wm-row"><input type="checkbox" id="c-take-emb" ${s.takeoverEmbedding ? "checked" : ""}/> \u63A5\u7BA1\u5411\u91CF\u68C0\u7D22\uFF08\u7528\u6211\u4EEC\u81EA\u5DF1\u7684\u5411\u91CF\u53EC\u56DE\u4E16\u754C\u4E66\u6761\u76EE\uFF09</label>
    </div>`;
    }
    function renderPaneRerank(s) {
      return `<div class="wm-card">
      <div class="wm-h">Rerank\uFF08\u91CD\u6392\u5E8F\uFF09\u914D\u7F6E</div>
      <label class="wm-row"><input type="checkbox" id="c-rerank" ${s.rerankEnabled ? "checked" : ""}/> \u542F\u7528\u91CD\u6392\u5E8F(Rerank)</label>
      <label class="wm-row">Base URL<input id="c-rk-url" value="${s.rerankBaseUrl}" placeholder="https://api.siliconflow.cn/v1/rerank \u6216 http://127.0.0.1:8080/vec/v1/rerank"/></label>
      <div class="wm-hint">\u76F4\u63A5\u586B\u4EFB\u610F\u670D\u52A1\u7684 Base URL\uFF0C\u81EA\u52A8\u9002\u914D\uFF1A<br/>\xB7 \u672C\u5730\u53CD\u4EE3/\u540C\u6E90\u4EE3\u7406\uFF1A<code>http://127.0.0.1:8080/vec</code>\uFF08\u81EA\u52A8\u8865 /v1/rerank\uFF09<br/>\xB7 \u7845\u57FA\u6D41\u52A8\u7B49\u4E91\u7AEF\uFF1A<code>https://api.siliconflow.cn/v1/rerank</code></div>
      <label class="wm-row">API Key<input id="c-rk-key" type="password" value="${s.rerankApiKey}" placeholder="\u53EF\u9009\uFF08\u672C\u5730\u53CD\u4EE3\u7559\u7A7A\uFF09"/></label>
      <label class="wm-row">\u6A21\u578B<input id="c-rk-model" value="${s.rerankModel}" placeholder="BAAI/bge-reranker-v2-m3"/></label>
      <div class="wm-divider"></div>
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
        pane += `<div class="wm-row">
        <button id="err-copy" class="wm-btn">\u590D\u5236\u4E3A\u6587\u672C</button>
        <button id="err-download" class="wm-btn">\u5BFC\u51FA JSON</button>
        <button id="err-clear" class="wm-btn">\u6E05\u7A7A\u672C\u62A5\u544A</button>
      </div>`;
      }
      pane += `</div>`;
      setTimeout(() => {
        const copyBtn = document.getElementById("err-copy");
        if (copyBtn) copyBtn.onclick = () => {
          const txt = WM.ErrLog && WM.ErrLog.toText ? WM.ErrLog.toText() : "";
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(() => toast("\u5DF2\u590D\u5236\u9519\u8BEF\u62A5\u544A\u5230\u526A\u8D34\u677F"), () => toast("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9"));
          } else {
            toast("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u526A\u8D34\u677F");
          }
        };
        const dlBtn = document.getElementById("err-download");
        if (dlBtn) dlBtn.onclick = () => {
          const json = WM.ErrLog && WM.ErrLog.exportJSON ? WM.ErrLog.exportJSON() : "{}";
          const blob = new Blob([json], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "warmmemo_errors_" + Date.now() + ".json";
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(a.href);
        };
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
          let r = await WM.Summary.triggerSummary(s);
          if (r && !r.ok && s.autoSummaryMode === "floor") {
            const total = WM.Summary.getRecentMessages && WM.Summary.getRecentMessages(1e3).length || 0;
            const ptr = WM.MemoryStore.getSummaryPointer();
            if (ptr < total) r = await WM.Summary.triggerSummary(s, { forceEnd: true });
          }
          if (r && r.ok) {
            if (s.autoHideFloors && WM.FloorHider && WM.FloorHider.hideUntil) {
              await WM.FloorHider.hideUntil(r.range[1]);
            }
            const extra = r.partial ? "\uFF08\u90E8\u5206\u63D0\u70BC\u5931\u8D25\uFF0C\u89C1\u9519\u8BEF\u62A5\u544A\uFF09" : "";
            toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u5DF2\u63D0\u70BC ${r.count} \u6761\u8BB0\u5FC6\uFF08\u697C\u5C42 ${r.range[0]}-${r.range[1]}\uFF09${extra}`);
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
        t.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(91,110,87,.95);color:#fff;padding:6px 14px;border-radius:12px;font-size:12px;z-index:100002;box-shadow:0 4px 14px rgba(0,0,0,.2)";
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
  window.WarmMemo = window.WarmMemo || {};
  window.WarmMemo.version = "fix-relgraph-centered-and-plot-status-and-mem-tab";
  if (window.WarmMemo && window.WarmMemo.Launcher) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.WarmMemo.Launcher.init());
    else window.WarmMemo.Launcher.init();
  } else {
    console.error("[WarmMemo] \u542F\u52A8\u5931\u8D25\uFF1ALauncher \u672A\u5B9A\u4E49");
  }
  console.log("[WarmMemo] \u5C31\u7EEA");
})();
