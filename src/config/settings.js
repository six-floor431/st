// 设置模块：含「自定义自动总结楼层」配置（用户需求：可自定义选择自动总结的楼层）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const LS_KEY = 'warmmemo_settings_v2';

  const DEFAULTS = {
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
    //   source: 'local'  => 用酒馆当前源（shared-api），无需额外配置
    //   source: 'custom' => 用 custom_api 切换：优先填「代理预设名」(proxyPreset)，
    //                       否则填 apiUrl/apiKey/model 直连（全部交给酒馆 generate 处理，
    //                       不再自造 fetch，以复用酒馆的源管理/模型列表/流式等能力）
    // 该配置在设置面板可一键「测试连接」验证 API 可用。
    llmConfig: {
      source: 'local',
      proxyPreset: '',
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
      plot: '你是剧情梳理者。请基于「关系」和「最近对话」，梳理当前剧情主线、支线、悬念与下一步可能发展。输出条目，每条一行。\n\n【关系】\n{{relations}}\n\n【最近对话】\n{{recent}}',
      worldview: '你是世界观提炼者。请基于「剧情线」和「最近对话」，抽取本世界的关键设定：地点、势力、规则、物品、概念。输出条目，每条一行。\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
      itemExtract: '你是物品记录员。请基于「最近对话」，抽取本段出现的「具体物品/道具/信物/装备」：名称、描述、当前持有者。每行一条，格式：物品名｜描述｜持有者。\n\n【最近对话】\n{{recent}}',
    },
  };

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      const s = Object.assign({}, DEFAULTS, JSON.parse(raw));
      // 迁移：旧的 5 份独立 llmProfiles 或旧的 summary* 默认配置 → 单一 llmConfig
      if (!s.llmConfig) {
        s.llmConfig = { source: 'local', proxyPreset: '', apiUrl: '', apiKey: '', model: '' };
        const profiles = s.llmProfiles;
        if (profiles && profiles.summary) {
          // 取 summary 那份作为统一配置
          s.llmConfig = Object.assign(s.llmConfig, profiles.summary);
        } else if (s.summaryBaseUrl || s.summaryApiKey || s.summaryModel) {
          // 旧默认自定义配置迁移
          s.llmConfig = {
            source: (s.summaryBaseUrl || s.summaryApiKey) ? 'custom' : 'local',
            proxyPreset: '',
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
