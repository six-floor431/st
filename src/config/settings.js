// 设置模块：含「自定义自动总结楼层」配置（用户需求：可自定义选择自动总结的楼层）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const LS_KEY = 'warmmemo_settings_v2';

  const DEFAULTS = {
    showMemoryButton: true,
    autoUpdate: true,
    vectorEnabled: false,
    // 向量(Embedding)配置：直接填 Base URL 自适应任意 OpenAI 兼容/本地反代服务（不再选厂家）
    embeddingBaseUrl: '',           // 任意 Base URL：如 http://127.0.0.1:8080/vec/v1/embeddings、https://api.siliconflow.cn/v1、https://xxx.openai.azure.com
    embeddingApiKey: '',
    embeddingModel: 'text-embedding-3-small',
    rerankEnabled: false,
    // 重排序(Rerank)配置：直接填 Base URL 自适应任意 OpenAI 兼容服务
    rerankBaseUrl: '',
    rerankApiKey: '',
    rerankModel: 'BAAI/bge-reranker-v2-m3',
    // 自动总结楼层设置（自定义）
    autoSummaryEnabled: true,     // 是否开启自动总结
    autoSummaryMode: 'new',       // 'new'=只总结新增楼层, 'range'=按区间, 'count'=最近N条, 'floor'=按楼层区间(1-20,21-40...)
    autoSummaryCount: 20,         // count 模式：最近 N 条
    autoSummaryStart: 0,          // range 模式：起始楼层
    autoSummaryEnd: -1,           // range 模式：-1 表示到最新
    autoSummaryFloor: 20,         // floor 模式：每多少层触发一段（1-20,21-40,...）
    autoHideFloors: true,          // 总结后隐藏已处理楼层
    autoSummaryParallel: true,    // 总结后并行调用关系/剧情/世界观/物品（带失败重试）
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
      maxTokens: 700,   // 输出 token 上限：所有功能共用，模型会在该上限内尽量输出完整内容
    },
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
    //   {{recent}} 最近对话   {{historySummary}} 历史总结   {{relations}} 关系
    //   {{plot}} 剧情线   {{worldview}} 世界观   {{current}} 当前对话   {{title}} 聊天标题
    prompts: {
      summary: '你是我的专属记录员。请基于「最近对话」，按「时间顺序」提炼出「关键事实、约定、状态变化、人名/地点/组织、未完成的承诺或待办」。不要编造，不确定就写“未知”。仅输出条目，每条一行，不超过 12 条。\n\n【最近对话】\n{{recent}}',
      relations: '你是关系分析师。请基于「历史总结」和「最近对话」，分析「我（用户）与角色之间」的关系状态、亲密度、张力、未解心结。输出结构化条目，每条一行。\n\n【历史总结】\n{{historySummary}}\n\n【最近对话】\n{{recent}}',
      plot: '你是剧情梳理者。请基于「关系」和「最近对话」，梳理这一段发生的剧情。\n\n每行一条，严格用竖线分隔，格式：\n时间｜标题｜内容｜状态\n\n说明：\n- 时间：剧情内的时间点（如「第三日清晨」「建元七年春」）。若对话未提及，写「未标注」。\n- 标题：这段剧情的简短命名，不超过 15 字。\n- 内容：这段剧情发生了什么，一到两句话。\n- 状态：只能填 进行中 / 已完结 / 已废弃 三者之一。\n\n不要输出表头，不要编号，不要额外说明。最多 8 条。\n\n【关系】\n{{relations}}\n\n【最近对话】\n{{recent}}',
      worldview: '你是世界观提炼者。请基于【剧情线】【最近对话】，提炼这个故事所处世界本身的「底层规则设定」。\n\n严格按以下格式输出，不要添加任何多余说明：\n\n世界名：（这个世界/大陆/城市叫什么，没有就起一个贴切的）\n世界类型：（用一个词概括，如：修仙世界、赛博朋克、蒸汽朋克、现代都市、剑与魔法）\n简述：（一到两句话说明这是个什么样的世界）\n\n## 设定标题一\n（围绕"世界类型"展开的具体规则与法则。例如修仙世界就写修炼体系的境界划分、灵气运行法则；赛博朋克就写义体改造规则、企业与财阀的运行法则）\n\n## 设定标题二\n（内容）\n\n要求：\n1. 「世界设定」只写世界本身的通用规则、法则、历史背景、力量体系，绝不写单个具体物品、单个具体角色姓名、单个具体地点名称。\n2. 「世界类型」决定了下面写什么。修仙世界就必须写修炼体系、灵气、法则等，不要写无关内容。\n3. 每条设定要具体、可被后续剧情引用，不要空泛。\n4. 输出 3-6 条设定条目。\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
      itemExtract: '你是物品记录员。物品必须与「角色」和「剧情」产生关联，孤立的普通道具不要记录。\n\n请基于【最近对话】，抽取本段出现的具有剧情意义的物品/道具/信物/装备。\n\n每行一条，严格用竖线分隔，格式：\n物品名｜作用｜持有者｜关联剧情｜来历\n\n说明：\n- 物品名：物品的名称。\n- 作用：这件物品有什么用途、效果或象征意义（必填，不可写「无」）。\n- 持有者：现在在哪个角色手上。必须是【剧情线】或对话中出现过的角色名；确实不明写「未知」。\n- 关联剧情：这件物品牵涉到哪条剧情线，请从下面【已知剧情线】的标题中挑选，可多个用顿号分隔；都不沾边写「无」。\n- 来历：从哪里获得的，不明写「未知」。\n\n判断标准：只记录满足以下任一条件的物品——\n(a) 被某个角色明确持有或争夺；\n(b) 推动了某条剧情线的发展；\n(c) 是角色关系或身份的信物。\n\n不要输出表头，不要编号，不要额外说明。最多 8 条。\n\n【已知剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
    },
  };

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      const s = Object.assign({}, DEFAULTS, JSON.parse(raw));
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
      return s;
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  WM.Settings = { load, save, DEFAULTS };
})();
