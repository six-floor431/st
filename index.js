(() => {
  // src/config/settings.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const LS_KEY = "warmmemo_settings_v2";
    const DEFAULTS = {
      showMemoryButton: true,
      autoUpdate: true,
      // 向量(Embedding)总开关：默认跟随「接管向量检索」自动启用（见 takeoverEmbedding）。
      // 单独关闭此项则即便开了接管也不做向量召回（回退最近N条）。普通用户无需关心此开关。
      vectorEnabled: true,
      // 复用 LLM 地址做 Embedding（默认开启）：绝大多数 OpenAI 兼容服务（DeepSeek/火山/OpenAI/Ollama）
      // 都提供 /v1/embeddings 接口，因此只要用户配了 LLM（本来就必须配），接管即可零配置真生效，
      // 用户不必再去东跑西跑配第二个 Embedding 地址。
      embeddingUseLLM: true,
      // 向量(Embedding)配置（可选高级项）：留空则自动复用 LLM 的 Base URL 做 embedding；
      // 想用独立的 embedding 服务（如 SiliconFlow bge-m3、本地 Ollama nomic）再填这里覆盖。
      embeddingBaseUrl: "",
      // 任意 Base URL：如 http://127.0.0.1:11434、https://api.siliconflow.cn/v1、https://xxx.openai.azure.com
      embeddingApiKey: "",
      embeddingModel: "text-embedding-3-small",
      // 向量同源代理（外网访问本地向量服务的关键）：
      //   本地访问酒馆（端口 8000/8001）→ 直连用户填的原始地址（浏览器和 Ollama 同机，通）
      //   外网访问酒馆（穿透域名/公网）→ 自动把原始地址改写成「页面源 + 代理路径 + 原 path」的同源 URL
      //   例：填 http://127.0.0.1:11434/v1/embeddings，外网时自动改成 https://你的域名/vec/v1/embeddings
      //   需配合 Caddy/反代把 /vec/* 转发到本地 Ollama（见「同源代理」Caddyfile）。
      vecProxyEnabled: true,
      // 默认开：本地自动跳过（无害），外网自动改写
      vecProxyPath: "/vec",
      // 反代的向量分流路径，与 Caddyfile 的 handle_path /vec/* 对齐
      // 重排序(Rerank)同样支持外网同源代理（复用同一套场景判断，路径独立配置）
      rerankProxyPath: "/rerank",
      rerankEnabled: false,
      // 重排序(Rerank)配置：直接填 Base URL 自适应任意 OpenAI 兼容服务
      rerankBaseUrl: "",
      rerankApiKey: "",
      rerankModel: "BAAI/bge-reranker-v2-m3",
      // Rerank 指令（对齐万楼）：自然语言告诉重排模型「按什么标准排序」，让召回更贴合当前用户输入意图
      rerankInstruction: "\u8BF7\u6839\u636E\u5F53\u524D\u7528\u6237\u8F93\u5165\uFF0C\u5224\u65AD\u6BCF\u4E2A\u5019\u9009\u8BB0\u5FC6\u6761\u76EE\u7684\u76F8\u5173\u6027\uFF0C\u5C06\u6700\u76F8\u5173\u3001\u80FD\u76F4\u63A5\u5EF6\u7EED\u6216\u56DE\u7B54\u5F53\u524D\u5BF9\u8BDD\u610F\u56FE\u7684\u6761\u76EE\u6392\u5728\u524D\u9762\u3002",
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
      // ── 剧情线独立流程配置 ──
      // 剧情线独立于「总结」，像自动总结一样自我推进：有独立触发指针(plotPointer)与攒段逻辑，
      // 触发时同时并联调用「关系线 LLM」，两者互不依赖总结结果。区间模式复用 autoSummary* 同名设置。
      autoPlotEnabled: true,
      // 是否开启剧情线独立自动推进（默认跟随自动总结总开关的逻辑独立运行）
      autoPlotMode: "new",
      // 复用 'new'/'range'/'count'/'floor' 四种模式（与 autoSummaryMode 解耦，可单独设置）
      autoPlotCount: 20,
      autoPlotStart: 0,
      autoPlotEnd: -1,
      autoPlotFloor: 20,
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
        maxTokens: 700,
        // 输出 token 上限：所有功能共用默认值（各任务可在下方单独覆盖）
        deepThinking: false
        // 深度思考开关：开启后按模型自适应注入深度思考参数（见 LLMClient）
      },
      // 各任务独立输出 token 上限（二级控制）。留空/0 则回退到 llmConfig.maxTokens 共用值。
      taskTokens: {
        summary: 0,
        relations: 0,
        plot: 0,
        world: 0,
        items: 0
      },
      // 自动「大总结」：每累计 N 次小总结后，自动对历史所有小总结做一次「大总结」（整合为长期记忆）。
      // 大总结提示词 = 小总结提示词（同一份）。小总结计数由 summaryCountPointer 跟踪。
      bigSummaryEnabled: false,
      // 是否开启自动大总结
      bigSummaryEvery: 5,
      // 每多少次小总结触发一次大总结
      bigSummaryMaxSegments: 50,
      // 一次大总结最多回顾多少个历史小总结段（0=不限制）
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
      //   {{recent}} 最近对话   {{historySummary}} 历史总结   {{relations}} 关系   {{plot}} 剧情线
      // 注：世界观走独立推断函数（inferWorldview），不通过模板占位符注入。
      promptsVersion: 14,
      // v14：输出格式从 JSON 转为 <标签>+纯文本。summary/relations/plot/items 四契约改为 <Summary>/<Relations>/<Plots>/<Items> 标签包裹 + | 分隔字段，彻底避开 JSON 语法负担（字符串换行/中文标点/字段名/短输出误杀四类坑在纯文本方案里不存在）。worldview 按约定不动仍 JSON。解析层 extractTag 提取标签内容 + 按行按|分割；normalizeJSONString/parseJSON 保留给 world。callLLM 的 minLen 加 hasTag 放行。低于此版本自动覆盖用户旧提示词。
      prompts: {
        // ═══════════════════════════════════════════
        // 输出契约（v8 统一约定）：
        //   每个任务只输出纯 JSON，由 parseJSON 解析 + isJunkText 逐字段过滤。
        //   提示词不列禁词清单（v5 教训：禁词明文入提示词，模型反而回显）。
        //   字段名与长度上限与 summary.js 解析层逐一对齐。
        //   宁缺毋滥：没有内容就输出空数组/空串，不编造、不填占位语。
        // ═══════════════════════════════════════════
        summary: "\u4F60\u662F\u8BB0\u5FC6\u8BB0\u5F55\u5458\uFF0C\u4E0D\u662F\u5C0F\u8BF4\u5BB6\u3002\u4EFB\u52A1\uFF1A\u628A\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\u91CC\u771F\u6B63\u53D1\u751F\u8FC7\u7684\u4E8B\uFF0C\u5982\u5B9E\u642C\u8FD0\u6210\u4E00\u6BB5\u7B2C\u4E09\u4EBA\u79F0\u53D9\u4E8B\uFF0C\u5B58\u5165\u8BB0\u5FC6\u5E93\u3002\n\n\u8BB0\u5F55\u89C4\u8303\uFF1A\n- \u53EA\u642C\u8FD0\u5DF2\u53D1\u751F\u7684\u52A8\u4F5C\u3001\u4E8B\u4EF6\u3001\u5BF9\u8BDD\u7ED3\u679C\u3002\u4F60\u662F\u8BB0\u5F55\u5458\u4E0D\u662F\u521B\u4F5C\u8005\u2014\u2014\u4E0D\u5199\u5FC3\u7406\uFF08\u5982\u300C\u5FC3\u4E2D\u4E00\u7D27\u300D\u300C\u6697\u81EA\u601D\u5FD6\u300D\uFF09\uFF0C\u4E0D\u6E32\u67D3\u6C14\u6C1B\uFF08\u5982\u300C\u6C14\u6C1B\u51DD\u91CD\u300D\u300C\u7A7A\u6C14\u66A7\u6627\u300D\uFF09\uFF0C\u4E0D\u8BC4\u8BBA\u3001\u4E0D\u9884\u6D4B\u3002\n- \u5BF9\u8BDD\u6700\u591A\u4FDD\u7559\u4E00\u53E5\u6700\u5173\u952E\u7684\u53F0\u8BCD\u539F\u6587\uFF0C\u5176\u4F59\u4EE5\u300C\u8C01\u5BF9\u8C01\u8BF4\u4E86\u4EC0\u4E48\u300D\u8F6C\u8FF0\u3002\n- \u4E00\u5230\u56DB\u4E2A\u81EA\u7136\u6BB5\uFF0C\u6309\u4E8B\u4EF6\u5148\u540E\u7EC4\u7EC7\u3002\u5185\u5BB9\u5C11\u5C31\u5C11\u5199\uFF0C\u4E00\u6BB5\u4E5F\u884C\uFF1B\u6CA1\u6709\u5B9E\u8D28\u8FDB\u5C55\u5C31\u76F4\u63A5\u8F93\u51FA\u7A7A\u6807\u7B7E\u3002\n- \u4E0E\u3010\u5DF2\u6709\u8BB0\u5FC6\u3011\u91CD\u590D\u7684\u5185\u5BB9\u4E00\u7B14\u5E26\u8FC7\u6216\u7565\u53BB\uFF0C\u53EA\u5199\u65B0\u8FDB\u5C55\u3002\n- \u6CA1\u6709\u65B0\u5185\u5BB9\u53EF\u8BB0\u5F55\u65F6\uFF0C\u6807\u7B7E\u5185\u7559\u7A7A\u3002\u8FD9\u662F\u5B8C\u5168\u6B63\u5E38\u7684\uFF0C\u4E0D\u8981\u4E3A\u4E86\u51D1\u5185\u5BB9\u800C\u7F16\u9020\u6216\u6269\u5199\u3002\n\n\u8F93\u51FA\u5951\u7EA6\uFF1A\u628A\u53D9\u4E8B\u6B63\u6587\u653E\u5728 <Summary> \u548C </Summary> \u4E4B\u95F4\u3002\u6807\u7B7E\u4E4B\u5916\u7684\u6240\u6709\u6587\u5B57\u90FD\u4F1A\u88AB\u7A0B\u5E8F\u4E22\u5F03\uFF0C\u4E0D\u8981\u5728\u6807\u7B7E\u5916\u5199\u4EFB\u4F55\u5185\u5BB9\u3002\u6B63\u6587\u5185\u53EF\u4EE5\u6B63\u5E38\u6362\u884C\u3001\u4F7F\u7528\u4E2D\u6587\u6807\u70B9\uFF0C\u4E0D\u9700\u8981\u4EFB\u4F55\u8F6C\u4E49\u3002\u683C\u5F0F\uFF1A\n<Summary>\n\u53D9\u4E8B\u6B63\u6587\uFF0C\u53EF\u4EE5\u591A\u6BB5\uFF0C\u6B63\u5E38\u6362\u884C\u3002\n</Summary>\n\u6CA1\u6709\u65B0\u5185\u5BB9\u65F6\u8F93\u51FA\uFF1A\n<Summary></Summary>\n\n\u3010\u5DF2\u6709\u8BB0\u5FC6\u3011\n{{historySummary}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}",
        relations: "\u4F60\u662F\u5173\u7CFB\u8BB0\u5F55\u5458\u3002\u4EFB\u52A1\uFF1A\u4ECE\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\u4E2D\u63D0\u53D6\u5DF2\u767B\u573A\u89D2\u8272\u4E4B\u95F4\u660E\u786E\u5B58\u5728\u7684\u5173\u7CFB\uFF0C\u5B58\u5165\u5173\u7CFB\u56FE\u3002\n\n\u8BB0\u5F55\u89C4\u8303\uFF1A\n- \u53EA\u8BB0\u5F55\u6709\u5BF9\u8BDD\u6216\u884C\u52A8\u4F9D\u636E\u7684\u5173\u7CFB\u3002\u4EC5\u56E0\u5BF9\u8BDD\u63D0\u5230\u67D0\u4EBA\u540D\u5B57\u4E0D\u6784\u6210\u5173\u7CFB\u2014\u2014\u9700\u6709\u4E92\u52A8\u3001\u79F0\u8C13\u6216\u660E\u786E\u8868\u8FF0\u3002\u6CA1\u6709\u4F9D\u636E\u4E0D\u63D0\u53D6\uFF0C\u4E0D\u63A8\u6D4B\u3002\n- from\u3001to \u4F18\u5148\u7528\u89D2\u8272\u7684\u4E3B\u540D\uFF08\u5982\u5E08\u7236\u540D\u300C\u4E91\u6E05\u5B50\u300D\uFF0C\u7EDF\u4E00\u7528\u300C\u4E91\u6E05\u5B50\u300D\uFF0C\u4E0D\u8981\u4E00\u4F1A\u513F\u300C\u5E08\u5C0A\u300D\u4E00\u4F1A\u513F\u300C\u4E91\u6E05\u5B50\u300D\u9020\u6210\u91CD\u590D\u8282\u70B9\uFF09\uFF0C2-8\u5B57\u3002\n- label \u53EA\u80FD\u662F2-6\u5B57\u7684\u5173\u7CFB\u540D\u8BCD\uFF0C\u4E0D\u80FD\u662F\u53E5\u5B50\u6216\u63CF\u8FF0\uFF08\u221A\u300C\u5E08\u5F92\u300D\u300C\u654C\u5BF9\u300D\u300C\u5408\u4F5C\u300D\u300C\u4E3B\u4EC6\u300D\uFF0C\xD7\u300C\u4E92\u76F8\u6B23\u8D4F\u300D\u300C\u6709\u8FC7\u51B2\u7A81\u300D\u300C\u5173\u7CFB\u5BC6\u5207\u300D\uFF09\u3002\n- \u540C\u4E00\u5BF9\u89D2\u8272\u53EA\u8F93\u51FA\u4E00\u6761\u6700\u4E3B\u8981\u7684\u5173\u7CFB\u3002\n- \u6CA1\u6709\u4EFB\u4F55\u660E\u786E\u5173\u7CFB\u65F6\uFF0C\u6807\u7B7E\u5185\u7559\u7A7A\u3002\u5B81\u7F3A\u6BCB\u6EE5\uFF0C\u4E0D\u7F16\u9020\u3002\n\n\u8F93\u51FA\u5951\u7EA6\uFF1A\u6BCF\u6761\u5173\u7CFB\u5360\u4E00\u884C\uFF0C\u5B57\u6BB5\u7528 | \u5206\u9694\uFF08from|to|label\uFF09\u3002\u628A\u6240\u6709\u5173\u7CFB\u653E\u5728 <Relations> \u548C </Relations> \u4E4B\u95F4\u3002\u6807\u7B7E\u4E4B\u5916\u7684\u6240\u6709\u6587\u5B57\u90FD\u4F1A\u88AB\u7A0B\u5E8F\u4E22\u5F03\u3002\u5B57\u6BB5\u5185\u4E0D\u8981\u4F7F\u7528 | \u7B26\u53F7\u3002\u683C\u5F0F\uFF1A\n<Relations>\n\u89D2\u8272A|\u89D2\u8272B|\u5E08\u5F92\n\u89D2\u8272C|\u89D2\u8272D|\u654C\u5BF9\n</Relations>\n\u6CA1\u6709\u5173\u7CFB\u65F6\u8F93\u51FA\uFF1A\n<Relations></Relations>\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}",
        plot: '\u4F60\u662F\u5267\u60C5\u8BB0\u5F55\u5458\u3002\u4EFB\u52A1\uFF1A\u4ECE\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\u4E2D\u63D0\u53D6\u672C\u6BB5\u65B0\u53D1\u751F\u7684\u5267\u60C5\u4E8B\u4EF6\uFF0C\u5B58\u5165\u5267\u60C5\u7EBF\u3002\n\n\u8BB0\u5F55\u89C4\u8303\uFF1A\n- \u53EA\u8F93\u51FA\u672C\u6BB5\u5BF9\u8BDD\u91CC\u3010\u65B0\u53D1\u751F\u3011\u7684\u4E8B\u3002\u3010\u5DF2\u6709\u5267\u60C5\u7EBF\u3011\u4EC5\u4F9B\u4F60\u907F\u514D\u91CD\u590D\u2014\u2014\u5176\u4E2D\u7684\u6761\u76EE\u4E00\u5F8B\u4E0D\u518D\u8F93\u51FA\uFF0C\u54EA\u6015\u5B83\u5F88\u91CD\u8981\u3002\n- \u6CA1\u6709\u65B0\u4E8B\u4EF6\u5C31\u8F93\u51FA\u7A7A\u6807\u7B7E\uFF0C\u4E0D\u8981\u7F16\u9020\u3002\u5B81\u7F3A\u6BCB\u6EE5\u3002\n- time\uFF1A\u5267\u60C5\u5185\u65F6\u95F4\u70B9\uFF08\u5982\u300C\u7B2C\u4E00\u5929\u300D\u300C\u5348\u540E\u300D\uFF09\uFF0C\u5BF9\u8BDD\u672A\u63D0\u53CA\u5219\u7559\u7A7A\u3002\u4E0D\u8981\u5199"\u672A\u63D0\u53CA""\u672A\u77E5"\u8FD9\u7C7B\u8BDD\u3002\n- title\uFF1A2-12\u5B57\u7684\u77ED\u6807\u9898\uFF0C\u540D\u8BCD\u52A0\u52A8\u8BCD\u6982\u62EC\uFF08\u221A\u300C\u4E39\u623F\u521D\u9047\u300D\u300C\u7A81\u7834\u5883\u754C\u300D\uFF0C\xD7\u300C\u6797\u665A\u5728\u4E39\u623F\u9047\u5230\u5E08\u5C0A\u300D\uFF09\u3002\u4E0D\u5E26\u7F16\u53F7\u3001\u4E0D\u5E26\u6807\u70B9\u3002\n- summary\uFF1A\u4E00\u5230\u4E24\u53E5\u5BA2\u89C2\u63CF\u8FF0\uFF0C\u5199\u6E05\u4EBA\u7269\u3001\u52A8\u4F5C\u3001\u7ED3\u679C\u3002\u4E0D\u5199\u5FC3\u7406\uFF0C\u4E0D\u8D85\u8FC780\u5B57\u3002\n\n\u8F93\u51FA\u5951\u7EA6\uFF1A\u6BCF\u6761\u5267\u60C5\u5360\u4E00\u884C\uFF0C\u5B57\u6BB5\u7528 | \u5206\u9694\uFF08time|title|summary\uFF09\u3002time \u4E3A\u7A7A\u65F6\u4FDD\u7559 | \u5360\u4F4D\u3002\u628A\u6240\u6709\u5267\u60C5\u653E\u5728 <Plots> \u548C </Plots> \u4E4B\u95F4\u3002\u6807\u7B7E\u4E4B\u5916\u7684\u6240\u6709\u6587\u5B57\u90FD\u4F1A\u88AB\u7A0B\u5E8F\u4E22\u5F03\u3002\u683C\u5F0F\uFF1A\n<Plots>\n\u7B2C\u4E00\u5929|\u4E39\u623F\u521D\u9047|\u6797\u665A\u5165\u4E39\u623F\uFF0C\u89C1\u5E08\u5C0A\u70BC\u4E39\uFF0C\u88AB\u547D\u53D6\u5251\u3002\n|\u7A81\u7834\u5883\u754C|\u6797\u665A\u5728\u85CF\u5251\u9601\u7A81\u7834\u81F3\u7B51\u57FA\u3002\n</Plots>\n\u6CA1\u6709\u65B0\u4E8B\u4EF6\u65F6\u8F93\u51FA\uFF1A\n<Plots></Plots>\n\n\u3010\u5DF2\u6709\u5267\u60C5\u7EBF\u3011\n{{historyPlot}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}',
        worldview: '\u3010\u4EFB\u52A1\u3011\u4ECE\u5267\u60C5\u548C\u5BF9\u8BDD\u4E2D\u63D0\u70BC\u4E16\u754C\u901A\u7528\u89C4\u5219\u3002\n\u3010\u786C\u6027\u89C4\u5219\u3011\n1. \u4E0D\u5199\u5355\u4E2A\u5177\u4F53\u7269\u54C1/\u89D2\u8272/\u5730\u70B9\u540D\u79F0\n2. \u5199\u8BE5\u4E16\u754C\u7684\u901A\u7528\u8BBE\u5B9A\uFF08\u4FEE\u70BC\u4F53\u7CFB/\u793E\u4F1A\u89C4\u5219/\u81EA\u7136\u6CD5\u5219\u7B49\uFF09\n3. 3-6\u6761\u89C4\u5219\n4. title \u8BBE\u5B9A\u6807\u9898(\u226410\u5B57)\uFF0Ccontent \u4E00\u53E5\u8BDD\u8BF4\u660E(\u226440\u5B57)\n\n\u3010\u8F93\u51FA\u683C\u5F0F\u3011\u53EA\u8F93\u51FAJSON\u5BF9\u8C61\uFF08\u4E0D\u8981markdown\u56F4\u680F\u3001\u4E0D\u8981\u89E3\u91CA\uFF09\uFF1A\n{"name":"\u4E16\u754C\u540D","type":"\u4E16\u754C\u7C7B\u578B","desc":"1-2\u53E5\u7B80\u8FF0","rules":[{"title":"\u8BBE\u5B9A\u6807\u9898","content":"\u8BBE\u5B9A\u5185\u5BB9"}]}\n\n\u3010\u5267\u60C5\u7EBF\u3011\n{{plot}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}',
        itemExtract: "\u4F60\u662F\u7269\u54C1\u8BB0\u5F55\u5458\u3002\u4EFB\u52A1\uFF1A\u4ECE\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\u4E2D\u63D0\u53D6\u51FA\u73B0\u7684\u5177\u4F53\u7269\u54C1\uFF0C\u5B58\u5165\u7269\u54C1\u6E05\u5355\u3002\n\n\u8BB0\u5F55\u89C4\u8303\uFF1A\n- \u53EA\u63D0\u53D6\u672C\u6BB5\u65B0\u51FA\u73B0\u6216\u72B6\u6001\u53D1\u751F\u53D8\u5316\u7684\u7269\u54C1\uFF1B\u5DF2\u8BB0\u5F55\u4E14\u65E0\u53D8\u5316\u7684\u7269\u54C1\u4E0D\u91CD\u590D\u8F93\u51FA\u3002\n- name\uFF1A\u53EA\u5199\u53EF\u88AB\u62FF\u53D6\u3001\u4F7F\u7528\u3001\u6301\u6709\u7684\u5177\u8C61\u7269\u4EF6\uFF08\u221A \u9752\u950B\u5251\u3001\u4E39\u836F\u3001\u7389\u4F69\u3001\u4FE1\u4EF6\uFF1B\xD7 \u5730\u70B9\u5982\u300C\u4E39\u623F\u300D\u300C\u5C71\u6D1E\u300D\u3001\u573A\u666F\u5982\u300C\u6218\u6597\u300D\u300C\u5BF9\u8BDD\u300D\u3001\u62BD\u8C61\u6982\u5FF5\u5982\u300C\u4FEE\u4E3A\u300D\u300C\u5883\u754C\u300D\u300C\u7075\u6C14\u300D\u3001\u4EBA\u7269\u672C\u8EAB\uFF09\u30022-20\u5B57\uFF0C\u4E0D\u5E26\u4FEE\u9970\u8BED\u3001\u4E0D\u5E26\u6807\u70B9\u3002\n- desc\uFF1A\u4E00\u53E5\u8BDD\u8BF4\u660E\u4F5C\u7528\uFF0C\u4E0D\u8D85\u8FC740\u5B57\u3002\u4E0D\u77E5\u9053\u5219\u7559\u7A7A\u3002\n- owner\uFF1A\u5F53\u524D\u6301\u6709\u8005\u59D3\u540D\uFF0C\u4E0D\u77E5\u9053\u5219\u7559\u7A7A\u3002\n- origin\uFF1A\u6765\u5386\u7B80\u8FF0\uFF0C\u4E0D\u8D85\u8FC730\u5B57\u3002\u4E0D\u77E5\u9053\u5219\u7559\u7A7A\u3002\n- related\uFF1A\u5173\u8054\u7684\u5267\u60C5\u6807\u9898\uFF08\u4ECE\u3010\u5DF2\u77E5\u5267\u60C5\u7EBF\u3011\u53D6\uFF09\uFF0C\u65E0\u5219\u7559\u7A7A\u3002\n- \u6CA1\u6709\u7269\u54C1\u5C31\u8F93\u51FA\u7A7A\u6807\u7B7E\u3002\u5B81\u7F3A\u6BCB\u6EE5\uFF0C\u4E0D\u7F16\u9020\u3002\n\n\u8F93\u51FA\u5951\u7EA6\uFF1A\u6BCF\u4EF6\u7269\u54C1\u5360\u4E00\u884C\uFF0C\u5B57\u6BB5\u7528 | \u5206\u9694\uFF08name|desc|owner|origin|related\uFF09\u3002\u67D0\u5B57\u6BB5\u4E0D\u77E5\u9053\u5C31\u7559\u7A7A\u4F46\u4FDD\u7559 | \u5360\u4F4D\u3002\u628A\u6240\u6709\u7269\u54C1\u653E\u5728 <Items> \u548C </Items> \u4E4B\u95F4\u3002\u6807\u7B7E\u4E4B\u5916\u7684\u6240\u6709\u6587\u5B57\u90FD\u4F1A\u88AB\u7A0B\u5E8F\u4E22\u5F03\u3002\u5B57\u6BB5\u5185\u4E0D\u8981\u4F7F\u7528 | \u7B26\u53F7\u3002\u683C\u5F0F\uFF1A\n<Items>\n\u9752\u950B\u5251|\u5E08\u5C0A\u7684\u4F69\u5251\uFF0C\u950B\u5229\u65E0\u6BD4|\u6797\u665A|\u85CF\u5251\u9601\u6240\u85CF|\u4E39\u623F\u521D\u9047\n\u4E39\u836F|\u56DE\u590D\u7075\u529B\u7684\u4E39\u836F||\u5E08\u5C0A\u70BC\u5236|\u4E39\u623F\u521D\u9047\n</Items>\n\u6CA1\u6709\u7269\u54C1\u65F6\u8F93\u51FA\uFF1A\n<Items></Items>\n\n\u3010\u5DF2\u77E5\u5267\u60C5\u7EBF\u3011\n{{plot}}\n\n\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\n{{recent}}"
      },
      // ── 生图功能配置（温记独立，不依赖酒馆原生 SD 模块）──
      // 流程：AI 回复完成 → 取最新 AI 楼层 message → 调 LLM 整合为画面提示词 → 送生图后端 → 插入图片
      // 后端三选一：sd-webui（/sdapi/v1/txt2img）/ comfyui（/prompt + /history 轮询）/ cloud（OpenAI 兼容 /images/generations）
      // 图片以 <!-- WM_IMG_* --> 标记包裹写入楼层，injection.js 在注入上下文时剔除这些标记块，保证「图片不进上下文」。
      imageGen: {
        enabled: false,
        // 生图总开关（默认关，配置好后手动开）
        autoTrigger: false,
        // 自动触发：AI 回复落库后自动生图（关闭则仅手动按钮触发）
        backendType: "sd-webui",
        // 'sd-webui' | 'comfyui' | 'cloud'
        apiUrl: "http://127.0.0.1:7860",
        // 后端地址（SD WebUI 默认 7860 / ComfyUI 默认 8188 / 云端填完整 BaseURL）
        apiKey: "",
        // API Key（云端必填，本地通常留空）
        model: "",
        // 模型/checkpoint 名（SD WebUI sd_model_checkpoint / ComfyUI {{model}} 占位；建议用下拉选不要手填）
        // 外网同源代理（跟向量服务一样的机制）：
        //   本地访问酒馆(端口8000/8001) → 直连后端；
        //   外网穿透访问 → 把 http://127.0.0.1:7860/xxx 改写成 window.location.origin + imgProxyPath + /xxx
        //   ComfyUI 不配合开 CORS 时也可以靠这个代理绕浏览器跨域限制
        imgProxyEnabled: true,
        // 默认开（跟向量一致；本地访问不会改写，无副作用）
        imgProxyPath: "/img",
        // 代理路径；对应你反代里的转发规则（如 /img → http://127.0.0.1:7860）
        // 「常见提示词前缀」：对所有生图生效，拼在 LLM 提示词前面或包裹它。含 {{prompt}} 时替换，不含则前置。
        // 例：masterpiece, best quality, absurdres, {{prompt}}, detailed background
        promptPrefix: "masterpiece, best quality, absurdres,",
        // 「常见负面提示词前缀」：对所有生图生效，拼在 negativePrompt 前面
        negativePrefix: "lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, blurry,",
        negativePrompt: "",
        // 当前特定的负面提示词（留空只用上面的前缀）
        sizePreset: "",
        // 尺寸预设键名（如 '1_1_avatar' / '3_4_portrait' / '16_9_landscape'，匹配到自动填宽高）
        width: 512,
        height: 768,
        steps: 20,
        cfgScale: 7,
        denoisingStrength: 1,
        // 去噪强度（txt2img 默认 1.0，范围 0~1）
        seed: -1,
        // 种子，-1 表示每次随机
        sampler: "",
        // 采样器名（可选；SD WebUI 用 sampler_name，留空走默认 Euler a）
        // ComfyUI 工作流管理：
        //   comfyWorkflowName: 已保存的工作流文件名（通过酒馆后端 /api/sd/comfy/* 管理，与酒馆原生 SD 模块互通）
        //   comfyWorkflow: 内联工作流 JSON（直接粘贴，优先级高于 comfyWorkflowName）
        //   留空则用内置默认工作流（自动检测模型类型选 checkpoint/unet 工作流）
        // 占位符支持两种格式（等价）：
        //   {{prompt}} 或 "%prompt%" — 正向提示词
        //   {{negative}} 或 "%negative_prompt%" — 负面提示词
        //   {{model}} {{vae}} {{clip}} {{sampler}} {{scheduler}} — 字符串型
        //   {{seed}} {{steps}} {{cfg}} {{width}} {{height}} {{denoise}} {{clip_skip}} — 数字型
        comfyWorkflow: "",
        comfyWorkflowName: "",
        // 已保存的工作流文件名（如 'my_workflow.json'）
        comfyWorkflowList: [],
        // 工作流文件名列表缓存（UI 下拉框用）
        cloudPath: "/images/generations",
        // 云端 API 路径（拼在 apiUrl 后；SiliconFlow/OpenAI 兼容端点都用此默认值）
        displayMode: "append",
        // 'append' 追加到 AI 楼层末尾 | 'separate' 独立 system 楼层
        promptStyle: "general",
        // 'general' 通用 | 'anime' 动漫 | 'realistic' 写实 | 'ink' 水墨
        // 兼容旧字段：老版本用 promptTemplate，新版本改名 promptPrefix（做一次迁移兜底）
        promptTemplate: "",
        // 模型下拉缓存（刷新模型列表时写入，下次打开面板不重复请求）
        models: []
      }
    };
    function load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return Object.assign({}, DEFAULTS);
        const parsed = JSON.parse(raw);
        const s = Object.assign({}, DEFAULTS, parsed);
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
        const savedPromptVer = parsed.promptsVersion || 0;
        const savedSummary = parsed.prompts && parsed.prompts.summary || "";
        const looksLegacy = !/\{\s*"text"\s*:/.test(savedSummary);
        if (savedPromptVer < DEFAULTS.promptsVersion || looksLegacy) {
          s.prompts = Object.assign({}, DEFAULTS.prompts);
          s.promptsVersion = DEFAULTS.promptsVersion;
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
        s.plots = (Array.isArray(s.plots) ? s.plots : []).map((p) => {
          const clean = Object.assign({}, p);
          delete clean.status;
          return Object.assign(
            { id: "pl_" + Math.random().toString(36).slice(2), title: "", summary: "", time: "", ts: Date.now() },
            clean
          );
        });
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
        const st = WM.Settings && WM.Settings.load();
        if (WM.Worldbook && st && st.worldToLorebook !== false) {
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
      const t = String(text || "").trim();
      if (!t) return null;
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
        const label = sm.kind === "big" ? "\u957F\u671F\u8BB0\u5FC6\xB7\u5927\u603B\u7ED3" : sm.kind === "plot" ? "\u8FC7\u5F80\u4E8B\u4EF6\xB7\u5267\u60C5\u6458\u8981" : "\u8FC7\u5F80\u5BF9\u8BDD\xB7\u603B\u7ED3";
        await WM.Worldbook.writeEntry({
          kind: sm.kind === "plot" ? "summary" : "summary",
          sourceId: "summary::" + sm.id,
          title: (sm.kind === "plot" ? "\u5267\u60C5\u6458\u8981\xB7" : sm.kind === "big" ? "\u5927\u603B\u7ED3\xB7" : "\u603B\u7ED3\xB7") + sm.title,
          content: `\u3010\u4E4B\u524D\u53D1\u751F\u8FC7\u7684\u4E8B\u60C5\xB7${label}\u3011
${sm.text}`,
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
          content: `\u3010\u5DF2\u77E5\u5B58\u5728\u7684\u7269\u54C1\u3011
${lines.join("\n")}`,
          keys: Array.from(new Set(keys.filter(Boolean))),
          strategy: "selective"
        });
      }
      const plotsSorted = (s.plots || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const topPlots = plotsSorted.slice(0, 3);
      for (const p of topPlots) {
        if (!p.title && !p.summary) continue;
        const lines = [];
        if (p.time) lines.push(`\u65F6\u95F4\uFF1A${p.time}`);
        if (p.summary) lines.push(p.summary);
        await WM.Worldbook.writeEntry({
          kind: "plot",
          sourceId: "plot::" + p.id,
          title: "\u5267\u60C5\xB7" + (p.title || p.time || p.id),
          content: `\u3010\u4E4B\u524D\u53D1\u751F\u8FC7\u7684\u5267\u60C5\u4E8B\u4EF6\u3011
${lines.join("\n")}`,
          keys: [p.title].filter(Boolean),
          strategy: "constant"
          // 最新剧情线常驻蓝灯，确保当前进展始终注入上下文
        });
      }
      const groups = WM.Relations && WM.Relations.groupByPerson ? WM.Relations.groupByPerson({ pairs: s.relations }) : [];
      for (const g of groups) {
        await WM.Worldbook.writeEntry({
          kind: "relation",
          sourceId: "relation::" + g.person,
          title: "\u5173\u7CFB\xB7" + g.person,
          content: `\u3010\u4EBA\u7269\u4E4B\u95F4\u7684\u5173\u7CFB\uFF08\u8FC7\u5F80\u5DF2\u77E5\uFF09\u3011
${g.person}\u7684\u5173\u7CFB\uFF1A${g.text}`,
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
          content: `\u3010\u4E16\u754C\u7684\u57FA\u672C\u8BBE\u5B9A\uFF08\u56FA\u5B9A\u4E0D\u53D8\uFF09\u3011
${headLines.join("\n")}`,
          strategy: "constant"
        });
      }
      for (const w of s.worldSections || []) {
        if (!w.title && !w.body) continue;
        const body = `${w.title ? w.title + "\n" : ""}${w.body || ""}`.trim();
        await WM.Worldbook.writeEntry({
          kind: "world",
          sourceId: "worldsec::" + w.id,
          title: "\u8BBE\u5B9A\xB7" + (w.title || w.id),
          content: `\u3010\u4E16\u754C\u7684\u5177\u4F53\u8BBE\u5B9A\uFF08\u56FA\u5B9A\u89C4\u5219\uFF09\u3011
${body}`,
          keys: [w.title].filter(Boolean),
          strategy: "selective"
        });
      }
      if (WM.Worldbook.pruneByPrefix) {
        await WM.Worldbook.pruneByPrefix("item::", s.items.map((x) => "item::" + x.id));
        await WM.Worldbook.pruneByPrefix("plot::", topPlots.map((x) => "plot::" + x.id));
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
        time: String(o && o.time || "").trim()
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
    async function setPlotPointer(idx) {
      const s = load();
      s.plotPointer = idx;
      await save(s);
    }
    function getPlotPointer() {
      return load().plotPointer || 0;
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
      const safe = load_compat(merged);
      await save(safe);
      return true;
    }
    function load_compat(raw) {
      const base = emptyStore();
      const s = Object.assign(base, raw);
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
    }
    async function clearAll() {
      await save(emptyStore());
      try {
        if (WM.FloorHider && WM.FloorHider.unhideAll) await WM.FloorHider.unhideAll();
      } catch (e) {
        console.warn("[WarmMemo] \u6E05\u7A7A\u65F6\u6062\u590D\u9690\u85CF\u697C\u5C42\u5931\u8D25", e);
      }
      try {
        if (WM.Worldbook && WM.Worldbook.clearAll) await WM.Worldbook.clearAll();
      } catch (e) {
        console.warn("[WarmMemo] \u6E05\u7A7A\u4E16\u754C\u4E66\u6761\u76EE\u5931\u8D25", e);
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
      setPlotPointer,
      getPlotPointer,
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
      const deepOn = profile.deepThinking === true;
      const reasoningEffort = opts && opts.reasoningEffort || profile.reasoningEffort || "medium";
      const mdl = String(profile.model || "").toLowerCase();
      const isJsonCapable = /deepseek|gpt-4|gpt-3\.5|openai|qwen|通义|dashscope|moonshot|kimi|glm|智谱|zhipu|doubao|豆包|volc|abab|minimax|baichuan|chatglm/.test(mdl) && !/reasoner|(^|[^a-z0-9])o[0-9]|(^|[^a-z0-9])(o1|o3|o4)([^a-z0-9]|$)|qwq|qwen-?3.*thinking|thinking/.test(mdl);
      const wantJson = opts.jsonMode === true && isJsonCapable;
      const body = {
        model: profile.model || "",
        messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "system", content: String(m.content || "") })),
        max_tokens: maxTokens,
        temperature
      };
      if (wantJson) {
        body.response_format = { type: "json_object" };
        const lastUser = body.messages.filter((m) => m.role === "user").pop();
        if (lastUser && !/json/i.test(lastUser.content)) {
          lastUser.content += "\n\u8BF7\u4E25\u683C\u4EE5 JSON \u683C\u5F0F\u8F93\u51FA\u3002";
        }
      }
      if (deepOn) {
        const mdl2 = String(profile.model || "").toLowerCase();
        if (/(^|[^a-z0-9])o[0-9]|(^|[^a-z0-9])(o1|o3|o4)([^a-z0-9]|$)|gpt-5|gpt5/.test(mdl2)) {
          body.reasoning_effort = /^(low|medium|high)$/.test(reasoningEffort) ? reasoningEffort : "medium";
          body.max_tokens = Math.max(maxTokens, 2e3);
        } else if (/reasoner/.test(mdl2)) {
          body.max_tokens = Math.max(maxTokens, 2e3);
        } else if (/doubao|thinking|qwq|qwen3|qwen-3|gemini|claude/.test(mdl2)) {
          body.thinking = { type: "enabled", budget_tokens: Math.min(Math.max(Math.floor(maxTokens * 0.6), 1024), 8192) };
          if (/qwen3|qwen-3/.test(mdl2)) body.enable_thinking = true;
          body.max_tokens = Math.max(maxTokens, 1500);
        } else {
          if (WM.DebugLog) WM.DebugLog.logResponse("llm", { note: "\u6DF1\u5EA6\u601D\u8003\u5F00\u5173\u5DF2\u5F00\uFF0C\u4F46\u6A21\u578B\u300C" + profile.model + "\u300D\u672A\u5339\u914D\u5230\u5DF2\u77E5\u601D\u8003\u6A21\u578B\uFF0C\u672A\u6CE8\u5165\u601D\u8003\u53C2\u6570" });
        }
      }
      const headers = { "Content-Type": "application/json" };
      if (profile.apiKey) headers["Authorization"] = "Bearer " + profile.apiKey;
      if (WM.DebugLog) {
        WM.DebugLog.logRequest("llm", {
          url,
          model: body.model,
          messages: body.messages,
          max_tokens: body.max_tokens,
          temperature,
          deepThinking: deepOn,
          reasoningEffort: deepOn ? body.reasoning_effort || (body.thinking ? "thinking-block" : "model-native") : false
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
      if (settings.vectorEnabled === false || !WM.EmbeddingClient || !WM.EmbeddingClient.embed) return null;
      const llmOk = settings.embeddingUseLLM !== false && settings.llmConfig && settings.llmConfig.apiUrl;
      if (!settings.embeddingBaseUrl && !llmOk) return null;
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
    function applyVecProxy(url, settings) {
      if (!url) return url;
      var s = settings || {};
      if (s.vecProxyEnabled === false) return url;
      if (!/^https?:\/\//i.test(url)) return url;
      var base = "";
      try {
        base = window.top && window.top.location && window.top.location.origin || window.location.origin;
      } catch (e) {
        base = window.location.origin;
      }
      if (!base || base === "null") return url;
      var port = "";
      try {
        var u0 = new URL(base);
        port = u0.port || (u0.protocol === "https:" ? "443" : "80");
      } catch (e) {
      }
      if (port === "8000" || port === "8001") return url;
      var proxyPath = (s.vecProxyPath || "/vec").replace(/\/+$/, "");
      try {
        var eu = new URL(url, base);
        var pathOnly = eu.pathname + (eu.search || "");
        var rewritten = base + proxyPath + pathOnly;
        try {
          console.log("[WarmMemo] \u5411\u91CF\u540C\u6E90\u4EE3\u7406\u6539\u5199\uFF1A" + url + " \u2192 " + rewritten);
        } catch (e) {
        }
        return rewritten;
      } catch (e) {
        return url;
      }
    }
    function resolveEmbedUrl(s) {
      let base = normalizeBaseUrl(s.embeddingBaseUrl) || s.baseUrl || "";
      let apiKey = s.embeddingApiKey || s.apiKey || "";
      if (!base && s.embeddingUseLLM !== false && s.llmConfig && s.llmConfig.apiUrl) {
        base = normalizeBaseUrl(s.llmConfig.apiUrl) || "";
        if (!apiKey && s.llmConfig.apiKey) apiKey = s.llmConfig.apiKey;
      }
      if (!base) return { url: "", provider: "compatible", model: s.embeddingModel || "" };
      if (/generativelanguage\.googleapis\.com/i.test(base)) {
        return { url: base, provider: "gemini", model: s.embeddingModel || s.model || "text-embedding-004" };
      }
      return { url: buildEmbedUrl(base), provider: "compatible", model: s.embeddingModel || s.model || "BAAI/bge-m3", apiKey };
    }
    async function embed(texts, settings) {
      const s = settings || {};
      const info = resolveEmbedUrl(s);
      const base = info.url;
      const model = info.model;
      const key = info.apiKey || s.embeddingApiKey || s.apiKey || "";
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
      const url = applyVecProxy(base, s);
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
    WM.EmbeddingClient = { PROVIDERS, embed, testConnection, normalizeBaseUrl, resolveEmbedUrl, applyVecProxy };
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
      const enabled = s.rerankEnabled || s.takeoverRerank;
      if (!enabled) return null;
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
          const rerankInstruction = typeof s.rerankInstruction === "string" && s.rerankInstruction.trim() ? s.rerankInstruction.trim() : "";
          body = JSON.stringify({
            model,
            query,
            documents: docs,
            top_n: docs.length,
            return_documents: false,
            ...rerankInstruction ? { instruction: rerankInstruction } : {}
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
        if (!Array.isArray(names) || !names.includes(name)) {
          await helper().createWorldbook(name, []);
        }
      } catch (e) {
        console.warn("[WarmMemo] \u521B\u5EFA/\u83B7\u53D6\u4E16\u754C\u4E66\u5931\u8D25:", e);
        return false;
      }
      try {
        if (typeof helper().rebindCharWorldbooks === "function") {
          let cur = null;
          try {
            cur = await helper().getCharWorldbookNames("current");
          } catch (e) {
            cur = null;
          }
          const additional = Array.isArray(cur && cur.additional) ? cur.additional.slice() : [];
          if (!additional.includes(name)) {
            additional.push(name);
            await helper().rebindCharWorldbooks("current", { primary: cur && cur.primary || null, additional });
          }
        }
      } catch (e) {
        console.warn("[WarmMemo] \u7ED1\u5B9A\u4E16\u754C\u4E66\u5230\u89D2\u8272\u5361\u5931\u8D25\uFF08\u5199\u5165\u4ECD\u7EE7\u7EED\uFF09:", e);
      }
      return true;
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
      const takeover = isTakeoverOn();
      return {
        name: opts.title || "",
        enabled: !takeover,
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
    function isTakeoverOn() {
      try {
        const s = WM.Settings && WM.Settings.load ? WM.Settings.load() : {};
        return !!(s.takeoverEmbedding && s.vectorEnabled && WM.VectorStore && WM.EmbeddingClient);
      } catch (e) {
        return false;
      }
    }
    async function syncEntryEnabled() {
      if (!available()) return false;
      const name = targetName();
      const takeover = isTakeoverOn();
      try {
        await helper().updateWorldbookWith(name, (wb) => {
          return wb.map((e) => {
            if (e && e.extra && e.extra.warmMemo) {
              return Object.assign({}, e, { enabled: !takeover });
            }
            return e;
          });
        });
        return true;
      } catch (e) {
        console.warn("[WarmMemo] syncEntryEnabled \u5931\u8D25:", e);
        return false;
      }
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
      const descBuf = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        let m = line.match(/^■\s*(.+?)\s*[｜|]\s*([\s\S]*)$/);
        if (m) {
          const title = m[1].trim();
          const body = m[2].trim();
          if (title) out.sections.push({ title, body });
          continue;
        }
        m = line.match(/^#{1,6}\s*(.+?)\s*$/) || line.match(/^【(.+?)】\s*$/) || line.match(/^「(.+?)」\s*$/);
        if (m) {
          out.sections.push({ title: m[1].trim(), body: "" });
          continue;
        }
        m = line.match(/^(?:世界名(?:称)?|世界)\s*[:：]\s*(.+)$/);
        if (m && !out.name) {
          out.name = m[1].trim();
          continue;
        }
        m = line.match(/^世界类型\s*[:：]\s*(.+)$/);
        if (m && !out.kind) {
          out.kind = m[1].trim();
          continue;
        }
        m = line.match(/^(?:简述|世界简述|概述)\s*[:：]\s*(.+)$/);
        if (m) {
          descBuf.push(m[1].trim());
          continue;
        }
        const last = out.sections[out.sections.length - 1];
        if (last && !last.body) last.body = line;
        else if (last && last.body) last.body += (last.body ? "\n" : "") + line;
        else descBuf.push(line);
      }
      out.desc = descBuf.join("\n").trim();
      const ENTITY_NOISE = /(物品|道具|物件|武器|装备|信物|角色|人物|地点|场所|城市|城镇|村庄|村落|门派|宗门|势力|公会|家族|国家|组织|帮派|商店|店铺|NPC|具体人名)/;
      out.sections = out.sections.map((s) => ({ title: s.title, body: s.body.trim() })).filter((s) => s.title || s.body).filter((s) => !(s.title && ENTITY_NOISE.test(s.title) && /[:：·]/.test(s.title)));
      if (!out.name && !out.kind && !out.desc && !out.sections.length) return null;
      return out;
    }
    async function inferWorldview(settings, opts) {
      settings = settings || WM.Settings && WM.Settings.load && WM.Settings.load() || {};
      opts = opts || {};
      const char = getCharacterCard();
      const user = getUserCard();
      const store = WM.MemoryStore;
      const prevMeta = store && store.getWorldMeta ? store.getWorldMeta() : { name: "", kind: "", desc: "" };
      const prevSecs = store && store.getWorldSections ? store.getWorldSections() : [];
      const prev = store ? store.getWorld() : "";
      const plots = (store && store.getPlots ? store.getPlots() : []).map((p) => `\xB7 ${p.time ? "[" + p.time + "] " : ""}${p.title}\uFF1A${p.summary}`).join("\n");
      const recentFull = Array.isArray(opts.recent) ? opts.recent : [];
      const recent = recentFull.filter((m) => !(m && (m.is_wm_hidden || m.is_hidden || m.is_system)));
      const recentText = recent.length ? recent.map((m) => (m.name ? "\u3010" + m.name + "\u3011" : "") + (m.content || "")).join("\n") : "";
      const tpl = settings && settings.prompts && settings.prompts.worldview || DEFAULT_WORLDVIEW_PROMPT;
      const sys = WM.Summary.fillTemplate(tpl, { plot: plots, recent: recentText });
      const known = [
        prevMeta.name ? `\u4E16\u754C\u540D\uFF1A${prevMeta.name}` : "",
        prevMeta.kind ? `\u4E16\u754C\u7C7B\u578B\uFF1A${prevMeta.kind}` : "",
        prevMeta.desc ? `\u7B80\u8FF0\uFF1A${prevMeta.desc}` : "",
        ...prevSecs.map((w) => `\u25A0${w.title}\uFF5C${w.body}`)
      ].filter(Boolean).join("\n");
      const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
      const recentRaw = ctx && ctx.chat ? ctx.chat.slice(-30).filter((m) => !(m && (m.is_wm_hidden || m.is_hidden || m.is_system))).map((m) => (m.name ? "\u3010" + m.name + "\u3011" : "") + (m.mes || "")).join("\n") : recentText || "\uFF08\u65E0\uFF09";
      const userMsg = `\u3010\u89D2\u8272\u8BBE\u5B9A\u3011${char.name || "\u672A\u77E5"}\uFF1A${char.description || ""}
\u3010\u7528\u6237\u8BBE\u5B9A\u3011${user.name || "\u672A\u77E5"}\uFF1A${user.description || ""}
\u3010\u5267\u60C5\u7EBF\u3011
${plots || "\uFF08\u65E0\uFF09"}
\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011
${recentText || recentRaw || "\uFF08\u65E0\uFF09"}
\u3010\u5DF2\u6709\u4E16\u754C\u89C2\u3011
${known || prev || "\uFF08\u65E0\uFF09"}
${opts && opts.extraInstruction ? "\u3010\u989D\u5916\u8981\u6C42\u3011" + opts.extraInstruction + "\n" : ""}\u8BF7\u6309\u89C4\u5B9A\u683C\u5F0F\u8F93\u51FA\u4E16\u754C\u8BBE\u5B9A\uFF1A`;
      if (!WM.Summary || !WM.Summary.callLLM) return prev;
      const out = await WM.Summary.callLLM(sys, userMsg + "\n\u76F4\u63A5\u8F93\u51FA JSON\uFF0C\u6574\u6BB5\u56DE\u590D\u987B\u53EF\u88AB JSON.parse \u89E3\u6790\u3002", settings, { temperature: 0.4, jsonMode: true });
      const parsed = WM.Summary.parseWorld ? WM.Summary.parseWorld(out) : null;
      if (!parsed || !parsed.name && !parsed.type && !parsed.desc && !parsed.rules.length) return prev;
      const lines = [];
      if (parsed.name) lines.push("\u4E16\u754C\u540D\uFF1A" + parsed.name);
      if (parsed.type) lines.push("\u4E16\u754C\u7C7B\u578B\uFF1A" + parsed.type);
      if (parsed.desc) lines.push("\u7B80\u8FF0\uFF1A" + parsed.desc);
      for (const r of parsed.rules) lines.push("\u25A0" + r.title + "\uFF5C" + r.content);
      return lines.join("\n");
    }
    const DEFAULT_WORLDVIEW_PROMPT = `\u4F60\u662F\u4E16\u754C\u89C2\u63D0\u70BC\u8005\u3002\u8BF7\u57FA\u4E8E\u3010\u5267\u60C5\u7EBF\u3011\u3010\u6700\u8FD1\u5BF9\u8BDD\u3011\uFF0C\u63D0\u70BC\u8FD9\u4E2A\u4E16\u754C\u672C\u8EAB\u7684\u300C\u5E95\u5C42\u89C4\u5219\u8BBE\u5B9A\u300D\u3002

\u4E25\u683C\u6309\u4EE5\u4E0B\u683C\u5F0F\u8F93\u51FA\uFF0C\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u591A\u4F59\u8BF4\u660E\uFF1A

\u4E16\u754C\u540D\uFF1A\uFF08\u8FD9\u4E2A\u4E16\u754C/\u5927\u9646/\u57CE\u5E02\u53EB\u4EC0\u4E48\uFF0C\u6CA1\u6709\u5C31\u8D77\u4E00\u4E2A\u8D34\u5207\u7684\uFF09
\u4E16\u754C\u7C7B\u578B\uFF1A\uFF08\u7528\u4E00\u4E2A\u8BCD\u6982\u62EC\uFF0C\u5982\uFF1A\u4FEE\u4ED9\u4E16\u754C\u3001\u8D5B\u535A\u670B\u514B\u3001\u84B8\u6C7D\u670B\u514B\u3001\u73B0\u4EE3\u90FD\u5E02\u3001\u5251\u4E0E\u9B54\u6CD5\uFF09
\u7B80\u8FF0\uFF1A\uFF08\u4E00\u5230\u4E24\u53E5\u8BDD\u8BF4\u660E\u8FD9\u662F\u4E2A\u4EC0\u4E48\u6837\u7684\u4E16\u754C\uFF09
\u25A0\u8BBE\u5B9A\u6807\u9898\u4E00\uFF5C\uFF08\u56F4\u7ED5"\u4E16\u754C\u7C7B\u578B"\u5C55\u5F00\u7684\u5177\u4F53\u89C4\u5219\u4E0E\u6CD5\u5219\u3002\u4F8B\u5982\u4FEE\u4ED9\u4E16\u754C\u5C31\u5199\u4FEE\u70BC\u4F53\u7CFB\u7684\u5883\u754C\u5212\u5206\u3001\u7075\u6C14\u8FD0\u884C\u6CD5\u5219\uFF1B\u8D5B\u535A\u670B\u514B\u5C31\u5199\u4E49\u4F53\u6539\u9020\u89C4\u5219\u3001\u4F01\u4E1A\u4E0E\u8D22\u9600\u7684\u8FD0\u884C\u6CD5\u5219\uFF09
\u25A0\u8BBE\u5B9A\u6807\u9898\u4E8C\uFF5C\uFF08\u5185\u5BB9\uFF09

\u8981\u6C42\uFF1A
1. \u300C\u4E16\u754C\u8BBE\u5B9A\u300D\u53EA\u5199\u4E16\u754C\u672C\u8EAB\u7684\u901A\u7528\u89C4\u5219\u3001\u6CD5\u5219\u3001\u5386\u53F2\u80CC\u666F\u3001\u529B\u91CF\u4F53\u7CFB\uFF0C\u7EDD\u4E0D\u5199\u5355\u4E2A\u5177\u4F53\u7269\u54C1\u3001\u5355\u4E2A\u5177\u4F53\u89D2\u8272\u59D3\u540D\u3001\u5355\u4E2A\u5177\u4F53\u5730\u70B9\u540D\u79F0\u3002
2. \u300C\u4E16\u754C\u7C7B\u578B\u300D\u51B3\u5B9A\u4E86\u4E0B\u9762\u5199\u4EC0\u4E48\u3002\u4FEE\u4ED9\u4E16\u754C\u5C31\u5FC5\u987B\u5199\u4FEE\u70BC\u4F53\u7CFB\u3001\u7075\u6C14\u3001\u6CD5\u5219\u7B49\uFF0C\u4E0D\u8981\u5199\u65E0\u5173\u5185\u5BB9\u3002
3. \u6BCF\u6761\u8BBE\u5B9A\u7528 \u25A0 \u8D77\u5934\u3001\u6807\u9898\u4E0E\u5185\u5BB9\u7528\u5355\u4E2A\uFF5C\u5206\u9694\uFF08\u5982\u300C\u25A0\u7075\u6C14\u8FD0\u884C\u6CD5\u5219\uFF5C\u7075\u6C14\u81EA\u5B50\u591C\u8D77\u6700\u5145\u76C8\u300D\uFF09\u3002
4. \u6BCF\u6761\u8BBE\u5B9A\u8981\u5177\u4F53\u3001\u53EF\u88AB\u540E\u7EED\u5267\u60C5\u5F15\u7528\uFF0C\u4E0D\u8981\u7A7A\u6CDB\u3002
5. \u8F93\u51FA 3-6 \u6761\u8BBE\u5B9A\u6761\u76EE\u3002

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
      DEFAULT_WORLDVIEW_PROMPT,
      isTakeoverOn,
      syncEntryEnabled
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
    function isJunkText(v) {
      const s = String(v == null ? "" : v).trim();
      if (!s) return false;
      if (/^(让我|我们来|接下来我|另外[，,]|逐段|解析如下|分析如下|总结一下|根据对话|按照要求|用户要求|系统要求|我们需要|我打算|我将|根据要求)/.test(s)) return true;
      if (s.length > 60) return false;
      if (/^(desc|name|title|summary|owner|origin|related|label|from|to|time|type|rules?|content)\s*[：:]/i.test(s)) return true;
      if (/^(desc|name|title|summary|owner|origin|related|label|from|to|time|type|rules?|content)\s+[^\s：:]/i.test(s)) return true;
      if (s.length < 30 && /(未提及|未填写|可能还需要|建议考虑|需进一步|有待补充|待补充|暂无|占位|示例|示例如下|不确定|不清楚|不知道)/.test(s)) return true;
      if (/^第[一二三四五六七八九十百]+段/.test(s)) return true;
      if (/^\d+\s*[\.、\)\）]/.test(s)) return true;
      if (/^\s*\{['"]?\w+['"]?\s*:/.test(s)) return true;
      if (/^\d+\s*[\.、]\s*\{/.test(s)) return true;
      if (/^[\d\s\{\}\[\]"'\.\,\;\:\|｜\-–—•·]+$/.test(s)) return true;
      if (/(只输出|不要任何|markdown|代码块|格式如下|输出格式|输出应该|注意：输出)/.test(s)) return true;
      return false;
    }
    function sanitizeLLMText(raw) {
      if (!raw) return "";
      var t = String(raw);
      t = t.replace(/^```[a-zA-Z]*\s*$/gim, "").replace(/```\s*$/g, "").trim();
      t = t.replace(/<<<\s*[A-Z_]+\s*>>>/g, "");
      t = t.replace(/^(好的[，,。！!]?\s*|当然[，,]?\s*|明白[，,]?\s*|没问题[，,]?\s*|以下是[^\n]{0,20}[:：]?\s*|这是为您[^\n]{0,20}[:：]?\s*)/i, "");
      t = t.replace(/\n{3,}/g, "\n\n").trim();
      return t;
    }
    function cleanSummaryText(raw) {
      if (!raw) return "";
      let t = String(raw);
      t = t.replace(/<<<\s*[A-Z_]+\s*>>>/g, "");
      t = t.replace(/^```[a-z]*\s*$/gim, "");
      let lines = t.split("\n").map((ln) => {
        let s = ln.trim();
        if (!s) return "";
        if (/^#{1,6}\s*/.test(s)) return "";
        if (/^(-{3,}|={3,}|\*{3,})$/.test(s)) return "";
        if (/^[#＃*【\[]*\s*(总结|摘要|概述|梗概|正文|叙事|片段|记忆|内容)[^\n]{0,6}[#＃*】\]]*$/.test(s)) return "";
        s = s.replace(/^(好的|当然|明白|收到|没问题)[，,。！!]?\s*(以下|下面|这是|我来)?[：:]?\s*/, "");
        s = s.replace(/^(总结|分析|解析|概述|梗概|正文|叙事|片段|记忆|内容|回复|答案|结果)[：:]\s*/, "");
        if (/^(以下|下面)(是|为)[^\n]{0,20}[:：]?$/.test(s)) return "";
        if (/^(以上|综上)[^\n]{0,30}$/.test(s)) return "";
        s = s.replace(/^\d+\s*[.、)）]\s*/, "");
        s = s.replace(/^[-*•·]\s+/, "");
        s = s.replace(/^\*{1,2}([^*\n]+)\*{1,2}/, "$1");
        return s;
      });
      while (lines.length && !lines[0]) lines.shift();
      while (lines.length && !lines[lines.length - 1]) lines.pop();
      t = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1");
      return t;
    }
    function extractTag(raw, tag) {
      if (raw == null) return "";
      const s = String(raw).replace(/^```[a-zA-Z]*\s*/gim, "").replace(/```\s*$/g, "").trim();
      const lower = s.toLowerCase();
      const start = lower.indexOf("<" + tag.toLowerCase());
      if (start === -1) return "";
      let i = start + tag.length + 1;
      while (i < s.length && s[i] !== ">" && s[i] !== "/" && s[i] !== "<") i++;
      if (s[i] === "/") return "";
      if (s[i] !== ">") return "";
      const contentStart = i + 1;
      const end = lower.indexOf("</" + tag.toLowerCase(), contentStart);
      if (end === -1) return s.slice(contentStart).trim();
      return s.slice(contentStart, end).trim();
    }
    function truncateItemFields(items) {
      const MAX = { name: 20, desc: 40, owner: 30, rel: 30, origin: 30 };
      return items.map((it) => ({
        name: (it.name || "").slice(0, MAX.name).trim(),
        desc: (it.desc || "").slice(0, MAX.desc).trim(),
        owner: (it.owner || "").slice(0, MAX.owner).trim(),
        relatedPlotText: (it.relatedPlotText || "").slice(0, MAX.rel).trim(),
        origin: (it.origin || "").slice(0, MAX.origin).trim(),
        // 保留关联剧情 ID 数组（若 parseItems 已匹配出），与存储层 normItem 字段对齐
        ...Array.isArray(it.relatedPlots) ? { relatedPlots: it.relatedPlots.filter(Boolean).map(String) } : {}
      }));
    }
    function taggedSummary(out) {
      const raw = extractTag(out, "Summary");
      if (!raw) return "";
      const text = cleanSummaryText(raw);
      if (text.length >= 4 && !isJunkText(text)) return text;
      return "";
    }
    function taggedRelations(out) {
      return out != null ? String(out) : "";
    }
    function taggedPlot(out) {
      return out != null ? String(out) : "";
    }
    function taggedItems(out) {
      return out != null ? String(out) : "";
    }
    function taggedWorld(out) {
      return out != null ? String(out) : "";
    }
    function normalizeJSONString(raw) {
      if (raw == null) return "";
      let s = String(raw);
      s = s.replace(/^```[a-zA-Z]*\s*/g, "").replace(/```\s*$/g, "").trim();
      let out = "";
      let inStr = false;
      let esc = false;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
          if (esc) {
            out += ch;
            esc = false;
            continue;
          }
          if (ch === "\\") {
            out += ch;
            esc = true;
            continue;
          }
          if (ch === "\n") {
            out += "\\n";
            continue;
          }
          if (ch === "\r") {
            out += "\\r";
            continue;
          }
          if (ch === "	") {
            out += "\\t";
            continue;
          }
          if (ch === '"' || ch === "\u201D" || ch === "\u300D") {
            out += '"';
            inStr = false;
            continue;
          }
          out += ch;
        } else {
          if (ch === '"' || ch === "\u201C" || ch === "\u300C") {
            out += '"';
            inStr = true;
            continue;
          }
          if (ch === "\uFF0C") {
            out += ",";
            continue;
          }
          if (ch === "\uFF1A") {
            out += ":";
            continue;
          }
          out += ch;
        }
      }
      out = out.replace(/,(\s*[}\]])/g, "$1");
      return out;
    }
    function parseJSON(raw) {
      if (raw == null) return { ok: false, data: null };
      const normalized = normalizeJSONString(raw);
      const start = normalized.search(/[[{]/);
      const end = Math.max(normalized.lastIndexOf("}"), normalized.lastIndexOf("]"));
      if (start === -1) return { ok: false, data: null };
      let s = end >= start ? normalized.slice(start, end + 1) : normalized.slice(start);
      try {
        const data = JSON.parse(s);
        return data == null ? { ok: false, data: null } : { ok: true, data };
      } catch (e) {
        const fixes = [s + '"', s + '"}', s + "]", s + "}]", s.replace(/,\s*$/, "") + "}", s.replace(/,\s*$/, "") + '"}', s + "}"];
        for (const f of fixes) {
          try {
            const d = JSON.parse(f);
            if (d != null) return { ok: true, data: d };
          } catch (e2) {
          }
        }
        return { ok: false, data: null };
      }
    }
    function extractArray(data, keys) {
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object") {
        for (const k of keys) if (Array.isArray(data[k])) return data[k];
        for (const k of Object.keys(data)) if (Array.isArray(data[k])) return data[k];
      }
      return [];
    }
    function getChatMessages() {
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
        const chat = ctx && ctx.chat;
        return Array.isArray(chat) ? chat : [];
      } catch (e) {
        return [];
      }
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
          name: m.name || "",
          is_wm_hidden: !!m.is_wm_hidden,
          is_hidden: !!m.is_hidden,
          is_system: !!m.is_system
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
      return msgs.filter((m) => !(m && (m.is_wm_hidden || m.is_hidden || m.is_system))).map((m) => {
        const raw = (m.name ? "\u3010" + m.name + "\u3011" : "") + (m.content || "");
        return WM.TagFilter && WM.TagFilter.strip ? WM.TagFilter.strip(raw, rules) : raw;
      }).join("\n");
    }
    function taskMaxKey(phase) {
      if (phase === "summary") return "summary";
      if (phase === "relations") return "relations";
      if (phase === "plot") return "plot";
      if (phase === "worldview") return "world";
      if (phase === "items") return "items";
      return null;
    }
    function resolveTaskMax(settings, phase) {
      const key = taskMaxKey(phase);
      const tt = settings && settings.taskTokens;
      if (key && tt && tt[key] > 0) return tt[key];
      const cfg = settings && settings.llmConfig;
      return cfg && cfg.maxTokens || 700;
    }
    async function callLLM(systemText, userText, settings, opts) {
      opts = opts || {};
      if (opts.maxTokens == null && opts.phase) opts.maxTokens = resolveTaskMax(settings, opts.phase);
      const maxRetry = opts.maxRetry != null ? opts.maxRetry : 3;
      let lastErr = null;
      for (let attempt = 1; attempt <= maxRetry; attempt++) {
        try {
          const out = await WM.LLMClient.complete(systemText, userText, settings, opts);
          const text = out && out.trim && out.trim() || "";
          if (!text) throw new Error("\u6A21\u578B\u8FD4\u56DE\u7A7A\u5185\u5BB9");
          const cleaned = sanitizeLLMText(text);
          let minLen = 8;
          if (opts && opts.minLen != null) minLen = opts.minLen;
          else if (opts && opts.phase === "summary") minLen = 30;
          else if (opts && opts.phase === "world") minLen = 20;
          else if (opts && opts.phase === "plot") minLen = 15;
          else if (opts && opts.phase === "items") minLen = 10;
          else if (opts && opts.phase === "relations") minLen = 6;
          const hasTag = /<\/?(Summary|Relations|Plots|Items)\b/i.test(cleaned);
          const isLegalJson = opts.jsonMode === true && parseJSON(cleaned).ok;
          if (!hasTag && !isLegalJson && cleaned.length < minLen) {
            throw new Error("\u6A21\u578B\u8FD4\u56DE\u8FC7\u77ED\uFF08\u4EC5 " + cleaned.length + " \u5B57\uFF1A" + cleaned.slice(0, 20) + "\uFF09\uFF0C\u7591\u4F3C\u622A\u65AD/\u62BD\u98CE");
          }
          return cleaned;
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
    let _plotting = false;
    function isSummarizing() {
      return _summarizing;
    }
    function isPlotting() {
      return _plotting;
    }
    function computeRange(settings, opts, modeKey, getPtr, forceAllKey) {
      opts = opts || {};
      const auto = settings[modeKey] || "new";
      const total = getChatMessages().length;
      if (!total) return { skip: true, range: [0, 0], total, reason: "\u5F53\u524D\u5BF9\u8BDD\u6CA1\u6709\u53EF\u603B\u7ED3\u7684\u697C\u5C42\uFF08\u8BF7\u5148\u6709\u5BF9\u8BDD\u5185\u5BB9\uFF09" };
      const msgs = getRecentMessages(total);
      let range;
      if (opts.forceAll) {
        range = [1, total];
      } else if (auto === "new") {
        const ptr = getPtr();
        if (ptr >= total) return { skip: true, range: [ptr + 1, total], total, reason: "\u6CA1\u6709\u65B0\u589E\u697C\u5C42\u9700\u8981\u5904\u7406\uFF08\u5DF2\u5904\u7406\u5230\u6700\u65B0\uFF09" };
        range = [ptr + 1, total];
      } else if (auto === "count") {
        const win = Math.max(5, settings[forceAllKey ? forceAllKey.replace("Mode", "Count") : modeKey.replace("Mode", "Count")] || 20);
        const from = Math.max(0, total - win);
        range = [from + 1, total];
      } else if (auto === "range") {
        const startKey = modeKey.replace("Mode", "Start"), endKey = modeKey.replace("Mode", "End");
        const start = Math.max(1, settings[startKey] || 1);
        let end = settings[endKey];
        if (end == null || end < 0) end = total;
        end = Math.min(end, total);
        if (start > end) return { skip: true, range: [start, end], total, reason: "\u533A\u95F4\u8D77\u59CB\u5927\u4E8E\u7ED3\u675F" };
        range = [start, end];
      } else if (auto === "floor") {
        const floor = Math.max(1, settings[modeKey.replace("Mode", "Floor")] || 20);
        const ptr = getPtr();
        const segEnd = Math.floor(ptr / floor) * floor + floor;
        if (opts.forceEnd) {
          if (ptr >= total) return { skip: true, range: [ptr + 1, total], total, reason: "\u5DF2\u5168\u90E8\u5904\u7406\u5B8C\uFF0C\u65E0\u65B0\u589E\u697C\u5C42" };
          range = total < segEnd ? [ptr + 1, total] : [ptr + 1, Math.min(total, segEnd)];
        } else {
          if (total < segEnd) return { skip: true, range: [ptr + 1, Math.min(total, segEnd)], total, reason: "\u5C1A\u672A\u6512\u6EE1\u4E00\u6BB5\uFF0C\u6682\u4E0D\u5904\u7406" };
          range = [ptr + 1, Math.min(total, segEnd)];
        }
      } else {
        return { skip: true, range: [0, 0], total, reason: "\u672A\u77E5\u7684\u5904\u7406\u6A21\u5F0F\uFF1A" + auto };
      }
      const recent = msgs.slice(range[0] - 1, range[1]);
      if (!recent.length) return { skip: true, range, total, reason: "\u8BA1\u7B97\u51FA\u7684\u5904\u7406\u533A\u95F4\u4E3A\u7A7A" };
      return { range, recent, total };
    }
    function parseRelations(out) {
      const body = extractTag(out, "Relations");
      if (!body) return [];
      const LABEL_BAD = /(可能|也许|或许|大概|似乎|好像|感觉|推测|应该|未提及|未出现|暂无|未知|不确定|不清楚|不知道|不明|有待|关系|互动|联系|关联|对话|交流|接触|见过|认识|提到|讨论|提及|涉及|关于)/;
      const FIELD_NAMES = /^(from|to|label|relation|source|target|从|到|甲方|乙方|关系|关系类型)$/;
      return body.split("\n").map((ln) => ln.trim()).filter(Boolean).map((ln) => {
        const parts = ln.split("|").map((p) => p.trim());
        return {
          from: (parts[0] || "").slice(0, 8),
          to: (parts[1] || "").slice(0, 8),
          label: (parts[2] || "").slice(0, 10)
        };
      }).filter((r) => {
        if (!r.from || !r.to || !r.label) return false;
        if (r.from === r.to) return false;
        if (FIELD_NAMES.test(r.from) || FIELD_NAMES.test(r.to) || FIELD_NAMES.test(r.label)) return false;
        if (isJunkText(r.from) || isJunkText(r.to) || isJunkText(r.label)) return false;
        if (r.label.length < 2 || r.from.length < 2) return false;
        if (LABEL_BAD.test(r.label)) return false;
        if (r.label === r.from || r.label === r.to) return false;
        return true;
      });
    }
    function parsePlots(out) {
      const body = extractTag(out, "Plots");
      if (!body) return [];
      const FIELD_NAMES = /^(time|title|summary|when|name|content|时间|标题|摘要|内容|事件)$/;
      return body.split("\n").map((ln) => ln.trim()).filter(Boolean).map((ln) => {
        const parts = ln.split("|").map((p) => p.trim());
        return {
          time: (parts[0] || "").slice(0, 20),
          title: (parts[1] || "").replace(/[。！？!?\n]+$/g, "").trim().slice(0, 12),
          summary: (parts[2] || "").slice(0, 80)
        };
      }).filter((p) => {
        if (!p.title) return false;
        if (FIELD_NAMES.test(p.title)) return false;
        if (isJunkText(p.title)) return false;
        if (p.title.length < 2) return false;
        if (/[。！？!?\n]/.test(p.title)) return false;
        if (FIELD_NAMES.test(p.time) || isJunkText(p.time)) p.time = "";
        if (isJunkText(p.summary)) p.summary = "";
        return true;
      });
    }
    function parseItems(out, plots) {
      const isBlankRel = (v) => !v || /^(无|未知|未标注|-|—)$/.test(v);
      const matchPlotIds = (text) => {
        if (!text || isBlankRel(text) || !Array.isArray(plots)) return [];
        const ids = [];
        for (const t of String(text).split(/[、,，/]/).map((x) => x.trim()).filter(Boolean)) {
          const hit = plots.find((p) => p.title === t) || plots.find((p) => p.title && (p.title.includes(t) || t.includes(p.title)));
          if (hit) ids.push(hit.id);
        }
        return ids;
      };
      const body = extractTag(out, "Items");
      if (!body) return [];
      const FIELD_NAMES = /^(name|desc|owner|origin|related|item|description|holder|名字|名称|描述|持有者|来历|来源|关联|物品)$/;
      const items = body.split("\n").map((ln) => ln.trim()).filter(Boolean).map((ln) => {
        const parts = ln.split("|").map((p) => p.trim());
        let name = (parts[0] || "").replace(/[。！？!?\n]+$/g, "").trim();
        let desc = parts[1] || "";
        let owner = parts[2] || "";
        let origin = parts[3] || "";
        let relText = parts[4] || "";
        if (isJunkText(desc)) desc = "";
        if (isJunkText(owner) || /^(未知|持有者[:：].*)$/.test(owner)) owner = "";
        if (isJunkText(origin)) origin = "";
        if (isJunkText(relText)) relText = "";
        const relIds = matchPlotIds(relText);
        const obj = { name, desc, owner, origin, relatedPlotText: relText };
        if (relIds.length) obj.relatedPlots = relIds;
        return obj;
      }).filter((it) => {
        if (!it.name) return false;
        if (FIELD_NAMES.test(it.name)) return false;
        if (isJunkText(it.name)) return false;
        if (it.name.length < 2 || it.name.length > 20) return false;
        if (/[。！？!?\n]/.test(it.name)) return false;
        return true;
      });
      return truncateItemFields(items);
    }
    function parseWorld(out) {
      const { ok, data } = parseJSON(out);
      if (!ok || !data || typeof data !== "object") return { name: "", type: "", desc: "", rules: [] };
      const rules = extractArray(data, ["rules", "\u8BBE\u5B9A", "\u89C4\u5219", "world_rules"]).filter((r) => r && typeof r === "object").map((r) => ({ title: String(r.title || r["\u6807\u9898"] || "").trim().slice(0, 20), content: String(r.content || r["\u5185\u5BB9"] || "").trim().slice(0, 60) })).filter((r) => {
        if (!r.title || !r.content) return false;
        if (isJunkText(r.title) || isJunkText(r.content)) return false;
        return true;
      }).slice(0, 6);
      const name = isJunkText(data.name) ? "" : String(data.name || data["\u4E16\u754C\u540D"] || "").trim().slice(0, 30);
      const type = isJunkText(data.type) ? "" : String(data.type || data["\u7C7B\u578B"] || "").trim().slice(0, 20);
      const desc = isJunkText(data.desc) ? "" : String(data.desc || data["\u7B80\u8FF0"] || data["\u63CF\u8FF0"] || "").trim().slice(0, 80);
      return { name, type, desc, rules };
    }
    async function triggerSummary(settings, opts) {
      opts = opts || {};
      settings = settings || {};
      const mode = opts.mode || "full";
      if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
        try {
          const fresh = WM.Settings && WM.Settings.load && WM.Settings.load();
          if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh;
        } catch (e) {
        }
      }
      if (_summarizing) return { ok: false, reason: "\u4E0A\u4E00\u6BB5\u603B\u7ED3\u4ECD\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u5019" };
      _summarizing = true;
      let range, total, recent;
      try {
        const cr = computeRange(settings, opts, "autoSummaryMode", () => WM.MemoryStore.getSummaryPointer());
        if (cr.skip) return { ok: false, range: cr.range, reason: cr.reason };
        range = cr.range;
        recent = cr.recent;
        total = cr.total;
        const histSummaries = (WM.MemoryStore.getSummaries() || []).map((s) => `\xB7 ${s.title}\uFF1A${s.text}`).join("\n");
        const successes = [];
        const failures = [];
        if (mode === "full" || mode === "summary") {
          const summaryTpl = settings.prompts && settings.prompts.summary;
          const sys = fillTemplate(summaryTpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries });
          try {
            const rawSummary = await callLLM(sys, "\u628A\u53D9\u4E8B\u6B63\u6587\u653E\u5728 <Summary> \u548C </Summary> \u4E4B\u95F4\u3002\u6CA1\u6709\u65B0\u5185\u5BB9\u5C31\u8F93\u51FA <Summary></Summary>\u3002\u6807\u7B7E\u4E4B\u5916\u4E0D\u8981\u5199\u4EFB\u4F55\u5185\u5BB9\u3002", settings, { temperature: 0.3, phase: "summary" });
            const summaryText = taggedSummary(rawSummary);
            if (summaryText && summaryText.trim()) {
              await WM.MemoryStore.addSummary(summaryText, "summary", "\u697C\u5C42 " + range[0] + "-" + range[1]);
              await WM.MemoryStore.setSummaryPointer(range[1]);
              successes.push("summary");
            } else {
              console.warn("[WarmMemo] \u603B\u7ED3\u5185\u5BB9\u4E3A\u7A7A\uFF0C\u8DF3\u8FC7\u5B58\u50A8\u4E0E\u6307\u9488\u63A8\u8FDB\uFF08\u533A\u95F4\u53EF\u80FD\u5168\u4E3A\u5DF2\u9690\u85CF\u697C\u5C42\uFF09");
            }
          } catch (e) {
            if (WM.ErrLog) await WM.ErrLog.add("summary", e, { range });
            WM.UI && WM.UI.toast && WM.UI.toast("\u603B\u7ED3\u5931\u8D25\uFF1A" + (e.message || e), "error");
            failures.push({ scope: "summary", err: e });
          }
        }
        const tasks = [];
        const labels = [];
        if (mode === "full" || mode === "world") {
          const hasWorld = (() => {
            const meta = WM.MemoryStore.getWorldMeta ? WM.MemoryStore.getWorldMeta() : {};
            const secs = WM.MemoryStore.getWorldSections ? WM.MemoryStore.getWorldSections() : [];
            const wold = WM.MemoryStore.getWorld ? WM.MemoryStore.getWorld() : "";
            return !!(meta && (meta.name || meta.kind || meta.desc)) || secs && secs.length || wold && String(wold).trim();
          })();
          if (mode === "world" || !hasWorld) {
            tasks.push((async () => {
              const worldRaw = await WM.Worldbook.inferWorldview(settings, { recent });
              const world = taggedWorld(worldRaw);
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
        }
        if (mode === "full" || mode === "items") {
          tasks.push((async () => {
            const tpl = settings.prompts && settings.prompts.itemExtract;
            if (!tpl) return { kind: "items", ok: true, skipped: true };
            const knownPlots = (WM.MemoryStore.getPlots() || []).map((p) => `\xB7 ${p.title || p.time || p.id}`).join("\n") || "\uFF08\u65E0\uFF09";
            const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), plot: knownPlots });
            const out = await callLLM(s, "\u628A\u6240\u6709\u7269\u54C1\u653E\u5728 <Items> \u548C </Items> \u4E4B\u95F4\uFF0C\u6BCF\u4EF6\u4E00\u884C\uFF0C\u5B57\u6BB5\u7528 | \u5206\u9694\uFF08name|desc|owner|origin|related\uFF09\u3002\u6CA1\u6709\u7269\u54C1\u5C31\u8F93\u51FA <Items></Items>\u3002", settings, { temperature: 0.3, phase: "items" });
            const itemRaw = taggedItems(out);
            const parsedItems = parseItems(itemRaw);
            const allPlots = WM.MemoryStore.getPlots() || [];
            const blank = (v) => !v || /^(无|未知|未标注|-|—)$/.test(v);
            for (const it of parsedItems) {
              const name = it.name;
              if (!name) continue;
              const relIds = [];
              if (!blank(it.relatedPlotText)) {
                for (const t of it.relatedPlotText.split(/[、,，/]/).map((x) => x.trim()).filter(Boolean)) {
                  const hit = allPlots.find((p) => p.title === t) || allPlots.find((p) => p.title && (p.title.includes(t) || t.includes(p.title)));
                  if (hit) relIds.push(hit.id);
                }
              }
              const exist = (WM.MemoryStore.getItems() || []).find((x) => x.name === name);
              const data = {
                name,
                desc: blank(it.desc) ? exist ? exist.desc : "" : it.desc,
                owner: blank(it.owner) ? exist ? exist.owner : "" : it.owner,
                origin: blank(it.origin) ? exist ? exist.origin : "" : it.origin,
                relatedPlots: relIds.length ? relIds : exist ? exist.relatedPlots : []
              };
              if (exist) await WM.MemoryStore.updateItem(exist.id, data);
              else await WM.MemoryStore.addItem(data);
            }
            return { kind: "items", ok: true };
          })());
          labels.push("items");
        }
        if (tasks.length) {
          const results2 = await Promise.allSettled(tasks);
          results2.forEach((r, i) => {
            if (r.status === "rejected") {
              failures.push({ scope: labels[i], err: r.reason });
              if (WM.ErrLog) WM.ErrLog.add(labels[i], r.reason, { range }).catch(() => {
              });
            } else if (r.value && !r.value.skipped) {
              successes.push(r.value.kind);
            }
          });
        }
        if (failures.length > 0 && successes.length === 0) {
          const reason = failures.map((f) => "\u3010" + f.scope + "\u3011" + (f.err && f.err.message ? f.err.message : f.err)).join("\uFF1B\n");
          if (WM.ErrLog) await WM.ErrLog.add("pipeline", new Error("\u603B\u7ED3\u6D41\u7A0B\u5B50\u4EFB\u52A1\u5168\u90E8\u5931\u8D25"), { range, reason });
        } else if (failures.length > 0) {
          if (WM.ErrLog) await WM.ErrLog.add("pipeline", new Error("\u603B\u7ED3\u6D41\u7A0B\u90E8\u5206\u5931\u8D25"), { range, ok: successes, fail: failures.map((f) => f.scope) }).catch(() => {
          });
        }
        if ((mode === "full" || mode === "summary") && settings.bigSummaryEnabled !== false) {
          const allSmall = (WM.MemoryStore.getSummaries ? WM.MemoryStore.getSummaries() : []).filter((s) => s.kind !== "big");
          const every = Math.max(2, settings.bigSummaryEvery || 5);
          if (allSmall.length > 0 && allSmall.length % every === 0) {
            try {
              const big = await triggerBigSummary(settings);
              if (big && big.ok) {
                WM.UI && WM.UI.toast && WM.UI.toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u5DF2\u81EA\u52A8\u751F\u6210\u5927\u603B\u7ED3\uFF08\u6574\u5408 " + big.count + " \u6BB5\u5C0F\u603B\u7ED3\uFF09");
              }
            } catch (e) {
            }
          }
        }
        try {
          if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
        } catch (e) {
        }
        if (WM.UI && WM.UI.refresh) WM.UI.refresh();
        return { ok: true, range, count: recent.length, partial: failures.length > 0, successes, failures: failures.map((f) => f.scope) };
      } finally {
        _summarizing = false;
      }
    }
    async function triggerPlot(settings, opts) {
      opts = opts || {};
      settings = settings || {};
      const mode = opts.mode || "full";
      if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
        try {
          const fresh = WM.Settings && WM.Settings.load && WM.Settings.load();
          if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh;
        } catch (e) {
        }
      }
      if (_plotting) return { ok: false, reason: "\u4E0A\u4E00\u6BB5\u5267\u60C5\u7EBF\u4ECD\u5728\u63A8\u8FDB\uFF0C\u8BF7\u7A0D\u5019" };
      _plotting = true;
      let range, total, recent;
      try {
        const cr = computeRange(settings, opts, "autoPlotMode", () => WM.MemoryStore.getPlotPointer());
        if (cr.skip) return { ok: false, range: cr.range, reason: cr.reason };
        range = cr.range;
        recent = cr.recent;
        total = cr.total;
        const histSummaries = (WM.MemoryStore.getSummaries() || []).map((s) => `\xB7 ${s.title}\uFF1A${s.text}`).join("\n");
        const plotsSorted = WM.MemoryStore.getPlotsSorted ? WM.MemoryStore.getPlotsSorted() : WM.MemoryStore.getPlots() || [];
        const historyPlot = plotsSorted.map((p) => `\xB7 ${p.time ? "[" + p.time + "] " : ""}${p.title}\uFF1A${p.summary}`).join("\n") || "\uFF08\u6682\u65E0\uFF0C\u8BF7\u4ECE\u6700\u8FD1\u5BF9\u8BDD\u8D77\u7B14\uFF09";
        const relationsText = (WM.MemoryStore.getRelations() || []).map((r) => `\xB7 ${r.from} \u2192 ${r.to}\uFF1A${r.label || ""}`).join("\n") || "\uFF08\u6682\u65E0\u5DF2\u77E5\u5173\u7CFB\uFF09";
        const successes = [];
        const failures = [];
        const tasks = [];
        const labels = [];
        if (mode === "full" || mode === "relations") {
          tasks.push((async () => {
            const tpl = settings.prompts && settings.prompts.relations;
            const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), historySummary: histSummaries });
            const out = await callLLM(s, "\u628A\u6240\u6709\u5173\u7CFB\u653E\u5728 <Relations> \u548C </Relations> \u4E4B\u95F4\uFF0C\u6BCF\u6761\u4E00\u884C\uFF0C\u5B57\u6BB5\u7528 | \u5206\u9694\uFF08from|to|label\uFF09\u3002\u6CA1\u6709\u5173\u7CFB\u5C31\u8F93\u51FA <Relations></Relations>\u3002", settings, { temperature: 0.3, phase: "relations" });
            const parsed = parseRelations(taggedRelations(out));
            const prev = WM.MemoryStore.getRelations() || [];
            const merged = WM.Relations && WM.Relations.mergeRelations ? WM.Relations.mergeRelations(prev, parsed) : parsed;
            await WM.MemoryStore.setRelations(merged);
            return { kind: "relations", ok: true };
          })());
          labels.push("relations");
        }
        if (mode === "full" || mode === "plot") {
          tasks.push((async () => {
            const tpl = settings.prompts && settings.prompts.plot;
            const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), relations: relationsText, historyPlot });
            const out = await callLLM(s, "\u628A\u6240\u6709\u5267\u60C5\u653E\u5728 <Plots> \u548C </Plots> \u4E4B\u95F4\uFF0C\u6BCF\u6761\u4E00\u884C\uFF0C\u5B57\u6BB5\u7528 | \u5206\u9694\uFF08time|title|summary\uFF09\u3002\u6CA1\u6709\u65B0\u4E8B\u4EF6\u5C31\u8F93\u51FA <Plots></Plots>\u3002", settings, { temperature: 0.4, phase: "plot" });
            const parsed = parsePlots(taggedPlot(out));
            const existing = WM.MemoryStore.getPlots() || [];
            const normKey = (p) => `${(p.time || "").replace(/\s/g, "")}|${(p.title || "").replace(/\s/g, "")}|${(p.summary || "").replace(/\s/g, "")}`;
            const existKeys = new Set(existing.map(normKey));
            let added = 0, skipped = 0;
            for (const ev of parsed) {
              if (existKeys.has(normKey(ev))) {
                skipped++;
                continue;
              }
              await WM.MemoryStore.addPlot(ev);
              added++;
            }
            if (settings.autoPlotMode === "new" || opts.forceAll) {
              await WM.MemoryStore.setPlotPointer(range[1]);
            }
            return { kind: "plot", ok: true, added, skipped };
          })());
          labels.push("plot");
        }
        if (mode === "full" || mode === "items") {
          tasks.push((async () => {
            const tpl = settings.prompts && settings.prompts.itemExtract;
            if (!tpl) return { kind: "items", ok: true, skipped: true };
            const allPlots = WM.MemoryStore.getPlots() || [];
            const knownPlots = allPlots.map((p) => `\xB7 ${p.title || p.time || p.id}`).join("\n") || "\uFF08\u65E0\uFF09";
            const s = fillTemplate(tpl, { recent: buildDialogue(recent, settings), plot: knownPlots });
            const out = await callLLM(s, "\u628A\u6240\u6709\u7269\u54C1\u653E\u5728 <Items> \u548C </Items> \u4E4B\u95F4\uFF0C\u6BCF\u4EF6\u4E00\u884C\uFF0C\u5B57\u6BB5\u7528 | \u5206\u9694\uFF08name|desc|owner|origin|related\uFF09\u3002\u6CA1\u6709\u7269\u54C1\u5C31\u8F93\u51FA <Items></Items>\u3002", settings, { temperature: 0.3, phase: "items" });
            const itemRaw = taggedItems(out);
            const parsedItems = parseItems(itemRaw, allPlots);
            const blank = (v) => !v || /^(无|未知|未标注|-|—)$/.test(v);
            for (const it of parsedItems) {
              const name = it.name;
              if (!name) continue;
              const exist = (WM.MemoryStore.getItems() || []).find((x) => x.name === name);
              const data = {
                name,
                desc: blank(it.desc) ? exist ? exist.desc : "" : it.desc,
                owner: blank(it.owner) ? exist ? exist.owner : "" : it.owner,
                origin: blank(it.origin) ? exist ? exist.origin : "" : it.origin,
                relatedPlots: Array.isArray(it.relatedPlots) && it.relatedPlots.length ? it.relatedPlots : exist ? exist.relatedPlots : []
              };
              if (exist) await WM.MemoryStore.updateItem(exist.id, data);
              else await WM.MemoryStore.addItem(data);
            }
            return { kind: "items", ok: true };
          })());
          labels.push("items");
        }
        if (tasks.length) {
          const results2 = await Promise.allSettled(tasks);
          results2.forEach((r, i) => {
            if (r.status === "rejected") {
              failures.push({ scope: labels[i], err: r.reason });
              if (WM.ErrLog) WM.ErrLog.add(labels[i], r.reason, { range }).catch(() => {
              });
            } else if (r.value) {
              successes.push(r.value.kind);
            }
          });
        }
        if (failures.length === results.length && failures.length > 0) {
          const reason = failures.map((f) => "\u3010" + f.scope + "\u3011" + (f.err && f.err.message ? f.err.message : f.err)).join("\uFF1B\n");
          if (WM.ErrLog) await WM.ErrLog.add("plot-pipeline", new Error("\u5267\u60C5\u6D41\u7A0B\u5B50\u4EFB\u52A1\u5168\u90E8\u5931\u8D25"), { range, reason });
          WM.UI && WM.UI.toast && WM.UI.toast("\u5267\u60C5\u6D41\u7A0B\u5931\u8D25\uFF0C\u89C1\u300C\u9519\u8BEF\u62A5\u544A\u300D\uFF1A\n" + reason, "error");
        } else if (failures.length > 0) {
          if (WM.ErrLog) await WM.ErrLog.add("plot-pipeline", new Error("\u5267\u60C5\u6D41\u7A0B\u90E8\u5206\u5931\u8D25"), { ok: successes, fail: failures.map((f) => f.scope) }).catch(() => {
          });
          WM.UI && WM.UI.toast && WM.UI.toast("\u5267\u60C5\u6D41\u7A0B\u90E8\u5206\u5931\u8D25 \u2192 " + failures.map((f) => f.scope).join("\u3001"), "warn");
        }
        try {
          if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
        } catch (e) {
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
            plots: (WM.MemoryStore.getPlots() || []).length
          }
        };
      } finally {
        _plotting = false;
      }
    }
    async function triggerBigSummary(settings) {
      settings = settings || {};
      if (!settings.llmConfig || !settings.llmConfig.apiUrl) {
        try {
          const fresh = WM.Settings && WM.Settings.load && WM.Settings.load();
          if (fresh && fresh.llmConfig && fresh.llmConfig.apiUrl) settings = fresh;
        } catch (e) {
        }
      }
      if (settings.bigSummaryEnabled === false) return { ok: false, reason: "\u5927\u603B\u7ED3\u672A\u5F00\u542F" };
      const all = WM.MemoryStore.getSummaries ? WM.MemoryStore.getSummaries() : [];
      const every = Math.max(2, settings.bigSummaryEvery || 5);
      const maxSeg = settings.bigSummaryMaxSegments || 0;
      const smalls = all.filter((s) => s.kind !== "big");
      const recentSmalls = maxSeg > 0 ? smalls.slice(-maxSeg) : smalls.slice(-every);
      if (recentSmalls.length < 2) return { ok: false, reason: "\u5C0F\u603B\u7ED3\u6570\u91CF\u4E0D\u8DB3\uFF0C\u6682\u4E0D\u5927\u603B\u7ED3" };
      const joined = recentSmalls.map((s, i) => `\uFF08\u5C0F\u603B\u7ED3 ${i + 1}\uFF09${s.title}
${s.text}`).join("\n\n");
      const summaryTpl = settings.prompts && settings.prompts.summary;
      const sys = fillTemplate(summaryTpl, {
        recent: "\u3010\u4EE5\u4E0B\u662F\u6B64\u524D\u591A\u6BB5\u5C0F\u603B\u7ED3\uFF0C\u8BF7\u5C06\u5B83\u4EEC\u6574\u5408\u4E3A\u4E00\u4EFD\u8FDE\u8D2F\u3001\u4E0D\u91CD\u590D\u7684\u957F\u671F\u8BB0\u5FC6\u3011\n" + joined,
        historySummary: ""
      });
      try {
        const rawBig = await callLLM(sys, "\u628A\u6574\u5408\u540E\u7684\u957F\u671F\u8BB0\u5FC6\u653E\u5728 <Summary> \u548C </Summary> \u4E4B\u95F4\u3002\u6CA1\u6709\u5185\u5BB9\u5C31\u8F93\u51FA <Summary></Summary>\u3002", settings, { temperature: 0.3, phase: "summary" });
        const text = taggedSummary(rawBig);
        await WM.MemoryStore.addSummary(text, "big", "\u5927\u603B\u7ED3\uFF08\u6574\u5408 " + recentSmalls.length + " \u6BB5\u5C0F\u603B\u7ED3\uFF09");
        return { ok: true, count: recentSmalls.length };
      } catch (e) {
        if (WM.ErrLog) await WM.ErrLog.add("big-summary", e, {});
        return { ok: false, reason: e && e.message ? e.message : String(e) };
      }
    }
    WM.Summary = {
      fillTemplate,
      callLLM,
      triggerSummary,
      runSummary: triggerSummary,
      triggerPlot,
      triggerBigSummary,
      getChatMessages,
      getRecentMessages,
      toMessages,
      isSummarizing,
      isPlotting,
      taggedSummary,
      taggedRelations,
      taggedPlot,
      taggedWorld,
      taggedItems,
      parsePlots,
      parseRelations,
      parseItems,
      parseWorld,
      parseJSON,
      sanitizeLLMText,
      cleanSummaryText,
      truncateItemFields,
      isJunkText
    };
  })();

  // src/config/relations.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function mergeRelations(oldList, newList) {
      const map = /* @__PURE__ */ new Map();
      oldList.forEach((r) => map.set(r.from + "" + r.to + "" + r.label, Object.assign({ weight: 1 }, r)));
      newList.forEach((r) => {
        const k = r.from + "" + r.to + "" + r.label;
        const ex = map.get(k);
        if (ex) ex.weight = Math.min(5, (ex.weight || 1) + (r.weight || 1));
        else map.set(k, Object.assign({ weight: 1 }, r));
      });
      return Array.from(map.values());
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
    WM.Relations = { mergeRelations, groupByPerson };
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
        cands.push({ id: p.id, type: "\u5267\u60C5", text: `${p.time ? "[" + p.time + "] " : ""}${p.title || ""}
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
      const takeover = WM.Worldbook && WM.Worldbook.isTakeoverOn ? WM.Worldbook.isTakeoverOn() : false;
      if (takeover) {
        const q = WM.VectorStore.lastQuery || "";
        const ranked = q ? await WM.VectorStore.search(candidates, q, settings.injectTopK || 8) : candidates.slice(-(settings.injectTopK || 8));
        const parts2 = [memBlock];
        if (settings.injectWorld !== false && ranked.length) {
          parts2.push("\u3010\u6E29\u8BB0\u53EC\u56DE\uFF08\u5411\u91CF\u63A5\u7BA1\xB7\u81EA\u5BB6 embedding+rerank\uFF09\u3011\n" + ranked.map((c) => "\xB7 [" + c.type + "] " + c.text).join("\n"));
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
    const WM_BLOCK_START = "\u3010\u6E29\u8BB0\xB7BEGIN\u3011";
    const WM_BLOCK_END = "\u3010\u6E29\u8BB0\xB7END\u3011";
    const IMG_START_TAG = "<!-- WM_IMG_START -->";
    const IMG_END_TAG = "<!-- WM_IMG_END -->";
    function stripImageBlocks(content) {
      if (!content) return content;
      let out = String(content);
      out = out.replace(new RegExp(IMG_START_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" + IMG_END_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");
      out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
      return out.replace(/\n{3,}/g, "\n\n").trim();
    }
    function injectBlockIntoChat(chat, block) {
      if (!Array.isArray(chat) || !chat.length) return chat;
      for (const m of chat) {
        if (m && typeof m.content === "string" && (m.content.indexOf(IMG_START_TAG) >= 0 || m.content.indexOf("![") >= 0)) {
          m.content = stripImageBlocks(m.content);
        }
      }
      if (!block) return chat;
      const sys = chat.find((m) => m && m.role === "system");
      const wrapped = WM_BLOCK_START + "\n" + block + "\n" + WM_BLOCK_END;
      if (sys) {
        let c = sys.content || "";
        if (c.indexOf(WM_BLOCK_START) >= 0) {
          c = c.replace(new RegExp(WM_BLOCK_START + "[\\s\\S]*?" + WM_BLOCK_END, "g"), "").replace(/\n{3,}/g, "\n\n").trim();
        }
        sys.content = (c ? c + "\n\n" : "") + wrapped;
      } else {
        chat.unshift({ role: "system", content: wrapped });
      }
      return chat;
    }
    function extractQueryFromChat(chat) {
      if (!Array.isArray(chat) || !chat.length) return "";
      const userMsgs = chat.filter((m) => m && m.role === "user");
      const lastUser = userMsgs.length ? userMsgs[userMsgs.length - 1].content : "";
      return lastUser ? String(lastUser).slice(0, 2e3) : "";
    }
    async function doInject(chat) {
      try {
        const q = extractQueryFromChat(chat);
        if (q && WM.VectorStore) WM.VectorStore.lastQuery = q;
        const block = await buildMemoryBlock();
        if (!block) return chat;
        return injectBlockIntoChat(chat, block);
      } catch (e) {
        console.error("[WarmMemo] \u6CE8\u5165\u5931\u8D25", e);
        return chat;
      }
    }
    function init() {
      let bound = false;
      try {
        if (window.hooks && typeof window.hooks.addFilter === "function") {
          window.hooks.addFilter("chat_completion_prompt_ready", async (chat) => {
            const arr = Array.isArray(chat) ? chat : chat && chat.chat && Array.isArray(chat.chat) ? chat.chat : null;
            if (!arr) return chat;
            const out = await doInject(arr);
            if (Array.isArray(chat)) return out;
            chat.chat = out;
            return chat;
          }, 1e3);
          bound = true;
          console.log("[WarmMemo] \u6CE8\u5165\u94A9\u5B50\u5DF2\u7ED1\u5B9A\uFF1Awindow.hooks.addFilter(chat_completion_prompt_ready)");
        }
      } catch (e) {
        console.warn("[WarmMemo] addFilter \u7ED1\u5B9A\u5931\u8D25", e);
      }
      const ctx = getCtx();
      const es = ctx && ctx.eventSource;
      if (es && typeof es.on === "function") {
        const readyEvent = getReadyEventName();
        es.on(readyEvent, async (event) => {
          const chat = event && event.detail && Array.isArray(event.detail.chat) ? event.detail.chat : event && Array.isArray(event.chat) ? event.chat : null;
          if (!chat) return;
          const out = await doInject(chat);
          if (event && event.detail && Array.isArray(event.detail.chat)) event.detail.chat = out;
          if (event && Array.isArray(event.chat)) event.chat = out;
        });
        if (bound) console.log("[WarmMemo] \u6CE8\u5165\u94A9\u5B50\u5DF2\u8FFD\u52A0\u53CC\u4FDD\u9669\uFF1A", readyEvent);
        else console.log("[WarmMemo] \u6CE8\u5165\u94A9\u5B50\u5DF2\u7ED1\u5B9A\uFF08\u4EC5 eventSource\uFF09\uFF1A", readyEvent);
      } else if (!bound) {
        console.warn("[WarmMemo] \u672A\u627E\u5230\u4EFB\u4F55\u53EF\u7528\u7684\u6CE8\u5165\u5165\u53E3\uFF08hooks / eventSource \u5747\u4E0D\u53EF\u7528\uFF09");
      }
    }
    WM.Injection = { init, buildMemoryBlock, collectCandidates };
  })();

  // src/config/floor-hider.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    function helper() {
      return window.TavernHelper;
    }
    async function applySummaryPointerHiding(summaryPointer, settings) {
      if (!summaryPointer || summaryPointer <= 0) return "no_pointer";
      const ctx = window.SillyTavern ? window.SillyTavern.getContext() : null;
      if (!ctx || !ctx.chat) return "no_context";
      const chat = ctx.chat;
      if (summaryPointer > chat.length) return "stale_pointer";
      const toHide = [];
      for (let i = 0; i < summaryPointer; i++) {
        const m = chat[i];
        if (m && !m.is_system && !m.is_wm_hidden) toHide.push(i);
      }
      if (!toHide.length) return "already";
      let apiOk = false;
      try {
        const h = helper();
        if (h && typeof h.setChatMessages === "function") {
          await h.setChatMessages(
            toHide.map((id) => ({ message_id: id, is_hidden: true })),
            { refresh: "affected" }
          );
          apiOk = true;
        }
      } catch (e) {
        console.warn("[WarmMemo] setChatMessages \u9690\u85CF\u5931\u8D25\uFF0C\u56DE\u9000\u76F4\u63A5\u6539 chat:", e);
      }
      for (const i of toHide) {
        const m = chat[i];
        m.is_original_system = false;
        m.is_hidden = true;
        if (!apiOk) {
          m.is_system = true;
        }
        m.is_wm_hidden = true;
      }
      if (typeof ctx.saveChat === "function") {
        try {
          await ctx.saveChat();
        } catch (e) {
          console.warn("[WarmMemo] saveChat \u5931\u8D25:", e);
        }
      }
      try {
        const showChat = ctx && typeof ctx.showChat === "function" ? ctx.showChat : window.SillyTavern && typeof window.SillyTavern.showChat === "function" ? window.SillyTavern.showChat : null;
        if (showChat) showChat();
      } catch (e) {
      }
      if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
      return "hidden";
    }
    async function hideUntil(lastIndex, settings) {
      if (lastIndex == null || lastIndex < 0) return "invalid";
      return applySummaryPointerHiding(lastIndex, settings);
    }
    async function unhideAll() {
      const ctx = window.SillyTavern ? window.SillyTavern.getContext() : null;
      if (!ctx || !ctx.chat) return false;
      const chat = ctx.chat;
      const toRestore = [];
      for (let i = 0; i < chat.length; i++) {
        const m = chat[i];
        if (m && m.is_wm_hidden) toRestore.push(i);
      }
      if (!toRestore.length) return false;
      try {
        const h = helper();
        if (h && typeof h.setChatMessages === "function") {
          await h.setChatMessages(
            toRestore.map((id) => ({ message_id: id, is_hidden: false })),
            { refresh: "affected" }
          );
        }
      } catch (e) {
        console.warn("[WarmMemo] setChatMessages \u53CD\u9690\u85CF\u5931\u8D25:", e);
      }
      for (const i of toRestore) {
        const m = chat[i];
        m.is_wm_hidden = false;
        if (!m.is_original_system) {
          m.is_system = false;
          m.is_hidden = false;
        }
      }
      if (typeof ctx.saveChat === "function") {
        try {
          await ctx.saveChat();
        } catch (e) {
        }
      }
      try {
        const showChat = ctx && typeof ctx.showChat === "function" ? ctx.showChat : window.SillyTavern && typeof window.SillyTavern.showChat === "function" ? window.SillyTavern.showChat : null;
        if (showChat) showChat();
      } catch (e) {
      }
      if (WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
      return true;
    }
    WM.FloorHider = { applySummaryPointerHiding, hideUntil, unhideAll };
  })();

  // src/config/image-generator.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const IMG_START = "<!-- WM_IMG_START -->";
    const IMG_END = "<!-- WM_IMG_END -->";
    function helper() {
      return window.TavernHelper;
    }
    function getChatMessages(range, opts) {
      const h = helper();
      if (h && typeof h.getChatMessages === "function") return h.getChatMessages(range, opts);
      if (typeof window.getChatMessages === "function") return window.getChatMessages(range, opts);
      if (typeof getChatMessages === "function") return getChatMessages(range, opts);
      return [];
    }
    async function setChatMessages(arr, opts) {
      const h = helper();
      if (h && typeof h.setChatMessages === "function") return h.setChatMessages(arr, opts);
      if (typeof window.setChatMessages === "function") return window.setChatMessages(arr, opts);
      if (typeof setChatMessages === "function") return setChatMessages(arr, opts);
      throw new Error("setChatMessages \u4E0D\u53EF\u7528\uFF08\u9700\u9152\u9986\u52A9\u624B\uFF09");
    }
    async function createChatMessages(arr, opts) {
      const h = helper();
      if (h && typeof h.createChatMessages === "function") return h.createChatMessages(arr, opts);
      if (typeof window.createChatMessages === "function") return window.createChatMessages(arr, opts);
      if (typeof createChatMessages === "function") return createChatMessages(arr, opts);
      throw new Error("createChatMessages \u4E0D\u53EF\u7528\uFF08\u9700\u9152\u9986\u52A9\u624B\uFF09");
    }
    function applyImgProxy(url, settings) {
      if (!url) return url;
      const ig = settings && settings.imageGen || {};
      if (ig.imgProxyEnabled === false) return url;
      if (!/^https?:\/\//i.test(url)) return url;
      let origin = "";
      try {
        origin = window.top && window.top.location && window.top.location.origin || window.location.origin;
      } catch (e) {
        origin = window.location.origin;
      }
      if (!origin || origin === "null") return url;
      let port = "";
      try {
        const u0 = new URL(origin);
        port = u0.port || (u0.protocol === "https:" ? "443" : "80");
      } catch (e) {
      }
      if (port === "8000" || port === "8001") return url;
      const proxyPath = String(ig.imgProxyPath || "/img").replace(/\/+$/, "");
      try {
        const eu = new URL(url, origin);
        const pathOnly = eu.pathname + (eu.search || "");
        const rewritten = origin + proxyPath + pathOnly;
        try {
          console.log("[WarmMemo][image-gen] \u540C\u6E90\u4EE3\u7406\u6539\u5199\uFF1A", url, "\u2192", rewritten);
        } catch (_) {
        }
        return rewritten;
      } catch (e) {
        return url;
      }
    }
    async function wmFetch(url, opts, settings) {
      const finalUrl = applyImgProxy(url, settings);
      try {
        return await fetch(finalUrl, opts);
      } catch (netErr) {
        const netMsg = String(netErr && netErr.message ? netErr.message : netErr);
        const origHost = function() {
          try {
            return new URL(url).host;
          } catch (_) {
            return url;
          }
        }();
        const isComfy = /127\.0\.0\.1:8188|localhost:8188/.test(String(url));
        const comfyExtra = isComfy ? '\n  \uFF08ComfyUI \u65B0\u7248\u672C\u8FD8\u6709 Host/Origin \u6821\u9A8C \u2192 \u989D\u5916\u52A0\u53C2\u6570 --disable-header-check\uFF09\n  \u5B8C\u6574\u542F\u52A8\u53C2\u6570\u793A\u4F8B\uFF08\u63A8\u8350\uFF09\uFF1Apython main.py --listen 127.0.0.1 --enable-cors-header "*" --disable-header-check' : "";
        const hint = "\u6D4F\u89C8\u5668\u65E0\u6CD5\u76F4\u8FDE " + origHost + '\uFF08\u53EF\u80FD\u662F ComfyUI/SD WebUI \u672A\u5F00\u542F CORS \u6216\u4EE3\u7406\u4E0D\u901A\uFF09\u3002\n\u89E3\u51B3\u65B9\u5F0F\uFF08\u4EFB\u9009\u5176\u4E00\uFF09\uFF1A\n  \u2460 \u542F\u52A8 ComfyUI \u65F6\u52A0\u53C2\u6570\uFF1Apython main.py --enable-cors-header "*"' + comfyExtra + '\n     SD WebUI \u542F\u52A8\u65F6\u52A0\u53C2\u6570\uFF1A--api --cors-allow-origins=*\n  \u2461 \u8D70\u6E29\u8BB0\u540C\u6E90\u4EE3\u7406\uFF08\u5916\u7F51\u7A7F\u900F\u573A\u666F\uFF09\uFF1A\u5728\u53CD\u4EE3\u91CC\u628A "' + String(settings && settings.imageGen && settings.imageGen.imgProxyPath || "/img") + '/*" \u8F6C\u53D1\u5230 ' + origHost + "/*\uFF0C\u6E29\u8BB0\u5DF2\u81EA\u52A8\u6539\u5199\u8BF7\u6C42 URL\u3002\n\u539F\u59CB\u9519\u8BEF\uFF1A" + netMsg;
        const err = new Error(hint);
        err.name = "ImageCorsError";
        throw err;
      }
    }
    let _csrfToken = null;
    async function getCsrfToken() {
      if (_csrfToken) return _csrfToken;
      try {
        const res = await fetch("/csrf-token");
        if (!res.ok) return null;
        const data = await res.json();
        _csrfToken = data.token || null;
        return _csrfToken;
      } catch (e) {
        console.warn("[WarmMemo][image-gen] \u83B7\u53D6 CSRF token \u5931\u8D25:", e);
        return null;
      }
    }
    async function stFetch(path, body) {
      const token = await getCsrfToken();
      const headers = { "Content-Type": "application/json" };
      if (token) headers["X-CSRF-Token"] = token;
      return await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    }
    function sanitizePrompt(raw) {
      if (!raw) return "";
      let s = String(raw);
      s = s.replace(/<\/?ImagePrompt[^>]*>/gi, "");
      s = s.replace(/^```[a-zA-Z]*\s*/gm, "").replace(/```\s*$/gm, "");
      s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      const parts = s.split(/[\n\r。！？!?\.；;，,]+/).map((p) => p.trim()).filter(Boolean);
      const NOISE_KEYWORDS = [
        // 中文：LLM 自言自语/解释类关键词
        "\u4E5F\u8BB8",
        "\u6216\u8BB8",
        "\u53EF\u80FD",
        "\u8003\u8651\u5230",
        "\u9274\u4E8E",
        "\u53E6\u4E00\u79CD\u53EF\u80FD",
        "\u53E6\u5916",
        "\u6B64\u5916",
        "\u4F46\u662F",
        "\u7136\u800C",
        "\u4E0D\u8FC7",
        "\u6211\u4EEC\u53EF\u4EE5",
        "\u6211\u4EEC\u5E94\u8BE5",
        "\u6211\u53EF\u4EE5",
        "\u5982\u679C",
        "\u5047\u8BBE",
        "\u65E0\u6CD5\u9605\u8BFB",
        "\u65E0\u6CD5\u8BC6\u522B",
        "\u751F\u56FE\u6A21\u578B",
        "\u4E0D\u80FD\u7406\u89E3",
        "\u65E0\u6CD5\u7406\u89E3",
        "\u6CE8\u610F",
        "\u63D0\u793A",
        "\u8BF7",
        "\u8981\u6C42",
        "\u8F93\u51FA",
        "\u5982\u679C\u6211\u4EEC",
        "\u5BF9\u4E8E",
        "\u5173\u4E8E",
        "\u8FD9\u79CD",
        "\u90A3\u4E2A",
        "\u4E00\u4E2A\u62BD\u8C61\u573A\u666F",
        "\u6BD4\u55BB\u6027",
        "\u793A\u610F\u7684\u65B9\u5F0F",
        "\u4E0D\u662F\u5177\u4F53\u53D9\u4E8B",
        "\u62BD\u8C61",
        "welcome",
        "\u6B22\u8FCE\u6D88\u606F",
        "\u753B\u9762\u5143\u7D20",
        "\u8089\u773C\u53EF\u89C1",
        "\u63D0\u70BC\u89C4\u8303",
        "\u8F93\u51FA\u5951\u7EA6",
        "\u683C\u5F0F\u8981\u6C42",
        "\u4EE5\u4E0B\u662F",
        "\u8BA9\u6211",
        "\u6211\u4EEC\u6765",
        "\u9996\u5148",
        "\u5176\u6B21",
        "\u6700\u540E",
        "\u603B\u7ED3\u4E00\u4E0B",
        "\u7EFC\u4E0A\u6240\u8FF0",
        // 新增：LLM 分析/元评论类（"但实际上用户没有提供叙事"等典型废话）
        "\u4F46\u5B9E\u9645\u4E0A",
        "\u8FD9\u4F3C\u4E4E",
        "\u6CA1\u6709\u63D0\u4F9B",
        "\u9700\u8981\u6307\u51FA",
        "\u89D2\u8272\u8BBE\u5B9A",
        "\u53D9\u4E8B",
        "\u5B9E\u9645\u4E0A\u662F",
        "\u770B\u8D77\u6765",
        "\u4F3C\u4E4E\u662F",
        "\u5E94\u8BE5\u662F",
        "\u65E0\u6CD5\u751F\u6210",
        "\u65E0\u6CD5\u63CF\u7ED8",
        "\u5E73\u53F0",
        "\u6CA1\u6709\u5B9E\u9645",
        "\u6240\u4EE5\u6211\u4EEC\u9700\u8981",
        "\u6307\u51FA",
        "\u7528\u6237\u6CA1\u6709",
        "\u52A9\u624B",
        // 英文
        "maybe",
        "perhaps",
        "however",
        "but",
        "if we",
        "consider",
        "considering",
        "note that",
        "note:",
        "prompt",
        "output:",
        "welcome",
        "let me",
        "i think",
        "here are",
        "first",
        "second",
        "finally",
        "in conclusion",
        "to summarize"
      ];
      const filtered = parts.filter((p) => {
        if (p.length < 2) return false;
        const lower = p.toLowerCase();
        return !NOISE_KEYWORDS.some((kw) => p.indexOf(kw) >= 0 || lower.indexOf(kw.toLowerCase()) >= 0);
      });
      if (!filtered.length) return "";
      const joined = filtered.join(", ");
      return joined.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").replace(/[,，]{2,}/g, ",").replace(/^[,，\s]+|[,，\s]+$/g, "").trim();
    }
    function extractTag(raw, tag) {
      if (raw == null) return "";
      const s = String(raw).replace(/^```[a-zA-Z]*\s*/gim, "").replace(/```\s*$/g, "").trim();
      const lower = s.toLowerCase();
      const start = lower.indexOf("<" + tag.toLowerCase());
      if (start === -1) return "";
      let i = start + tag.length + 1;
      while (i < s.length && s[i] !== ">" && s[i] !== "/" && s[i] !== "<") i++;
      if (s[i] === "/") return "";
      if (s[i] !== ">") return "";
      const contentStart = i + 1;
      const end = lower.indexOf("</" + tag.toLowerCase(), contentStart);
      if (end === -1) return s.slice(contentStart).trim();
      return s.slice(contentStart, end).trim();
    }
    const STYLE_PREFIX = {
      general: "",
      anime: "anime style, illustration, vibrant colors, detailed shading, ",
      realistic: "photorealistic, high detail, natural lighting, sharp focus, 8k, ",
      ink: "traditional chinese ink painting, sumi-e, minimalist, monochrome, brush stroke, "
    };
    async function generateImagePrompt(aiMessage, settings) {
      const sys = [
        "\u4F60\u662F\u753B\u9762\u6784\u56FE\u5E08\u3002\u4EFB\u52A1\uFF1A\u4ECE\u7ED9\u5B9A\u7684\u53D9\u4E8B\u6587\u672C\u4E2D\u63D0\u70BC\u4E00\u4E2A\u9002\u5408\u6587\u751F\u56FE\u7684\u753B\u9762\u63CF\u8FF0\u3002",
        "",
        "\u63D0\u70BC\u89C4\u8303\uFF1A",
        "- \u53EA\u5199\u300C\u8089\u773C\u53EF\u89C1\u300D\u7684\u753B\u9762\u5143\u7D20\uFF1A\u4EBA\u7269\u5916\u89C2/\u670D\u88C5/\u52A8\u4F5C/\u8868\u60C5\u3001\u573A\u666F/\u73AF\u5883/\u5149\u5F71/\u5929\u6C14\u3001\u6784\u56FE/\u89C6\u89D2/\u666F\u522B\u3002",
        "- \u4E0D\u5199\u53F0\u8BCD\u3001\u5FC3\u7406\u3001\u62BD\u8C61\u6982\u5FF5\u3001\u5267\u60C5\u80CC\u666F\u2014\u2014\u751F\u56FE\u6A21\u578B\u770B\u4E0D\u61C2\u8FD9\u4E9B\u3002",
        "- \u7528\u82F1\u6587\u77ED\u53E5+\u9017\u53F7\u5206\u9694\u7684\u5173\u952E\u8BCD\u7EC4\uFF08tag \u5F0F\uFF09\uFF0C\u4FBF\u4E8E\u751F\u56FE\u6A21\u578B\u89E3\u6790\u3002\u5982\uFF1A1girl, long black hair, red hanfu, standing in pavilion, moonlight, side view\u3002",
        "- \u628A\u591A\u4E2A\u89D2\u8272\u7684\u5916\u89C2\u5206\u522B\u63CF\u8FF0\u6E05\u695A\uFF08\u53D1\u8272/\u670D\u88C5/\u4F4D\u7F6E\uFF09\u3002",
        "- 80-150 \u5B57\u4E4B\u5185\uFF0C\u5B81\u7CBE\u52FF\u6CDB\u3002",
        "",
        "\u8F93\u51FA\u5951\u7EA6\uFF1A\u628A\u753B\u9762\u63CF\u8FF0\u653E\u5728 <ImagePrompt> \u548C </ImagePrompt> \u4E4B\u95F4\u3002\u6807\u7B7E\u5916\u7684\u6240\u6709\u6587\u5B57\u90FD\u4F1A\u88AB\u4E22\u5F03\u3002",
        "\u683C\u5F0F\uFF1A",
        "<ImagePrompt>",
        "1girl, long black hair, red hanfu, standing in bamboo forest, sunlight filtering through leaves, upper body",
        "</ImagePrompt>"
      ].join("\n");
      const user = "\u3010AI \u56DE\u590D\u3011\n" + String(aiMessage || "").slice(0, 4e3);
      const opts = { maxTokens: 400, temperature: 0.5 };
      const out = await WM.LLMClient.complete(sys, user, settings, opts);
      const tagged = extractTag(out, "ImagePrompt");
      const cleaned = String(out || "").replace(/^```[a-zA-Z]*\s*/gim, "").replace(/```\s*$/g, "").trim();
      const raw = (tagged || cleaned || "").trim();
      if (!raw) throw new Error("LLM \u672A\u751F\u6210\u6709\u6548\u753B\u9762\u63D0\u793A\u8BCD");
      const result = sanitizePrompt(raw);
      if (!result) throw new Error("LLM \u753B\u9762\u63D0\u793A\u8BCD\u6E05\u6D17\u540E\u4E3A\u7A7A\uFF08\u6A21\u578B\u8F93\u51FA\u7684\u5168\u662F\u89E3\u91CA\u6587\u5B57\uFF0C\u8BF7\u91CD\u8BD5\u6216\u964D\u4F4E promptStyle \u7B49\u7EA7\uFF09");
      return result;
    }
    function buildFullPrompt(imagePrompt, settings) {
      const ig = settings.imageGen || {};
      const style = STYLE_PREFIX[ig.promptStyle] || "";
      let core = style ? style + imagePrompt : imagePrompt;
      const tpl = ig.promptPrefix && ig.promptPrefix.trim() ? ig.promptPrefix : ig.promptTemplate || "";
      if (tpl && tpl.trim()) {
        if (tpl.indexOf("{{prompt}}") >= 0) {
          core = tpl.replace(/\{\{prompt\}\}/g, core);
        } else {
          core = tpl + " " + core;
        }
      }
      return core;
    }
    function buildFullNegative(settings) {
      const ig = settings.imageGen || {};
      const pre = (ig.negativePrefix || "").trim();
      const cur = (ig.negativePrompt || "").trim();
      const parts = [];
      if (pre) parts.push(pre.replace(/[,，\s]+$/g, ""));
      if (cur) parts.push(cur.replace(/^[,，\s]+/g, "").replace(/[,，\s]+$/g, ""));
      return parts.filter(Boolean).join(", ");
    }
    function resolveSeed(seedCfg) {
      const n = Number(seedCfg);
      if (isNaN(n) || n === -1 || n < 0) {
        return Math.floor(Math.random() * 2147483647);
      }
      return Math.floor(n);
    }
    async function callSdWebui(prompt2, settings) {
      const ig = settings.imageGen || {};
      const base = (ig.apiUrl || "http://127.0.0.1:7860").replace(/0\.0\.0\.0/g, "127.0.0.1").replace(/\/+$/, "");
      const negative = buildFullNegative(settings);
      const body = {
        url: base,
        auth: "",
        prompt: prompt2,
        negative_prompt: negative,
        steps: Number(ig.steps) || 20,
        cfg_scale: Number(ig.cfgScale) || 7,
        width: Number(ig.width) || 512,
        height: Number(ig.height) || 768,
        denoising_strength: ig.denoisingStrength == null ? 1 : Math.max(0, Math.min(1, Number(ig.denoisingStrength))),
        seed: resolveSeed(ig.seed),
        sampler_name: ig.sampler || "Euler a"
      };
      if (ig.model) body.override_settings = { sd_model_checkpoint: ig.model };
      const res = await stFetch("/api/sd/generate", body);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error("SD WebUI\uFF08\u9152\u9986\u4EE3\u7406 /api/sd/generate\uFF09HTTP " + res.status + "\uFF1A" + t.slice(0, 300));
      }
      const j = await res.json();
      if (!j.images || !j.images.length) throw new Error("SD WebUI \u672A\u8FD4\u56DE\u56FE\u7247");
      return "data:image/png;base64," + j.images[0];
    }
    const PLACEHOLDER_DEFS = [
      { key: "prompt", label: "\u6B63\u5411\u63D0\u793A\u8BCD", type: "string", desc: "LLM \u6574\u5408\u51FA\u7684\u753B\u9762\u63CF\u8FF0\uFF08\u542B\u98CE\u683C\u524D\u7F00\uFF09" },
      { key: "negative", label: "\u8D1F\u9762\u63D0\u793A\u8BCD", type: "string", desc: "\u8D1F\u9762\u63D0\u793A\u8BCD\uFF08\u542B\u524D\u7F00+\u672C\u6B21\u7279\u5B9A\uFF09" },
      { key: "negative_prompt", label: "\u8D1F\u9762\u63D0\u793A\u8BCD(\u9152\u9986\u683C\u5F0F)", type: "string", desc: "\u540C negative\uFF0C\u517C\u5BB9\u9152\u9986\u5BFC\u51FA\u5DE5\u4F5C\u6D41" },
      { key: "model", label: "\u6A21\u578B\u540D", type: "string", desc: "Checkpoint / UNet / GGUF \u6A21\u578B\u6587\u4EF6\u540D" },
      { key: "vae", label: "VAE \u540D", type: "string", desc: "VAELoader \u7684 vae_name" },
      { key: "clip", label: "CLIP \u540D", type: "string", desc: "CLIPLoader \u7684 clip_name" },
      { key: "sampler", label: "\u91C7\u6837\u5668", type: "string", desc: "KSampler \u7684 sampler_name" },
      { key: "scheduler", label: "\u8C03\u5EA6\u5668", type: "string", desc: "KSampler \u7684 scheduler" },
      { key: "seed", label: "\u79CD\u5B50", type: "number", desc: "-1=\u968F\u673A\uFF0C\u5426\u5219\u7528\u56FA\u5B9A\u503C" },
      { key: "steps", label: "\u91C7\u6837\u6B65\u6570", type: "number", desc: "KSampler \u7684 steps" },
      { key: "cfg", label: "CFG \u7F29\u653E", type: "number", desc: "KSampler \u7684 cfg\uFF08\u4E5F\u53EB scale\uFF09" },
      { key: "scale", label: "CFG \u7F29\u653E(\u9152\u9986\u683C\u5F0F)", type: "number", desc: "\u540C cfg\uFF0C\u517C\u5BB9\u9152\u9986\u5BFC\u51FA\u5DE5\u4F5C\u6D41" },
      { key: "width", label: "\u56FE\u7247\u5BBD\u5EA6", type: "number", desc: "EmptyLatentImage \u7684 width" },
      { key: "height", label: "\u56FE\u7247\u9AD8\u5EA6", type: "number", desc: "EmptyLatentImage \u7684 height" },
      { key: "denoise", label: "\u53BB\u566A\u5F3A\u5EA6", type: "number", desc: "KSampler \u7684 denoise\uFF080~1\uFF09" },
      { key: "clip_skip", label: "CLIP\u8DF3\u8FC7\u5C42", type: "number", desc: "CLIPSetLastLayer \u7684 stop_at_clip_layer\uFF08\u8D1F\u503C\uFF09" }
    ];
    const NUMERIC_KEYS = new Set(PLACEHOLDER_DEFS.filter((p) => p.type === "number").map((p) => p.key));
    const PLACEHOLDER_ALIASES = {
      "negative_prompt": "negative",
      "scale": "cfg"
    };
    function defaultComfyWorkflow() {
      return {
        "3": { class_type: "KSampler", inputs: { seed: "{{seed}}", steps: "{{steps}}", cfg: "{{cfg}}", sampler_name: "{{sampler}}", scheduler: "{{scheduler}}", denoise: "{{denoise}}", model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } },
        "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{model}}" } },
        "5": { class_type: "EmptyLatentImage", inputs: { width: "{{width}}", height: "{{height}}", batch_size: 1 } },
        "6": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", clip: ["4", 1] } },
        "7": { class_type: "CLIPTextEncode", inputs: { text: "{{negative}}", clip: ["4", 1] } },
        "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
        "9": { class_type: "SaveImage", inputs: { filename_prefix: "WarmMemo", images: ["8", 0] } }
      };
    }
    function defaultComfyWorkflowZImage() {
      return {
        "3": { class_type: "KSampler", inputs: { seed: "{{seed}}", steps: "{{steps}}", cfg: 1, sampler_name: "res_multistep", scheduler: "simple", denoise: "{{denoise}}", model: ["11", 0], positive: ["27", 0], negative: ["33", 0], latent_image: ["13", 0] } },
        "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["29", 0] } },
        "9": { class_type: "SaveImage", inputs: { filename_prefix: "WarmMemo", images: ["8", 0] } },
        "11": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["28", 0], shift: 3 } },
        "13": { class_type: "EmptySD3LatentImage", inputs: { width: "{{width}}", height: "{{height}}", batch_size: 1 } },
        "27": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", clip: ["30", 0] } },
        "28": { class_type: "UNETLoader", inputs: { unet_name: "{{model}}", weight_dtype: "default" } },
        "29": { class_type: "VAELoader", inputs: { vae_name: "{{vae}}" } },
        "30": { class_type: "CLIPLoader", inputs: { clip_name: "{{clip}}", type: "lumina2", device: "default" } },
        "33": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["27", 0] } }
      };
    }
    function isUnetModel(modelName) {
      if (!modelName) return false;
      const lower = modelName.toLowerCase();
      return lower.includes("z_image") || lower.includes("z-image") || lower.includes("flux") || lower.includes("sdxl_unet") || lower.includes("diffusion_model") || lower.includes("_unet") || lower.includes(".gguf");
    }
    function detectWorkflowNodes(workflowObj) {
      const result = {
        modelType: "unknown",
        loaders: [],
        placeholders: [],
        nodeCount: 0,
        hasKSampler: false,
        hasSaveImage: false,
        hasVAEDecode: false
      };
      if (!workflowObj || typeof workflowObj !== "object") return result;
      const nodes = workflowObj;
      let hasCheckpoint = false, hasUNET = false, hasGGUF = false;
      const usedPlaceholders = /* @__PURE__ */ new Set();
      for (const nodeId of Object.keys(nodes)) {
        const node = nodes[nodeId];
        if (!node || !node.class_type) continue;
        result.nodeCount++;
        const ct = node.class_type;
        const inputs = node.inputs || {};
        if (ct === "CheckpointLoaderSimple") {
          hasCheckpoint = true;
          result.loaders.push({ nodeId, class_type: ct, inputField: "ckpt_name" });
        } else if (ct === "UNETLoader") {
          hasUNET = true;
          result.loaders.push({ nodeId, class_type: ct, inputField: "unet_name" });
        } else if (ct === "UnetLoaderGGUF") {
          hasGGUF = true;
          result.loaders.push({ nodeId, class_type: ct, inputField: "unet_name" });
        } else if (ct === "CLIPLoader" || ct === "DualCLIPLoader") {
          result.loaders.push({ nodeId, class_type: ct, inputField: ct === "DualCLIPLoader" ? "clip_name1" : "clip_name" });
        } else if (ct === "VAELoader") {
          result.loaders.push({ nodeId, class_type: ct, inputField: "vae_name" });
        } else if (ct === "KSampler" || ct === "KSamplerAdvanced" || ct === "SamplerCustom") {
          result.hasKSampler = true;
        } else if (ct === "SaveImage" || ct === "PreviewImage") {
          result.hasSaveImage = true;
        } else if (ct === "VAEDecode") {
          result.hasVAEDecode = true;
        }
        for (const inputKey of Object.keys(inputs)) {
          const val = inputs[inputKey];
          if (typeof val === "string") {
            const matches = val.match(/\{\{(\w+)\}\}/g) || [];
            for (const m of matches) usedPlaceholders.add(m.replace(/[{}]/g, ""));
            const pctMatches = val.match(/%(\w+)%/g) || [];
            for (const m of pctMatches) usedPlaceholders.add(m.replace(/%/g, ""));
          }
        }
      }
      if (hasGGUF) result.modelType = "gguf";
      else if (hasUNET) result.modelType = "unet";
      else if (hasCheckpoint) result.modelType = "checkpoint";
      result.placeholders = PLACEHOLDER_DEFS.map((p) => ({
        key: p.key,
        label: p.label,
        type: p.type,
        found: usedPlaceholders.has(p.key)
      }));
      return result;
    }
    function checkPlaceholdersInWorkflow(workflowStr) {
      const found = /* @__PURE__ */ new Set();
      if (!workflowStr) return PLACEHOLDER_DEFS.map((p) => ({ ...p, found: false }));
      for (const p of PLACEHOLDER_DEFS) {
        const re1 = new RegExp("\\{\\{" + p.key + "\\}\\}", "g");
        const re2 = new RegExp('%"?' + p.key + '"?%', "g");
        if (re1.test(workflowStr) || re2.test(workflowStr)) {
          found.add(p.key);
        }
      }
      return PLACEHOLDER_DEFS.map((p) => ({ ...p, found: found.has(p.key) }));
    }
    function replaceWorkflowPlaceholders(workflowStr, values) {
      let s = workflowStr;
      const esc = (anyVal) => {
        const str = String(anyVal == null ? "" : anyVal);
        const out = JSON.stringify(str);
        return out.length >= 2 ? out.slice(1, -1) : out;
      };
      const repStr = (val) => () => esc(val);
      for (const p of PLACEHOLDER_DEFS) {
        const val = values[p.key];
        if (val == null) continue;
        if (p.type === "number") {
          const numVal = String(val);
          s = s.replace(new RegExp('"\\{\\{' + p.key + '\\}\\}"', "g"), numVal);
          s = s.replace(new RegExp('"%' + p.key + '%"', "g"), numVal);
        } else {
          s = s.replace(new RegExp("\\{\\{" + p.key + "\\}\\}", "g"), repStr(val));
          s = s.replace(new RegExp("%" + p.key + "%", "g"), repStr(val));
        }
      }
      return s;
    }
    async function listComfyWorkflows() {
      try {
        const res = await stFetch("/api/sd/comfy/workflows", { url: "" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const arr = await res.json();
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        console.warn("[WarmMemo][comfy] \u5217\u51FA\u5DE5\u4F5C\u6D41\u5931\u8D25\uFF08\u9152\u9986\u540E\u7AEF\uFF09\uFF0C\u56DE\u9000\u5185\u5D4C\u5B58\u50A8\uFF1A", e.message);
        return null;
      }
    }
    async function loadComfyWorkflow(name) {
      if (!name) return null;
      try {
        const res = await stFetch("/api/sd/comfy/workflow", { file_name: name });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const raw = await res.json();
        return typeof raw === "string" ? raw : JSON.stringify(raw);
      } catch (e) {
        console.warn("[WarmMemo][comfy] \u52A0\u8F7D\u5DE5\u4F5C\u6D41\u5931\u8D25\uFF1A", e.message);
        return null;
      }
    }
    async function saveComfyWorkflow(name, workflowJson) {
      if (!name) throw new Error("\u5DE5\u4F5C\u6D41\u6587\u4EF6\u540D\u4E0D\u80FD\u4E3A\u7A7A");
      const fname = name.toLowerCase().endsWith(".json") ? name : name + ".json";
      try {
        const res = await stFetch("/api/sd/comfy/save-workflow", { file_name: fname, workflow: workflowJson });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const arr = await res.json();
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        throw new Error("\u4FDD\u5B58\u5DE5\u4F5C\u6D41\u5931\u8D25\uFF1A" + (e.message || String(e)));
      }
    }
    async function deleteComfyWorkflow(name) {
      if (!name) throw new Error("\u5DE5\u4F5C\u6D41\u6587\u4EF6\u540D\u4E0D\u80FD\u4E3A\u7A7A");
      try {
        const res = await stFetch("/api/sd/comfy/delete-workflow", { file_name: name });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return true;
      } catch (e) {
        throw new Error("\u5220\u9664\u5DE5\u4F5C\u6D41\u5931\u8D25\uFF1A" + (e.message || String(e)));
      }
    }
    async function renameComfyWorkflow(oldName, newName) {
      if (!oldName || !newName) throw new Error("\u6587\u4EF6\u540D\u4E0D\u80FD\u4E3A\u7A7A");
      const oldF = oldName.toLowerCase().endsWith(".json") ? oldName : oldName + ".json";
      const newF = newName.toLowerCase().endsWith(".json") ? newName : newName + ".json";
      try {
        const res = await stFetch("/api/sd/comfy/rename-workflow", { old_name: oldF, new_name: newF });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error("HTTP " + res.status + (t ? ": " + t.slice(0, 200) : ""));
        }
        return true;
      } catch (e) {
        throw new Error("\u91CD\u547D\u540D\u5DE5\u4F5C\u6D41\u5931\u8D25\uFF1A" + (e.message || String(e)));
      }
    }
    async function callComfyui(prompt2, settings) {
      const ig = settings.imageGen || {};
      const base = (ig.apiUrl || "http://127.0.0.1:8188").replace(/0\.0\.0\.0/g, "127.0.0.1").replace(/\/+$/, "");
      const model = ig.model && ig.model.trim() ? ig.model.trim() : "";
      const useZImageWorkflow = ig.comfyWorkflowPreset === "z-image-turbo" || ig.comfyWorkflowPreset !== "checkpoint" && isUnetModel(model);
      let workflowStr;
      let workflowSource = "default";
      if (ig.comfyWorkflow && ig.comfyWorkflow.trim()) {
        workflowStr = ig.comfyWorkflow.trim();
        workflowSource = "inline";
      } else if (ig.comfyWorkflowName) {
        const loaded = await loadComfyWorkflow(ig.comfyWorkflowName);
        if (loaded) {
          workflowStr = loaded;
          workflowSource = "file:" + ig.comfyWorkflowName;
        } else {
          workflowStr = JSON.stringify(useZImageWorkflow ? defaultComfyWorkflowZImage() : defaultComfyWorkflow());
          workflowSource = "default(fallback)";
        }
      } else {
        workflowStr = JSON.stringify(useZImageWorkflow ? defaultComfyWorkflowZImage() : defaultComfyWorkflow());
        workflowSource = "default";
      }
      let workflowObj;
      try {
        workflowObj = JSON.parse(workflowStr);
      } catch (e) {
        throw new Error("ComfyUI \u5DE5\u4F5C\u6D41 JSON \u89E3\u6790\u5931\u8D25\uFF1A" + e.message + "\n\uFF08\u6765\u6E90\uFF1A" + workflowSource + "\uFF09");
      }
      const detection = detectWorkflowNodes(workflowObj);
      const neg = buildFullNegative(settings);
      const cleanPrompt = sanitizePrompt(prompt2);
      const cleanNeg = sanitizePrompt(neg);
      const w = Number(ig.width) || (useZImageWorkflow ? 1024 : 512);
      const h = Number(ig.height) || (useZImageWorkflow ? 1024 : 768);
      const steps = Number(ig.steps) || (useZImageWorkflow ? 8 : 20);
      const cfg = Number(ig.cfgScale) || (useZImageWorkflow ? 1 : 7);
      const denoise = ig.denoisingStrength == null ? 1 : Math.max(0, Math.min(1, Number(ig.denoisingStrength)));
      const seed = resolveSeed(ig.seed);
      const clipName = ig.comfyClip && ig.comfyClip.trim() ? ig.comfyClip.trim() : "qwen_3_4b.safetensors";
      const vaeName = ig.comfyVae && ig.comfyVae.trim() ? ig.comfyVae.trim() : "ae.safetensors";
      const samplerName = ig.sampler && ig.sampler.trim() ? ig.sampler.trim() : useZImageWorkflow ? "res_multistep" : "euler";
      const schedulerName = ig.comfyScheduler && ig.comfyScheduler.trim() ? ig.comfyScheduler.trim() : useZImageWorkflow ? "simple" : "normal";
      const clipSkip = Number(ig.clipSkip) || 0;
      if (!model && workflowSource === "default") {
        throw new Error(useZImageWorkflow ? "ComfyUI\uFF1A\u672A\u9009\u62E9 UNet \u6A21\u578B\u3002\u8BF7\u70B9\u300C\u{1F504} \u5237\u65B0\u5217\u8868\u300D\uFF0C\u4ECE\u4E0B\u62C9\u6846\u9009\u4E00\u4E2A\uFF08\u5982 z_image_turbo_bf16.safetensors\uFF09\u3002" : "ComfyUI\uFF1A\u672A\u9009\u62E9 Checkpoint \u6A21\u578B\u3002\u8BF7\u70B9\u300C\u{1F504} \u5237\u65B0\u5217\u8868\u300D\uFF0C\u4ECE\u4E0B\u62C9\u6846\u9009\u4E00\u4E2A\u4F60\u672C\u5730\u5DF2\u6709\u7684\u6A21\u578B\u540D\u3002");
      }
      const values = {
        prompt: cleanPrompt,
        negative: cleanNeg,
        negative_prompt: cleanNeg,
        // 酒馆格式别名
        model,
        vae: vaeName,
        clip: clipName,
        sampler: samplerName,
        scheduler: schedulerName,
        seed,
        steps,
        cfg,
        scale: cfg,
        // 酒馆格式别名
        width: w,
        height: h,
        denoise,
        clip_skip: clipSkip > 0 ? -clipSkip : -1
      };
      let replacedStr = replaceWorkflowPlaceholders(workflowStr, values);
      let promptObj;
      try {
        promptObj = JSON.parse(replacedStr);
      } catch (e) {
        let posMatch = /position\s+(\d+)/i.exec(String(e && e.message ? e.message : e));
        let snippet = "";
        if (posMatch && posMatch[1]) {
          const p = parseInt(posMatch[1], 10);
          if (!isNaN(p)) {
            const start = Math.max(0, p - 80);
            const end = Math.min(replacedStr.length, p + 80);
            snippet = "\uFF08\u4E0A\u4E0B\u6587\uFF1A\u2026" + replacedStr.slice(start, end).replace(/[\r\n\t]/g, "\u21B5") + "\u2026\uFF09";
          }
        }
        throw new Error("\u5DE5\u4F5C\u6D41\u5360\u4F4D\u7B26\u66FF\u6362\u540E\u89E3\u6790\u5931\u8D25\uFF1A" + (e.message || String(e)) + snippet + "|\u63D0\u793A\u8BCD\u7247\u6BB5=" + String(cleanPrompt || "").slice(0, 120));
      }
      const clientId = "WarmMemo_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const res = await stFetch("/api/sd/comfy/generate", {
        url: base,
        auth: "",
        prompt: JSON.stringify({ prompt: promptObj, client_id: clientId })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error("ComfyUI\uFF08\u9152\u9986\u4EE3\u7406 /api/sd/comfy/generate\uFF09HTTP " + res.status + "\uFF1A" + t.slice(0, 300));
      }
      const j = await res.json();
      if (!j.data) throw new Error("ComfyUI\uFF08\u9152\u9986\u4EE3\u7406\uFF09\u672A\u8FD4\u56DE\u56FE\u7247\u6570\u636E");
      return "data:image/" + (j.format || "png") + ";base64," + j.data;
    }
    async function callCloudApi(prompt2, settings) {
      const ig = settings.imageGen || {};
      const base = (ig.apiUrl || "").replace(/\/+$/, "");
      if (!base) throw new Error("\u4E91\u7AEF API \u672A\u914D\u7F6E apiUrl");
      const path = ig.cloudPath || "/images/generations";
      const url = base + path;
      const w = Number(ig.width) || 512;
      const h = Number(ig.height) || 768;
      const body = {
        prompt: prompt2,
        n: 1,
        size: w + "x" + h,
        response_format: "b64_json"
      };
      if (ig.model) body.model = ig.model;
      const seed = Number(ig.seed);
      if (seed > 0) body.seed = Math.floor(seed);
      if (ig.steps) body.steps = Number(ig.steps) || 20;
      if (ig.cfgScale) body.cfg_scale = Number(ig.cfgScale) || 7;
      const neg = buildFullNegative(settings);
      if (neg) body.negative_prompt = neg;
      const headers = { "Content-Type": "application/json" };
      if (ig.apiKey) headers["Authorization"] = "Bearer " + ig.apiKey;
      const res = await wmFetch(url, { method: "POST", headers, body: JSON.stringify(body) }, settings);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error("\u4E91\u7AEF API HTTP " + res.status + "\uFF1A" + t.slice(0, 300));
      }
      const j = await res.json();
      if (j.data && j.data[0]) {
        if (j.data[0].b64_json) return "data:image/png;base64," + j.data[0].b64_json;
        if (j.data[0].url) return j.data[0].url;
      }
      throw new Error("\u4E91\u7AEF API \u672A\u8FD4\u56DE\u56FE\u7247\u6570\u636E");
    }
    async function fetchAvailableModels(settings) {
      const ig = settings && settings.imageGen || WM.Settings.load().imageGen || {};
      const base = (ig.apiUrl || "").replace(/0\.0\.0\.0/g, "127.0.0.1").replace(/\/+$/, "");
      const type = ig.backendType || "sd-webui";
      if (type === "cloud") {
        return { ok: true, models: [] };
      }
      if (!base) return { ok: false, error: "\u672A\u914D\u7F6E\u540E\u7AEF\u5730\u5740" };
      if (type === "sd-webui") {
        try {
          const res = await stFetch("/api/sd/models", { url: base, auth: "" });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            return { ok: false, error: "SD WebUI\uFF08\u9152\u9986\u4EE3\u7406 /api/sd/models\uFF09HTTP " + res.status + "\uFF1A" + t.slice(0, 200) };
          }
          const arr = await res.json();
          if (!Array.isArray(arr)) return { ok: false, error: "SD WebUI \u8FD4\u56DE\u7ED3\u6784\u5F02\u5E38" };
          const models = arr.map((m) => ({ value: m.value || "", label: m.text || m.value || "" })).filter((m) => m.value);
          return { ok: true, models };
        } catch (e) {
          return { ok: false, error: e.message || String(e) };
        }
      }
      try {
        const res = await stFetch("/api/sd/comfy/models", { url: base, auth: "" });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return { ok: false, error: "ComfyUI\uFF08\u9152\u9986\u4EE3\u7406 /api/sd/comfy/models\uFF09HTTP " + res.status + "\uFF1A" + t.slice(0, 200) };
        }
        const arr = await res.json();
        const models = (Array.isArray(arr) ? arr : []).map((m) => ({ value: m.value || "", label: m.text || m.value || "" })).filter((m) => m.value);
        return { ok: true, models };
      } catch (e) {
        return { ok: false, error: "ComfyUI \u6A21\u578B\u5217\u8868\u52A0\u8F7D\u5931\u8D25\uFF08\u9152\u9986\u4EE3\u7406\uFF09\uFF1A" + (e.message || String(e)) + "\n\n\u8BF7\u786E\u8BA4\u9152\u9986\u6B63\u5728\u8FD0\u884C\uFF0C\u4E14 ComfyUI \u5730\u5740\u6B63\u786E\uFF08" + base + "\uFF09\u3002" };
      }
    }
    async function generateImage(prompt2, settings) {
      const ig = settings.imageGen || {};
      const type = ig.backendType || "sd-webui";
      if (WM.DebugLog) {
        WM.DebugLog.logRequest("llm", { url: "[image-gen:" + type + "]", model: ig.model || "", messages: [{ role: "user", content: prompt2.slice(0, 500) }], max_tokens: 0, temperature: 0, deepThinking: false, reasoningEffort: false, note: "\u751F\u56FE\u8BF7\u6C42" });
      }
      let imageUrl;
      try {
        if (type === "sd-webui") imageUrl = await callSdWebui(prompt2, settings);
        else if (type === "comfyui") imageUrl = await callComfyui(prompt2, settings);
        else if (type === "cloud" || type === "cloud-openai") imageUrl = await callCloudApi(prompt2, settings);
        else throw new Error("\u4E0D\u652F\u6301\u7684\u751F\u56FE\u540E\u7AEF\u7C7B\u578B\uFF1A" + type);
        if (WM.DebugLog) WM.DebugLog.logResponse("llm", { url: "[image-gen:" + type + "]", model: ig.model || "", output: imageUrl.slice(0, 80) + (imageUrl.length > 80 ? "..." : ""), usage: null, finish_reason: "image-ok", rawPreview: "imageUrl length=" + imageUrl.length });
        return imageUrl;
      } catch (e) {
        if (WM.DebugLog) WM.DebugLog.logError("llm", { url: "[image-gen:" + type + "]", error: e.message || String(e) });
        throw e;
      }
    }
    function getLastAIMessage(messageId) {
      if (messageId != null) {
        try {
          const msgs = getChatMessages(messageId);
          if (msgs && msgs.length) return msgs[0];
        } catch (e) {
        }
      }
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
        const chat = ctx && ctx.chat;
        if (Array.isArray(chat)) {
          for (let i = chat.length - 1; i >= 0; i--) {
            const m = chat[i];
            if (!m || m.is_user || m.is_system) continue;
            const mid = m.message_id != null ? m.message_id : i;
            try {
              const msgs = getChatMessages(mid);
              if (msgs && msgs.length) return msgs[0];
            } catch (e) {
            }
            return {
              message_id: mid,
              message: m.mes || "",
              role: "assistant",
              is_hidden: !!m.is_hidden
            };
          }
        }
      } catch (e) {
      }
      return null;
    }
    async function insertImage(imageUrl, messageId, settings) {
      const ig = settings.imageGen || {};
      const alt = "\u6E29\u8BB0\u751F\u56FE " + (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN");
      const safeUrl = String(imageUrl || "").replace(/"/g, "%22").replace(/'/g, "%27");
      const html = '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" data-wm-img-link="1" title="\u70B9\u51FB\u65B0\u6807\u7B7E\u9875\u67E5\u770B\u539F\u56FE\uFF08\u65E0\u9650\u5236\u5927\u5C0F\uFF09"><img src="' + safeUrl + '" alt="' + alt + '" style="max-width:100%!important;max-height:none!important;width:auto!important;height:auto!important;display:block;margin:6px 0;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.15)" data-wm-img="1" /></a>';
      const wrapped = IMG_START + html + IMG_END;
      if (ig.displayMode === "separate") {
        await createChatMessages([{ role: "system", message: wrapped, is_hidden: false }], { refresh: "affected" });
      } else {
        const target = getLastAIMessage(messageId);
        if (!target) throw new Error("\u627E\u4E0D\u5230\u76EE\u6807 AI \u697C\u5C42\uFF0C\u65E0\u6CD5\u8FFD\u52A0\u56FE\u7247");
        const newMessage = (target.message || "") + "\n\n" + wrapped;
        await setChatMessages([{ message_id: target.message_id, message: newMessage }], { refresh: "affected" });
      }
    }
    async function triggerImageGeneration(opts) {
      opts = opts || {};
      const settings = WM.Settings.load();
      const ig = settings.imageGen || {};
      if (ig.enabled === false) return { ok: false, error: "\u751F\u56FE\u529F\u80FD\u672A\u5F00\u542F\uFF08\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u5F00\u542F\uFF09" };
      if (!opts.force && !ig.autoTrigger && opts.silent) {
        return { ok: false, error: "autoTrigger \u672A\u5F00\u542F\uFF0C\u5DF2\u8DF3\u8FC7\uFF08\u53EF\u70B9\u300C\u{1F3A8} \u65E0\u9650\u5236\u7ACB\u5373\u751F\u56FE\u300D\u5F3A\u5236\u51FA\u56FE\uFF09", skipped: true };
      }
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast("\u{1F3A8} \u6B63\u5728\u751F\u6210\u753B\u9762\u63D0\u793A\u8BCD\u2026\uFF08\u53EF\u7EE7\u7EED\u70B9\u51FB\u6392\u961F\uFF09");
      const aiMsg = getLastAIMessage(opts.messageId);
      if (!aiMsg || !aiMsg.message) {
        return { ok: false, error: "\u6CA1\u6709\u53EF\u7528\u7684 AI \u6D88\u606F" };
      }
      const aiText = aiMsg.message;
      let imagePrompt;
      try {
        imagePrompt = await generateImagePrompt(aiText, settings);
      } catch (e) {
        if (WM.ErrLog) await WM.ErrLog.add("image-prompt", e, { stage: "prompt-gen", aiTextPreview: aiText.slice(0, 200) });
        const msg = "\u63D0\u793A\u8BCD\u751F\u6210\u5931\u8D25\uFF1A" + (e.message || e);
        if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast("\u{1F3A8} " + msg);
        return { ok: false, error: msg };
      }
      const fullPrompt = buildFullPrompt(imagePrompt, settings);
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast("\u{1F3A8} \u63D0\u793A\u8BCD\u5C31\u7EEA\uFF0C\u5DF2\u9001\u751F\u56FE\u540E\u7AEF\u6392\u961F\u2026\uFF08\u8FDE\u7EED\u70B9\u51FB\u53EF\u8FFD\u52A0\u591A\u5F20\uFF09");
      let imageUrl;
      try {
        imageUrl = await generateImage(fullPrompt, settings);
      } catch (e) {
        if (WM.ErrLog) await WM.ErrLog.add("image-gen", e, { stage: "image-gen", backend: ig.backendType, prompt: fullPrompt.slice(0, 300) });
        const msg = "\u751F\u56FE\u5931\u8D25\uFF1A" + (e.message || e);
        if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast("\u{1F3A8} " + msg);
        return { ok: false, error: msg, prompt: fullPrompt };
      }
      try {
        await insertImage(imageUrl, aiMsg.message_id, settings);
      } catch (e) {
        if (WM.ErrLog) await WM.ErrLog.add("image-insert", e, { stage: "insert", displayMode: ig.displayMode });
        const msg = "\u56FE\u7247\u63D2\u5165\u5931\u8D25\uFF1A" + (e.message || e);
        if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast("\u{1F3A8} " + msg);
        return { ok: false, error: msg, prompt: fullPrompt, imageUrl };
      }
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast("\u{1F3A8} \u751F\u56FE\u5B8C\u6210\uFF0C\u5DF2\u63D2\u5165\u5BF9\u8BDD\uFF08\u7EE7\u7EED\u70B9\u53EF\u751F\u6210\u66F4\u591A\uFF09");
      return { ok: true, prompt: fullPrompt, imageUrl };
    }
    async function testConnection(settings) {
      const ig = settings && settings.imageGen || WM.Settings.load().imageGen || {};
      const type = ig.backendType || "sd-webui";
      const base = (ig.apiUrl || "").replace(/0\.0\.0\.0/g, "127.0.0.1").replace(/\/+$/, "");
      if (type === "cloud") {
        if (!ig.apiUrl) return { success: false, error: "\u672A\u914D\u7F6E\u540E\u7AEF\u5730\u5740\uFF08apiUrl\uFF09" };
        try {
          const testPrompt = "a cute cat, simple test image";
          const url = await generateImage(testPrompt, { imageGen: ig });
          if (url) return { success: true, detail: "\u8FDE\u901A\uFF0C\u5DF2\u8FD4\u56DE\u56FE\u7247\uFF08" + (url.startsWith("data:") ? "base64" : "url") + "\uFF09" };
          return { success: false, error: "\u672A\u8FD4\u56DE\u56FE\u7247" };
        } catch (e) {
          return { success: false, error: e.message || String(e) };
        }
      }
      if (!base) return { success: false, error: "\u672A\u914D\u7F6E\u540E\u7AEF\u5730\u5740\uFF08apiUrl\uFF09" };
      try {
        const pingPath = type === "comfyui" ? "/api/sd/comfy/ping" : "/api/sd/ping";
        const res = await stFetch(pingPath, { url: base, auth: "" });
        if (res.ok) return { success: true, detail: (type === "comfyui" ? "ComfyUI" : "SD WebUI") + " \u8FDE\u901A\uFF08\u901A\u8FC7\u9152\u9986\u4EE3\u7406\uFF0C\u65E0\u9700\u5F00 CORS\uFF09" };
        const t = await res.text().catch(() => "");
        return { success: false, error: (type === "comfyui" ? "ComfyUI" : "SD WebUI") + " HTTP " + res.status + "\uFF1A" + t.slice(0, 200) };
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    }
    let _floorBtnObserver = null;
    const INJECTED_FLAG = "wm-img-btn-injected";
    function getMessageIdFromEl(el) {
      if (!el) return null;
      const mid = el.getAttribute("data-message-id") || el.getAttribute("data-mid");
      if (mid != null && mid !== "") return isNaN(Number(mid)) ? mid : Number(mid);
      const idAttr = el.id || "";
      if (idAttr && idAttr.indexOf("mes_") === 0) {
        const n = idAttr.slice(4);
        return isNaN(Number(n)) ? n : Number(n);
      }
      return null;
    }
    function isAIMessage(el) {
      if (!el) return false;
      if (el.classList && (el.classList.contains("mes_assistant") || el.classList.contains("assistant") || el.classList.contains("ai-mes"))) return true;
      const role = el.getAttribute("data-role");
      if (role === "assistant" || role === "ai") return true;
      const isUser = el.getAttribute("data-isuser");
      if (isUser === "false") return true;
      return false;
    }
    function injectBtnToMessage(el) {
      if (!el || !el.classList) return;
      if (el.classList.contains(INJECTED_FLAG)) return;
      if (!isAIMessage(el)) return;
      const mid = getMessageIdFromEl(el);
      if (mid == null) return;
      const btn = document.createElement("button");
      btn.className = "wm-floor-img-btn";
      btn.title = "\u{1F3A8} \u6E29\u8BB0\uFF1A\u5BF9\u672C\u697C\u5C42\u65E0\u9650\u5236\u751F\u56FE\uFF08\u8FDE\u70B9\u53EF\u6392\u961F\uFF09";
      btn.textContent = "\u{1F3A8}";
      btn.style.cssText = [
        "position:absolute",
        "top:6px",
        "right:8px",
        "z-index:10",
        "width:28px",
        "height:28px",
        "border-radius:50%",
        "border:none",
        "background:linear-gradient(135deg,#6f5cff,#b347ff)",
        "color:#fff",
        "font-size:14px",
        "cursor:pointer",
        "opacity:0",
        "transition:opacity .2s",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "box-shadow:0 2px 6px rgba(0,0,0,.2)",
        "padding:0"
      ].join(";");
      el.style.position = el.style.position || "relative";
      el.addEventListener("mouseenter", () => {
        btn.style.opacity = "1";
      });
      el.addEventListener("mouseleave", () => {
        btn.style.opacity = "0";
      });
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!WM.ImageGen || typeof WM.ImageGen.triggerUnlimited !== "function") return;
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
        try {
          await WM.ImageGen.triggerUnlimited(mid);
        } finally {
          setTimeout(() => {
            btn.style.opacity = "1";
            btn.style.pointerEvents = "";
          }, 500);
        }
      });
      el.appendChild(btn);
      el.classList.add(INJECTED_FLAG);
    }
    function scanAllMessages() {
      const settings = WM.Settings ? WM.Settings.load() : {};
      const ig = settings.imageGen || {};
      if (ig.enabled === false) return;
      const selectors = ["#chat", ".chat_log", "#chat_log", ".chat", "[data-chat]"];
      let chatEl = null;
      for (const sel of selectors) {
        chatEl = document.querySelector(sel);
        if (chatEl) break;
      }
      if (!chatEl) return;
      const msgSelectors = [".mes", ".message", ".chat-message", "[data-message-id]"];
      let msgEls = [];
      for (const sel of msgSelectors) {
        msgEls = chatEl.querySelectorAll(sel);
        if (msgEls.length) break;
      }
      msgEls.forEach(injectBtnToMessage);
    }
    function initFloorButtons() {
      if (_floorBtnObserver) return;
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFloorButtons, { once: true });
        return;
      }
      try {
        scanAllMessages();
      } catch (e) {
        console.warn("[WarmMemo][image-gen] \u9996\u6B21\u626B\u63CF\u697C\u5C42\u6309\u94AE\u5931\u8D25\uFF1A", e);
      }
      const chatSelectors = ["#chat", ".chat_log", "#chat_log", ".chat", "[data-chat]"];
      let chatEl = null;
      for (const sel of chatSelectors) {
        chatEl = document.querySelector(sel);
        if (chatEl) break;
      }
      if (!chatEl) {
        setTimeout(initFloorButtons, 2e3);
        return;
      }
      _floorBtnObserver = new MutationObserver(() => {
        try {
          scanAllMessages();
        } catch (_) {
        }
      });
      _floorBtnObserver.observe(chatEl, { childList: true, subtree: true });
      console.log("[WarmMemo][image-gen] \u697C\u5C42\u751F\u56FE\u6309\u94AE\u5DF2\u542F\u7528");
    }
    WM.ImageGen = {
      triggerImageGeneration,
      // 简写：面板按钮调用，强制立即生成（忽略 autoTrigger 开关），允许连点排队
      triggerUnlimited: (msgId) => triggerImageGeneration({ force: true, messageId: msgId, silent: false }),
      generateImage,
      generateImagePrompt,
      buildFullPrompt,
      insertImage,
      testConnection,
      fetchAvailableModels,
      sanitizePrompt,
      IMG_START,
      IMG_END,
      // 已取消全局单锁（允许连点排队生成多张），这里保持返回 false 让旧调用方兼容不报错
      isGenerating: () => false,
      // 楼层生图按钮：外部可手动触发重新扫描（切换角色/刷新聊天后）
      initFloorButtons,
      scanAllMessages,
      // ── ComfyUI 工作流管理 ──
      PLACEHOLDER_DEFS,
      listComfyWorkflows,
      loadComfyWorkflow,
      saveComfyWorkflow,
      deleteComfyWorkflow,
      renameComfyWorkflow,
      detectWorkflowNodes,
      checkPlaceholdersInWorkflow,
      replaceWorkflowPlaceholders,
      defaultComfyWorkflow,
      defaultComfyWorkflowZImage,
      isUnetModel
    };
    if (typeof window !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => setTimeout(initFloorButtons, 1e3), { once: true });
      } else {
        setTimeout(initFloorButtons, 1e3);
      }
    }
  })();

  // src/ui/rel-graph.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    const SVGNS = "http://www.w3.org/2000/svg";
    function ensureStyle() {
      if (document.getElementById("wm-relgraph-style")) return;
      const st = document.createElement("style");
      st.id = "wm-relgraph-style";
      st.textContent = `
.wm-graph-wrap{position:relative;width:100%;height:380px;background:var(--wm-paper,#f6f1ea);border:1px solid var(--wm-line,#d8cdbf);border-radius:8px;overflow:hidden;cursor:grab;touch-action:none}
.wm-graph-wrap.panning{cursor:grabbing}
.wm-graph{width:100%;height:100%;display:block;touch-action:none;user-select:none}
.wm-graph .wm-edge{stroke:var(--wm-jade,#6b8e7f);transition:opacity .2s}
.wm-graph .wm-edge.dim{opacity:.1}
.wm-graph .wm-edge.hi{stroke:var(--wm-rose,#b56a6a);opacity:.95}
.wm-graph .wm-node{stroke:var(--wm-paper,#f6f1ea);stroke-width:2;cursor:grab;transition:r .12s}
.wm-graph .wm-node-g.dragging .wm-node{cursor:grabbing}
.wm-graph .wm-node.dim{opacity:.25}
.wm-graph .wm-node.hi{stroke:var(--wm-rose,#b56a6a);stroke-width:3}
.wm-graph text{fill:var(--wm-ink-soft,#5a4a3a);user-select:none;pointer-events:none;font-family:inherit}
.wm-graph text.hi{fill:var(--wm-rose,#b56a6a);font-weight:bold}
.wm-graph text.dim{opacity:.3}
.wm-graph-ctrls{position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:4px;opacity:.85}
.wm-graph-ctrls button{width:30px;height:30px;border-radius:6px;border:1px solid var(--wm-line,#d8cdbf);background:var(--wm-paper,#f6f1ea);color:var(--wm-ink,#3a2a1a);cursor:pointer;font-size:16px;line-height:1;padding:0}
.wm-graph-ctrls button:hover{background:var(--wm-jade-soft,#d8e4dc)}
.wm-rel-names{display:flex;flex-wrap:wrap;gap:6px;padding:10px 2px 4px}
.wm-name-chip{padding:3px 11px;border-radius:13px;background:var(--wm-jade-soft,#d8e4dc);color:var(--wm-ink,#3a2a1a);font-size:12px;cursor:pointer;border:1px solid transparent;transition:all .15s;user-select:none}
.wm-name-chip:hover{border-color:var(--wm-jade,#6b8e7f)}
.wm-name-chip.active{background:var(--wm-rose,#b56a6a);color:#fff;border-color:var(--wm-rose,#b56a6a)}
.wm-rel-detail{margin-top:4px}
.wm-rel-row{padding:5px 10px;border-left:3px solid var(--wm-jade,#6b8e7f);margin:4px 0;background:var(--wm-jade-soft,#eef3ef);border-radius:0 5px 5px 0;font-size:13px}
.wm-rel-row .wm-arrow{color:var(--wm-jade,#6b8e7f);margin:0 6px;font-weight:bold}
.wm-rel-row .wm-lbl{color:var(--wm-rose,#b56a6a);font-weight:600}`;
      document.head.appendChild(st);
    }
    function create(svg, rels, opts) {
      opts = opts || {};
      ensureStyle();
      if (!svg) return noopCtrl();
      const nameSet = /* @__PURE__ */ new Set();
      (rels || []).forEach((r) => {
        if (r && r.from) nameSet.add(r.from);
        if (r && r.to) nameSet.add(r.to);
      });
      const W = 400, H = 380, cx = W / 2, cy = H / 2;
      const names = Array.from(nameSet);
      if (!names.length) {
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.innerHTML = '<text x="200" y="190" text-anchor="middle" fill="#9b8579" font-size="13">\u6682\u65E0\u5173\u7CFB\u6570\u636E</text>';
        return noopCtrl();
      }
      const nodes = names.map((id, i) => {
        const a = i / names.length * Math.PI * 2;
        return { id, x: cx + Math.cos(a) * 70, y: cy + Math.sin(a) * 70, vx: 0, vy: 0, deg: 0 };
      });
      const nodeMap = {};
      nodes.forEach((n) => {
        nodeMap[n.id] = n;
      });
      const edges = (rels || []).filter((r) => r && nodeMap[r.from] && nodeMap[r.to] && r.from !== r.to).map((r) => ({ a: nodeMap[r.from], b: nodeMap[r.to], label: r.label || "", weight: Number.isFinite(r.weight) ? r.weight : 2 }));
      edges.forEach((e) => {
        e.a.deg++;
        e.b.deg++;
      });
      let center = nodeMap[opts.userName || ""];
      if (!center) {
        center = nodes[0];
        nodes.forEach((n) => {
          if (n.deg > center.deg) center = n;
        });
      }
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.classList.add("wm-graph");
      svg.innerHTML = '<g class="wm-viewport"><g class="wm-edges"></g><g class="wm-nodes"></g></g>';
      const edgesG = svg.querySelector(".wm-edges");
      const nodesG = svg.querySelector(".wm-nodes");
      edges.forEach((e) => {
        const line = document.createElementNS(SVGNS, "line");
        line.setAttribute("class", "wm-edge");
        line.setAttribute("stroke-width", Math.min(e.weight, 6));
        line.setAttribute("stroke-opacity", e.a === center || e.b === center ? 0.8 : 0.4);
        edgesG.appendChild(line);
        e.el = line;
      });
      nodes.forEach((n) => {
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "wm-node-g");
        g.setAttribute("data-name", n.id);
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("class", "wm-node");
        c.setAttribute("r", n === center ? 9 : 6);
        c.setAttribute("fill", n === center ? "var(--wm-rose,#b56a6a)" : "var(--wm-jade,#6b8e7f)");
        const t = document.createElementNS(SVGNS, "text");
        t.setAttribute("class", "wm-node-label");
        t.setAttribute("font-size", n === center ? 11 : 10);
        t.textContent = n.id.length > 6 ? n.id.slice(0, 6) + "\u2026" : n.id;
        g.appendChild(c);
        g.appendChild(t);
        nodesG.appendChild(g);
        n.g = g;
        n.c = c;
        n.t = t;
      });
      const K_REP = 2600, K_SPRING = 0.045, REST = 92, K_CENTER = 0.018, DAMPING = 0.84;
      let dragging = null;
      let panning = null;
      let downPos = null;
      let selected = null;
      let rafId = null, running = true, stableFrames = 0;
      function step() {
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = a.x - b.x, dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 0.01) {
              dx = Math.random() - 0.5;
              dy = Math.random() - 0.5;
              d2 = dx * dx + dy * dy + 0.1;
            }
            const d = Math.sqrt(d2);
            const f = K_REP / d2;
            const fx = f * dx / d, fy = f * dy / d;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
        edges.forEach((e) => {
          const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const f = K_SPRING * (d - REST);
          const fx = f * dx / d, fy = f * dy / d;
          e.a.vx += fx;
          e.a.vy += fy;
          e.b.vx -= fx;
          e.b.vy -= fy;
        });
        let totalV = 0;
        nodes.forEach((n) => {
          if (n === dragging) {
            n.vx = 0;
            n.vy = 0;
            return;
          }
          n.vx += (cx - n.x) * K_CENTER;
          n.vy += (cy - n.y) * K_CENTER;
          n.vx *= DAMPING;
          n.vy *= DAMPING;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(24, Math.min(W - 24, n.x));
          n.y = Math.max(24, Math.min(H - 24, n.y));
          totalV += Math.abs(n.vx) + Math.abs(n.vy);
        });
        render();
        if (totalV < 0.4) {
          stableFrames++;
          if (stableFrames > 40) {
            running = false;
            rafId = null;
            return;
          }
        } else stableFrames = 0;
        rafId = requestAnimationFrame(step);
      }
      function render() {
        edges.forEach((e) => {
          e.el.setAttribute("x1", e.a.x.toFixed(1));
          e.el.setAttribute("y1", e.a.y.toFixed(1));
          e.el.setAttribute("x2", e.b.x.toFixed(1));
          e.el.setAttribute("y2", e.b.y.toFixed(1));
        });
        nodes.forEach((n) => {
          n.c.setAttribute("cx", n.x.toFixed(1));
          n.c.setAttribute("cy", n.y.toFixed(1));
          n.t.setAttribute("x", (n.x + (n === center ? 11 : 8)).toFixed(1));
          n.t.setAttribute("y", (n.y + 4).toFixed(1));
        });
      }
      function wake() {
        if (!running) {
          running = true;
          stableFrames = 0;
          if (!rafId) rafId = requestAnimationFrame(step);
        }
      }
      let view = { x: 0, y: 0, w: W, h: H };
      function applyView() {
        svg.setAttribute("viewBox", `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`);
      }
      function screenToWorld(clientX, clientY) {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return { x: clientX, y: clientY };
        const p = pt.matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
      }
      svg.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        const ng = ev.target.closest(".wm-node-g");
        const world = screenToWorld(ev.clientX, ev.clientY);
        downPos = { x: ev.clientX, y: ev.clientY, moved: false };
        try {
          svg.setPointerCapture(ev.pointerId);
        } catch (e) {
        }
        if (ng) {
          dragging = nodeMap[ng.getAttribute("data-name")];
          ng.classList.add("dragging");
          dragging.x = world.x;
          dragging.y = world.y;
          wake();
        } else {
          panning = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
          svg.parentElement.classList.add("panning");
        }
      });
      svg.addEventListener("pointermove", (ev) => {
        if (downPos && (Math.abs(ev.clientX - downPos.x) > 3 || Math.abs(ev.clientY - downPos.y) > 3)) downPos.moved = true;
        if (dragging) {
          const w = screenToWorld(ev.clientX, ev.clientY);
          dragging.x = w.x;
          dragging.y = w.y;
          dragging.vx = 0;
          dragging.vy = 0;
          wake();
        } else if (panning) {
          const rect = svg.getBoundingClientRect();
          const s = view.w / rect.width;
          view.x = panning.vx - (ev.clientX - panning.sx) * s;
          view.y = panning.vy - (ev.clientY - panning.sy) * s;
          applyView();
        }
      });
      function endPointer(ev) {
        if (dragging) {
          const g = nodesG.querySelector(".wm-node-g.dragging");
          if (g) g.classList.remove("dragging");
          dragging = null;
          nodes.forEach((n) => {
            n.vx += (Math.random() - 0.5) * 0.5;
            n.vy += (Math.random() - 0.5) * 0.5;
          });
          wake();
        }
        if (panning) {
          panning = null;
          svg.parentElement.classList.remove("panning");
        }
        if (downPos && !downPos.moved) {
          const ng = ev && ev.target && ev.target.closest && ev.target.closest(".wm-node-g");
          if (ng) select(ng.getAttribute("data-name"));
        }
        downPos = null;
        if (ev) {
          try {
            svg.releasePointerCapture(ev.pointerId);
          } catch (e) {
          }
        }
      }
      svg.addEventListener("pointerup", endPointer);
      svg.addEventListener("pointercancel", (ev) => {
        dragging = null;
        panning = null;
        downPos = null;
        svg.parentElement.classList.remove("panning");
      });
      svg.addEventListener("wheel", (ev) => {
        ev.preventDefault();
        const delta = ev.deltaY > 0 ? 1.14 : 0.88;
        zoomAt(ev.clientX, ev.clientY, delta);
      }, { passive: false });
      function zoomAt(clientX, clientY, factor) {
        const w = screenToWorld(clientX, clientY);
        const newW = Math.max(90, Math.min(1600, view.w * factor));
        const newH = newW * (H / W);
        view.x = w.x - (w.x - view.x) * (newW / view.w);
        view.y = w.y - (w.y - view.y) * (newH / view.h);
        view.w = newW;
        view.h = newH;
        applyView();
      }
      function select(name) {
        selected = name;
        nodes.forEach((n) => {
          const related = name && (n.id === name || edges.some((e) => e.a.id === name && e.b.id === n.id || e.b.id === name && e.a.id === n.id));
          n.c.classList.toggle("hi", n.id === name);
          n.c.classList.toggle("dim", !!name && !related);
          n.t.classList.toggle("hi", n.id === name);
          n.t.classList.toggle("dim", !!name && !related);
        });
        edges.forEach((e) => {
          const related = name && (e.a.id === name || e.b.id === name);
          e.el.classList.toggle("hi", related);
          e.el.classList.toggle("dim", !!name && !related);
        });
        if (opts.onSelect) opts.onSelect(name);
      }
      function focus(name) {
        if (!nodeMap[name]) return;
        select(name);
        view.x = nodeMap[name].x - view.w / 2;
        view.y = nodeMap[name].y - view.h / 2;
        applyView();
      }
      function zoom(factor) {
        zoomAt(svg.getBoundingClientRect().left + svg.clientWidth / 2, svg.getBoundingClientRect().top + svg.clientHeight / 2, factor);
      }
      function resetView() {
        view = { x: 0, y: 0, w: W, h: H };
        applyView();
      }
      function destroy() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        running = false;
      }
      rafId = requestAnimationFrame(step);
      return { destroy, focus, select, zoom, resetView };
    }
    function noopCtrl() {
      return { destroy() {
      }, focus() {
      }, select() {
      }, zoom() {
      }, resetView() {
      } };
    }
    WM.RelGraph = { create };
  })();

  // src/ui/launcher.js
  (function() {
    "use strict";
    const WM = window.WarmMemo || (window.WarmMemo = {});
    let panelEl = null, btnEl = null, graphSvg = null, graphTimer = null;
    let currentRelGraph = null;
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
      if (currentRelGraph) {
        currentRelGraph.destroy();
        currentRelGraph = null;
      }
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
      if (currentRelGraph) {
        currentRelGraph.destroy();
        currentRelGraph = null;
      }
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
        <div class="wm-row" style="background:#f7f2e8;padding:6px 10px;border-radius:6px;margin-bottom:8px;font-size:13px">\u5F53\u524D\u5BF9\u8BDD\u5171 <b style="color:#c0392b;font-size:15px">${total}</b> \u5C42${s.autoSummaryMode === "new" ? `\uFF08\u5DF2\u603B\u7ED3\u5230\u7B2C ${WM.MemoryStore.getSummaryPointer ? WM.MemoryStore.getSummaryPointer() : 0} \u5C42\uFF09` : ""}</div>
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
        <details class="wm-fold">
          <summary>\u5267\u60C5\u7EBF\u697C\u5C42\u8303\u56F4\uFF08\u72EC\u7ACB\uFF09</summary>
          <div class="wm-hint">\u5267\u60C5\u7EBF / \u5173\u7CFB\u56FE\u7684\u5904\u7406\u697C\u5C42\u4E0E\u81EA\u52A8\u603B\u7ED3\u89E3\u8026\uFF08\u5404\u81EA\u72EC\u7ACB\u6307\u9488\uFF09\uFF0C\u53EF\u4EE5\u5728\u8FD9\u91CC\u5355\u72EC\u914D\u7F6E\u7A97\u53E3\uFF08\u5982\u60F3\u8DDF\u603B\u7ED3\u7528\u540C\u8303\u56F4\uFF0C\u9009\u62E9\u300C\u4EC5\u65B0\u589E\u697C\u5C42\u300D\u5373\u53EF\uFF09\u3002</div>
          <div class="wm-row">\u5267\u60C5\u7EBF\u5904\u7406\u697C\u5C42\uFF1A
            <select id="p-mode">
              <option value="new" ${s.autoPlotMode === "new" ? "selected" : ""}>\u4EC5\u65B0\u589E\u697C\u5C42</option>
              <option value="count" ${s.autoPlotMode === "count" ? "selected" : ""}>\u6700\u8FD1 N \u6761</option>
              <option value="range" ${s.autoPlotMode === "range" ? "selected" : ""}>\u81EA\u5B9A\u4E49\u697C\u5C42\u533A\u95F4</option>
              <option value="floor" ${s.autoPlotMode === "floor" ? "selected" : ""}>\u6309\u697C\u5C42\u533A\u95F4\uFF081-20,21-40\u2026\uFF09</option>
            </select>
          </div>
          <div id="p-count-row" style="${s.autoPlotMode === "count" ? "" : "display:none"}">\u6700\u8FD1\u6761\u6570\uFF1A
            <input type="number" id="p-count" value="${s.autoPlotCount}" min="1" max="200" style="width:70px"/>
          </div>
          <div id="p-range-row" style="${s.autoPlotMode === "range" ? "" : "display:none"}">
            \u697C\u5C42 <input type="number" id="p-start" value="${s.autoPlotStart}" min="0" style="width:64px"/> ~
            <input type="number" id="p-end" value="${s.autoPlotEnd}" min="-1" style="width:64px"/>\uFF08\u7EC8\u70B9 -1 \u8868\u793A\u6700\u65B0\uFF0C\u5171 ${total} \u5C42\uFF09
          </div>
          <div id="p-floor-row" style="${s.autoPlotMode === "floor" ? "" : "display:none"}">
            \u6BCF <input type="number" id="p-floor" value="${s.autoPlotFloor}" min="1" max="500" style="width:64px"/> \u5C42\u63A8\u8FDB\u4E00\u6BB5
          </div>
        </details>
        <details class="wm-fold">
          <summary>\u81EA\u52A8\u5927\u603B\u7ED3\uFF08\u5C0F\u603B\u7ED3\u6512\u591F\u81EA\u52A8\u6574\u5408\uFF09</summary>
          <div class="wm-hint">\u6BCF\u7D2F\u8BA1 N \u6B21\u300C\u5C0F\u603B\u7ED3\u300D\u540E\uFF0C\u81EA\u52A8\u628A\u8FD1\u671F\u5C0F\u603B\u7ED3\u6574\u5408\u4E3A\u4E00\u4EFD\u957F\u671F\u8BB0\u5FC6\uFF08\u5927\u603B\u7ED3\uFF09\u3002\u5927\u603B\u7ED3\u4E0E\u5C0F\u603B\u7ED3\u7528\u540C\u4E00\u4EFD\u63D0\u793A\u8BCD\u3002\u6512\u591F\u5373\u89E6\u53D1\uFF0C\u65E0\u9700\u624B\u52A8\u3002</div>
          <label class="wm-row"><input type="checkbox" id="a-big" ${s.bigSummaryEnabled !== false ? "checked" : ""}/> \u5F00\u542F\u81EA\u52A8\u5927\u603B\u7ED3</label>
          <label class="wm-row">\u6BCF <input type="number" id="a-big-every" value="${Number(s.bigSummaryEvery) || 5}" min="2" max="100" style="width:64px"/> \u6B21\u5C0F\u603B\u7ED3\uFF0C\u81EA\u52A8\u6574\u5408\u4E00\u6B21\u5927\u603B\u7ED3</label>
          <label class="wm-row">\u4E00\u6B21\u5927\u603B\u7ED3\u6700\u591A\u56DE\u987E <input type="number" id="a-big-max" value="${Number(s.bigSummaryMaxSegments) || 0}" min="0" max="200" style="width:64px"/> \u6BB5\u5C0F\u603B\u7ED3\uFF080=\u4E0D\u9650\uFF09</label>
        </details>
        <details class="wm-fold">
          <summary>\u89E6\u53D1\u903B\u8F91\u8BF4\u660E\uFF08\u6BCF\u6B21\u603B\u7ED3/\u81EA\u52A8\u5904\u7406\u90FD\u4F1A\u8DD1\uFF09</summary>
          <div class="wm-hint">
            \u81EA\u52A8\u603B\u7ED3 / \u300C\u7ACB\u5373\u603B\u7ED3\u300D\u6309\u94AE\uFF1A\u540C\u65F6\u8DD1\u4E24\u6BB5\u6D41\u7A0B\uFF0C\u5171 6 \u4E2A LLM \u8C03\u7528\u3002<br/>
            &nbsp;&nbsp;\u603B\u7ED3\u6D41\u7A0B\uFF1A\u603B\u7ED3\u672C\u4F53 + \u4E16\u754C\u89C2\uFF08\u9996\u6B21\u624D\u81EA\u52A8\uFF09+ \u7269\u54C1<br/>
            &nbsp;&nbsp;\u5267\u60C5\u6D41\u7A0B\uFF1A\u5173\u7CFB\u56FE + \u5267\u60C5\u7EBF + \u7269\u54C1\uFF08\u7B2C 2 \u6B21\uFF0C\u53CC\u4FDD\u9669\uFF09<br/>
            \u5404 tab \u4E0B\u7684\u300C\u751F\u6210\u300D\u6309\u94AE\uFF1A\u53EA\u8DD1\u5F53\u524D tab \u5BF9\u5E94\u7684\u90A3 1 \u4E2A LLM\uFF08\u72EC\u7ACB\u89E6\u53D1\uFF0C\u4E0D\u5F71\u54CD\u5176\u5B83\uFF09\u3002
          </div>
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
      const pmode = body.querySelector("#p-mode");
      if (pmode) pmode.onchange = () => {
        body.querySelector("#p-count-row").style.display = pmode.value === "count" ? "" : "none";
        body.querySelector("#p-range-row").style.display = pmode.value === "range" ? "" : "none";
        body.querySelector("#p-floor-row").style.display = pmode.value === "floor" ? "" : "none";
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
        const pModeEl = body.querySelector("#p-mode");
        s.autoPlotMode = pModeEl ? pModeEl.value : mode ? mode.value : "new";
        s.autoPlotCount = parseInt(body.querySelector("#p-count") ? body.querySelector("#p-count").value : body.querySelector("#a-count").value, 10) || 20;
        s.autoPlotFloor = parseInt(body.querySelector("#p-floor") ? body.querySelector("#p-floor").value : body.querySelector("#a-floor").value, 10) || 20;
        s.autoPlotStart = parseInt(body.querySelector("#p-start") ? body.querySelector("#p-start").value : body.querySelector("#a-start").value, 10) || 0;
        s.autoPlotEnd = parseInt(body.querySelector("#p-end") ? body.querySelector("#p-end").value : body.querySelector("#a-end").value, 10) || -1;
        s.bigSummaryEnabled = body.querySelector("#a-big")?.checked ?? s.bigSummaryEnabled;
        s.bigSummaryEvery = Math.max(2, parseInt(body.querySelector("#a-big-every")?.value, 10) || s.bigSummaryEvery || 5);
        s.bigSummaryMaxSegments = parseInt(body.querySelector("#a-big-max")?.value, 10) || s.bigSummaryMaxSegments || 0;
        s.taskTokens = s.taskTokens || {};
        const tkEl = (id) => body.querySelector(id);
        s.taskTokens.summary = parseInt(tkEl("#tk-summary")?.value, 10) || s.taskTokens.summary || 0;
        s.taskTokens.relations = parseInt(tkEl("#tk-relations")?.value, 10) || s.taskTokens.relations || 0;
        s.taskTokens.plot = parseInt(tkEl("#tk-plot")?.value, 10) || s.taskTokens.plot || 0;
        s.taskTokens.world = parseInt(tkEl("#tk-world")?.value, 10) || s.taskTokens.world || 0;
        s.taskTokens.items = parseInt(tkEl("#tk-items")?.value, 10) || s.taskTokens.items || 0;
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
        st.textContent = "\u5904\u7406\u4E2D\u2026\uFF08\u8DD1 6 \u4E2A LLM\uFF1A\u603B\u7ED3/\u4E16\u754C\u89C2/\u7269\u54C1 + \u5173\u7CFB/\u5267\u60C5\u7EBF/\u7269\u54C1\uFF09";
        try {
          const fresh = WM.Settings.load();
          fresh.autoSummaryMode = mode.value;
          fresh.autoSummaryCount = parseInt(body.querySelector("#a-count").value, 10) || 20;
          fresh.autoSummaryFloor = parseInt(body.querySelector("#a-floor").value, 10) || 20;
          fresh.autoSummaryStart = parseInt(body.querySelector("#a-start").value, 10) || 0;
          fresh.autoSummaryEnd = parseInt(body.querySelector("#a-end").value, 10) || -1;
          const pModeEl = body.querySelector("#p-mode");
          if (pModeEl) fresh.autoPlotMode = pModeEl.value;
          fresh.autoPlotCount = parseInt(body.querySelector("#p-count") ? body.querySelector("#p-count").value : body.querySelector("#a-count").value, 10) || 20;
          fresh.autoPlotFloor = parseInt(body.querySelector("#p-floor") ? body.querySelector("#p-floor").value : body.querySelector("#a-floor").value, 10) || 20;
          fresh.autoPlotStart = parseInt(body.querySelector("#p-start") ? body.querySelector("#p-start").value : body.querySelector("#a-start").value, 10) || 0;
          fresh.autoPlotEnd = parseInt(body.querySelector("#p-end") ? body.querySelector("#p-end").value : body.querySelector("#a-end").value, 10) || -1;
          const r = await WM.Summary.triggerSummary(fresh, { mode: "full" });
          let msg = "";
          if (r && r.ok) {
            const succ = (r.successes || []).join("\u3001") || "\u65E0";
            msg += `\u2713 \u603B\u7ED3\u6D41\u7A0B\uFF08\u697C\u5C42 ${r.range[0]}-${r.range[1]}\uFF09\uFF1A${succ}
`;
          } else {
            msg += "\u2717 \u603B\u7ED3\u6D41\u7A0B\uFF1A" + (r && r.reason ? r.reason : "\u5931\u8D25") + "\n";
          }
          const rp = await WM.Summary.triggerPlot(fresh, { mode: "full" });
          if (rp && rp.ok) {
            msg += `\u2713 \u5267\u60C5\u6D41\u7A0B\uFF08\u697C\u5C42 ${rp.range[0]}-${rp.range[1]}\uFF09\uFF1A${(rp.successes || []).join("\u3001") || "\u65E0"}`;
          } else {
            msg += "\u2717 \u5267\u60C5\u6D41\u7A0B\uFF1A" + (rp && rp.reason ? rp.reason : "\u5931\u8D25");
          }
          if (fresh.autoHideFloors && WM.FloorHider && WM.FloorHider.hideUntil) {
            const end = (rp && rp.range ? rp.range[1] : 0) || (r && r.range ? r.range[1] : 0);
            if (end > 0) await WM.FloorHider.hideUntil(end);
          }
          st.textContent = msg;
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
      if (currentRelGraph) {
        currentRelGraph.destroy();
        currentRelGraph = null;
      }
      const rels = WM.MemoryStore.getRelations();
      const deg = {}, set = /* @__PURE__ */ new Set(), names = [];
      rels.forEach((r) => {
        if (r.from && !set.has(r.from)) {
          set.add(r.from);
          names.push(r.from);
        }
        if (r.to && !set.has(r.to)) {
          set.add(r.to);
          names.push(r.to);
        }
        if (r.from) deg[r.from] = (deg[r.from] || 0) + 1;
        if (r.to) deg[r.to] = (deg[r.to] || 0) + 1;
      });
      names.sort((a, b) => (deg[b] || 0) - (deg[a] || 0));
      body.innerHTML = `<div class="wm-card">
      <div class="wm-h">\u5173\u7CFB\u56FE<span class="wm-h-sub">\uFF08\u52A8\u6001\u529B\u5BFC\u5411\uFF09</span></div>
      <div class="wm-hint">\u6EDA\u8F6E\u7F29\u653E \xB7 \u62D6\u7A7A\u767D\u5E73\u79FB \xB7 \u62D6\u8282\u70B9\u91CD\u6392 \xB7 \u70B9\u8282\u70B9\u6216\u4E0B\u65B9\u540D\u5B57\u67E5\u770B\u8BE5\u89D2\u8272\u5173\u7CFB</div>
      <div class="wm-actions" style="margin-bottom:8px">
        <button data-act="rel-run" class="wm-btn">\u27F3 \u5F52\u7EB3\u5173\u7CFB\uFF08\u4EC5\u89E6\u53D1\u5173\u7CFB\u56FE LLM\uFF09</button>
      </div>
      <div class="wm-graph-wrap">
        <svg id="wm-graph"></svg>
        <div class="wm-graph-ctrls">
          <button data-act="in" title="\u653E\u5927">+</button>
          <button data-act="out" title="\u7F29\u5C0F">\u2212</button>
          <button data-act="reset" title="\u91CD\u7F6E\u89C6\u56FE">\u27F2</button>
        </div>
      </div>
      <div class="wm-rel-names" id="rel-names">${names.length ? names.map((n) => `<span class="wm-name-chip" data-name="${escapeHtml(n)}">${escapeHtml(n)}</span>`).join("") : '<div class="wm-empty">\u6682\u65E0\u5173\u7CFB\u6570\u636E\u3002\u70B9\u4E0A\u65B9\u300C\u5F52\u7EB3\u5173\u7CFB\u300D\u6216\u53BB\u300C\u81EA\u52A8\u603B\u7ED3\u300D\u70B9\u7ACB\u5373\u603B\u7ED3\u81EA\u52A8\u751F\u6210\u3002</div>'}</div>
      <div class="wm-rel-detail" id="rel-detail"></div>
      <div class="wm-status"></div>
    </div>`;
      const svg = body.querySelector("#wm-graph");
      const detailEl = body.querySelector("#rel-detail");
      const namesEl = body.querySelector("#rel-names");
      const relRunBtn = body.querySelector('[data-act="rel-run"]');
      if (relRunBtn) relRunBtn.onclick = async () => {
        const st = body.querySelector(".wm-status");
        if (st) st.textContent = "\u4EC5\u5F52\u7EB3\u5173\u7CFB\u4E2D\u2026\uFF08\u53EA\u89E6\u53D1\u5173\u7CFB\u56FE LLM\uFF0C\u4E0D\u89E6\u53D1\u5267\u60C5/\u7269\u54C1/\u603B\u7ED3\uFF09";
        const s = WM.Settings.load();
        const r = await WM.Summary.triggerPlot(s, { mode: "relations", forceAll: true });
        if (st) st.textContent = r && r.ok ? "\u2713 \u5173\u7CFB\u5F52\u7EB3\u5B8C\u6210" : r ? "\u2717 " + (r.reason || "\u5931\u8D25") : "\u2717 \u5931\u8D25";
        renderRel(body);
      };
      function showDetail(name) {
        namesEl.querySelectorAll(".wm-name-chip").forEach((c) => c.classList.toggle("active", c.dataset.name === name));
        const all = WM.MemoryStore.getRelations();
        if (!name) {
          detailEl.innerHTML = all.length ? `<div class="wm-h">\u5168\u90E8\u5173\u7CFB\uFF08${all.length}\uFF09</div>` + all.map((r) => `<div class="wm-rel-row">${escapeHtml(r.from)} <span class="wm-arrow">\u2192</span><span class="wm-lbl">${escapeHtml(r.label || "")}</span><span class="wm-arrow">\u2192</span> ${escapeHtml(r.to)}</div>`).join("") : "";
          return;
        }
        const mine = all.filter((r) => r.from === name || r.to === name);
        detailEl.innerHTML = `<div class="wm-h">\u300C${escapeHtml(name)}\u300D\u7684\u5173\u7CFB\uFF08${mine.length}\uFF09</div>` + (mine.length ? mine.map((r) => {
          const other = r.from === name ? r.to : r.from;
          const dir = r.from === name ? "\u2192" : "\u2190";
          return `<div class="wm-rel-row">${escapeHtml(name)} <span class="wm-arrow">${dir}</span><span class="wm-lbl">${escapeHtml(r.label || "")}</span><span class="wm-arrow">${dir}</span> ${escapeHtml(other)}</div>`;
        }).join("") : '<div class="wm-empty">\u6682\u65E0\u5173\u7CFB</div>');
      }
      if (!names.length) return;
      currentRelGraph = WM.RelGraph.create(svg, rels, { userName: getUserName(), onSelect: showDetail });
      namesEl.querySelectorAll(".wm-name-chip").forEach((c) => {
        c.onclick = () => {
          currentRelGraph && currentRelGraph.focus(c.dataset.name);
          showDetail(c.dataset.name);
        };
      });
      body.querySelectorAll(".wm-graph-ctrls button").forEach((b) => {
        b.onclick = () => {
          if (!currentRelGraph) return;
          if (b.dataset.act === "in") currentRelGraph.zoom(0.8);
          else if (b.dataset.act === "out") currentRelGraph.zoom(1.25);
          else currentRelGraph.resetView();
        };
      });
      showDetail(null);
    }
    function getUserName() {
      try {
        const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
        if (ctx) {
          if (ctx.user && ctx.user.name) return ctx.user.name;
          if (ctx.name1) return ctx.name1;
          const um = (ctx.chat || []).find((m) => m.is_user && m.name);
          if (um) return um.name;
          const lastUserMsg = [...ctx.chat || []].reverse().find((m) => m.is_user && m.mes);
          if (lastUserMsg && lastUserMsg.mes) {
            const selfIntro = lastUserMsg.mes.match(/我叫[「"]?([^」"\n,，。]{1,8})[」"]?/) || lastUserMsg.mes.match(/我是[「"]?([^」"\n,，。]{1,8})[」"]?/);
            if (selfIntro) return selfIntro[1].trim();
          }
        }
      } catch (e) {
      }
      return "\u6211";
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
        const mountRoot = document.documentElement || document.body;
        mountRoot.appendChild(mask);
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
        return `<div class="wm-plot" data-id="${p.id}">
        <div class="wm-plot-time">
          <div class="wm-plot-time-main">${escapeHtml(mainTime)}</div>
          ${subTime ? `<div class="wm-plot-time-sub">${escapeHtml(subTime)}</div>` : ""}
        </div>
        <div class="wm-plot-body">
          <div class="wm-plot-head">
            <span class="wm-plot-title">${escapeHtml(p.title || "\uFF08\u672A\u547D\u540D\uFF09")}</span>
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
        <button data-act="plot-run" class="wm-btn">\u27F3 \u5F52\u7EB3\u5267\u60C5\u7EBF\uFF08\u4EC5\u89E6\u53D1\u5267\u60C5\u7EBF LLM\uFF09</button>
      </div>
      <div class="wm-timeline">${rows || '<div class="wm-empty">\u6682\u65E0\u5267\u60C5\u7EBF</div>'}</div>
      <div class="wm-status"></div></div>`;
      const plotFields = (p) => [
        { key: "time", label: "\u65F6\u95F4\uFF08\u5267\u60C5\u5185\u65F6\u95F4\uFF0C\u663E\u793A\u5728\u6700\u5DE6\u4FA7\uFF09", value: p && p.time || "", placeholder: "\u5982\uFF1A\u7B2C\u4E09\u65E5\u6E05\u6668 / \u5EFA\u5143\u4E03\u5E74\u6625" },
        { key: "title", label: "\u6807\u9898", value: p && p.title || "", placeholder: "\u8FD9\u6BB5\u5267\u60C5\u53EB\u4EC0\u4E48" },
        { key: "summary", label: "\u5185\u5BB9", type: "textarea", value: p && p.summary || "", placeholder: "\u8FD9\u6BB5\u5267\u60C5\u53D1\u751F\u4E86\u4EC0\u4E48" }
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
        try {
          if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
        } catch (e) {
        }
        toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u5267\u60C5\u5DF2\u6DFB\u52A0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
        renderPlot(body);
      };
      const plotRun = body.querySelector('[data-act="plot-run"]');
      if (plotRun) plotRun.onclick = async () => {
        const st = body.querySelector(".wm-status");
        if (st) st.textContent = "\u4EC5\u5F52\u7EB3\u5267\u60C5\u7EBF\u4E2D\u2026\uFF08\u53EA\u89E6\u53D1\u5267\u60C5\u7EBF LLM\uFF0C\u4E0D\u89E6\u53D1\u5173\u7CFB/\u7269\u54C1\uFF09";
        const psettings = WM.Settings.load();
        const r = await WM.Summary.triggerPlot(psettings, { mode: "plot", forceAll: true });
        if (st) st.textContent = r && r.ok ? "\u2713 \u5267\u60C5\u7EBF\u5DF2\u63A8\u8FDB\uFF08\u4EC5\u5267\u60C5\u7EBF\uFF09" : r ? "\u2717 " + (r.reason || "\u5931\u8D25") : "\u2717 \u5931\u8D25";
        renderPlot(body);
      };
      body.querySelectorAll('[data-act="edit"]').forEach((b) => {
        b.onclick = async () => {
          const p = WM.MemoryStore.getPlots().find((x) => x.id === b.dataset.id);
          if (!p) return;
          const r = await openModal({ title: "\u7F16\u8F91\u5267\u60C5", fields: plotFields(p), okText: "\u4FDD\u5B58" });
          if (!r) return;
          await WM.MemoryStore.updatePlot(p.id, r);
          try {
            if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
          } catch (e) {
          }
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u5267\u60C5\u5DF2\u66F4\u65B0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderPlot(body);
        };
      });
      body.querySelectorAll('[data-act="del"]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm("\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u5267\u60C5\uFF1F\u4E16\u754C\u4E66\u4E2D\u7684\u5BF9\u5E94\u6761\u76EE\u4E5F\u4F1A\u4E00\u5E76\u79FB\u9664\u3002")) return;
          await WM.MemoryStore.removePlot(b.dataset.id);
          try {
            if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
          } catch (e) {
          }
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
        <div>
          <div class="wm-item-block-label">\u4F5C\u7528</div>
          <div class="wm-item-effect">${escapeHtml(i.desc || "\uFF08\u672A\u586B\u5199\u4F5C\u7528\uFF09")}</div>
        </div>
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
      <div class="wm-actions">
        <button data-act="it-add" class="wm-btn primary">\uFF0B \u6DFB\u52A0\u7269\u54C1</button>
        <button data-act="it-run" class="wm-btn">\u27F3 \u5F52\u7EB3\u7269\u54C1\uFF08\u4EC5\u89E6\u53D1\u7269\u54C1 LLM\uFF09</button>
      </div>
      <div class="wm-item-list">${cards || '<div class="wm-empty">\u6682\u65E0\u7269\u54C1\uFF0C\u70B9\u4E0A\u65B9\u300C\u6DFB\u52A0\u7269\u54C1\u300D\u65B0\u5EFA\uFF0C\u6216\u70B9\u300C\u5F52\u7EB3\u7269\u54C1\u300D\u4ECE\u6700\u8FD1\u5BF9\u8BDD\u81EA\u52A8\u62BD\u53D6</div>'}</div>
      <div class="wm-status"></div>
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
        try {
          if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
        } catch (e) {
        }
        toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u7269\u54C1\u5DF2\u6DFB\u52A0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
        renderItem(body);
      };
      const itRun = body.querySelector('[data-act="it-run"]');
      if (itRun) itRun.onclick = async () => {
        const st = body.querySelector(".wm-status");
        if (st) st.textContent = "\u4EC5\u5F52\u7EB3\u7269\u54C1\u4E2D\u2026\uFF08\u53EA\u89E6\u53D1\u7269\u54C1 LLM\uFF0C\u4E0D\u89E6\u53D1\u603B\u7ED3/\u5173\u7CFB/\u5267\u60C5\u7EBF\uFF09";
        const s = WM.Settings.load();
        const r = await WM.Summary.triggerPlot(s, { mode: "items", forceAll: true });
        if (st) st.textContent = r && r.ok ? "\u2713 \u7269\u54C1\u5F52\u7EB3\u5B8C\u6210" : r ? "\u2717 " + (r.reason || "\u5931\u8D25") : "\u2717 \u5931\u8D25";
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
          try {
            if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
          } catch (e) {
          }
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u7269\u54C1\u5DF2\u66F4\u65B0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderItem(body);
        };
      });
      body.querySelectorAll('[data-act="del"]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm("\u786E\u5B9A\u5220\u9664\u8FD9\u4E2A\u7269\u54C1\uFF1F\u4E16\u754C\u4E66\u4E2D\u7684\u5BF9\u5E94\u6761\u76EE\u4E5F\u4F1A\u4E00\u5E76\u79FB\u9664\u3002")) return;
          await WM.MemoryStore.removeItem(b.dataset.id);
          try {
            if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
          } catch (e) {
          }
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
        <button data-act="world-gen" class="wm-btn">\u27F3 AI \u8865\u5168\u8BBE\u5B9A\uFF08\u4EC5\u89E6\u53D1\u4E16\u754C\u89C2 LLM\uFF09</button>
      </div>
      <div class="wm-hint" style="margin-top:6px">\u63D0\u793A\uFF1A\u81EA\u52A8\u603B\u7ED3\u53EA\u5728\u300C\u9996\u6B21\u300D\u65F6\u63A8\u65AD\u4E00\u6B21\u4E16\u754C\u89C2\uFF1B\u60F3\u8865\u5145/\u6539\u5199\u4E16\u754C\u89C2\u8BF7\u624B\u52A8\u70B9\u4E0A\u9762\u6309\u94AE\uFF08\u4E0D\u89E6\u53D1\u5176\u4ED6 LLM\uFF09\u3002</div>

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
        try {
          if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
        } catch (e) {
        }
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
        try {
          if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
        } catch (e) {
        }
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
          try {
            if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
          } catch (e) {
          }
          toast("\u{1F33F} \u6E29\u8BB0\uFF1A\u8BBE\u5B9A\u5DF2\u66F4\u65B0\u5E76\u540C\u6B65\u4E16\u754C\u4E66");
          renderWorld(body);
        };
      });
      body.querySelectorAll('[data-act="sec-del"]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm("\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u8BBE\u5B9A\uFF1F\u4E16\u754C\u4E66\u4E2D\u7684\u5BF9\u5E94\u6761\u76EE\u4E5F\u4F1A\u4E00\u5E76\u79FB\u9664\u3002")) return;
          await WM.MemoryStore.removeWorldSection(b.dataset.id);
          try {
            if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
          } catch (e) {
          }
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
          try {
            if (WM.MemoryStore && WM.MemoryStore.dispatchLorebook) await WM.MemoryStore.dispatchLorebook();
          } catch (e) {
          }
          renderWorld(body);
        } catch (e) {
          if (st) st.textContent = "\u2717 " + (e.message || e);
        }
      };
      if (WM.Worldbook && WM.Worldbook.listEntries) {
        WM.Worldbook.listEntries().then((list) => {
          const cnt = Array.isArray(list) ? list.length : 0;
          const hint = body.querySelector(".wm-hint");
          if (hint && cnt) {
            hint.textContent = hint.textContent.replace(/（现有 \d+ 条）/, "") + `\uFF08\u73B0\u6709 ${cnt} \u6761\uFF09`;
          }
        }).catch(() => {
        });
      }
    }
    function renderPaneLlm(s) {
      const c = s.llmConfig || { source: "local", apiUrl: "", apiKey: "", model: "" };
      const pp = s.presetPrefix || { mode: "none", importText: "", presetName: "" };
      const tt = s.taskTokens || {};
      const prompts = s.prompts || {};
      let presetNames = [];
      try {
        presetNames = WM.LLMClient && WM.LLMClient.listPresetNames ? WM.LLMClient.listPresetNames() : [];
      } catch (e) {
        presetNames = [];
      }
      const _D = WM.Settings && WM.Settings.DEFAULTS && WM.Settings.DEFAULTS.prompts || {};
      const promptEditors = [
        { key: "summary", title: "\u603B\u7ED3\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{recent}}", def: _D.summary || "" },
        { key: "relations", title: "\u5173\u7CFB\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{recent}}", def: _D.relations || "" },
        { key: "plot", title: "\u5267\u60C5\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{historyPlot}} {{relations}} {{recent}}", def: _D.plot || "" },
        { key: "worldview", title: "\u4E16\u754C\u89C2\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{plot}} {{recent}}", def: _D.worldview || "" },
        { key: "itemExtract", title: "\u7269\u54C1\u63D0\u793A\u8BCD", holder: "\u652F\u6301 {{plot}} {{recent}}", def: _D.itemExtract || "" }
      ];
      const promptHtml = `
      <div class="wm-subtabs lv3" data-lv3="prompts">
        ${promptEditors.map((p, i) => `<button data-ptab="${p.key}" class="${i === 0 ? "active" : ""}">${p.title.replace("\u63D0\u793A\u8BCD", "")}</button>`).join("")}
      </div>
      <div class="wm-actions" style="margin:6px 0">
        <button id="pp-reset" class="wm-btn" title="\u628A\u4E0B\u9762 5 \u4E2A\u63D0\u793A\u8BCD\u5168\u90E8\u5F3A\u5236\u6062\u590D\u4E3A\u6269\u5C55\u5185\u7F6E\u7684\u6700\u65B0\u7248\uFF08\u65E0\u89C6\u4F60\u4E4B\u524D\u624B\u52A8\u6539\u8FC7/\u4FDD\u5B58\u8FC7\u7684\u65E7\u7248\uFF09">\u21BA \u4E00\u952E\u6062\u590D\u9ED8\u8BA4\u63D0\u793A\u8BCD\uFF08\u5F3A\u5236\u8986\u76D6\u65E7\u7248\uFF09</button>
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
          <label class="wm-row"><input type="checkbox" id="llm-deep" ${c.deepThinking ? "checked" : ""}/> \u6DF1\u5EA6\u601D\u8003\uFF08\u63A8\u7406\u6A21\u578B\uFF09</label>
          <div class="wm-hint" style="margin:-2px 0 4px">\u5F00\u542F\u540E\u6309\u6A21\u578B\u81EA\u52A8\u9002\u914D\u6DF1\u5EA6\u601D\u8003\u53C2\u6570\uFF1AOpenAI o \u7CFB\u5217\u7528 reasoning_effort\uFF1BDeepSeek reasoner \u8D70\u539F\u751F\u601D\u8003\u94FE\uFF1B\u8C46\u5305/Qwen \u601D\u8003\u6A21\u578B\u7528 thinking \u5757\u3002\u666E\u901A\u6A21\u578B\uFF08\u5982 gpt-4o\uFF09\u5F00\u542F\u65E0\u6548\uFF0C\u53EF\u653E\u5FC3\u7559\u5F00\u3002</div>
          <label class="wm-row">\u8F93\u51FA Token \u4E0A\u9650<input id="llm-maxtok" type="number" min="50" max="4000" step="50" value="${Number(c.maxTokens) || 700}" title="\u9650\u5236\u6A21\u578B\u8F93\u51FA\u957F\u5EA6\uFF0C\u6240\u6709\u529F\u80FD\u5171\u7528\u6B64\u4E0A\u9650"/> <span class="wm-hint" style="margin:0">\u6240\u6709\u529F\u80FD\u5171\u7528\u9ED8\u8BA4\u4E0A\u9650\uFF0C\u4E0B\u9762\u53EF\u5BF9\u6BCF\u4E2A\u4EFB\u52A1\u5355\u72EC\u8986\u76D6</span></label>
          <details class="wm-fold">
            <summary>\u5404\u4EFB\u52A1\u72EC\u7ACB\u8F93\u51FA Token \u4E0A\u9650\uFF08\u4E8C\u7EA7\u63A7\u5236\uFF09</summary>
            <div class="wm-hint">\u7559\u7A7A\u6216\u586B 0 = \u7528\u4E0A\u9762\u7684\u5171\u7528\u4E0A\u9650\u3002\u53EF\u5206\u522B\u9650\u5236\uFF1A\u603B\u7ED3 / \u5173\u7CFB / \u5267\u60C5 / \u4E16\u754C\u89C2 / \u7269\u54C1 \u5404\u81EA\u6700\u957F\u8F93\u51FA\uFF0C\u907F\u514D\u957F\u4EFB\u52A1\u6324\u5360\u3001\u77ED\u4EFB\u52A1\u4E0D\u591F\u3002</div>
            <label class="wm-row">\u603B\u7ED3 Token<input id="tk-summary" type="number" min="0" max="4000" step="50" value="${Number(tt.summary) || 0}"/></label>
            <label class="wm-row">\u5173\u7CFB Token<input id="tk-relations" type="number" min="0" max="4000" step="50" value="${Number(tt.relations) || 0}"/></label>
            <label class="wm-row">\u5267\u60C5 Token<input id="tk-plot" type="number" min="0" max="4000" step="50" value="${Number(tt.plot) || 0}"/></label>
            <label class="wm-row">\u4E16\u754C\u89C2 Token<input id="tk-world" type="number" min="0" max="4000" step="50" value="${Number(tt.world) || 0}"/></label>
            <label class="wm-row">\u7269\u54C1 Token<input id="tk-items" type="number" min="0" max="4000" step="50" value="${Number(tt.items) || 0}"/></label>
          </details>
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
        { key: "img", label: "\u751F\u56FE" },
        { key: "err", label: "\u9519\u8BEF\u62A5\u544A" }
      ];
      const active = WM._cfgTab || "llm";
      body.innerHTML = `
      <div class="wm-subtabs" id="cfg-tabs">
        ${tabs.map((t) => `<button data-tab="${t.key}" class="${t.key === active ? "active" : ""}">${t.label}</button>`).join("")}
      </div>
      <div id="cfg-pane">${active === "llm" ? renderPaneLlm(s) : active === "mem" ? renderPaneMemory(s) : active === "vec" ? renderPaneVector(s) : active === "rerank" ? renderPaneRerank(s) : active === "lore" ? renderPaneLore(s) : active === "img" ? renderPaneImage(s) : active === "err" ? renderPaneErrors(s) : renderPaneLlm(s)}</div>
      <div class="wm-actions" style="margin-top:12px">
        <button id="c-test" class="wm-btn">\u6D4B\u8BD5\u8FDE\u63A5</button>
        <button id="c-img-gen" class="wm-btn" style="background:linear-gradient(135deg,#6f5cff 0%,#b347ff 100%);color:#fff;border:none">\u{1F3A8} \u65E0\u9650\u5236\u7ACB\u5373\u751F\u56FE\uFF08\u8FDE\u70B9\u53EF\u6392\u961F\u751F\u6210\u591A\u5F20\uFF09</button>
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
          else if (key === "img") pane.innerHTML = renderPaneImage(s);
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
            maxTokens: Math.max(50, parseInt(q("#llm-maxtok").value, 10) || 700),
            deepThinking: !!(q("#llm-deep") && q("#llm-deep").checked)
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
            worldview: q("#pprompt-worldview") ? q("#pprompt-worldview").value : s.prompts.worldview,
            itemExtract: q("#pprompt-itemExtract") ? q("#pprompt-itemExtract").value : s.prompts.itemExtract
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
          s.embeddingUseLLM = q("#c-emb-usellm") ? q("#c-emb-usellm").checked : s.embeddingUseLLM !== false;
          s.takeoverEmbedding = q("#c-take-emb") ? q("#c-take-emb").checked : s.takeoverEmbedding;
          s.vecProxyEnabled = q("#c-vec-proxy") ? q("#c-vec-proxy").checked : s.vecProxyEnabled !== false;
          s.vecProxyPath = q("#c-vec-proxy-path") ? q("#c-vec-proxy-path").value : s.vecProxyPath || "/vec";
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
          s.rerankInstruction = q("#c-rk-inst") ? q("#c-rk-inst").value : s.rerankInstruction;
          s.takeoverRerank = q("#c-take-re") ? q("#c-take-re").checked : s.takeoverRerank;
        }
      }
      if (!scope || scope === "lore") {
        if (q("#c-lore")) {
          s.lorebookName = q("#c-lore").value.trim();
          s.worldToLorebook = q("#c-wlore").checked;
        }
      }
      if (!scope || scope === "img") {
        if (q("#ig-url") !== null) {
          const prefixEl = q("#ig-prefix") || q("#ig-tpl");
          const negPreEl = q("#ig-neg-pre");
          const sizeEl = q("#ig-size");
          const seedEl = q("#ig-seed");
          const denoiseEl = q("#ig-denoise");
          const proxyEl = q("#ig-proxy");
          const proxyPathEl = q("#ig-proxy-path");
          const prevModels = s.imageGen && Array.isArray(s.imageGen.models) ? s.imageGen.models : [];
          s.imageGen = {
            enabled: q("#ig-on") ? q("#ig-on").checked : false,
            autoTrigger: q("#ig-auto") ? q("#ig-auto").checked : false,
            backendType: q("#ig-backend") ? q("#ig-backend").value : "sd-webui",
            apiUrl: q("#ig-url") ? q("#ig-url").value.trim() : "",
            apiKey: q("#ig-key") ? q("#ig-key").value.trim() : "",
            model: q("#ig-model") ? q("#ig-model").value.trim() : "",
            imgProxyEnabled: proxyEl ? proxyEl.checked : s.imageGen && s.imageGen.imgProxyEnabled !== false ? true : false,
            imgProxyPath: proxyPathEl ? proxyPathEl.value.trim() || "/img" : s.imageGen && s.imageGen.imgProxyPath || "/img",
            sizePreset: sizeEl ? sizeEl.value : "",
            width: parseInt(q("#ig-w") ? q("#ig-w").value : "512", 10) || 512,
            height: parseInt(q("#ig-h") ? q("#ig-h").value : "768", 10) || 768,
            steps: parseInt(q("#ig-steps") ? q("#ig-steps").value : "20", 10) || 20,
            cfgScale: parseFloat(q("#ig-cfg") ? q("#ig-cfg").value : "7") || 7,
            denoisingStrength: denoiseEl ? parseFloat(denoiseEl.value) : 1,
            seed: seedEl ? parseInt(seedEl.value, 10) : -1,
            sampler: q("#ig-sampler") ? q("#ig-sampler").value.trim() : "",
            promptPrefix: prefixEl ? prefixEl.value : "",
            negativePrefix: negPreEl ? negPreEl.value : "",
            negativePrompt: q("#ig-neg") ? q("#ig-neg").value : "",
            comfyWorkflow: q("#ig-comfy") ? q("#ig-comfy").value : "",
            comfyWorkflowName: q("#ig-comfy-wf") ? q("#ig-comfy-wf").value : "",
            comfyWorkflowList: s.imageGen && Array.isArray(s.imageGen.comfyWorkflowList) ? s.imageGen.comfyWorkflowList : [],
            cloudPath: q("#ig-cloud-path") ? q("#ig-cloud-path").value.trim() : "/images/generations",
            displayMode: q("#ig-display") ? q("#ig-display").value : "append",
            promptStyle: q("#ig-style") ? q("#ig-style").value : "general",
            // 兼容旧字段：旧版本 promptTemplate 也保留一份，防止老设置被误清空
            promptTemplate: q("#ig-tpl") ? q("#ig-tpl").value : "",
            models: prevModels
          };
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
      const resetBtn = body.querySelector("#pp-reset");
      if (resetBtn) resetBtn.onclick = () => {
        const defs = WM.Settings && WM.Settings.DEFAULTS && WM.Settings.DEFAULTS.prompts || {};
        const keys = ["summary", "relations", "plot", "worldview", "itemExtract"];
        keys.forEach((key) => {
          const ta = body.querySelector("#pprompt-" + key);
          if (ta && defs[key] != null) ta.value = defs[key];
        });
        s.prompts = Object.assign({}, defs);
        s.promptsVersion = WM.Settings && WM.Settings.DEFAULTS && WM.Settings.DEFAULTS.promptsVersion || s.promptsVersion;
        WM.Settings.save(s);
        if (WM.UI && WM.UI.toast) WM.UI.toast("\u2713 \u5DF2\u5F3A\u5236\u6062\u590D\u9ED8\u8BA4\u63D0\u793A\u8BCD\uFF08\u65B0\u7248\u5DF2\u9876\u66FF\u65E7\u7248\uFF09\uFF0C\u53EF\u76F4\u63A5\u4F7F\u7528");
      };
      const sizeSel = body.querySelector("#ig-size");
      const wInput = body.querySelector("#ig-w");
      const hInput = body.querySelector("#ig-h");
      const seedInput = body.querySelector("#ig-seed");
      if (sizeSel) {
        sizeSel.addEventListener("change", () => {
          const v = sizeSel.value || "";
          const parts = v.split("_");
          if (parts.length >= 2) {
            const w = parseInt(parts[0], 10);
            const h = parseInt(parts[1], 10);
            if (w && h) {
              if (wInput) wInput.value = String(w);
              if (hInput) hInput.value = String(h);
              syncPaneToSettings(body, s);
            }
          }
        });
      }
      if (wInput) wInput.addEventListener("input", () => {
        if (sizeSel && sizeSel.value) {
          sizeSel.value = "";
          syncPaneToSettings(body, s);
        }
      });
      if (hInput) hInput.addEventListener("input", () => {
        if (sizeSel && sizeSel.value) {
          sizeSel.value = "";
          syncPaneToSettings(body, s);
        }
      });
      if (seedInput) {
        seedInput.title = "\u586B -1 \u8868\u793A\u6BCF\u6B21\u968F\u673A\uFF1B\u53CC\u51FB\u8F93\u5165\u6846\u5FEB\u901F\u8BBE\u4E3A -1";
        seedInput.addEventListener("dblclick", () => {
          seedInput.value = "-1";
          syncPaneToSettings(body, s);
        });
      }
      async function refreshImageGenModels(opts) {
        opts = opts || {};
        const selectEl = body.querySelector("#ig-model");
        const refreshBtn = body.querySelector("#ig-model-refresh");
        if (!selectEl || !WM.ImageGen || typeof WM.ImageGen.fetchAvailableModels !== "function") return;
        syncPaneToSettings(body, s);
        const wasDisabled = refreshBtn ? refreshBtn.disabled : false;
        if (refreshBtn) {
          refreshBtn.disabled = true;
          refreshBtn.textContent = "\u23F3";
        }
        try {
          const r = await WM.ImageGen.fetchAvailableModels(s);
          if (!r.ok) {
            if (!opts.silent) toast("\u{1F3A8} \u5237\u65B0\u6A21\u578B\u5217\u8868\u5931\u8D25\uFF1A" + (r.error || "\u672A\u77E5\u9519\u8BEF"));
            return { ok: false, error: r.error };
          }
          const list = Array.isArray(r.models) ? r.models : [];
          if (s.imageGen) s.imageGen.models = list;
          const curVal = (selectEl.value || s.imageGen && s.imageGen.model || "").trim();
          const optList = [];
          optList.push('<option value="">\uFF08\u8BF7\u9009\u62E9\u4E00\u4E2A\u6A21\u578B\uFF09</option>');
          for (const m of list) {
            const val = typeof m === "string" ? m : m && m.value ? m.value : "";
            const lab = typeof m === "string" ? m : m && m.label ? m.label : val;
            if (!val) continue;
            optList.push(`<option value="${escapeHtml(val)}" ${curVal === val ? "selected" : ""}>${escapeHtml(lab)}</option>`);
          }
          if (curVal && !list.some((mm) => (typeof mm === "string" ? mm : mm && mm.value || "") === curVal)) {
            optList.push(`<option value="${escapeHtml(curVal)}" selected>${escapeHtml(curVal)}\uFF08\u81EA\u5B9A\u4E49\uFF09</option>`);
          }
          selectEl.innerHTML = optList.join("");
          if (!curVal && list.length) {
            const firstVal = typeof list[0] === "string" ? list[0] : list[0].value;
            if (firstVal) {
              selectEl.value = firstVal;
              syncPaneToSettings(body, s);
            }
          }
          if (!opts.silent) toast("\u{1F3A8} \u5DF2\u5237\u65B0\u6A21\u578B\u5217\u8868\uFF0C\u5171 " + list.length + " \u4E2A");
          return { ok: true, count: list.length };
        } catch (e) {
          if (!opts.silent) toast("\u{1F3A8} \u5237\u65B0\u6A21\u578B\u5217\u8868\u5F02\u5E38\uFF1A" + (e.message || String(e)));
          return { ok: false, error: e.message || String(e) };
        } finally {
          if (refreshBtn) {
            refreshBtn.disabled = wasDisabled;
            refreshBtn.textContent = "\u{1F504}";
          }
        }
      }
      const modelRefreshBtn = body.querySelector("#ig-model-refresh");
      if (modelRefreshBtn) modelRefreshBtn.onclick = () => refreshImageGenModels({ silent: false });
      async function refreshComfyWorkflows() {
        const wfSelect2 = body.querySelector("#ig-comfy-wf");
        if (!wfSelect2) return;
        if (!WM.ImageGen || typeof WM.ImageGen.listComfyWorkflows !== "function") return;
        try {
          const list = await WM.ImageGen.listComfyWorkflows();
          const names = Array.isArray(list) ? list : [];
          if (s.imageGen) s.imageGen.comfyWorkflowList = names;
          const curVal = s.imageGen && s.imageGen.comfyWorkflowName || "";
          const opts = ['<option value="">\uFF08\u5185\u7F6E\u9ED8\u8BA4\u5DE5\u4F5C\u6D41\xB7\u81EA\u52A8\u68C0\u6D4B\u6A21\u578B\u7C7B\u578B\uFF09</option>'];
          for (const name of names) {
            opts.push(`<option value="${escapeHtml(name)}" ${curVal === name ? "selected" : ""}>${escapeHtml(name)}</option>`);
          }
          wfSelect2.innerHTML = opts.join("");
          toast("\u{1F3A8} \u5DE5\u4F5C\u6D41\u5217\u8868\u5DF2\u5237\u65B0\uFF0C\u5171 " + names.length + " \u4E2A");
        } catch (e) {
          toast("\u{1F3A8} \u5237\u65B0\u5DE5\u4F5C\u6D41\u5217\u8868\u5931\u8D25\uFF1A" + (e.message || String(e)));
        }
      }
      async function openComfyWorkflowEditor(workflowName) {
        const ig = WM.ImageGen;
        if (!ig) return;
        let workflowJson = "";
        let title = "\u65B0\u5EFA\u5DE5\u4F5C\u6D41";
        if (workflowName) {
          title = workflowName;
          const loaded = await ig.loadComfyWorkflow(workflowName);
          if (loaded) workflowJson = loaded;
          else {
            toast("\u{1F3A8} \u52A0\u8F7D\u5DE5\u4F5C\u6D41\u5931\u8D25\uFF1A" + workflowName);
            return;
          }
        } else {
          const s2 = WM.Settings.load();
          const model = s2.imageGen && s2.imageGen.model || "";
          const useZ = ig.isUnetModel(model);
          workflowJson = JSON.stringify(useZ ? ig.defaultComfyWorkflowZImage() : ig.defaultComfyWorkflow(), null, 2);
          title = "\u5185\u7F6E\u9ED8\u8BA4\u5DE5\u4F5C\u6D41\uFF08" + (useZ ? "UNet" : "Checkpoint") + "\uFF09";
        }
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px";
        const popup = document.createElement("div");
        popup.style.cssText = "background:var(--SmartThemeBlurTintColor,#1a1a2e);border:1px solid var(--SmartThemeBorderColor,#333);border-radius:10px;width:90%;max-width:900px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.4)";
        const phStatus = ig.PLACEHOLDER_DEFS.map(
          (p) => `<span data-ph="${p.key}" style="display:inline-block;margin:2px 4px;padding:2px 8px;border-radius:4px;font-size:11px;background:rgba(255,255,255,.05);color:#888">\u274C <code>{{${p.key}}}</code> ${p.label}</span>`
        ).join("");
        popup.innerHTML = `
        <div style="padding:12px 16px;border-bottom:1px solid var(--SmartThemeBorderColor,#333);display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:600;font-size:14px">\u270F\uFE0F \u5DE5\u4F5C\u6D41\u7F16\u8F91\u5668 \u2014 ${escapeHtml(title)}</span>
          <button id="wf-close" style="background:none;border:none;color:var(--SmartThemeBodyColor,#ccc);font-size:18px;cursor:pointer">\u2715</button>
        </div>
        <div style="padding:8px 16px;border-bottom:1px solid var(--SmartThemeBorderColor,#333);max-height:80px;overflow-y:auto">
          <div style="font-size:11px;color:var(--SmartThemeBodyColor,#aaa);margin-bottom:4px">\u5360\u4F4D\u7B26\u72B6\u6001\uFF08\u2705=\u5DF2\u4F7F\u7528 \u274C=\u672A\u4F7F\u7528\uFF09\uFF1A</div>
          <div id="wf-ph-status">${phStatus}</div>
        </div>
        <div style="padding:12px 16px;flex:1;overflow:hidden;display:flex;flex-direction:column">
          <textarea id="wf-editor" style="flex:1;width:100%;min-height:300px;font-family:monospace;font-size:11px;background:rgba(0,0,0,.3);color:var(--SmartThemeBodyColor,#eee);border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;padding:8px;resize:vertical">${escapeHtml(workflowJson)}</textarea>
          <div style="font-size:11px;color:var(--SmartThemeBodyColor,#888);margin-top:6px">
            \u{1F4A1} \u628A\u9700\u8981\u52A8\u6001\u66FF\u6362\u7684\u503C\u6539\u6210\u5360\u4F4D\u7B26\uFF0C\u5982 <code>"seed": "{{seed}}"</code> \u6216 <code>"text": "%prompt%"</code>\u3002\u4E24\u79CD\u683C\u5F0F\u7B49\u4EF7\u3002
          </div>
        </div>
        <div style="padding:10px 16px;border-top:1px solid var(--SmartThemeBorderColor,#333);display:flex;gap:8px;justify-content:flex-end">
          <input id="wf-name" placeholder="\u6587\u4EF6\u540D\uFF08\u5982 my_workflow\uFF09" value="${escapeHtml(workflowName ? workflowName.replace(/\.json$/i, "") : "")}" style="flex:1;padding:6px 10px;background:rgba(0,0,0,.3);color:var(--SmartThemeBodyColor,#eee);border:1px solid var(--SmartThemeBorderColor,#444);border-radius:4px;font-size:12px"/>
          <button id="wf-save" style="padding:6px 16px;background:linear-gradient(135deg,#6f5cff,#b347ff);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">\u{1F4BE} \u4FDD\u5B58</button>
          <button id="wf-cancel" style="padding:6px 16px;background:rgba(255,255,255,.1);color:var(--SmartThemeBodyColor,#ccc);border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;cursor:pointer;font-size:12px">\u53D6\u6D88</button>
        </div>`;
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        const textarea = popup.querySelector("#wf-editor");
        const phContainer = popup.querySelector("#wf-ph-status");
        function updatePhStatus() {
          const text = textarea.value;
          const checks = ig.checkPlaceholdersInWorkflow(text);
          phContainer.innerHTML = checks.map((p) => {
            const color = p.found ? "#4caf50" : "#888";
            const bg = p.found ? "rgba(76,175,80,.1)" : "rgba(255,255,255,.05)";
            const icon = p.found ? "\u2705" : "\u274C";
            return `<span style="display:inline-block;margin:2px 4px;padding:2px 8px;border-radius:4px;font-size:11px;background:${bg};color:${color}">${icon} <code>{{${p.key}}}</code> ${p.label}</span>`;
          }).join("");
        }
        textarea.addEventListener("input", updatePhStatus);
        updatePhStatus();
        const closePopup = () => {
          document.body.removeChild(overlay);
        };
        popup.querySelector("#wf-close").onclick = closePopup;
        popup.querySelector("#wf-cancel").onclick = closePopup;
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) closePopup();
        });
        popup.querySelector("#wf-save").onclick = async () => {
          const nameInput = popup.querySelector("#wf-name");
          const fname = (nameInput.value || "").trim();
          if (!fname) {
            toast("\u{1F3A8} \u8BF7\u586B\u5199\u5DE5\u4F5C\u6D41\u6587\u4EF6\u540D");
            return;
          }
          const content = textarea.value.trim();
          try {
            JSON.parse(content);
          } catch (e) {
            toast("\u{1F3A8} JSON \u683C\u5F0F\u9519\u8BEF\uFF1A" + e.message);
            return;
          }
          try {
            await ig.saveComfyWorkflow(fname, content);
            toast("\u{1F3A8} \u5DE5\u4F5C\u6D41\u5DF2\u4FDD\u5B58\uFF1A" + (fname.endsWith(".json") ? fname : fname + ".json"));
            await refreshComfyWorkflows();
            const fullName = fname.toLowerCase().endsWith(".json") ? fname : fname + ".json";
            const wfSelect2 = body.querySelector("#ig-comfy-wf");
            if (wfSelect2) wfSelect2.value = fullName;
            if (s.imageGen) s.imageGen.comfyWorkflowName = fullName;
            closePopup();
          } catch (e) {
            toast("\u{1F3A8} \u4FDD\u5B58\u5931\u8D25\uFF1A" + (e.message || String(e)));
          }
        };
      }
      const wfSelect = body.querySelector("#ig-comfy-wf");
      if (wfSelect) wfSelect.onchange = () => {
        if (s.imageGen) s.imageGen.comfyWorkflowName = wfSelect.value;
      };
      const wfEditBtn = body.querySelector("#ig-comfy-edit");
      if (wfEditBtn) wfEditBtn.onclick = () => {
        const name = wfSelect ? wfSelect.value : "";
        openComfyWorkflowEditor(name || null);
      };
      const wfNewBtn = body.querySelector("#ig-comfy-new");
      if (wfNewBtn) wfNewBtn.onclick = () => openComfyWorkflowEditor(null);
      const wfImportBtn = body.querySelector("#ig-comfy-import");
      const wfFileInput = body.querySelector("#ig-comfy-file");
      if (wfImportBtn && wfFileInput) {
        wfImportBtn.onclick = () => wfFileInput.click();
        wfFileInput.onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            JSON.parse(text);
            const baseName = file.name.replace(/\.json$/i, "");
            const ig = WM.ImageGen;
            if (!ig) return;
            await ig.saveComfyWorkflow(baseName, text);
            toast("\u{1F3A8} \u5DF2\u5BFC\u5165\u5DE5\u4F5C\u6D41\uFF1A" + file.name);
            await refreshComfyWorkflows();
            const fullName = baseName.toLowerCase().endsWith(".json") ? baseName : baseName + ".json";
            if (wfSelect) wfSelect.value = fullName;
            if (s.imageGen) s.imageGen.comfyWorkflowName = fullName;
            openComfyWorkflowEditor(fullName);
          } catch (e2) {
            toast("\u{1F3A8} \u5BFC\u5165\u5931\u8D25\uFF1A" + (e2.message || String(e2)));
          }
          wfFileInput.value = "";
        };
      }
      const wfRenameBtn = body.querySelector("#ig-comfy-rename");
      if (wfRenameBtn) wfRenameBtn.onclick = async () => {
        const oldName = wfSelect ? wfSelect.value : "";
        if (!oldName) {
          toast("\u{1F3A8} \u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u5DE5\u4F5C\u6D41");
          return;
        }
        const newName = prompt("\u8F93\u5165\u65B0\u540D\u79F0\uFF08\u4E0D\u542B .json \u540E\u7F00\uFF09\uFF1A", oldName.replace(/\.json$/i, ""));
        if (!newName || newName.trim() === oldName.replace(/\.json$/i, "")) return;
        try {
          await WM.ImageGen.renameComfyWorkflow(oldName, newName.trim());
          toast("\u{1F3A8} \u5DF2\u91CD\u547D\u540D\u4E3A " + newName.trim() + ".json");
          await refreshComfyWorkflows();
          const fullName = newName.trim().toLowerCase().endsWith(".json") ? newName.trim() : newName.trim() + ".json";
          if (wfSelect) wfSelect.value = fullName;
          if (s.imageGen) s.imageGen.comfyWorkflowName = fullName;
        } catch (e) {
          toast("\u{1F3A8} \u91CD\u547D\u540D\u5931\u8D25\uFF1A" + (e.message || String(e)));
        }
      };
      const wfDeleteBtn = body.querySelector("#ig-comfy-delete");
      if (wfDeleteBtn) wfDeleteBtn.onclick = async () => {
        const name = wfSelect ? wfSelect.value : "";
        if (!name) {
          toast("\u{1F3A8} \u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u5DE5\u4F5C\u6D41");
          return;
        }
        if (!confirm("\u786E\u8BA4\u5220\u9664\u5DE5\u4F5C\u6D41\u300C" + name + "\u300D\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002")) return;
        try {
          await WM.ImageGen.deleteComfyWorkflow(name);
          toast("\u{1F3A8} \u5DF2\u5220\u9664\u5DE5\u4F5C\u6D41\uFF1A" + name);
          if (s.imageGen) s.imageGen.comfyWorkflowName = "";
          await refreshComfyWorkflows();
        } catch (e) {
          toast("\u{1F3A8} \u5220\u9664\u5931\u8D25\uFF1A" + (e.message || String(e)));
        }
      };
      const wfRefreshBtn = body.querySelector("#ig-comfy-refresh");
      if (wfRefreshBtn) wfRefreshBtn.onclick = () => refreshComfyWorkflows();
      if (body.querySelector("#ig-comfy-wf")) {
        refreshComfyWorkflows().catch(() => {
        });
      }
      async function handleUnlimitedImageGen() {
        if (!WM.ImageGen || typeof WM.ImageGen.triggerUnlimited !== "function") {
          toast("\u{1F3A8} \u6E29\u8BB0\u751F\u56FE\u6A21\u5757\u672A\u52A0\u8F7D\uFF08\u5237\u65B0\u9875\u9762\u518D\u8BD5\uFF09");
          return;
        }
        try {
          syncPaneToSettings(body, s, "img");
        } catch (_) {
        }
        const r = await WM.ImageGen.triggerUnlimited();
        if (r && r.ok) toast("\u{1F3A8} \u5DF2\u51FA\u56FE\uFF0C\u5DF2\u63D2\u5165\u5BF9\u8BDD\uFF08\u7EE7\u7EED\u70B9\u53EF\u7EE7\u7EED\u6392\u961F\uFF09");
        else if (r && r.skipped) {
        } else if (r && r.error) {
          if (WM.DebugLog) WM.DebugLog.logError("image-gen", { error: r.error, prompt: r.prompt ? String(r.prompt).slice(0, 300) : "" });
        }
      }
      const igUnlimitedTop = body.querySelector("#ig-unlimited-top");
      if (igUnlimitedTop) igUnlimitedTop.onclick = () => {
        handleUnlimitedImageGen();
      };
      const igUnlimitedFoot = body.querySelector("#c-img-gen");
      if (igUnlimitedFoot) igUnlimitedFoot.onclick = () => {
        handleUnlimitedImageGen();
      };
      const saveBtn = body.querySelector("#c-save");
      if (saveBtn) saveBtn.onclick = async () => {
        const scope = WM._cfgTab || "llm";
        const oldTakeover = WM.Worldbook && WM.Worldbook.isTakeoverOn ? WM.Worldbook.isTakeoverOn() : false;
        syncPaneToSettings(body, s, scope);
        WM.Settings.save(s);
        if (scope === "lore" && WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook();
        const newTakeover = WM.Worldbook && WM.Worldbook.isTakeoverOn ? WM.Worldbook.isTakeoverOn() : false;
        if (oldTakeover !== newTakeover && WM.Worldbook && WM.Worldbook.syncEntryEnabled) {
          try {
            await WM.Worldbook.syncEntryEnabled();
          } catch (e) {
          }
        }
        const labelMap = { llm: "LLM \u8C03\u7528", mem: "\u8BB0\u5FC6\u4E0E\u6CE8\u5165", vec: "\u5411\u91CF(Embedding)", rerank: "\u91CD\u6392\u5E8F(Rerank)", lore: "\u4E16\u754C\u4E66", img: "\u751F\u56FE", err: "\u9519\u8BEF\u62A5\u544A" };
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
        } else if (scope === "img") {
          try {
            const r = await WM.ImageGen.testConnection(tmp);
            add("\u751F\u56FE(" + (tmp.imageGen && tmp.imageGen.backendType || "sd-webui") + ")", r, r.success ? "\u5DF2\u8FD4\u56DE\u56FE\u7247" : "");
            if (r && r.success && tmp.imageGen && tmp.imageGen.backendType !== "cloud" && typeof refreshImageGenModels === "function") {
              try {
                const mr = await refreshImageGenModels({ silent: true });
                if (mr && mr.ok) rows.push('<div class="wm-test-item wm-ok">\u2705 \u751F\u56FE\u6A21\u578B\u5217\u8868\uFF1A\u5DF2\u81EA\u52A8\u52A0\u8F7D ' + mr.count + " \u4E2A\uFF08\u5207\u6362\u4E0B\u62C9\u5373\u53EF\u9009\u62E9\uFF09</div>");
                else rows.push('<div class="wm-test-item ' + (tmp.imageGen.backendType === "cloud" ? "wm-muted" : "wm-bad") + '">\u26A0\uFE0F \u751F\u56FE\u6A21\u578B\u5217\u8868\uFF1A\u81EA\u52A8\u52A0\u8F7D\u5931\u8D25' + (mr && mr.error ? "\uFF08" + String(mr.error).slice(0, 120) + "\uFF09" : "") + "\uFF0C\u8BF7\u70B9\u300C\u{1F504}\u300D\u624B\u52A8\u5237\u65B0</div>");
              } catch (_e) {
                rows.push('<div class="wm-test-item wm-muted">\u2139\uFE0F \u751F\u56FE\u6A21\u578B\u5217\u8868\uFF1A\u8BF7\u70B9\u300C\u{1F504}\u300D\u624B\u52A8\u5237\u65B0</div>');
              }
            }
          } catch (e) {
            add("\u751F\u56FE", { success: false }, String(e.message || e));
          }
          await testLlm();
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
      <div class="wm-hint">\u9ED8\u8BA4\u60C5\u51B5\u4E0B\u4F60<b>\u4EC0\u4E48\u90FD\u4E0D\u7528\u914D</b>\uFF1A\u52FE\u4E0B\u9762\u7684\u300C\u63A5\u7BA1\u5411\u91CF\u68C0\u7D22\u300D\u540E\uFF0C\u6E29\u8BB0\u4F1A\u76F4\u63A5\u7528\u4F60<b>\u5DF2\u7ECF\u586B\u597D\u7684 LLM \u5730\u5740</b>\u505A\u5411\u91CF\u53EC\u56DE\uFF08DeepSeek/\u706B\u5C71/OpenAI/Ollama \u90FD\u652F\u6301 /embeddings \u63A5\u53E3\uFF09\uFF0C\u96F6\u914D\u7F6E\u771F\u63A5\u7BA1\u3002\u53EA\u6709\u60F3\u6362\u72EC\u7ACB embedding \u670D\u52A1\u65F6\u624D\u586B\u4E0B\u9762\u5730\u5740\u3002</div>
      <label class="wm-row"><input type="checkbox" id="c-vec" ${s.vectorEnabled ? "checked" : ""}/> \u542F\u7528\u5411\u91CF\u68C0\u7D22\uFF08\u63A5\u7BA1\u65F6\u5FC5\u987B\uFF09</label>
      <label class="wm-row"><input type="checkbox" id="c-emb-usellm" ${s.embeddingUseLLM !== false ? "checked" : ""}/> \u590D\u7528 LLM \u5730\u5740\u505A Embedding\uFF08\u9ED8\u8BA4\u5F00\uFF0C\u514D\u914D\u7F6E\uFF09</label>
      <div class="wm-hint" style="margin:-2px 0 4px">\u5F00\u542F\u65F6\uFF0C\u4E0B\u65B9\u7559\u7A7A\u4F1A\u81EA\u52A8\u7528\u300CLLM \u914D\u7F6E\u300D\u91CC\u7684 Base URL\u3002\u82E5\u4E0B\u65B9\u5DF2\u586B\u72EC\u7ACB\u5730\u5740\u5219\u4EE5\u6B64\u4E3A\u51C6\u3002</div>
      <label class="wm-row">\u72EC\u7ACB Base URL\uFF08\u53EF\u9009\uFF09<input id="c-emb-url" value="${s.embeddingBaseUrl}" placeholder="\u7559\u7A7A=\u81EA\u52A8\u7528 LLM \u5730\u5740\uFF1B\u5982 https://api.siliconflow.cn/v1"/></label>
      <div class="wm-hint">\u60F3\u7528\u72EC\u7ACB embedding \u670D\u52A1\u624D\u586B\uFF1A<br/>\xB7 \u7845\u57FA\u6D41\u52A8\u7B49\u4E91\u7AEF\uFF1A<code>https://api.siliconflow.cn/v1</code><br/>\xB7 \u672C\u5730 Ollama\uFF1A<code>http://127.0.0.1:11434/v1</code><br/>\xB7 Gemini\uFF1A<code>https://generativelanguage.googleapis.com/v1beta</code></div>
      <label class="wm-row">API Key<input id="c-emb-key" type="password" value="${s.embeddingApiKey}" placeholder="\u53EF\u9009\uFF08\u590D\u7528 LLM \u65F6\u7559\u7A7A\uFF09"/></label>
      <label class="wm-row">\u6A21\u578B<input id="c-emb-model" value="${s.embeddingModel}" placeholder="text-embedding-3-small"/></label>
      <div class="wm-divider"></div>
      <label class="wm-row"><input type="checkbox" id="c-vec-proxy" ${s.vecProxyEnabled !== false ? "checked" : ""}/> \u5916\u7F51\u540C\u6E90\u4EE3\u7406\uFF08\u672C\u5730\u76F4\u8FDE/\u5916\u7F51\u81EA\u52A8\u6539\u5199\uFF09</label>
      <div class="wm-hint" style="margin:-2px 0 4px">\u5916\u7F51\u8BBF\u95EE\u9152\u9986\u65F6\uFF0C\u81EA\u52A8\u628A\u672C\u5730\u5730\u5740\uFF08\u5982 <code>http://127.0.0.1:11434/v1/embeddings</code>\uFF09\u6539\u5199\u6210\u540C\u6E90\u4EE3\u7406 URL\uFF08<code>https://\u4F60\u7684\u57DF\u540D/vec/v1/embeddings</code>\uFF09\uFF0C\u8D70 Caddy \u8F6C\u53D1\u5230\u5185\u7F51 Ollama\u3002\u672C\u5730\u8BBF\u95EE\uFF08\u7AEF\u53E3 8000/8001\uFF09\u81EA\u52A8\u8DF3\u8FC7\u76F4\u8FDE\u3002\u9700\u914D\u5408\u300C\u540C\u6E90\u4EE3\u7406\u300DCaddyfile \u7684 <code>/vec/* \u2192 11434</code> \u5206\u6D41\u3002</div>
      <label class="wm-row">\u4EE3\u7406\u5206\u6D41\u8DEF\u5F84<input id="c-vec-proxy-path" value="${s.vecProxyPath || "/vec"}" placeholder="/vec"/></label>
      <div class="wm-divider"></div>
      <label class="wm-row"><input type="checkbox" id="c-take-emb" ${s.takeoverEmbedding ? "checked" : ""}/> \u63A5\u7BA1\u5411\u91CF\u68C0\u7D22\uFF08\u7528\u6E29\u8BB0\u81EA\u5DF1\u7684 embedding \u53EC\u56DE\uFF0C\u66FF\u4EE3\u9152\u9986\u539F\u751F\u53EC\u56DE\uFF09</label>
      <div class="wm-hint" style="margin:-2px 0 4px">\u52FE\u9009\u5373<b>\u7ACB\u523B\u771F\u63A5\u7BA1</b>\uFF1A\u6E29\u8BB0\u5185\u5BB9\u4E0D\u518D\u62C6\u5199\u9152\u9986\u4E16\u754C\u4E66\uFF0C\u6539\u7531\u6E29\u8BB0\u7528\u5411\u91CF\u53EC\u56DE topK \u6CE8\u5165\uFF08\u9ED8\u8BA4\u590D\u7528 LLM \u5730\u5740\uFF0C\u96F6\u914D\u7F6E\uFF09\u3002\u4E0D\u52FE\u5219\u4EA4\u56DE\u9152\u9986\u4E16\u754C\u4E66\u539F\u751F\u6FC0\u6D3B\u3002</div>
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
      <label class="wm-row" style="flex-direction:column;align-items:stretch">Rerank \u6307\u4EE4\uFF08\u544A\u8BC9\u6A21\u578B\u6309\u4EC0\u4E48\u6807\u51C6\u6392\u5E8F\uFF09
        <textarea id="c-rk-inst" rows="3" style="width:100%;font-family:monospace;font-size:12px">${escapeHtml(s.rerankInstruction || "")}</textarea>
      </label>
      <div class="wm-divider"></div>
      <label class="wm-row"><input type="checkbox" id="c-take-re" ${s.takeoverRerank ? "checked" : ""}/> \u63A5\u7BA1\u91CD\u6392\u5E8F\uFF08\u5728\u5411\u91CF\u63A5\u7BA1\u57FA\u7840\u4E0A\uFF0C\u7528\u6E29\u8BB0\u81EA\u5DF1\u7684 Rerank \u91CD\u6392\u53EC\u56DE\u7ED3\u679C\uFF09</label>
      <div class="wm-hint" style="margin:-2px 0 4px">\u9700\u914D\u5408\u300C\u63A5\u7BA1\u5411\u91CF\u68C0\u7D22\u300D\u4E00\u8D77\u5F00\u542F\u624D\u751F\u6548\uFF1A\u5411\u91CF\u53EC\u56DE\u540E\u518D\u7528\u4F60\u914D\u7F6E\u7684 Rerank \u670D\u52A1\u91CD\u6392\u53EC\u56DE\u7ED3\u679C\uFF0C\u63D0\u5347\u76F8\u5173\u6027\u3002\u5355\u72EC\u5F00\u542F\u65E0\u6548\u3002</div>
    </div>`;
    }
    function renderPaneImage(s) {
      const ig = s.imageGen || {};
      const backendOpts = [
        { v: "sd-webui", label: "SD WebUI (AUTOMATIC1111)" },
        { v: "comfyui", label: "ComfyUI" },
        { v: "cloud", label: "\u4E91\u7AEF OpenAI \u517C\u5BB9 (SiliconFlow/OpenAI \u7B49)" }
      ].map((o) => `<option value="${o.v}" ${ig.backendType === o.v ? "selected" : ""}>${o.label}</option>`).join("");
      const styleOpts = [
        { v: "general", label: "\u901A\u7528\uFF08\u4E0D\u8FFD\u52A0\u98CE\u683C\u524D\u7F00\uFF09" },
        { v: "anime", label: "\u52A8\u6F2B\u63D2\u753B" },
        { v: "realistic", label: "\u5199\u5B9E\u6444\u5F71" },
        { v: "ink", label: "\u4E1C\u65B9\u6C34\u58A8" }
      ].map((o) => `<option value="${o.v}" ${ig.promptStyle === o.v ? "selected" : ""}>${o.label}</option>`).join("");
      const displayOpts = [
        { v: "append", label: "\u8FFD\u52A0\u5230 AI \u697C\u5C42\u672B\u5C3E\uFF08\u9ED8\u8BA4\uFF09" },
        { v: "separate", label: "\u72EC\u7ACB system \u697C\u5C42" }
      ].map((o) => `<option value="${o.v}" ${ig.displayMode === o.v ? "selected" : ""}>${o.label}</option>`).join("");
      const SIZE_PRESETS = [
        { v: "", label: "\u81EA\u5B9A\u4E49\uFF08\u624B\u52A8\u586B\u5BBD\u9AD8\uFF09" },
        { v: "512_512_1_1\u5934\u50CF", label: "512x512 (1:1 \xB7 \u5934\u50CF / \u56FE\u6807)" },
        { v: "768_768_1_1\u65B9\u56FE", label: "768x768 (1:1 \xB7 \u9AD8\u6E05\u65B9\u56FE)" },
        { v: "512_768_2_3\u7AD6\u7248", label: "512x768 (2:3 \xB7 \u7AD6\u7248\u4EBA\u50CF)" },
        { v: "768_1024_3_4\u4EBA\u50CF", label: "768x1024 (3:4 \xB7 \u9AD8\u6E05\u4EBA\u50CF)" },
        { v: "600_800_3_4\u4E2A\u4EBA\u4FE1\u606F", label: "600x800 (3:4 \xB7 \u4E2A\u4EBA\u4FE1\u606F\u56FE\u50CF)" },
        { v: "768_512_3_2\u6A2A\u7248", label: "768x512 (3:2 \xB7 \u6A2A\u7248\u53D9\u4E8B)" },
        { v: "1024_768_4_3\u6A2A\u56FE", label: "1024x768 (4:3 \xB7 \u9AD8\u6E05\u6A2A\u56FE)" },
        { v: "1024_576_16_9\u6A2A\u5E45", label: "1024x576 (16:9 \xB7 \u5BBD\u5C4F\u6A2A\u5E45)" },
        { v: "1344_768_16_9\u5927\u6A2A\u5E45", label: "1344x768 (16:9 \xB7 \u9AD8\u6E05\u6A2A\u5E45)" },
        { v: "576_1024_9_16\u7AD6\u5C4F", label: "576x1024 (9:16 \xB7 \u7AD6\u5C4F / \u624B\u673A\u58C1\u7EB8)" }
      ];
      const sizeOpts = SIZE_PRESETS.map((o) => `<option value="${o.v}" ${ig.sizePreset === o.v ? "selected" : ""}>${o.label}</option>`).join("");
      const portHint = ig.backendType === "comfyui" ? "8188" : ig.backendType === "cloud" ? "\u5B8C\u6574 BaseURL\uFF0C\u5982 https://api.siliconflow.cn/v1" : "7860";
      const isCloud = ig.backendType === "cloud";
      const isComfy = ig.backendType === "comfyui";
      return `<div class="wm-card">
      <div class="wm-h">\u{1F3A8} \u751F\u56FE\u914D\u7F6E</div>
      <div class="wm-hint">AI \u6BCF\u6B21\u56DE\u590D\u540E\uFF0C\u81EA\u52A8\u8C03\u7528 LLM \u628A\u56DE\u590D\u6574\u5408\u6210\u753B\u9762\u63D0\u793A\u8BCD\uFF0C\u518D\u9001\u751F\u56FE\u540E\u7AEF\u51FA\u56FE\u3002<b>\u56FE\u7247\u4E0D\u8FDB\u5BF9\u8BDD\u4E0A\u4E0B\u6587</b>\uFF08\u7528\u6807\u8BB0\u5305\u88F9\uFF0C\u6CE8\u5165\u65F6\u5254\u9664\uFF09\u3002\u590D\u7528\u4E0A\u65B9\u300CLLM \u8C03\u7528\u300D\u914D\u7F6E\u505A\u63D0\u793A\u8BCD\u6574\u5408\uFF0C\u65E0\u9700\u989D\u5916\u914D LLM\u3002</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 14px 0">
        <button id="ig-unlimited-top" class="wm-btn" style="background:linear-gradient(135deg,#ff7a59 0%,#ff4e87 100%);color:white;font-weight:700;padding:10px 18px;border:none">\u{1F3A8} \u65E0\u9650\u5236\u7ACB\u5373\u751F\u56FE\uFF08\u5BF9\u6700\u65B0 AI \u6D88\u606F\u51FA\u56FE\uFF0C\u8FDE\u70B9\u53EF\u6392\u961F\u591A\u5F20\uFF09</button>
      </div>
      <label class="wm-row"><input type="checkbox" id="ig-on" ${ig.enabled ? "checked" : ""}/> \u542F\u7528\u751F\u56FE\u529F\u80FD</label>
      <label class="wm-row"><input type="checkbox" id="ig-auto" ${ig.autoTrigger ? "checked" : ""}/> \u81EA\u52A8\u89E6\u53D1\uFF08AI \u56DE\u590D\u843D\u5E93\u540E\u81EA\u52A8\u751F\u56FE\uFF1B\u5173\u95ED\u5219\u4EC5\u624B\u52A8\u70B9\u300C\u{1F3A8} \u7ACB\u5373\u751F\u56FE\u300D\u6309\u94AE\uFF09</label>
      <div class="wm-divider"></div>
      <label class="wm-row">\u540E\u7AEF\u7C7B\u578B
        <select id="ig-backend">${backendOpts}</select>
      </label>
      <label class="wm-row">\u540E\u7AEF\u5730\u5740 (apiUrl)<input id="ig-url" value="${escapeHtml(ig.apiUrl || "")}" placeholder="${isCloud ? "https://api.siliconflow.cn/v1" : "http://127.0.0.1:" + portHint}"/></label>
      <div class="wm-hint">${isCloud ? "\u4E91\u7AEF OpenAI \u517C\u5BB9\u7AEF\u70B9\u7684 BaseURL\uFF0C\u81EA\u52A8\u62FC\u63A5\u4E0B\u65B9\u7684 API \u8DEF\u5F84\u3002" : isComfy ? 'ComfyUI \u670D\u52A1\u5730\u5740\uFF0C\u9ED8\u8BA4\u7AEF\u53E3 8188\u3002\u4F1A\u8C03\u7528 /prompt \u63D0\u4EA4\u3001/history \u8F6E\u8BE2\u3001/view \u53D6\u56FE\u3002<b>\u5982\u6D4F\u89C8\u5668\u63A7\u5236\u53F0\u62A5 CORS/ERR_FAILED\uFF0C\u8BF7\u542F\u52A8 ComfyUI \u65F6\u52A0\u53C2\u6570\uFF1A<code>python main.py --enable-cors-header "*"</code></b>\u3002' : "SD WebUI (AUTOMATIC1111) \u670D\u52A1\u5730\u5740\uFF0C\u9ED8\u8BA4\u7AEF\u53E3 7860\u3002\u8C03\u7528 /sdapi/v1/txt2img\u3002<b>\u5982\u62A5 CORS \u8BF7\u542F\u52A8\u65F6\u52A0\uFF1A<code>--api --cors-allow-origins=*</code></b>\u3002"}</div>
      <label class="wm-row">API Key<input id="ig-key" type="password" value="${escapeHtml(ig.apiKey || "")}" placeholder="${isCloud ? "sk-...\uFF08\u4E91\u7AEF\u5FC5\u586B\uFF09" : "\u672C\u5730\u901A\u5E38\u7559\u7A7A"}"/></label>
      <label class="wm-row" style="flex-direction:column;align-items:stretch">\u6A21\u578B / Checkpoint
        ${isCloud ? `<input id="ig-model" value="${escapeHtml(ig.model || "")}" placeholder="\u5982 Kwai-Kolors/Kolors"/>` : `<div style="display:flex;gap:6px;width:100%;margin-top:4px">
              <select id="ig-model" style="flex:1">
                ${Array.isArray(ig.models) && ig.models.length ? `<option value="">\uFF08\u8BF7\u9009\u62E9\u4E00\u4E2A\u6A21\u578B\uFF09</option>` + ig.models.map((m) => {
        const val = typeof m === "string" ? m : m && m.value ? m.value : "";
        const lab = typeof m === "string" ? m : m && m.label ? m.label : val;
        return `<option value="${escapeHtml(val)}" ${ig.model === val ? "selected" : ""}>${escapeHtml(lab)}</option>`;
      }).join("") : `<option value="">${escapeHtml(ig.model || "")}\uFF08\u70B9\u51FB\u53F3\u4FA7\u300C\u{1F504}\u300D\u5237\u65B0\u6A21\u578B\u5217\u8868\uFF09</option>`}
                ${ig.model && !(Array.isArray(ig.models) && ig.models.some((mm) => (typeof mm === "string" ? mm : mm.value) === ig.model)) ? `<option value="${escapeHtml(ig.model)}" selected>${escapeHtml(ig.model)}\uFF08\u81EA\u5B9A\u4E49 / \u672C\u5730\u672A\u5339\u914D\uFF09</option>` : ""}
              </select>
              <button id="ig-model-refresh" class="wm-btn small" title="\u4ECE ${isComfy ? "ComfyUI (/object_info/CheckpointLoaderSimple)" : "SD WebUI (/sdapi/v1/sd-models)"} \u62C9\u53D6\u53EF\u7528 Checkpoint">\u{1F504}</button>
            </div>
            <div class="wm-hint">\u672C\u5730\u6A21\u578B\u6765\u81EA\u4F60${isComfy ? "ComfyUI\u300Cmodels/checkpoints\u300D\u76EE\u5F55\u4E0B\u7684\u6587\u4EF6\uFF08\u6587\u4EF6\u540D\u5373 CKPT \u540D\uFF09" : "SD WebUI \u5DF2\u52A0\u8F7D\u7684\u6A21\u578B\u5217\u8868"}\u3002\u5237\u65B0\u5931\u8D25\u901A\u5E38\u662F\u672A\u5F00 CORS \u6216\u540E\u7AEF\u5730\u5740\u4E0D\u5BF9\u3002\u4E0B\u62C9\u9009\u4E2D\u540E\u4F1A\u81EA\u52A8\u5199\u5165\u4E0A\u65B9\u6A21\u578B\u5B57\u6BB5\u3002</div>`}
      </label>
      ${isCloud ? `` : `
      <label class="wm-row"><input type="checkbox" id="ig-proxy" ${ig.imgProxyEnabled !== false ? "checked" : ""}/> \u5916\u7F51\u8BBF\u95EE\u65F6\u542F\u7528\u540C\u6E90\u4EE3\u7406\uFF08\u81EA\u52A8\u628A\u8BF7\u6C42\u6539\u5199\u5230\u5F53\u524D\u6E90 + \u4EE3\u7406\u8DEF\u5F84\uFF0C\u7ED5\u5F00\u672C\u5730\u540E\u7AEF CORS \u9650\u5236\uFF09</label>
      <label class="wm-row">\u540C\u6E90\u4EE3\u7406\u8DEF\u5F84<input id="ig-proxy-path" value="${escapeHtml(ig.imgProxyPath || "/img")}" placeholder="/img"/>
      </label>
      <div class="wm-hint">\u7528\u4E8E frp/ngrok/\u4E91\u53CD\u4EE3\u7B49\u5916\u7F51\u8BBF\u95EE\u6E29\u8BB0\u7684\u573A\u666F\u3002\u628A\u6E29\u8BB0\u53CD\u4EE3\u91CC <code>/img/*</code> \u8F6C\u53D1\u5230\u672C\u5730\u751F\u56FE\u670D\u52A1\uFF08ComfyUI/SD WebUI\uFF09\u5373\u53EF\u3002</div>`}
      ${isCloud ? `<label class="wm-row">\u4E91\u7AEF API \u8DEF\u5F84<input id="ig-cloud-path" value="${escapeHtml(ig.cloudPath || "/images/generations")}" placeholder="/images/generations"/></label>
      <div class="wm-hint">\u62FC\u5728 apiUrl \u540E\u3002SiliconFlow / OpenAI \u517C\u5BB9\u7AEF\u70B9\u90FD\u7528 <code>/images/generations</code>\u3002</div>` : ""}
      <div class="wm-divider"></div>
      <div class="wm-h" style="margin-top:0">\u5C3A\u5BF8\u9884\u8BBE</div>
      <label class="wm-row">\u5C3A\u5BF8\u9884\u8BBE
        <select id="ig-size">${sizeOpts}</select>
      </label>
      <div class="wm-hint">\u9009\u9884\u8BBE\u4F1A\u81EA\u52A8\u586B\u5165\u4E0B\u65B9\u5BBD\u9AD8\uFF1B\u4E4B\u540E\u624B\u52A8\u6539\u5BBD\u9AD8\u4F1A\u628A\u9884\u8BBE\u7F6E\u4E3A\u300C\u81EA\u5B9A\u4E49\u300D\u3002</div>
      <div class="wm-h" style="margin-top:0">\u51FA\u56FE\u53C2\u6570\uFF08\u90FD\u53EF\u81EA\u5DF1\u586B\u5199\uFF09</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="wm-row" style="flex:1;min-width:120px">\u5BBD (px)<input id="ig-w" type="number" min="64" max="3072" step="8" value="${Number(ig.width) || 512}"/></label>
        <label class="wm-row" style="flex:1;min-width:120px">\u9AD8 (px)<input id="ig-h" type="number" min="64" max="3072" step="8" value="${Number(ig.height) || 768}"/></label>
        <label class="wm-row" style="flex:1;min-width:120px">\u91C7\u6837\u6B65\u6570<input id="ig-steps" type="number" min="1" max="150" value="${Number(ig.steps) || 20}"/></label>
        <label class="wm-row" style="flex:1;min-width:120px">CFG \u7F29\u653E<input id="ig-cfg" type="number" min="1" max="30" step="0.5" value="${Number(ig.cfgScale) || 7}"/></label>
        <label class="wm-row" style="flex:1;min-width:120px">\u53BB\u566A\u5F3A\u5EA6<input id="ig-denoise" type="number" min="0" max="1" step="0.05" value="${Number(ig.denoisingStrength) || 1}"/></label>
        <label class="wm-row" style="flex:1;min-width:120px">\u79CD\u5B50 (-1=\u968F\u673A)<input id="ig-seed" type="number" min="-1" step="1" value="${ig.seed == null ? -1 : Number(ig.seed)}"/></label>
      </div>
      ${!isCloud ? `<label class="wm-row">\u91C7\u6837\u5668 (\u7559\u7A7A\u7528\u9ED8\u8BA4)<input id="ig-sampler" value="${escapeHtml(ig.sampler || "")}" placeholder="Euler a / DPM++ 2M Karras / Euler"/></label>` : ""}
      <label class="wm-row" style="flex-direction:column;align-items:stretch">\u5E38\u89C1\u63D0\u793A\u8BCD\u524D\u7F00\uFF08\u5BF9\u6240\u6709\u56FE\u751F\u6548\uFF1B{{prompt}} \u8868\u793A LLM \u6574\u5408\u51FA\u7684\u753B\u9762\u63CF\u8FF0\u4F4D\u7F6E\uFF09
        <textarea id="ig-prefix" rows="2" style="width:100%;font-family:monospace;font-size:12px" placeholder="masterpiece, best quality, absurdres, {{prompt}}">${escapeHtml((ig.promptPrefix != null ? ig.promptPrefix : ig.promptTemplate) || "")}</textarea>
      </label>
      <div class="wm-hint">\u542B <code>{{prompt}}</code> \u65F6\u66FF\u6362\uFF1B\u4E0D\u542B\u65F6\u4F1A\u81EA\u52A8\u524D\u7F6E\u5230 LLM \u753B\u9762\u63CF\u8FF0\u4E4B\u524D\u3002</div>
      <label class="wm-row" style="flex-direction:column;align-items:stretch">\u5E38\u89C1\u8D1F\u9762\u63D0\u793A\u8BCD\u524D\u7F00\uFF08\u5BF9\u6240\u6709\u56FE\u751F\u6548\uFF0C\u7559\u7A7A\u4E5F\u884C\uFF09
        <textarea id="ig-neg-pre" rows="2" style="width:100%;font-family:monospace;font-size:12px" placeholder="lowres, bad anatomy, bad hands, missing fingers, extra digit, cropped, worst quality">${escapeHtml(ig.negativePrefix || "")}</textarea>
      </label>
      <label class="wm-row" style="flex-direction:column;align-items:stretch">\u672C\u6B21\u7279\u5B9A\u8D1F\u9762\u63D0\u793A\u8BCD\uFF08\u53EF\u9009\uFF0C\u4F1A\u62FC\u5728\u4E0A\u9762\u524D\u7F00\u4E4B\u540E\uFF09
        <textarea id="ig-neg" rows="2" style="width:100%;font-family:monospace;font-size:12px" placeholder="\uFF08\u901A\u5E38\u7559\u7A7A\uFF1B\u5BF9\u67D0\u5F20\u56FE\u60F3\u989D\u5916\u6392\u9664\u7684\u5185\u5BB9\u586B\u8FD9\u91CC\uFF09">${escapeHtml(ig.negativePrompt || "")}</textarea>
      </label>
      <div class="wm-divider"></div>
      <div class="wm-h" style="margin-top:0">\u753B\u9762\u98CE\u683C\u4E0E\u5C55\u793A</div>
      <label class="wm-row">\u753B\u9762\u98CE\u683C\uFF08\u8FFD\u52A0\u98CE\u683C\u524D\u7F00\uFF0C\u5F15\u5BFC\u51FA\u56FE\u8C03\u6027\uFF09
        <select id="ig-style">${styleOpts}</select>
      </label>
      <label class="wm-row">\u56FE\u7247\u5C55\u793A\u65B9\u5F0F
        <select id="ig-display">${displayOpts}</select>
      </label>
      <div class="wm-hint">\u300C\u8FFD\u52A0\u5230 AI \u697C\u5C42\u672B\u5C3E\u300D\uFF1A\u56FE\u7247\u7D27\u8DDF AI \u56DE\u590D\u4E0B\u65B9\u3002\u300C\u72EC\u7ACB system \u697C\u5C42\u300D\uFF1A\u5355\u72EC\u4E00\u5C42\u663E\u793A\u3002\u4E24\u79CD\u65B9\u5F0F\u5747\u4E0D\u8FDB\u4E0A\u4E0B\u6587\u3002</div>
      ${isComfy ? `<div class="wm-divider"></div>
      <div class="wm-h" style="margin-top:0">ComfyUI \u5DE5\u4F5C\u6D41</div>
      <div class="wm-hint">\u4ECE ComfyUI \u91CC\u300C\u4FDD\u5B58(Ctrl+S)\u300D\u6216\u300CSave (API Format)\u300D\u5BFC\u51FA\u7684 JSON \u5373\u53EF\u7528\u3002<br/>
        \u652F\u6301\u4E24\u79CD\u5360\u4F4D\u7B26\u683C\u5F0F\uFF08\u7B49\u4EF7\uFF09\uFF1A<code>{{prompt}}</code> \u6216 <code>"%prompt%"</code>\u3002\u5728\u7F16\u8F91\u5668\u91CC\u628A\u9700\u8981\u52A8\u6001\u66FF\u6362\u7684\u503C\u6539\u6210\u5360\u4F4D\u7B26\u5373\u53EF\u3002\u7559\u7A7A\u7528\u5185\u7F6E\u9ED8\u8BA4\u5DE5\u4F5C\u6D41\u3002</div>
      <div style="display:flex;gap:6px;width:100%;margin-top:6px;align-items:center;flex-wrap:wrap">
        <select id="ig-comfy-wf" style="flex:1;min-width:180px">
          <option value="">\uFF08\u5185\u7F6E\u9ED8\u8BA4\u5DE5\u4F5C\u6D41\xB7\u81EA\u52A8\u68C0\u6D4B\u6A21\u578B\u7C7B\u578B\uFF09</option>
          ${(Array.isArray(ig.comfyWorkflowList) ? ig.comfyWorkflowList : []).map((wf) => {
        const name = typeof wf === "string" ? wf : wf && wf.name ? wf.name : "";
        return `<option value="${escapeHtml(name)}" ${ig.comfyWorkflowName === name ? "selected" : ""}>${escapeHtml(name)}</option>`;
      }).join("")}
        </select>
        <button id="ig-comfy-edit" class="wm-btn small" title="\u7F16\u8F91\u5F53\u524D\u5DE5\u4F5C\u6D41\uFF08\u5F39\u51FA\u7F16\u8F91\u5668\uFF0C\u652F\u6301\u5360\u4F4D\u7B26\u68C0\u6D4B\uFF09">\u270F\uFE0F \u7F16\u8F91</button>
        <button id="ig-comfy-new" class="wm-btn small" title="\u65B0\u5EFA\u7A7A\u767D\u5DE5\u4F5C\u6D41">\u2795 \u65B0\u5EFA</button>
        <button id="ig-comfy-import" class="wm-btn small" title="\u4ECE .json \u6587\u4EF6\u5BFC\u5165\u5DE5\u4F5C\u6D41">\u{1F4E5} \u5BFC\u5165</button>
        <button id="ig-comfy-rename" class="wm-btn small" title="\u91CD\u547D\u540D\u5F53\u524D\u5DE5\u4F5C\u6D41">\u6539\u540D</button>
        <button id="ig-comfy-delete" class="wm-btn small" title="\u5220\u9664\u5F53\u524D\u5DE5\u4F5C\u6D41">\u{1F5D1}\uFE0F</button>
        <button id="ig-comfy-refresh" class="wm-btn small" title="\u5237\u65B0\u5DE5\u4F5C\u6D41\u5217\u8868">\u{1F504}</button>
      </div>
      <input type="file" id="ig-comfy-file" accept=".json" style="display:none"/>
      <div class="wm-hint" style="margin-top:4px">\u5DE5\u4F5C\u6D41\u6587\u4EF6\u901A\u8FC7\u9152\u9986\u540E\u7AEF\u7BA1\u7406\uFF0C\u4E0E\u9152\u9986\u539F\u751F SD \u6A21\u5757\u4E92\u901A\u3002\u9009\u300C\u5185\u7F6E\u9ED8\u8BA4\u300D\u4F1A\u6839\u636E\u6A21\u578B\u540D\u81EA\u52A8\u5207\u6362 Checkpoint/UNet \u5DE5\u4F5C\u6D41\u3002</div>
      <details style="margin-top:8px">
        <summary style="cursor:pointer;color:var(--SmartThemeQuoteColor,#6f5cff);font-size:12px">\u{1F4DD} \u9AD8\u7EA7\uFF1A\u5185\u8054\u5DE5\u4F5C\u6D41 JSON\uFF08\u76F4\u63A5\u7C98\u8D34\uFF0C\u4F18\u5148\u7EA7\u9AD8\u4E8E\u4E0A\u65B9\u4E0B\u62C9\u6846\uFF09</summary>
        <textarea id="ig-comfy" rows="5" style="width:100%;font-family:monospace;font-size:11px;margin-top:6px" placeholder='{"3":{"class_type":"KSampler","inputs":{"seed":"{{seed}}",...}},"6":{"class_type":"CLIPTextEncode","inputs":{"text":"{{prompt}}"}}}'>${escapeHtml(ig.comfyWorkflow || "")}</textarea>
        <div class="wm-hint">\u7C98\u8D34\u5728\u8FD9\u91CC\u7684\u5DE5\u4F5C\u6D41\u4F1A\u76F4\u63A5\u4F7F\u7528\uFF0C\u4E0D\u7ECF\u8FC7\u6587\u4EF6\u7BA1\u7406\u3002\u9002\u5408\u4E34\u65F6\u6D4B\u8BD5\u3002</div>
      </details>` : ""}
      <div class="wm-divider"></div>
      <div class="wm-hint">\u{1F4A1} \u63D0\u793A\uFF1A\u70B9\u4E0A\u65B9\u300C\u6D4B\u8BD5\u8FDE\u63A5\u300D\u4F1A\u771F\u7684\u51FA\u4E00\u5F20\u6D4B\u8BD5\u56FE\uFF0C\u9A8C\u8BC1\u540E\u7AEF\u8FDE\u901A\u6027+\u53C2\u6570\u3002\u751F\u56FE\u63D0\u793A\u8BCD\u590D\u7528\u300CLLM \u8C03\u7528\u300D\u6807\u7B7E\u9875\u914D\u7F6E\uFF0C\u65E0\u9700\u5728\u6B64\u91CD\u590D\u586B\u3002</div>
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
      injectImageButton();
      if (WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook().catch((e) => console.warn("[WarmMemo] \u4E16\u754C\u4E66\u7ED1\u5B9A\u5931\u8D25", e));
      WM.Injection.init();
      const es = window.eventSource && window.eventSource.eventNames ? window.eventSource : window.SillyTavern && window.SillyTavern.eventSource;
      if (es && es.on) {
        const names = window.eventSource && window.eventSource.eventNames ? window.eventSource.eventNames : {};
        const evReceived = names.MESSAGE_RECEIVED || "MESSAGE_RECEIVED";
        const evSent = names.MESSAGE_SENT || "MESSAGE_SENT";
        es.on(evReceived, autoSummaryHook);
        es.on(evSent, autoSummaryHook);
        es.on(evReceived, autoImageHook);
      }
    }
    function injectImageButton() {
      if (document.getElementById("warmmemo-img-btn")) return;
      const container = findInputContainer();
      if (!container) return;
      const btn = document.createElement("button");
      btn.id = "warmmemo-img-btn";
      btn.className = "wm-input-btn menu_button";
      btn.type = "button";
      btn.title = "\u6E29\u8BB0 \xB7 \u5BF9\u5F53\u524D AI \u56DE\u590D\u751F\u56FE";
      btn.textContent = "\u{1F3A8} \u751F\u56FE";
      btn.onclick = async () => {
        const s = WM.Settings.load();
        if (!s.imageGen || s.imageGen.enabled !== true) {
          toast("\u{1F3A8} \u751F\u56FE\u672A\u5F00\u542F\uFF0C\u6B63\u5728\u6253\u5F00\u8BBE\u7F6E\u2026");
          WM._cfgTab = "img";
          openPanel();
          return;
        }
        if (WM.ImageGen && WM.ImageGen.isGenerating && WM.ImageGen.isGenerating()) {
          toast("\u{1F3A8} \u6B63\u5728\u751F\u56FE\u4E2D\uFF0C\u8BF7\u7A0D\u5019\u2026");
          return;
        }
        await WM.ImageGen.triggerImageGeneration({});
      };
      const memBtn = document.getElementById("warmmemo-btn");
      if (memBtn && memBtn.parentNode === container) {
        container.insertBefore(btn, memBtn.nextSibling);
      } else {
        container.appendChild(btn);
      }
    }
    let _lastImgAt = 0;
    async function autoImageHook() {
      const s = WM.Settings.load();
      const ig = s.imageGen || {};
      if (ig.enabled !== true || ig.autoTrigger !== true) return;
      const now = Date.now();
      if (now - _lastImgAt < 2e3) return;
      _lastImgAt = now;
      setTimeout(async () => {
        try {
          await WM.ImageGen.triggerImageGeneration({ silent: false });
        } catch (e) {
          toast("\u{1F3A8} \u81EA\u52A8\u751F\u56FE\u5931\u8D25 - " + (e.message || e));
        }
      }, 3e3);
    }
    let _lastAutoAt = 0;
    async function autoSummaryHook() {
      const s = WM.Settings.load();
      if (s.autoSummaryEnabled === false) return;
      const now = Date.now();
      if (now - _lastAutoAt < 1200) return;
      _lastAutoAt = now;
      setTimeout(async () => {
        try {
          let r = await WM.Summary.triggerSummary(s, { mode: "full" });
          if (r && !r.ok && s.autoSummaryMode === "floor") {
            const total = WM.Summary.getChatMessages && WM.Summary.getChatMessages().length || 0;
            const ptr = WM.MemoryStore.getSummaryPointer();
            if (ptr < total) r = await WM.Summary.triggerSummary(s, { mode: "full", forceEnd: true });
          }
          if (s.autoHideFloors && r && r.ok && WM.FloorHider && WM.FloorHider.hideUntil) {
            await WM.FloorHider.hideUntil(r.range[1]);
          }
          if (r && r.ok) {
            const extra = r.partial ? "\uFF08\u90E8\u5206\u63D0\u70BC\u5931\u8D25\uFF0C\u89C1\u9519\u8BEF\u62A5\u544A\uFF09" : "";
            toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u5DF2\u5199\u5165 ${r.count} \u6761\u8BB0\u5FC6\uFF08\u697C\u5C42 ${r.range[0]}-${r.range[1]}\uFF09${extra}`);
          }
          let rp = await WM.Summary.triggerPlot(s, { mode: "full" });
          if (rp && !rp.ok && s.autoPlotMode === "floor") {
            const total = WM.Summary.getChatMessages && WM.Summary.getChatMessages().length || 0;
            const ptr = WM.MemoryStore.getPlotPointer();
            if (ptr < total) rp = await WM.Summary.triggerPlot(s, { mode: "full", forceEnd: true });
          }
          if (s.autoHideFloors && rp && rp.ok && WM.FloorHider && WM.FloorHider.hideUntil) {
            await WM.FloorHider.hideUntil(rp.range[1]);
          }
          if (rp && rp.ok) {
            const extra = rp.partial ? "\uFF08\u90E8\u5206\u5931\u8D25\uFF0C\u89C1\u9519\u8BEF\u62A5\u544A\uFF09" : "";
            toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u5267\u60C5\u7EBF\u5DF2\u63A8\u8FDB ${rp.count} \u6761\uFF08\u697C\u5C42 ${rp.range[0]}-${rp.range[1]}\uFF09${extra}`);
          }
        } catch (e) {
          toast(`\u{1F33F} \u6E29\u8BB0\uFF1A\u81EA\u52A8\u5904\u7406\u5931\u8D25 - ${e.message || e}`);
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
    WM.Launcher = { init, renderTab, renderCfg, renderWorld, renderAuto, renderMem, renderRel, renderItem, renderPlot, toast, openPanel };
  })();

  // src/index.js
  window.WarmMemo = window.WarmMemo || {};
  window.WarmMemo.version = "summary-wenxue-style-v6";
  if (window.WarmMemo && window.WarmMemo.Launcher) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.WarmMemo.Launcher.init());
    else window.WarmMemo.Launcher.init();
  } else {
    console.error("[WarmMemo] \u542F\u52A8\u5931\u8D25\uFF1ALauncher \u672A\u5B9A\u4E49");
  }
  console.log("[WarmMemo] \u5C31\u7EEA");
})();
