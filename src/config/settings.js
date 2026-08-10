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
    embeddingBaseUrl: '',           // 任意 Base URL：如 http://127.0.0.1:11434、https://api.siliconflow.cn/v1、https://xxx.openai.azure.com
    embeddingApiKey: '',
    embeddingModel: 'text-embedding-3-small',
    // 向量同源代理（外网访问本地向量服务的关键）：
    //   本地访问酒馆（端口 8000/8001）→ 直连用户填的原始地址（浏览器和 Ollama 同机，通）
    //   外网访问酒馆（穿透域名/公网）→ 自动把原始地址改写成「页面源 + 代理路径 + 原 path」的同源 URL
    //   例：填 http://127.0.0.1:11434/v1/embeddings，外网时自动改成 https://你的域名/vec/v1/embeddings
    //   需配合 Caddy/反代把 /vec/* 转发到本地 Ollama（见「同源代理」Caddyfile）。
    vecProxyEnabled: true,          // 默认开：本地自动跳过（无害），外网自动改写
    vecProxyPath: '/vec',           // 反代的向量分流路径，与 Caddyfile 的 handle_path /vec/* 对齐
    // 重排序(Rerank)同样支持外网同源代理（复用同一套场景判断，路径独立配置）
    rerankProxyPath: '/rerank',
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
    promptsVersion: 14,            // v14：输出格式从 JSON 转为 <标签>+纯文本。summary/relations/plot/items 四契约改为 <Summary>/<Relations>/<Plots>/<Items> 标签包裹 + | 分隔字段，彻底避开 JSON 语法负担（字符串换行/中文标点/字段名/短输出误杀四类坑在纯文本方案里不存在）。worldview 按约定不动仍 JSON。解析层 extractTag 提取标签内容 + 按行按|分割；normalizeJSONString/parseJSON 保留给 world。callLLM 的 minLen 加 hasTag 放行。低于此版本自动覆盖用户旧提示词。
    prompts: {
      // ═══════════════════════════════════════════
      // 输出契约（v8 统一约定）：
      //   每个任务只输出纯 JSON，由 parseJSON 解析 + isJunkText 逐字段过滤。
      //   提示词不列禁词清单（v5 教训：禁词明文入提示词，模型反而回显）。
      //   字段名与长度上限与 summary.js 解析层逐一对齐。
      //   宁缺毋滥：没有内容就输出空数组/空串，不编造、不填占位语。
      // ═══════════════════════════════════════════

      summary: '你是记忆记录员，不是小说家。任务：把【最近对话】里真正发生过的事，如实搬运成一段第三人称叙事，存入记忆库。\n\n记录规范：\n- 只搬运已发生的动作、事件、对话结果。你是记录员不是创作者——不写心理（如「心中一紧」「暗自思忖」），不渲染气氛（如「气氛凝重」「空气暧昧」），不评论、不预测。\n- 对话最多保留一句最关键的台词原文，其余以「谁对谁说了什么」转述。\n- 一到四个自然段，按事件先后组织。内容少就少写，一段也行；没有实质进展就直接输出空标签。\n- 与【已有记忆】重复的内容一笔带过或略去，只写新进展。\n- 没有新内容可记录时，标签内留空。这是完全正常的，不要为了凑内容而编造或扩写。\n\n输出契约：把叙事正文放在 <Summary> 和 </Summary> 之间。标签之外的所有文字都会被程序丢弃，不要在标签外写任何内容。正文内可以正常换行、使用中文标点，不需要任何转义。格式：\n<Summary>\n叙事正文，可以多段，正常换行。\n</Summary>\n没有新内容时输出：\n<Summary></Summary>\n\n【已有记忆】\n{{historySummary}}\n\n【最近对话】\n{{recent}}',

      relations: '你是关系记录员。任务：从【最近对话】中提取已登场角色之间明确存在的关系，存入关系图。\n\n记录规范：\n- 只记录有对话或行动依据的关系。仅因对话提到某人名字不构成关系——需有互动、称谓或明确表述。没有依据不提取，不推测。\n- from、to 优先用角色的主名（如师父名「云清子」，统一用「云清子」，不要一会儿「师尊」一会儿「云清子」造成重复节点），2-8字。\n- label 只能是2-6字的关系名词，不能是句子或描述（√「师徒」「敌对」「合作」「主仆」，×「互相欣赏」「有过冲突」「关系密切」）。\n- 同一对角色只输出一条最主要的关系。\n- 没有任何明确关系时，标签内留空。宁缺毋滥，不编造。\n\n输出契约：每条关系占一行，字段用 | 分隔（from|to|label）。把所有关系放在 <Relations> 和 </Relations> 之间。标签之外的所有文字都会被程序丢弃。字段内不要使用 | 符号。格式：\n<Relations>\n角色A|角色B|师徒\n角色C|角色D|敌对\n</Relations>\n没有关系时输出：\n<Relations></Relations>\n\n【最近对话】\n{{recent}}',

      plot: '你是剧情记录员。任务：从【最近对话】中提取本段新发生的剧情事件，存入剧情线。\n\n记录规范：\n- 只输出本段对话里【新发生】的事。【已有剧情线】仅供你避免重复——其中的条目一律不再输出，哪怕它很重要。\n- 没有新事件就输出空标签，不要编造。宁缺毋滥。\n- time：剧情内时间点（如「第一天」「午后」），对话未提及则留空。不要写"未提及""未知"这类话。\n- title：2-12字的短标题，名词加动词概括（√「丹房初遇」「突破境界」，×「林晚在丹房遇到师尊」）。不带编号、不带标点。\n- summary：一到两句客观描述，写清人物、动作、结果。不写心理，不超过80字。\n\n输出契约：每条剧情占一行，字段用 | 分隔（time|title|summary）。time 为空时保留 | 占位。把所有剧情放在 <Plots> 和 </Plots> 之间。标签之外的所有文字都会被程序丢弃。格式：\n<Plots>\n第一天|丹房初遇|林晚入丹房，见师尊炼丹，被命取剑。\n|突破境界|林晚在藏剑阁突破至筑基。\n</Plots>\n没有新事件时输出：\n<Plots></Plots>\n\n【已有剧情线】\n{{historyPlot}}\n\n【最近对话】\n{{recent}}',

      worldview: '【任务】从剧情和对话中提炼世界通用规则。\n【硬性规则】\n1. 不写单个具体物品/角色/地点名称\n2. 写该世界的通用设定（修炼体系/社会规则/自然法则等）\n3. 3-6条规则\n4. title 设定标题(≤10字)，content 一句话说明(≤40字)\n\n【输出格式】只输出JSON对象（不要markdown围栏、不要解释）：\n{"name":"世界名","type":"世界类型","desc":"1-2句简述","rules":[{"title":"设定标题","content":"设定内容"}]}\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',

      itemExtract: '你是物品记录员。任务：从【最近对话】中提取出现的具体物品，存入物品清单。\n\n记录规范：\n- 只提取本段新出现或状态发生变化的物品；已记录且无变化的物品不重复输出。\n- name：只写可被拿取、使用、持有的具象物件（√ 青锋剑、丹药、玉佩、信件；× 地点如「丹房」「山洞」、场景如「战斗」「对话」、抽象概念如「修为」「境界」「灵气」、人物本身）。2-20字，不带修饰语、不带标点。\n- desc：一句话说明作用，不超过40字。不知道则留空。\n- owner：当前持有者姓名，不知道则留空。\n- origin：来历简述，不超过30字。不知道则留空。\n- related：关联的剧情标题（从【已知剧情线】取），无则留空。\n- 没有物品就输出空标签。宁缺毋滥，不编造。\n\n输出契约：每件物品占一行，字段用 | 分隔（name|desc|owner|origin|related）。某字段不知道就留空但保留 | 占位。把所有物品放在 <Items> 和 </Items> 之间。标签之外的所有文字都会被程序丢弃。字段内不要使用 | 符号。格式：\n<Items>\n青锋剑|师尊的佩剑，锋利无比|林晚|藏剑阁所藏|丹房初遇\n丹药|回复灵力的丹药||师尊炼制|丹房初遇\n</Items>\n没有物品时输出：\n<Items></Items>\n\n【已知剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}',
    },
    // ── 生图功能配置（温记独立，不依赖酒馆原生 SD 模块）──
    // 流程：AI 回复完成 → 取最新 AI 楼层 message → 调 LLM 整合为画面提示词 → 送生图后端 → 插入图片
    // 后端三选一：sd-webui（/sdapi/v1/txt2img）/ comfyui（/prompt + /history 轮询）/ cloud（OpenAI 兼容 /images/generations）
    // 图片以 <!-- WM_IMG_* --> 标记包裹写入楼层，injection.js 在注入上下文时剔除这些标记块，保证「图片不进上下文」。
    imageGen: {
      enabled: false,                  // 生图总开关（默认关，配置好后手动开）
      autoTrigger: false,              // 自动触发：AI 回复落库后自动生图（关闭则仅手动按钮触发）
      backendType: 'sd-webui',         // 'sd-webui' | 'comfyui' | 'cloud'
      apiUrl: 'http://127.0.0.1:7860', // 后端地址（SD WebUI 默认 7860 / ComfyUI 默认 8188 / 云端填完整 BaseURL）
      apiKey: '',                      // API Key（云端必填，本地通常留空）
      model: '',                       // 模型/checkpoint 名（可选；SD WebUI 设 sd_model_checkpoint，云端设 model 字段）
      negativePrompt: '',              // 负面提示词（可选，对所有后端生效）
      width: 512,
      height: 768,
      steps: 20,
      cfgScale: 7,
      sampler: '',                     // 采样器名（可选；SD WebUI 用 sampler_name，留空走默认 Euler a）
      // ComfyUI 工作流 JSON（可选）：粘贴完整 prompt API 格式工作流。
      // 用占位符 {{prompt}} {{negative}} {{width}} {{height}} {{steps}} {{cfg}} 标记关键参数位置，
      // 生图时自动替换。留空则用内置 txt2img 默认工作流。
      comfyWorkflow: '',
      cloudPath: '/images/generations',// 云端 API 路径（拼在 apiUrl 后；SiliconFlow/OpenAI 兼容端点都用此默认值）
      displayMode: 'append',           // 'append' 追加到 AI 楼层末尾 | 'separate' 独立 system 楼层
      promptStyle: 'general',          // 'general' 通用 | 'anime' 动漫 | 'realistic' 写实 | 'ink' 水墨
      // 自定义提示词模板（可选）：含 {{prompt}} 占位符，生图时会替换为 LLM 整合出的画面描述。
      // 例：「masterpiece, best quality, {{prompt}}, detailed background」
      promptTemplate: '',
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
      // 兜底（looksLegacy）：仅用于拦截「远古版本」——早期 v3 用 <<<SUMMARY_START>>> 标签包裹，v5+ 已统一为
      //   {"text": ...} JSON 契约。故以 JSON 契约特征作为「非远古」的判据；v5/v6 均含此特征，不会被误判，
      //   用户在 v6 上自定义的提示词得以保留（v5 旧锚点会误伤 v5/v6 导致每次 load 都被覆盖）。
      const savedPromptVer = parsed.promptsVersion || 0;
      const savedSummary = (parsed.prompts && parsed.prompts.summary) || '';
      const looksLegacy = !/\{\s*"text"\s*:/.test(savedSummary);
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
