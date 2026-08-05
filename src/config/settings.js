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

      summary: '你是网文写手。把【最近对话】改写成一段小说正文式的叙事片段。\n\n【输出格式（唯一允许的形态）】\n<<<SUMMARY_START>>>\n（叙事正文，2-5 个自然段，纯散文）\n<<<SUMMARY_END>>>\n\n除了这三行结构外，一个字都不许多写：不写标题、不写前言、不写解释、不写"以下是…"、不写你打算怎么写、不写任何对规则的复述。直接从故事第一句起笔。\n\n【正文怎么写】\n- 只写对话里真实发生过的：谁、在哪、做了什么、说了什么、结果如何。\n- 节奏快，动作和对白推进，不铺陈景物、不写心理分析、不写气氛评价。\n- 对白直接引用或压缩其内容，不描述语气声线。\n- 连贯散文，不用编号、不用小标题、不用列表、不用加粗符号。\n- 不编造对话里没有的人物、地点、物品和后续。\n\n【正确示例】\n<<<SUMMARY_START>>>\n黄昏图书馆，林清玄翻到借书卡背面那个名字，指尖停了好一会儿。"原来你也看过这本。"温如玉把两杯奶茶往桌上一搁，热气直往脸上扑。\n<<<SUMMARY_END>>>\n\n【错误示例】\n✗ 好的，以下是这段对话的总结：…（多余开场白）\n✗ ## 剧情梳理 ##（标题）\n✗ 1. 林清玄… 2. 温如玉…（编号列表）\n✗ 我需要把对话压缩成叙事，注意不能出现禁词…（复述规则）\n✗ 两人气氛微妙，似乎暗生情愫。（心理分析）\n\n【最近对话】\n{{recent}}',

      relations: '你是关系图谱构建器。唯一任务：从对话中提取【已登场角色之间】的「直接关系」。\n\n【输出格式（必须严格遵守）】\n你的全部输出必须用以下符号包裹：\n<<<RELATIONS_START>>>\n（每行一个三元组）\n<<<RELATIONS_END>>>\n\n【写作原则（违反即无效）】\n1. 🛑 每行只能是一个「三元组」，格式：人物A → 人物B：关系词\n2. 🛑 关系词必须是 2-6 字的简短客观标签（恋人、师徒、敌对、暗恋、主仆、同伴、竞争者）。\n3. 🛑 绝对禁止分析句/描述句/长句，禁止「对...有...感」「存在潜在...」「某种...纠葛」「占有欲」「暧昧」「张力」。\n4. 🛑 只提取两个具体已登场角色之间有明确互动的关系。不提取单向分析。\n5. 🛑 无真实互动则不写。宁缺毋滥。最多 8 条。\n6. 🛑 <<<RELATIONS_START>>> 前后不要任何引导语/说明。\n\n【正确示例】\n<<<RELATIONS_START>>>\n小明 → 小红：恋人\n小红 → 小刚：敌对\n<<<RELATIONS_END>>>\n\n【错误示例（全部禁止）】\n✗ 小明对用户有依赖感（分析，非关系）\n✗ 李华与张伟之间存在潜在冲突（描述句）\n\n【最近对话】\n{{recent}}',

      plot: '你是剧情编辑。基于【已有剧情线】和【最近对话】，继续推进故事的**剧情事件**。\n\n你是「自我推进」的：从【已有剧情线】读取上文，顺着它把【最近对话】新发生的事写成新事件；旧线有延续/收尾就补新事件（不改旧线，只新增）。\n\n【输出格式（必须严格遵守）】\n你的全部输出必须用以下符号包裹：\n<<<PLOT_START>>>\n（每行一条，竖线分隔）\n<<<PLOT_END>>>\n\n每行格式：时间｜标题｜事件叙述\n- 标题：有画面的短标题（如「雨夜的告白」），不超过 12 字\n- 事件叙述：1-2 句描述发生了什么（人物动作+场景+关键转折），有画面感\n- 时间：剧情内时间点，未提及写「未标注」\n\n【写作原则（违反即无效）】\n1. 🛑 只记录已登场角色真实发生、推动剧情的事件。丢弃无关闲笔/环境描写/心理揣测。\n2. 🛑 严禁分析评论（"这表明…""这暗示着…"）或心理推测/气氛渲染——只写客观事件。\n3. 🛑 <<<PLOT_START>>> 前不要引导语/声明句/格式说明，直接从第一条事件起写。\n4. 🛑 严禁词汇：时间线、梳理、整理、汇总、概括、归纳、回顾、记录、核心事件、关键信息、要点、摘要、概述、状态标记、进行中、已完结、已废弃、供后续参考、分析如下、描述如下、说明如下。\n5. 🛑 严禁输出状态/标签字样（不写 进行中/已完结/已废弃）。\n6. 🛑 不要表头、编号、额外说明。最多 8 条。\n\n【正确示例】\n<<<PLOT_START>>>\n第三日清晨｜雨夜的告白｜小明在屋檐下把星空画册递给小红，说「这本该和你一起看」\n<<<PLOT_END>>>\n\n【错误示例（全部禁止）】\n✗ <<<PLOT_START>>>\\n时间线梳理如下（含状态标记，供后续参考）：\\n<<<PLOT_END>>> （指令回显）\n✗ <<<PLOT_START>>>\\n未标注｜氛围紧张｜两人之间的气氛变得微妙而充满张力\\n<<<PLOT_END>>> （分析+渲染，非事件）\n\n【已有剧情线】\n{{historyPlot}}\n\n【关系】\n{{relations}}\n\n【最近对话】\n{{recent}}',

      worldview: '你是世界观提炼者。基于【剧情线】【最近对话】，提炼这个世界本身的「底层规则设定」。\n\n【输出格式（必须严格遵守，对齐物品的结构化风格）】\n你的全部输出必须用以下符号包裹：\n<<<WORLD_START>>>\n（以下内容）\n<<<WORLD_END>>>\n\n输出结构（顶部三行固定，下面每条设定用 ■ 起头、标题与内容用单个｜分隔）：\n世界名：xxx\n世界类型：xxx（修仙世界 / 赛博朋克 / 蒸汽朋克 / 现代都市 / 剑与魔法 …）\n简述：xxx（1-2 句说明这是什么世界）\n■设定标题一｜设定内容（具体规则与法则，一句话）\n■设定标题二｜设定内容\n■设定标题三｜设定内容\n\n【写作原则（违反即无效）】\n1. 🛑 顶部三行（世界名/类型/简述）必须严格用「键：值」格式，单独成行。\n2. 🛑 每条设定单独一行，以 ■ 起头，标题与内容之间【只用单个｜分隔】，内容里不得再出现｜。\n3. 🛑 只写世界本身的通用规则、法则、历史背景、力量体系。\n4. 🛑 **绝对禁止写出单个具体物品**（如捆仙绳、印信、药囊、剑、玉佩等道具/装备/信物/消耗品——这些属于「物品」，不是世界观设定）。\n5. 🛑 **绝对禁止写出单个具体角色姓名**作为设定条目（如"林清玄的身世"——这是角色，不是世界设定）。\n6. 🛑 **绝对禁止写出单个具体地点名称**作为设定条目（如"落霞镇位于大陆东陲"——这是地点，不是世界设定）。\n7. 🛑 只提炼可复用的世界运行规律。不写单次具体事件。\n8. 🛑 严禁编造与剧情无关的宏大设定；必须有依据。\n9. 🛑 严禁心理/气氛类抽象词当设定。\n10. 🛑 输出 3-6 条设定条目。\n11. 🛑 <<<WORLD_START>>> 前后不要任何引导语。\n\n【正确示例】\n<<<WORLD_START>>>\n世界名：青云界\n世界类型：修仙世界\n简述：一个以灵气修炼为核心的世界，宗门林立，弱肉强食。\n■灵气运行法则｜灵气自子夜起最为充盈，修者需在此时吐纳方能进阶\n■封印契约体系｜仙家封印需以丹药与阵法配合；师尊定约「一天一次，一次一人」\n■宗门等级｜弟子、长老、宗主三级，按修为论资排辈\n<<<WORLD_END>>>\n\n【错误示例（全部禁止）】\n✗ ## 物品：捆仙绳（灵纹细素，缚仙封元）（这是物品！不是世界观！）\n✗ ## 林清玄的短剑（这是具体角色的具体物品！）\n✗ 地点：青云端，仙魔同源之主林晏的道场（这是地点，不是世界规则）\n✗ 灵气法则：灵气自子夜起最为充盈（没用 ■ 起头、用冒号连写）\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',

      itemExtract: '你是物品记录员。只记录与【已登场角色】和【剧情】有关联意义的物品/道具/信物/装备。\n\n【输出格式（必须严格遵守）】\n你的全部输出必须用以下符号包裹：\n<<<ITEMS_START>>>\n（每行一条，用单个「｜」分隔五个字段，字段内不得再出现「｜」）\n<<<ITEMS_END>>>\n\n每行格式（五个字段，严格用｜分隔）：\n物品名｜作用｜持有者｜关联剧情｜来历\n\n【字段填写铁律（违反即判定无效）】\n1. 🛑 「物品名」字段【只写物品的名字本身】，绝不可把作用、持有者、剧情、来历塞进名字里！\n   ✗ 错误：捆仙绳：束缚修士之物，用于捆住师尊林晏。持有者：由林清玄使用……（名字被撑爆）\n   ✓ 正确：捆仙绳\n2. 🛑 五个字段之间【只用单个｜分隔】。禁止用冒号「：」把多个信息连写在同一字段里。\n3. 🛑 作用：用途/效果/象征意义（必填，不可写"无"），简短一句话。\n4. 🛑 持有者：写【当前最终状态】下的持有者角色名。若中途易主，只写现在谁拿着，不要写"最初…后来…"。例：桃夭（当前系在腕上）。\n5. 🛑 关联剧情：从【已知剧情线】标题里挑，多则顿号隔；都不沾边写「无」。\n6. 🛑 来历：哪里获得的，简短；不明写「未知」。\n7. 🛑 不要表头、编号、额外说明。最多 8 条。\n8. 🛑 <<<ITEMS_START>>> 前后不要引导语。\n\n【正确示例】\n<<<ITEMS_START>>>\n捆仙绳｜束缚灵力、限制行动的仙家法器，可松可紧｜桃夭（当前半截系于腕上）｜雨夜的告白｜师尊所赐\n师尊青玉印信｜宗门权限信物，藏于书案锦盒｜林晏｜无｜传承信物\n<<<ITEMS_END>>>\n\n【错误示例（全部禁止）】\n✗ 捆仙绳：束缚修士之物，用于捆住师尊林晏。持有者：由林清玄等弟子使用……（名字字段塞了整段描述）\n✗ 捆仙绳｜束缚：林清玄使用｜后来桃夭也系：整个软禁剧情（用冒号连写，字段未拆分）\n\n【已知剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
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
