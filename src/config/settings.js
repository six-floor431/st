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
      deepThinking: false, // 深度思考开关：开启后按模型自适应注入深度思考参数（见 LLMClient）
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
    //   {{recent}} 最近对话   {{historySummary}} 历史总结   {{relations}} 关系   {{plot}} 剧情线
    // 注：世界观走独立推断函数（inferWorldview），不通过模板占位符注入。
    prompts: {
      summary: '你是一位网文/轻小说作家。请把【最近对话】中发生的事情写成一段「纯叙事风格的章节片段」。\n\n输出要求：像写一章网文或轻小说那样——有场景、有动作、有对话、有情绪氛围。直接写故事本身，不要任何元描述、不要任何总结性措辞。\n\n【绝对禁止（出现即判定为无效输出）】\n1. 🛑 严禁使用以下词汇及其变体：总结、梳理、概括、归纳、回顾、记录、时间线、时间顺序、按时间、状态标记、供后续参考、核心事件、关键信息、要点、摘要、概述、概要、简述、备注、注记、梳理如下、整理如下、汇总如下、分析如下、描述如下、说明如下。\n2. 🛑 严禁在正文前加任何引导语/声明句（如"以下是…""根据对话…""用户让我…"）。直接从故事内容开始写。\n3. 🛑 严禁编造对话中没有的情节、人物、地点、物品或后续发展。\n4. 🛑 严禁主观臆断与心理分析（如"A对B有占有欲""两人气氛暧昧"），只写客观发生的行为和对话。\n5. 🛑 严禁输出分析评论当叙事（如"这表明…""这暗示着…"）。\n6. 🛑 严禁用"第一/第二/第三/首先/其次/最后"等序号词罗列事件——要连贯的叙事流，不是列表。\n\n【正确示例（这就是你要的输出风格）】\n黄昏的图书馆里，林清玄翻到借书卡背面那一栏，指尖停在一个名字上很久。"原来你也看过这本。"身后传来温如玉的声音，她手里提着两杯还冒热气的奶茶。\n\n【错误示例（以下全部禁止，严禁输出）】\n✗ 根据对话内容，总结如下：三个徒弟……（使用了"总结""根据"等禁词）\n✗ 时间线梳理如下：（含状态标记，供后续参考）：（这是指令回显，不是叙事）\n✗ 按时间顺序，核心事件包括：林清玄与温如玉……（用了"时间顺序""核心事件"等禁词）\n✗ 第一，林清玄去了仙尊殿；第二，温如玉追了出去。（序号罗列，不是叙事）\n\n【最近对话】\n{{recent}}',
      relations: '你是关系图谱构建器。你的唯一任务：从对话中提取「人物之间的直接关系」。\n\n【最高级禁令（违反则输出无效）】\n1. 🛑 每行只能是一个「三元组」，格式严格为：人物A → 人物B：关系词\n2. 🛑 「关系词」必须是 2-6 个字的简短标签，如：恋人、师徒、敌对、暗恋、主仆、同伴、竞争者\n3. 🛑 绝对禁止输出分析句、描述句、长句子，绝对禁止任何「对...有...感」「存在潜在...」「某种...纠葛」这类主观推断。\n4. 🛑 只提取**两个具体人物之间、且有明确互动**的关系。不提取「对用户的感受」「与...存在...」这种单向分析（这类不是关系，必须丢弃）。\n5. 如果两个人之间没有明确互动关系，就不要写。宁缺毋滥。\n6. 最多 8 条。\n\n【正确示例】\n小明 → 小红：恋人\n小红 → 小刚：敌对\n【错误示例（全部禁止，严禁输出）】\n✗ 小明对用户有依赖感（这是分析，不是关系）\n✗ 李华与张伟之间存在潜在冲突（描述句）\n✗ 张伟对用户才具有依赖感（单向分析）\n✗ A对B有某种复杂的情感纠葛（主观推断）\n\n【历史总结】\n{{historySummary}}\n\n【最近对话】\n{{recent}}',
      plot: '你是一位轻小说剧情编辑。请基于「关系」和「最近对话」，提取这一段发生的**剧情事件**。\n\n每行一条，严格用竖线分隔，格式：\n时间｜标题｜事件叙述｜状态\n\n【绝对禁止（出现即判定为无效输出）】\n1. 🛑 严禁在输出前加任何引导语/声明句/格式说明（如"时间线梳理如下""剧情事件如下""按时间顺序""含状态标记""供后续参考""以下是…"）。直接从第一条事件开始写。\n2. 🛑 严禁使用以下词汇及其变体：时间线、梳理、整理、汇总、概括、归纳、回顾、记录、核心事件、关键信息、要点、摘要、概述、状态标记、供后续参考、分析如下、描述如下、说明如下。\n3. 🛑 严格只记录【最近对话】中真实发生的剧情事件。严禁编造未发生的情节，严禁加入无关内容（世界观说明、人物背景闲笔）。\n4. 🛑 严禁输出分析评论（如"这表明…""这暗示着…"）或心理推测——只写发生了什么客观事件。\n5. 🛑 每行的「事件叙述」要有画面感（人物动作+场景），不要写干巴巴的"双方进行了讨论"。\n\n写作要求（像轻小说章节大纲）：\n- 标题：给这段剧情起一个有画面感的短标题（如「雨夜的告白」「剑锋相对的瞬间」），不超过 12 字\n- 事件叙述：用 1-2 句话描述发生了什么（有人物动作、场景变化、关键转折），要有画面感\n- 时间：剧情内的时间点（如「第三日清晨」）。未提及则写「未标注」\n- 状态：只能填 进行中 / 已完结 / 已废弃 三者之一\n\n【正确示例】\n第三日清晨｜雨夜的告白｜小明在屋檐下把星空画册递给小红，说「这本该和你一起看」｜已完结\n【错误示例（全部禁止，严禁输出）】\n✗ 时间线梳理如下（含状态标记，供后续参考）：（这是指令回显，不是事件列表）\n✗ 未标注｜氛围紧张｜两人之间的气氛变得微妙而充满张力（这是分析，不是事件）｜进行中\n\n不要输出表头、编号、额外说明。最多 8 条。\n\n【关系】\n{{relations}}\n\n【最近对话】\n{{recent}}',
      worldview: '你是世界观提炼者。请基于【剧情线】【最近对话】，提炼这个故事所处世界本身的「底层规则设定」。\n\n【最高级禁令（违反则输出无效）】\n1. 🛑 「世界设定」只写世界本身的通用规则、法则、历史背景、力量体系，**绝不写**单个具体物品、单个具体角色姓名、单个具体地点名称、单次具体事件。\n2. 🛑 只提炼能从剧情中归纳出的、可复用的世界运行规律。严禁把某一段剧情、某一个人、某一个地点当成「设定」写进来。\n3. 🛑 严禁编造与剧情毫无关联的宏大设定；设定必须能从【剧情线】【最近对话】中找到依据或合理延伸。\n\n严格按以下格式输出，不要添加任何多余说明：\n\n世界名：（这个世界/大陆/城市叫什么，没有就起一个贴切的）\n世界类型：（用一个词概括，如：修仙世界、赛博朋克、蒸汽朋克、现代都市、剑与魔法）\n简述：（一到两句话说明这是个什么样的世界）\n\n## 设定标题一\n（围绕"世界类型"展开的具体规则与法则。例如修仙世界就写修炼体系的境界划分、灵气运行法则；赛博朋克就写义体改造规则、企业与财阀的运行法则）\n\n## 设定标题二\n（内容）\n\n要求：\n1. 「世界类型」决定了下面写什么。修仙世界就必须写修炼体系、灵气、法则等，不要写无关内容。\n2. 每条设定要具体、可被后续剧情引用，不要空泛。\n3. 输出 3-6 条设定条目。\n\n【正确示例】\n## 灵气运行法则\n灵气自子夜起最为充盈，修者需在此时吐纳方能进阶。\n【错误示例（严禁）】\n## 小明的身世\n小明是孤儿，幼年被送至宗门。（这是角色，不是世界设定）\n## 落霞镇\n落霞镇位于大陆东陲。（这是地点，不是世界设定）\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
      itemExtract: '你是物品记录员。物品必须与「角色」和「剧情」产生关联，孤立的普通道具、消耗品、环境杂物不要记录。\n\n请基于【最近对话】，抽取本段出现的具有剧情意义的物品/道具/信物/装备。\n\n【最高级禁令（违反则输出无效）】\n1. 🛑 只记录【最近对话】中真实出现、且满足条件的物品。严禁编造对话里没有的物品。\n2. 🛑 只记录与角色或剧情产生关联的物品，不记录无关的日常杂物。\n3. 🛑 持有者必须是对话/剧情中出现过的角色名，不可凭空捏造；不明时写「未知」。\n\n每行一条，严格用竖线分隔，格式：\n物品名｜作用｜持有者｜关联剧情｜来历\n\n说明：\n- 物品名：物品的名称。\n- 作用：这件物品有什么用途、效果或象征意义（必填，不可写「无」）。\n- 持有者：现在在哪个角色手上。必须是【剧情线】或对话中出现过的角色名；确实不明写「未知」。\n- 关联剧情：这件物品牵涉到哪条剧情线，请从下面【已知剧情线】的标题中挑选，可多个用顿号分隔；都不沾边写「无」。\n- 来历：从哪里获得的，不明写「未知」。\n\n判断标准：只记录满足以下任一条件的物品——\n(a) 被某个角色明确持有或争夺；\n(b) 推动了某条剧情线的发展；\n(c) 是角色关系或身份的信物。\n\n不要输出表头，不要编号，不要额外说明。最多 8 条。\n\n【已知剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
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
