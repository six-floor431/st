// 设置模块：含「自定义自动总结楼层」配置（用户需求：可自定义选择自动总结的楼层）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const LS_KEY = 'warmmemo_settings_v2';

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
    embeddingBaseUrl: '',           // 任意 Base URL：如 http://127.0.0.1:8080/vec/v1/embeddings、https://api.siliconflow.cn/v1、https://xxx.openai.azure.com
    embeddingApiKey: '',
    embeddingModel: 'text-embedding-3-small',
    rerankEnabled: false,
    // 重排序(Rerank)配置：直接填 Base URL 自适应任意 OpenAI 兼容服务
    rerankBaseUrl: '',
    rerankApiKey: '',
    rerankModel: 'BAAI/bge-reranker-v2-m3',
    // Rerank 指令（对齐万楼）：自然语言告诉重排模型「按什么标准排序」，让召回更贴合当前用户输入意图
    rerankInstruction: '请根据当前用户输入，判断每个候选记忆条目的相关性，将最相关、能直接延续或回答当前对话意图的条目排在前面。',
    // 自动总结楼层设置（自定义）
    autoSummaryEnabled: true,     // 是否开启自动总结
    autoSummaryMode: 'new',       // 'new'=只总结新增楼层, 'range'=按区间, 'count'=最近N条, 'floor'=按楼层区间(1-20,21-40...)
    autoSummaryCount: 20,         // count 模式：最近 N 条
    autoSummaryStart: 0,          // range 模式：起始楼层
    autoSummaryEnd: -1,           // range 模式：-1 表示到最新
    autoSummaryFloor: 20,         // floor 模式：每多少层触发一段（1-20,21-40,...）
    autoHideFloors: true,          // 总结后隐藏已处理楼层
    autoSummaryParallel: true,    // 总结后并行调用关系/剧情/世界观/物品（带失败重试）
    // ── 剧情线独立流程配置 ──
    // 剧情线独立于「总结」，像自动总结一样自我推进：有独立触发指针(plotPointer)与攒段逻辑，
    // 触发时同时并联调用「关系线 LLM」，两者互不依赖总结结果。区间模式复用 autoSummary* 同名设置。
    autoPlotEnabled: true,        // 是否开启剧情线独立自动推进（默认跟随自动总结总开关的逻辑独立运行）
    autoPlotMode: 'new',          // 复用 'new'/'range'/'count'/'floor' 四种模式（与 autoSummaryMode 解耦，可单独设置）
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
      { name: 'think', open: '<think>', close: '</think>', wrap: true, singleBefore: true, singleAfter: false, enabled: true },
    ],
    worldToLorebook: true,        // 是否把世界观/总结/物品/关系拆分写入世界书条目（默认开启，实现条目隔离）
    // 统一的 LLM 调用配置（所有功能共用这一个）：
    //   直接按填写的 Base URL 走 OpenAI 兼容 /chat/completions 协议请求，
    //   不再依赖酒馆的 generateRaw / generate（已彻底移除"本地酒馆源"调用路径）。
    //   只发送我们自己的自定义提示词（system + user），不携带酒馆预设/角色卡/聊天历史。
    //   该配置在设置面板可一键「测试连接」验证 API 可用。
    llmConfig: {
      source: 'local',
      apiUrl: '',
      apiKey: '',
      model: '',
      maxTokens: 700,   // 输出 token 上限：所有功能共用默认值（各任务可在下方单独覆盖）
      deepThinking: false, // 深度思考开关：开启后按模型自适应注入深度思考参数（见 LLMClient）
    },
    // 各任务独立输出 token 上限（二级控制）。留空/0 则回退到 llmConfig.maxTokens 共用值。
    taskTokens: {
      summary: 0,
      relations: 0,
      plot: 0,
      world: 0,
      items: 0,
    },
    // 自动「大总结」：每累计 N 次小总结后，自动对历史所有小总结做一次「大总结」（整合为长期记忆）。
    // 大总结提示词 = 小总结提示词（同一份）。小总结计数由 summaryCountPointer 跟踪。
    bigSummaryEnabled: false,    // 是否开启自动大总结
    bigSummaryEvery: 5,          // 每多少次小总结触发一次大总结
    bigSummaryMaxSegments: 50,   // 一次大总结最多回顾多少个历史小总结段（0=不限制）
    // 预设前置：拼在我们自己可编辑的提示词「之前」
    //   mode: 'none'   => 不使用
    //   mode: 'import' => 用 importText 作为前置（用户自己粘贴/编辑）
    //   mode: 'preset' => 调用酒馆里已经保存的预设（presetName），取其 enabled 且有内容的提示词作为前置
    presetPrefix: {
      mode: 'none',
      importText: '',
      presetName: '',
    },
    lorebookName: 'WarmMemo',     // 世界书名（可自定义；绑定到当前角色卡实现数据隔离）
    // 接管酒馆内置向量与重排序（开启后用我们自己的 VectorStore + Rerank 召回世界书条目）
    takeoverEmbedding: false,     // 接管向量检索：开启后注入用我们自己的 embedding 相似度召回
    takeoverRerank: false,        // 接管重排序：开启后对世界书召回结果做 rerank 重排
    injectMemories: true,         // 是否注入记忆到上下文
    injectWorld: true,

    // 扩展自带提示词（均可编辑）。保留 {{变量}} 占位符，运行时被真实数据替换：
    //   {{recent}} 最近对话   {{historySummary}} 历史总结   {{relations}} 关系   {{plot}} 剧情线
    // 注：世界观走独立推断函数（inferWorldview），不通过模板占位符注入。
    promptsVersion: 4,             // 提示词结构/内容版本。每次大改提示词 +1；低于此版本时自动覆盖用户已保存的旧提示词（保留其它设置）。
    prompts: {
      // ═══════════════════════════════════════════
      // 统一输出格式约定（所有提示词必须遵守）：
      //   每个任务的输出必须用专用符号包裹，便于代码精确解析：
      //     <<<SUMMARY_START>>>  ...  <<<SUMMARY_END>>>
      //     <<<RELATIONS_START>>> ... <<<RELATIONS_END>>>
      //     <<<PLOT_START>>>       ...  <<<PLOT_END>>>
      //     <<<WORLD_START>>>      ...  <<<WORLD_END>>>
      //     <<<ITEMS_START>>>      ...  <<<ITEMS_END>>>
      //   符号标记之外的内容一律视为残留指令/回显，会被自动清除。
      // ═══════════════════════════════════════════
      //
      // 核心原则（参考 memoir 的「事实锚定」思路，解决"提取到与角色不相干的句子"）：
      //   只提取【已登场角色】直接相关、且对剧情/关系/设定/物品有实际作用的内容；
      //   丢弃与角色无关的闲笔、环境描写、心理分析、抽象气氛标签。
      //   严格只基于【对话原文】已发生的事实，禁止编造、禁止评价、禁止渲染。

      summary: '把【最近对话】压缩成一段叙事，只写动作和事件，对话最多留一句关键台词。\n只输出如下 JSON，不要任何解释、不要 markdown 代码块标记：\n{"text":"（2-5个自然段的散文叙事，纯动作与事件，不分析心理不渲染气氛）"}\n\n【最近对话】\n{{recent}}',

      relations: '从对话中提取两个已登场角色之间的直接关系。\n只输出如下 JSON 数组，不要任何解释、不要 markdown 代码块标记：\n[{"from":"角色A","to":"角色B","label":"关系词(2-6字)"}]\n无互动则不写。最多8条。\n\n【最近对话】\n{{recent}}',

      plot: '从【最近对话】挑出本段新发生的剧情事件。已有剧情线仅供参考、不要重复它。没有新事件就输出空数组。最多8条。\n只输出如下 JSON 数组，不要任何解释、不要 markdown 代码块标记：\n[{"time":"剧情时间点(未提及写空串)","title":"不超过12字的短标题","summary":"1-2句客观事件描述(人物+动作+场景)"}]\n\n【已有剧情线】\n{{historyPlot}}\n\n【最近对话】\n{{recent}}',

      worldview: '从剧情和对话中提炼世界的通用规则（不写单个具体物品/角色/地点）。3-6条。\n只输出如下 JSON，不要任何解释、不要 markdown 代码块标记：\n{"name":"世界名","type":"世界类型","desc":"1-2句简述","rules":[{"title":"设定标题","content":"设定内容(一句话)"}]}\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',

      itemExtract: '从对话中提取出现的物品。最多8条。\n只输出如下 JSON 数组，不要任何解释、不要 markdown 代码块标记：\n[{"name":"物品名(只写名字)","desc":"作用(一句话不超过20字)","owner":"当前持有者","related":"关联剧情标题(无则空串)","origin":"来历(简短)"}]\n\n【已知剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
    },
  };

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      const parsed = JSON.parse(raw);
      const s = Object.assign({}, DEFAULTS, parsed);
      // 迁移：旧的 5 份独立 llmProfiles 或旧的 summary* 默认配置 → 单一 llmConfig
      if (!s.llmConfig) {
        s.llmConfig = { source: 'local', apiUrl: '', apiKey: '', model: '' };
        const profiles = s.llmProfiles;
        if (profiles && profiles.summary) {
          // 取 summary 那份作为统一配置
          s.llmConfig = Object.assign(s.llmConfig, profiles.summary);
        } else if (s.summaryBaseUrl || s.summaryApiKey || s.summaryModel) {
          // 旧默认自定义配置迁移
          s.llmConfig = {
            source: (s.summaryBaseUrl || s.summaryApiKey) ? 'custom' : 'local',
            apiUrl: s.summaryBaseUrl || '',
            apiKey: s.summaryApiKey || '',
            model: s.summaryModel || '',
          };
        }
      }
      // 提示词版本迁移：用「用户实际保存」的 promptsVersion 判断（不能用被 DEFAULTS 覆盖后的 s.promptsVersion，
      // 否则 Object.assign 已把 DEFAULTS 的版本带进来，导致 3<3 永远 false、旧提示词永远不被覆盖）。
      // 若用户保存的版本低于当前版本，用 DEFAULTS 新提示词覆盖旧提示词，避免「源码改了但用户旧提示词仍在生效」。
      // 兜底：即便版本号巧合一致，只要当前 summary 提示词里没有符号包裹标记（说明是旧版），也强制覆盖，
      // 彻底解决「新的被旧的顶了」这类问题。
      const savedPromptVer = parsed.promptsVersion || 0;
      const savedSummary = (parsed.prompts && parsed.prompts.summary) || '';
      const looksLegacy = !/<{3}SUMMARY_START>{3}>/.test(savedSummary);
      if (savedPromptVer < DEFAULTS.promptsVersion || looksLegacy) {
        s.prompts = Object.assign({}, DEFAULTS.prompts);
        s.promptsVersion = DEFAULTS.promptsVersion;
      }
      return s;
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  WM.Settings = { load, save, DEFAULTS };
})();
