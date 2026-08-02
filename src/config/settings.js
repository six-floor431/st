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
    // 总结时剔除「标签包裹」的内容，规则可自定义，每条规则可同时启用多重形态（多重存在）：
    // wrap=true        => 成对/相同包裹删中间（需 close）
    // singleBefore=true => 残缺单标签「删标签之前、留之后」
    // singleAfter=true  => 残缺单标签「删标签之后、留之前」
    tagStripRules: [
      { name: 'think', open: '<think>', close: '</think>', wrap: true, singleBefore: true, singleAfter: false, enabled: true },
    ],
    worldToLorebook: true,        // 是否把世界观/总结/物品/关系拆分写入世界书条目（默认开启，实现条目隔离）
    // 各功能的独立 LLM 配置（不挤在一起）：每个功能可单独选择
    //   source: 'local'  => 用酒馆当前源（shared-api），无需额外配置
    //   source: 'custom' => 用 custom_api 切换：优先填「代理预设名」(proxyPreset)，
    //                       否则填 apiUrl/apiKey/model 直连（全部交给酒馆 generate 处理，
    //                       不再自造 fetch，以复用酒馆的源管理/模型列表/流式等能力）
    // 把"默认自定义配置"（summaryBaseUrl/summaryApiKey/summaryModel）作为各 custom 的初始值，
    // 用户可在设置里为每个功能单独覆盖。
    llmProfiles: {
      summary:   { source: 'local', proxyPreset: '', apiUrl: '', apiKey: '', model: '' },
      relations: { source: 'local', proxyPreset: '', apiUrl: '', apiKey: '', model: '' },
      plot:      { source: 'local', proxyPreset: '', apiUrl: '', apiKey: '', model: '' },
      world:     { source: 'local', proxyPreset: '', apiUrl: '', apiKey: '', model: '' },
      items:     { source: 'local', proxyPreset: '', apiUrl: '', apiKey: '', model: '' },
    },
    lorebookName: 'WarmMemo',     // 世界书名（可自定义；绑定到当前角色卡实现数据隔离）
    // 接管酒馆内置向量与重排序（开启后用我们自己的 VectorStore + Rerank 召回世界书条目）
    takeoverEmbedding: false,     // 接管向量检索：开启后注入用我们自己的 embedding 相似度召回
    takeoverRerank: false,        // 接管重排序：开启后对世界书召回结果做 rerank 重排
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
