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
    promptsVersion: 3,             // 提示词结构/内容版本。每次大改提示词 +1；低于此版本时自动覆盖用户已保存的旧提示词（保留其它设置）。
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

      summary: '你是一位网文写手。把【最近对话】写成一段「纯叙事风格的章节片段」——像直接从网文/轻小说里摘出来的一页。\n\n【输出格式（必须严格遵守）】\n你的全部输出必须用以下符号包裹，不要输出符号外的任何内容：\n<<<SUMMARY_START>>>\n（这里写你的叙事正文）\n<<<SUMMARY_END>>>\n\n【写作原则（违反任意一条即判定无效）】\n1. 🛑 只写已经发生的事实：人物、时间、地点、动作、关键对话内容、结果。不写猜测、评价、气氛渲染、心理分析。\n2. 🛑 只记录与【已登场角色】直接相关、且对剧情推进有实际作用的内容；与角色无关的闲聊、环境描写、路人甲乙的无关举动一律丢弃。\n3. 🛑 严禁使用以下词汇：总结、梳理、概括、归纳、回顾、记录、时间线、时间顺序、按时间、状态标记、供后续参考、核心事件、关键信息、要点、摘要、概述、概要、简述、备注、注记、梳理如下、整理如下、汇总如下、分析如下、描述如下、说明如下。\n4. 🛑 严禁主观臆断与心理分析（如"A对B有占有欲""两人气氛暧昧""存在某种张力"），只写客观行为和对话。\n5. 🛑 严禁用"第一/第二/第三/首先/其次/最后"或数字编号(1. 2. 3.)罗列事件——要连贯的叙事流。\n6. 🛑 严禁在 <<<SUMMARY_START>>> 前加任何引导语/声明句（如"以下是…""根据对话…""用户让我…"），直接从故事内容起笔。\n7. 🛑 严禁编造对话中没有的情节、人物、地点、物品或后续发展。\n8. 🛑 输出必须是纯散文叙事段落，不是列表、不是大纲、不是摘要。要有画面感，像小说的一页。\n\n【正确示例】\n<<<SUMMARY_START>>>\n黄昏的图书馆里，林清玄翻到借书卡背面那一栏，指尖停在一个名字上很久。"原来你也看过这本。"身后传来温如玉的声音，她手里提着两杯还冒热气的奶茶。\n<<<SUMMARY_END>>>\n\n【错误示例（全部禁止）】\n✗ <<<SUMMARY_START>>>\\n## 对话总结 ##\\n核心事件\\n1.**林清玄**...2.**温如玉**...\\n<<<SUMMARY_END>>> （编号列表+禁词，不是叙事）\n✗ <<<SUMMARY_START>>>\\n根据对话内容，总结如下：……\\n<<<SUMMARY_END>>> （用了"总结""根据"等禁词）\n✗ <<<SUMMARY_START>>>\\n两人之间的气氛变得微妙而充满张力，似乎暗生情愫。\\n<<<SUMMARY_END>>> （心理分析+环境渲染）\n\n【最近对话】\n{{recent}}',

      relations: '你是关系图谱构建器。唯一任务：从对话中提取【已登场角色之间】的「直接关系」。\n\n【输出格式（必须严格遵守）】\n你的全部输出必须用以下符号包裹：\n<<<RELATIONS_START>>>\n（每行一个三元组）\n<<<RELATIONS_END>>>\n\n【写作原则（违反即无效）】\n1. 🛑 每行只能是一个「三元组」，格式：人物A → 人物B：关系词\n2. 🛑 关系词必须是 2-6 字的简短客观标签（恋人、师徒、敌对、暗恋、主仆、同伴、竞争者）。\n3. 🛑 绝对禁止分析句/描述句/长句，禁止「对...有...感」「存在潜在...」「某种...纠葛」「占有欲」「暧昧」「张力」。\n4. 🛑 只提取两个具体已登场角色之间有明确互动的关系。不提取单向分析。\n5. 🛑 无真实互动则不写。宁缺毋滥。最多 8 条。\n6. 🛑 <<<RELATIONS_START>>> 前后不要任何引导语/说明。\n\n【正确示例】\n<<<RELATIONS_START>>>\n小明 → 小红：恋人\n小红 → 小刚：敌对\n<<<RELATIONS_END>>>\n\n【错误示例（全部禁止）】\n✗ 小明对用户有依赖感（分析，非关系）\n✗ 李华与张伟之间存在潜在冲突（描述句）\n\n【最近对话】\n{{recent}}',

      plot: '你是剧情编辑。基于【已有剧情线】和【最近对话】，继续推进故事的**剧情事件**。\n\n你是「自我推进」的：从【已有剧情线】读取上文，顺着它把【最近对话】新发生的事写成新事件；旧线有延续/收尾就补新事件（不改旧线，只新增）。\n\n【输出格式（必须严格遵守）】\n你的全部输出必须用以下符号包裹：\n<<<PLOT_START>>>\n（每行一条，竖线分隔）\n<<<PLOT_END>>>\n\n每行格式：时间｜标题｜事件叙述\n- 标题：有画面的短标题（如「雨夜的告白」），不超过 12 字\n- 事件叙述：1-2 句描述发生了什么（人物动作+场景+关键转折），有画面感\n- 时间：剧情内时间点，未提及写「未标注」\n\n【写作原则（违反即无效）】\n1. 🛑 只记录已登场角色真实发生、推动剧情的事件。丢弃无关闲笔/环境描写/心理揣测。\n2. 🛑 严禁分析评论（"这表明…""这暗示着…"）或心理推测/气氛渲染——只写客观事件。\n3. 🛑 <<<PLOT_START>>> 前不要引导语/声明句/格式说明，直接从第一条事件起写。\n4. 🛑 严禁词汇：时间线、梳理、整理、汇总、概括、归纳、回顾、记录、核心事件、关键信息、要点、摘要、概述、状态标记、进行中、已完结、已废弃、供后续参考、分析如下、描述如下、说明如下。\n5. 🛑 严禁输出状态/标签字样（不写 进行中/已完结/已废弃）。\n6. 🛑 不要表头、编号、额外说明。最多 8 条。\n\n【正确示例】\n<<<PLOT_START>>>\n第三日清晨｜雨夜的告白｜小明在屋檐下把星空画册递给小红，说「这本该和你一起看」\n<<<PLOT_END>>>\n\n【错误示例（全部禁止）】\n✗ <<<PLOT_START>>>\\n时间线梳理如下（含状态标记，供后续参考）：\\n<<<PLOT_END>>> （指令回显）\n✗ <<<PLOT_START>>>\\n未标注｜氛围紧张｜两人之间的气氛变得微妙而充满张力\\n<<<PLOT_END>>> （分析+渲染，非事件）\n\n【已有剧情线】\n{{historyPlot}}\n\n【关系】\n{{relations}}\n\n【最近对话】\n{{recent}}',

      worldview: '你是世界观提炼者。基于【剧情线】【最近对话】，提炼这个世界本身的「底层规则设定」。\n\n【输出格式（必须严格遵守）】\n你的全部输出必须用以下符号包裹：\n<<<WORLD_START>>>\n（世界设定内容）\n<<<WORLD_END>>>\n\n严格按以下格式输出：\n世界名：（名称）\n世界类型：（修仙世界 / 赛博朋克 / 蒸汽朋克 / 现代都市 / 剑与魔法 …）\n简述：（1-2 句话说明这是个什么样的世界）\n\n## 设定标题一\n（具体规则与法则）\n\n## 设定标题二\n（内容）\n...\n\n【写作原则（违反即无效）】\n1. 🛑 只写世界本身的通用规则、法则、历史背景、力量体系。\n2. 🛑 **绝对禁止写出单个具体物品**（如捆仙绳、印信、药囊、剑、玉佩等道具/装备/信物/消耗品——这些属于「物品」，不是世界观设定）。\n3. 🛑 **绝对禁止写出单个具体角色姓名**作为设定条目（如"林清玄的身世"——这是角色，不是世界设定）。\n4. 🛑 **绝对禁止写出单个具体地点名称**作为设定条目（如"落霞镇位于大陆东陲"——这是地点，不是世界设定）。\n5. 🛑 只提炼可复用的世界运行规律。不写单次具体事件。\n6. 🛑 严禁编造与剧情无关的宏大设定；必须有依据。\n7. 🛑 严禁心理/气氛类抽象词当设定。\n8. 🛑 输出 3-6 条设定条目。\n9. 🛑 <<<WORLD_START>>> 前后不要任何引导语。\n\n【正确示例】\n<<<WORLD_START>>>\n世界名：青云界\n世界类型：修仙世界\n简述：一个以灵气修炼为核心的世界，宗门林立，弱肉强食。\n\n## 灵气运行法则\n灵气自子夜起最为充盈，修者需在此时吐纳方能进阶。\n\n## 封印契约体系\n仙家封印需以丹药与阵法配合；师尊定约「一天一次，一次一人」。\n<<<WORLD_END>>>\n\n【错误示例（全部禁止）】\n✗ 物品：捆仙绳（灵纹细素，缚仙封元，可松可紧）（这是物品！不是世界观！）\n✗ ## 林清玄的短剑（这是具体角色的具体物品！）\n✗ 地点：青云端，仙魔同源之主林晏的道场（这是地点，不是世界规则）\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',

      itemExtract: '你是物品记录员。只记录与【已登场角色】和【剧情】有关联意义的物品/道具/信物/装备。\n\n【输出格式（必须严格遵守）】\n你的全部输出必须用以下符号包裹：\n<<<ITEMS_START>>>\n（每行一条，竖线分隔）\n<<<ITEMS_END>>>\n\n每行格式：物品名｜作用｜持有者｜关联剧情｜来历\n- 作用：用途/效果/象征意义（必填，不可写"无"）\n- 持有者：当前持有者角色名（对话中出现过的）；不明写「未知」\n- 关联剧情：从【已知剧情线】标题中挑选，多则顿号隔；都不沾边写「无」\n- 来历：哪里获得的；不明写「未知」\n\n【写作原则（违反即无效）】\n1. 🛑 只记录【最近对话】真实出现且满足条件的物品。严禁编造，严禁把环境描写的物件当物品。\n2. 🛑 只记录与角色或剧情有关联的物品。不记录日常杂物。\n3. 🛑 持有者必须是对话/剧情中出现过的角色名。\n4. 🛑 判断标准：(a)被某角色明确持有/争夺 (b)推动剧情线发展 (c)是角色关系/身份的信物。\n5. 🛑 不要表头、编号、额外说明。最多 8 条。\n6. 🛑 <<<ITEMS_START>>> 前后不要引导语。\n\n【正确示例】\n<<<ITEMS_START>>>\n捆仙绳｜束缚灵力之物，缚仙封元，可松可紧｜林清玄｜雨夜的告白｜师尊所赐\n师尊青玉印信｜宗门权限信物，藏于书案锦盒｜林晏｜无｜传承信物\n<<<ITEMS_END>>>\n\n【已知剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
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
      const savedPromptVer = parsed.promptsVersion || 0;
      if (savedPromptVer < DEFAULTS.promptsVersion) {
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
