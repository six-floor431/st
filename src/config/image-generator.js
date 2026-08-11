// 生图模块：AI 回复完成 → 调 LLM 整合画面提示词 → 送生图后端 → 插入图片到对话。
// 后端三选一：sd-webui（/sdapi/v1/txt2img）/ comfyui（/prompt + /history 轮询）/ cloud（OpenAI 兼容 /images/generations）。
// 图片以 <!-- WM_IMG_START -->...<!-- WM_IMG_END --> 标记包裹写入楼层 message；
// injection.js 在注入上下文时按此标记剔除图片块，保证「图片不进上下文」。
// 复用 LLMClient.complete 做提示词整合（与总结/关系/剧情共用一份 LLM 配置，零额外配置）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 图片标记：包裹图片 markdown，供 injection.js 识别并剔除
  const IMG_START = '<!-- WM_IMG_START -->';
  const IMG_END = '<!-- WM_IMG_END -->';

  function helper() { return window.TavernHelper; }

  // ── 酒馆助手 chat_message API 封装（容错：优先 window.TavernHelper，回退顶层全局函数）──
  function getChatMessages(range, opts) {
    const h = helper();
    if (h && typeof h.getChatMessages === 'function') return h.getChatMessages(range, opts);
    if (typeof window.getChatMessages === 'function') return window.getChatMessages(range, opts);
    if (typeof getChatMessages === 'function') return getChatMessages(range, opts); // 顶层函数（esbuild 打包后可能在闭包内可见）
    return [];
  }
  async function setChatMessages(arr, opts) {
    const h = helper();
    if (h && typeof h.setChatMessages === 'function') return h.setChatMessages(arr, opts);
    if (typeof window.setChatMessages === 'function') return window.setChatMessages(arr, opts);
    if (typeof setChatMessages === 'function') return setChatMessages(arr, opts);
    throw new Error('setChatMessages 不可用（需酒馆助手）');
  }
  async function createChatMessages(arr, opts) {
    const h = helper();
    if (h && typeof h.createChatMessages === 'function') return h.createChatMessages(arr, opts);
    if (typeof window.createChatMessages === 'function') return window.createChatMessages(arr, opts);
    if (typeof createChatMessages === 'function') return createChatMessages(arr, opts);
    throw new Error('createChatMessages 不可用（需酒馆助手）');
  }

  // ── 外网同源代理改写（跟向量服务 applyVecProxy 一模一样的逻辑）──
  //   本地访问酒馆（端口 8000/8001）→ 直连（不会被跨域拦截）
  //   外网穿透访问 → 把 http://127.0.0.1:7860/path 改写成 window.location.origin + imgProxyPath + /path
  //   解决 ComfyUI/SD WebUI 没开 CORS 导致浏览器跨域拦成 ERR_FAILED 的问题
  function applyImgProxy(url, settings) {
    if (!url) return url;
    const ig = (settings && settings.imageGen) || {};
    if (ig.imgProxyEnabled === false) return url; // 显式关闭：直连
    if (!/^https?:\/\//i.test(url)) return url; // 相对路径/非 http 已是同源，放行
    let origin = '';
    try { origin = (window.top && window.top.location && window.top.location.origin) || window.location.origin; } catch (e) { origin = window.location.origin; }
    if (!origin || origin === 'null') return url;
    // 本地端口：直连，跳过改写
    let port = '';
    try { const u0 = new URL(origin); port = u0.port || (u0.protocol === 'https:' ? '443' : '80'); } catch (e) {}
    if (port === '8000' || port === '8001') return url;
    const proxyPath = String(ig.imgProxyPath || '/img').replace(/\/+$/, '');
    try {
      const eu = new URL(url, origin);
      const pathOnly = eu.pathname + (eu.search || '');
      const rewritten = origin + proxyPath + pathOnly;
      try { console.log('[WarmMemo][image-gen] 同源代理改写：', url, '→', rewritten); } catch (_) {}
      return rewritten;
    } catch (e) { return url; }
  }

  // 统一 fetch 包装：自动改写 URL + 错误增强
  async function wmFetch(url, opts, settings) {
    const finalUrl = applyImgProxy(url, settings);
    try {
      return await fetch(finalUrl, opts);
    } catch (netErr) {
      // 典型情况：浏览器跨域预检 CORS 失败 → TypeError: Failed to fetch
      // 给出有行动价值的报错信息（告诉用户开 CORS 或用代理）
      const netMsg = String(netErr && netErr.message ? netErr.message : netErr);
      const origHost = (function () { try { return (new URL(url)).host; } catch (_) { return url; } })();
      const isComfy = /127\.0\.0\.1:8188|localhost:8188/.test(String(url));
      const comfyExtra = isComfy
        ? '\n  （ComfyUI 新版本还有 Host/Origin 校验 → 额外加参数 --disable-header-check）\n'
          + '  完整启动参数示例（推荐）：python main.py --listen 127.0.0.1 --enable-cors-header "*" --disable-header-check'
        : '';
      const hint = '浏览器无法直连 ' + origHost + '（可能是 ComfyUI/SD WebUI 未开启 CORS 或代理不通）。\n'
        + '解决方式（任选其一）：\n'
        + '  ① 启动 ComfyUI 时加参数：python main.py --enable-cors-header "*"' + comfyExtra + '\n'
        + '     SD WebUI 启动时加参数：--api --cors-allow-origins=*\n'
        + '  ② 走温记同源代理（外网穿透场景）：在反代里把 "' + String((settings && settings.imageGen && settings.imageGen.imgProxyPath) || '/img')
        + '/*" 转发到 ' + origHost + '/*，温记已自动改写请求 URL。\n'
        + '原始错误：' + netMsg;
      const err = new Error(hint);
      err.name = 'ImageCorsError';
      throw err;
    }
  }

  // ── 酒馆服务端代理：借鉴酒馆原生 SD 模块，通过 /api/sd/* 端点转发请求到 ComfyUI/SD WebUI ──
  //   原理：前端 → 酒馆后端（同源无 CORS）→ ComfyUI/SD WebUI（服务器到服务器无 CORS）
  //   这就是酒馆自带 SD 模块能连接任意后端的秘密——不需要在 ComfyUI/SD WebUI 端开 CORS。
  //   酒馆后端已封装完整流程（ComfyUI 的提交/轮询/取图全在后端完成），前端只需一次请求。
  let _csrfToken = null;
  async function getCsrfToken() {
    if (_csrfToken) return _csrfToken;
    try {
      const res = await fetch('/csrf-token');
      if (!res.ok) return null;
      const data = await res.json();
      _csrfToken = data.token || null;
      return _csrfToken;
    } catch (e) {
      console.warn('[WarmMemo][image-gen] 获取 CSRF token 失败:', e);
      return null;
    }
  }
  // 酒馆代理请求：统一加 CSRF token + Content-Type，发到 /api/sd/* 端点
  async function stFetch(path, body) {
    const token = await getCsrfToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-CSRF-Token'] = token;
    return await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  // 提示词清洗：LLM 经常输出「叙事/解释/元思考」文字（"也许我们可以…""考虑到…""另一种可能…"），
  // 这些根本不是画面描述，会被直接塞给生图模型的 CLIP，浪费 token 且污染提示词。
  // 处理：
  //  1) 先按 <ImagePrompt> 标签取内容（之前已做），这里是二次防御
  //  2) 按句子/段落分句，分句里出现"思考/解释/旁白"类关键词的整个句子丢弃
  //  3) 去真实换行/制表符/多余空白，合成一行纯 tag 式 prompt
  //  4) —— 关键：过滤后若为空，直接返回空串（绝不回退到原文），让上层抛错并重试，
  //     避免把 LLM 的整段分析废话塞进生图 prompt。
  function sanitizePrompt(raw) {
    if (!raw) return '';
    let s = String(raw);
    // 先剥掉 <ImagePrompt> 标签（保险）
    s = s.replace(/<\/?ImagePrompt[^>]*>/gi, '');
    // 剥掉 ``` 代码块包裹
    s = s.replace(/^```[a-zA-Z]*\s*/gm, '').replace(/```\s*$/gm, '');
    // 先去掉所有控制字符（0x00-0x1F、0x7F），只保留可见字符 + 常用空白
    // 这是 JSON 解析安全的第一道防线——LLM 偶尔会输出零宽字符等奇怪东西
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // 分句：按中文句号/问号/感叹号/换行/英文 .?! 分号 逗号 切
    // 关键：加逗号分隔，避免"masterpiece, 但实际上..."这种中英混合被当成一个整体跳过过滤
    const parts = s.split(/[\n\r。！？!?\.；;，,]+/).map((p) => p.trim()).filter(Boolean);
    const NOISE_KEYWORDS = [
      // 中文：LLM 自言自语/解释类关键词
      '也许', '或许', '可能', '考虑到', '鉴于', '另一种可能', '另外', '此外',
      '但是', '然而', '不过', '我们可以', '我们应该', '我可以', '如果', '假设',
      '无法阅读', '无法识别', '生图模型', '不能理解', '无法理解', '注意', '提示',
      '请', '要求', '输出', '如果我们', '对于', '关于', '这种', '那个', '一个抽象场景',
      '比喻性', '示意的方式', '不是具体叙事', '抽象', 'welcome', '欢迎消息',
      '画面元素', '肉眼可见', '提炼规范', '输出契约', '格式要求', '以下是',
      '让我', '我们来', '首先', '其次', '最后', '总结一下', '综上所述',
      // 新增：LLM 分析/元评论类（"但实际上用户没有提供叙事"等典型废话）
      '但实际上', '这似乎', '没有提供', '需要指出', '角色设定', '叙事',
      '实际上是', '看起来', '似乎是', '应该是', '无法生成', '无法描绘',
      '平台', '没有实际', '所以我们需要', '指出', '用户没有', '助手',
      // 英文
      'maybe', 'perhaps', 'however', 'but', 'if we', 'consider', 'considering',
      'note that', 'note:', 'prompt', 'output:', 'welcome', 'let me', 'i think',
      'here are', 'first', 'second', 'finally', 'in conclusion', 'to summarize',
    ];
    const filtered = parts.filter((p) => {
      if (p.length < 2) return false;
      const lower = p.toLowerCase();
      return !NOISE_KEYWORDS.some((kw) => p.indexOf(kw) >= 0 || lower.indexOf(kw.toLowerCase()) >= 0);
    });
    // —— 修复：过滤后为空就返回空，绝不回退到原文
    // 回退原文等于把 LLM 的整段分析废话全塞进去，比不出图还糟糕
    if (!filtered.length) return '';
    const joined = filtered.join(', ');
    // 标准化空白：所有 \r\n\t 多空格 → 单个空格；去首尾逗号/空格
    return joined
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/[,，]{2,}/g, ',')
      .replace(/^[,，\s]+|[,，\s]+$/g, '')
      .trim();
  }

  // ── 标签提取（与 summary.js extractTag 同逻辑，独立实现避免循环依赖）──
  // 容错：标签名大小写不敏感；开标签可带属性；自闭合 <Tag/> 视为空；闭标签缺失取其后全部。
  function extractTag(raw, tag) {
    if (raw == null) return '';
    const s = String(raw).replace(/^```[a-zA-Z]*\s*/gim, '').replace(/```\s*$/g, '').trim();
    const lower = s.toLowerCase();
    const start = lower.indexOf('<' + tag.toLowerCase());
    if (start === -1) return '';
    let i = start + tag.length + 1; // 跳过 "<tag"
    while (i < s.length && s[i] !== '>' && s[i] !== '/' && s[i] !== '<') i++;
    if (s[i] === '/') return ''; // 自闭合 <Tag/> → 空
    if (s[i] !== '>') return ''; // 畸形，放弃
    const contentStart = i + 1;
    const end = lower.indexOf('</' + tag.toLowerCase(), contentStart);
    if (end === -1) return s.slice(contentStart).trim(); // 闭标签缺失
    return s.slice(contentStart, end).trim();
  }

  // 风格前缀表：拼在 LLM 整合出的画面描述之前，引导生图模型风格走向
  const STYLE_PREFIX = {
    general: '',
    anime: 'anime style, illustration, vibrant colors, detailed shading, ',
    realistic: 'photorealistic, high detail, natural lighting, sharp focus, 8k, ',
    ink: 'traditional chinese ink painting, sumi-e, minimalist, monochrome, brush stroke, ',
  };

  // 第一步：调 LLM 把 AI 回复整合成「画面提示词」。
  // 提示词放在 <ImagePrompt>...</ImagePrompt> 标签内，标签外内容丢弃（与温记其它任务一致的契约风格）。
  // 提示词只描述「画面」（人物外观/动作/表情/场景/光影/构图），不写台词/心理/抽象概念，便于生图模型理解。
  async function generateImagePrompt(aiMessage, settings) {
    const sys = [
      '你是画面构图师。任务：从给定的叙事文本中提炼一个适合文生图的画面描述。',
      '',
      '提炼规范：',
      '- 只写「肉眼可见」的画面元素：人物外观/服装/动作/表情、场景/环境/光影/天气、构图/视角/景别。',
      '- 不写台词、心理、抽象概念、剧情背景——生图模型看不懂这些。',
      '- 用英文短句+逗号分隔的关键词组（tag 式），便于生图模型解析。如：1girl, long black hair, red hanfu, standing in pavilion, moonlight, side view。',
      '- 把多个角色的外观分别描述清楚（发色/服装/位置）。',
      '- 80-150 字之内，宁精勿泛。',
      '',
      '输出契约：把画面描述放在 <ImagePrompt> 和 </ImagePrompt> 之间。标签外的所有文字都会被丢弃。',
      '格式：',
      '<ImagePrompt>',
      '1girl, long black hair, red hanfu, standing in bamboo forest, sunlight filtering through leaves, upper body',
      '</ImagePrompt>',
    ].join('\n');
    const user = '【AI 回复】\n' + String(aiMessage || '').slice(0, 4000);
    const opts = { maxTokens: 400, temperature: 0.5 };
    const out = await WM.LLMClient.complete(sys, user, settings, opts);
    const tagged = extractTag(out, 'ImagePrompt');
    // 兜底：模型偶尔不按标签输出，直接用清洗后的全文
    const cleaned = String(out || '').replace(/^```[a-zA-Z]*\s*/gim, '').replace(/```\s*$/g, '').trim();
    const raw = (tagged || cleaned || '').trim();
    if (!raw) throw new Error('LLM 未生成有效画面提示词');
    // 核心：最终做一次提示词清洗 → 去掉解释/废话/控制字符，得到纯 tag 列表
    const result = sanitizePrompt(raw);
    if (!result) throw new Error('LLM 画面提示词清洗后为空（模型输出的全是解释文字，请重试或降低 promptStyle 等级）');
    return result;
  }

  // 拼接完整正向提示词：常见前缀 + 风格前缀 + LLM 画面描述
  // 规则：
  //  1) 先取 STYLE_PREFIX 作为风格基础（画面风格走向）
  //  2) promptPrefix：用户填的「常见提示词前缀」—— 含 {{prompt}} 时作为模板替换，不含则前置在 LLM 描述前
  //  3) 顺序：风格前缀 + 用户自定义模板包裹 LLM 描述
  function buildFullPrompt(imagePrompt, settings) {
    const ig = settings.imageGen || {};
    const style = STYLE_PREFIX[ig.promptStyle] || '';
    let core = style ? style + imagePrompt : imagePrompt;
    // 优先用 promptPrefix（新版本），没有再回退 promptTemplate（老版本）
    const tpl = (ig.promptPrefix && ig.promptPrefix.trim()) ? ig.promptPrefix : (ig.promptTemplate || '');
    if (tpl && tpl.trim()) {
      if (tpl.indexOf('{{prompt}}') >= 0) {
        core = tpl.replace(/\{\{prompt\}\}/g, core);
      } else {
        // 不含占位符：前置（前缀），逗号分隔
        core = tpl + ' ' + core;
      }
    }
    return core;
  }

  // 拼接完整负面提示词：negativePrefix（常见负面前缀） + negativePrompt（本次特定负面）
  function buildFullNegative(settings) {
    const ig = settings.imageGen || {};
    const pre = (ig.negativePrefix || '').trim();
    const cur = (ig.negativePrompt || '').trim();
    const parts = [];
    if (pre) parts.push(pre.replace(/[,，\s]+$/g, ''));
    if (cur) parts.push(cur.replace(/^[,，\s]+/g, '').replace(/[,，\s]+$/g, ''));
    return parts.filter(Boolean).join(', ');
  }

  // 解析种子：-1 表示随机（返回整数≥0），其它返回用户填的整数
  function resolveSeed(seedCfg) {
    const n = Number(seedCfg);
    if (isNaN(n) || n === -1 || n < 0) {
      // -1 及以下 / 非数字 → 随机种子
      return Math.floor(Math.random() * 0x7fffffff);
    }
    return Math.floor(n);
  }

  // ── 后端适配 1：SD WebUI（AUTOMATIC1111）/sdapi/v1/txt2img ──
  // 走酒馆服务端代理 /api/sd/generate：前端→酒馆后端（同源）→SD WebUI（服务器端无 CORS）
  // 后端直接 JSON.stringify(request.body) 转发到 {url}/sdapi/v1/txt2img，响应原样返回。
  async function callSdWebui(prompt, settings) {
    const ig = settings.imageGen || {};
    const base = (ig.apiUrl || 'http://127.0.0.1:7860').replace(/0\.0\.0\.0/g, '127.0.0.1').replace(/\/+$/, '');
    const negative = buildFullNegative(settings);
    const body = {
      url: base,
      auth: '',
      prompt: prompt,
      negative_prompt: negative,
      steps: Number(ig.steps) || 20,
      cfg_scale: Number(ig.cfgScale) || 7,
      width: Number(ig.width) || 512,
      height: Number(ig.height) || 768,
      denoising_strength: ig.denoisingStrength == null ? 1.0 : Math.max(0, Math.min(1, Number(ig.denoisingStrength))),
      seed: resolveSeed(ig.seed),
      sampler_name: ig.sampler || 'Euler a',
    };
    if (ig.model) body.override_settings = { sd_model_checkpoint: ig.model };
    const res = await stFetch('/api/sd/generate', body);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('SD WebUI（酒馆代理 /api/sd/generate）HTTP ' + res.status + '：' + t.slice(0, 300));
    }
    const j = await res.json();
    if (!j.images || !j.images.length) throw new Error('SD WebUI 未返回图片');
    return 'data:image/png;base64,' + j.images[0];
  }

  // ── 后端适配 2：ComfyUI /prompt + /history 轮询 ──
  // 占位符列表：{{prompt}} {{negative}} {{model}} {{width}} {{height}} {{steps}} {{cfg}} {{denoise}} {{seed}} {{clip}} {{vae}}
  // 留空则用内置 txt2img 默认工作流（含 KSampler/CheckpointLoaderSimple/EmptyLatent/CLIP/VAEDecode/SaveImage）
  function defaultComfyWorkflow() {
    return {
      '3': { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: '{{steps}}', cfg: '{{cfg}}', sampler_name: 'euler', scheduler: 'normal', denoise: '{{denoise}}', model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
      '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '{{model}}' } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: '{{width}}', height: '{{height}}', batch_size: 1 } },
      '6': { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}', clip: ['4', 1] } },
      '7': { class_type: 'CLIPTextEncode', inputs: { text: '{{negative}}', clip: ['4', 1] } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'WarmMemo', images: ['8', 0] } },
    };
  }
  // Z-Image-Turbo 专用工作流：UNETLoader + CLIPLoader + VAELoader + ModelSamplingAuraFlow + ConditioningZeroOut
  // 参考 ComfyUI 官方蓝图 Text to Image (Z-Image-Turbo).json
  // 与普通 checkpoint 工作流的区别：
  //   1) 用 UNETLoader（从 unet/diffusion_models 目录加载）而非 CheckpointLoaderSimple
  //   2) 用独立 CLIPLoader 加载 qwen_3_4b.safetensors（type=lumina2）
  //   3) 用独立 VAELoader 加载 ae.safetensors
  //   4) 加 ModelSamplingAuraFlow（shift=3）调整采样分布
  //   5) 用 ConditioningZeroOut 生成空负面（Z-Image-Turbo 是蒸馏模型，不需要负面提示词）
  //   6) KSampler 用 cfg=1, sampler=res_multistep, scheduler=simple（蒸馏模型专用参数）
  //   7) 用 EmptySD3LatentImage 而非 EmptyLatentImage
  function defaultComfyWorkflowZImage() {
    return {
      '3': { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: '{{steps}}', cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: '{{denoise}}', model: ['11', 0], positive: ['27', 0], negative: ['33', 0], latent_image: ['13', 0] } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['29', 0] } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'WarmMemo', images: ['8', 0] } },
      '11': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['28', 0], shift: 3 } },
      '13': { class_type: 'EmptySD3LatentImage', inputs: { width: '{{width}}', height: '{{height}}', batch_size: 1 } },
      '27': { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}', clip: ['30', 0] } },
      '28': { class_type: 'UNETLoader', inputs: { unet_name: '{{model}}', weight_dtype: 'default' } },
      '29': { class_type: 'VAELoader', inputs: { vae_name: '{{vae}}' } },
      '30': { class_type: 'CLIPLoader', inputs: { clip_name: '{{clip}}', type: 'lumina2', device: 'default' } },
      '33': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['27', 0] } },
    };
  }
  // 自动检测模型类型：根据模型名判断是否为 UNet/diffusion 模型
  function isUnetModel(modelName) {
    if (!modelName) return false;
    const lower = modelName.toLowerCase();
    return lower.includes('z_image') || lower.includes('z-image') ||
           lower.includes('flux') || lower.includes('sdxl_unet') ||
           lower.includes('diffusion_model');
  }
  async function callComfyui(prompt, settings) {
    const ig = settings.imageGen || {};
    const base = (ig.apiUrl || 'http://127.0.0.1:8188').replace(/0\.0\.0\.0/g, '127.0.0.1').replace(/\/+$/, '');
    // {{model}}：用户没选时给一个兜底值（避免 CheckpointLoaderSimple/UNETLoader 提交空名称，ComfyUI 会直接 400）
    const model = (ig.model && ig.model.trim()) ? ig.model.trim() : '';
    // 自动检测模型类型：Z-Image-Turbo 等 diffusion 模型需要完全不同的工作流
    // 用户也可通过 ig.comfyWorkflowPreset 手动指定 ('auto' | 'checkpoint' | 'z-image-turbo')
    const useZImageWorkflow = ig.comfyWorkflowPreset === 'z-image-turbo' ||
      (ig.comfyWorkflowPreset !== 'checkpoint' && isUnetModel(model));
    let workflow;
    if (ig.comfyWorkflow && ig.comfyWorkflow.trim()) {
      try { workflow = JSON.parse(ig.comfyWorkflow); }
      catch (e) { throw new Error('ComfyUI 工作流 JSON 解析失败：' + e.message); }
    } else {
      workflow = useZImageWorkflow ? defaultComfyWorkflowZImage() : defaultComfyWorkflow();
    }
    const neg = buildFullNegative(settings);
    // 所有占位符先洗一遍：去控制字符、去 LLM 叙事废话，确保塞进 JSON 字符串不会有语法错误
    const cleanPrompt = sanitizePrompt(prompt);
    const cleanNeg = sanitizePrompt(neg);
    const w = Number(ig.width) || (useZImageWorkflow ? 1024 : 512);
    const h = Number(ig.height) || (useZImageWorkflow ? 1024 : 768);
    const steps = Number(ig.steps) || (useZImageWorkflow ? 8 : 20);
    const cfg = Number(ig.cfgScale) || (useZImageWorkflow ? 1 : 7);
    const denoise = ig.denoisingStrength == null ? 1.0 : Math.max(0, Math.min(1, Number(ig.denoisingStrength)));
    const seed = resolveSeed(ig.seed);
    // Z-Image-Turbo 配套模型：CLIP 和 VAE 文件名（用户可在设置中覆盖）
    const clipName = (ig.comfyClip && ig.comfyClip.trim()) ? ig.comfyClip.trim() : 'qwen_3_4b.safetensors';
    const vaeName = (ig.comfyVae && ig.comfyVae.trim()) ? ig.comfyVae.trim() : 'ae.safetensors';
    if (!model && !ig.comfyWorkflow) {
      throw new Error(useZImageWorkflow
        ? 'ComfyUI：未选择 UNet 模型。请点「🔄 刷新列表」，从下拉框选一个（如 z_image_turbo_bf16.safetensors）。'
        : 'ComfyUI：未选择 Checkpoint 模型。请点「🔄 刷新列表」，从下拉框选一个你本地已有的模型名。');
    }
    // 占位符替换：用 JSON.stringify(s).slice(1,-1) 得到合法 JSON 字符串字面量内容。
    // JSON.stringify 自动正确转义：引号、反斜杠、\r、\n、\t、\b、\f、所有 0x00-0x1F 控制字符、U+2028/U+2029 行分隔符。
    // —— 关键安全修复：replace 第二个参数用函数返回值，而不是字符串。
    //    因为 String.replace(regex, string) 里 $ 有特殊含义（$&/$1/$'/ $`），prompt 含 $ 会破坏 JSON 结构。
    //    用函数返回值则完全无特殊字符处理，值是什么就替换成什么。
    let workflowStr = JSON.stringify(workflow);
    const esc = (anyVal) => {
      const s = String(anyVal == null ? '' : anyVal);
      const out = JSON.stringify(s);
      return out.length >= 2 ? out.slice(1, -1) : out;
    };
    // 替换函数：每次匹配都返回转义后的值，避免 $ 特殊字符破坏 JSON
    const rep = (val) => () => esc(val);
    // —— 关键修复：数字字段必须替换为 JSON 数字（无引号），不能是字符串。
    //   ComfyUI API 要求 KSampler.seed/steps/cfg 等为 INT/FLOAT 类型。
    //   之前用 esc() 统一替换，数字 20 → "20"（字符串），ComfyUI 校验失败返回 500。
    //   修复方式：数字占位符替换时连引号一起消掉，产出裸数字；字符串占位符保持引号。
    workflowStr = workflowStr
      // 数字值：连引号一起替换为裸数字（"{{seed}}" → 12345，不是 "12345"）
      .replace(/"\{\{seed\}\}"/g, String(seed))
      .replace(/"\{\{steps\}\}"/g, String(steps))
      .replace(/"\{\{cfg\}\}"/g, String(cfg))
      .replace(/"\{\{width\}\}"/g, String(w))
      .replace(/"\{\{height\}\}"/g, String(h))
      .replace(/"\{\{denoise\}\}"/g, String(denoise))
      // 字符串值：只替换引号内的内容（保留 JSON 字符串引号）
      .replace(/\{\{prompt\}\}/g, rep(cleanPrompt))
      .replace(/\{\{negative\}\}/g, rep(cleanNeg))
      .replace(/\{\{model\}\}/g, rep(model))
      .replace(/\{\{clip\}\}/g, rep(clipName))
      .replace(/\{\{vae\}\}/g, rep(vaeName));
    // —— 关键修复：ComfyUI /prompt 要求 body = { prompt: <nodes对象>, client_id: '唯一标识' }
    // 之前直接把 workflow JSON 当 body，服务器端拿不到 prompt 字段 → 要么 400 要么 CORS 预检失败后被浏览器吞成 ERR_FAILED
    let promptObj;
    try { promptObj = JSON.parse(workflowStr); } catch (e) {
      // 万一仍失败，把出错位置附近的片段打出来，便于定位是哪段提示词仍含异常字符
      let posMatch = /position\s+(\d+)/i.exec(String(e && e.message ? e.message : e));
      let snippet = '';
      if (posMatch && posMatch[1]) {
        const p = parseInt(posMatch[1], 10);
        if (!isNaN(p)) {
          const start = Math.max(0, p - 80);
          const end = Math.min(workflowStr.length, p + 80);
          snippet = '（上下文：…' + workflowStr.slice(start, end).replace(/[\r\n\t]/g, '↵') + '…）';
        }
      }
      throw new Error('工作流 JSON 占位符替换后解析失败：' + (e.message || String(e)) + snippet
        + '|提示词片段=' + String(cleanPrompt || '').slice(0, 120));
    }
    // —— 走酒馆服务端代理 /api/sd/comfy/generate ——
    // 酒馆后端已封装完整流程：POST {url}/prompt → 轮询 {url}/history → GET {url}/view → 返回 {format, data:base64}
    // 前端只需一次请求，无需自己轮询 /history 和取 /view，且无 CORS 问题。
    // 这就是酒馆自带 SD 模块能连接任意 ComfyUI 的核心机制。
    const clientId = 'WarmMemo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const res = await stFetch('/api/sd/comfy/generate', {
      url: base,
      auth: '',
      prompt: JSON.stringify({ prompt: promptObj, client_id: clientId }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('ComfyUI（酒馆代理 /api/sd/comfy/generate）HTTP ' + res.status + '：' + t.slice(0, 300));
    }
    const j = await res.json();
    // 响应格式：{ format: 'png', data: '<base64字符串>' }
    if (!j.data) throw new Error('ComfyUI（酒馆代理）未返回图片数据');
    return 'data:image/' + (j.format || 'png') + ';base64,' + j.data;
  }
  // pollComfyuiResult 已废弃：酒馆 /api/sd/comfy/generate 后端已封装完整轮询+取图逻辑，前端不再需要。

  // ── 后端适配 3：云端 OpenAI 兼容 /images/generations（SiliconFlow / OpenAI 等）──
  // 注：OpenAI 官方 /images/generations 没有 negative_prompt 参数；部分兼容端点（如 SiliconFlow/Kolors）支持 seed
  async function callCloudApi(prompt, settings) {
    const ig = settings.imageGen || {};
    const base = (ig.apiUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('云端 API 未配置 apiUrl');
    const path = ig.cloudPath || '/images/generations';
    const url = base + path;
    const w = Number(ig.width) || 512;
    const h = Number(ig.height) || 768;
    const body = {
      prompt: prompt,
      n: 1,
      size: w + 'x' + h,
      response_format: 'b64_json',
    };
    if (ig.model) body.model = ig.model;
    // seed：用户填了非 -1 非负的才传；一些兼容端点支持，官方 OpenAI 忽略未知字段也不报错
    const seed = Number(ig.seed);
    if (seed > 0) body.seed = Math.floor(seed);
    // steps / cfg：兼容端点普遍支持；OpenAI 官方忽略未知字段不影响
    if (ig.steps) body.steps = Number(ig.steps) || 20;
    if (ig.cfgScale) body.cfg_scale = Number(ig.cfgScale) || 7;
    // negative_prompt：Kolors 等兼容端点支持；官方 OpenAI 忽略
    const neg = buildFullNegative(settings);
    if (neg) body.negative_prompt = neg;
    const headers = { 'Content-Type': 'application/json' };
    if (ig.apiKey) headers['Authorization'] = 'Bearer ' + ig.apiKey;
    const res = await wmFetch(url, { method: 'POST', headers, body: JSON.stringify(body) }, settings);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('云端 API HTTP ' + res.status + '：' + t.slice(0, 300));
    }
    const j = await res.json();
    if (j.data && j.data[0]) {
      if (j.data[0].b64_json) return 'data:image/png;base64,' + j.data[0].b64_json;
      if (j.data[0].url) return j.data[0].url;
    }
    throw new Error('云端 API 未返回图片数据');
  }

  // ── 模型列表查询（下拉框选项） ──
  //   全部走酒馆服务端代理，无需 ComfyUI/SD WebUI 开 CORS。
  //   SD WebUI：POST /api/sd/models → 后端 GET {url}/sdapi/v1/sd-models → 返回 [{value, text}]
  //   ComfyUI：POST /api/sd/comfy/models → 后端 GET {url}/object_info → 返回 [{value, text}]（已含 ckpt+unet+gguf）
  async function fetchAvailableModels(settings) {
    const ig = (settings && settings.imageGen) || WM.Settings.load().imageGen || {};
    const base = (ig.apiUrl || '').replace(/0\.0\.0\.0/g, '127.0.0.1').replace(/\/+$/, '');
    const type = ig.backendType || 'sd-webui';
    if (type === 'cloud') {
      // 云端：模型列表是各家独立的，不拉了，让用户手填
      return { ok: true, models: [] };
    }
    if (!base) return { ok: false, error: '未配置后端地址' };
    if (type === 'sd-webui') {
      try {
        const res = await stFetch('/api/sd/models', { url: base, auth: '' });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          return { ok: false, error: 'SD WebUI（酒馆代理 /api/sd/models）HTTP ' + res.status + '：' + t.slice(0, 200) };
        }
        const arr = await res.json();
        if (!Array.isArray(arr)) return { ok: false, error: 'SD WebUI 返回结构异常' };
        // 酒馆代理返回 [{value, text}]，统一映射为 {value, label}
        const models = arr.map((m) => ({ value: m.value || '', label: m.text || m.value || '' })).filter((m) => m.value);
        return { ok: true, models };
      } catch (e) { return { ok: false, error: e.message || String(e) }; }
    }
    // ComfyUI：走酒馆代理 /api/sd/comfy/models
    // 后端已解析 object_info 并合并 CheckpointLoaderSimple + UNETLoader + GGUF，前端无需再解析。
    try {
      const res = await stFetch('/api/sd/comfy/models', { url: base, auth: '' });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { ok: false, error: 'ComfyUI（酒馆代理 /api/sd/comfy/models）HTTP ' + res.status + '：' + t.slice(0, 200) };
      }
      const arr = await res.json();
      const models = (Array.isArray(arr) ? arr : []).map((m) => ({ value: m.value || '', label: m.text || m.value || '' })).filter((m) => m.value);
      return { ok: true, models };
    } catch (e) {
      return { ok: false, error: 'ComfyUI 模型列表加载失败（酒馆代理）：' + (e.message || String(e))
        + '\n\n请确认酒馆正在运行，且 ComfyUI 地址正确（' + base + '）。' };
    }
  }

  // 第二步：根据 backendType 分发到对应后端
  async function generateImage(prompt, settings) {
    const ig = settings.imageGen || {};
    const type = ig.backendType || 'sd-webui';
    // 调试日志：复用 llm 分类记录生图请求（便于在调试面板查看）
    if (WM.DebugLog) {
      WM.DebugLog.logRequest('llm', { url: '[image-gen:' + type + ']', model: ig.model || '', messages: [{ role: 'user', content: prompt.slice(0, 500) }], max_tokens: 0, temperature: 0, deepThinking: false, reasoningEffort: false, note: '生图请求' });
    }
    let imageUrl;
    try {
      if (type === 'sd-webui') imageUrl = await callSdWebui(prompt, settings);
      else if (type === 'comfyui') imageUrl = await callComfyui(prompt, settings);
      else if (type === 'cloud' || type === 'cloud-openai') imageUrl = await callCloudApi(prompt, settings);
      else throw new Error('不支持的生图后端类型：' + type);
      if (WM.DebugLog) WM.DebugLog.logResponse('llm', { url: '[image-gen:' + type + ']', model: ig.model || '', output: imageUrl.slice(0, 80) + (imageUrl.length > 80 ? '...' : ''), usage: null, finish_reason: 'image-ok', rawPreview: 'imageUrl length=' + imageUrl.length });
      return imageUrl;
    } catch (e) {
      if (WM.DebugLog) WM.DebugLog.logError('llm', { url: '[image-gen:' + type + ']', error: e.message || String(e) });
      throw e;
    }
  }

  // 第三步：取最新 AI 楼层（或指定楼层）的 message 文本
  // 优先用酒馆助手 getChatMessages 取标准化结构；失败时从 ctx.chat 原始数组兜底。
  function getLastAIMessage(messageId) {
    // 1) 指定 messageId：直接取
    if (messageId != null) {
      try {
        const msgs = getChatMessages(messageId);
        if (msgs && msgs.length) return msgs[0];
      } catch (e) {}
    }
    // 2) 从原始 chat 数组倒序找最新 assistant 楼层（跳过 user/system）
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
      const chat = ctx && ctx.chat;
      if (Array.isArray(chat)) {
        for (let i = chat.length - 1; i >= 0; i--) {
          const m = chat[i];
          if (!m || m.is_user || m.is_system) continue;
          const mid = (m.message_id != null) ? m.message_id : i;
          // 用酒馆助手 API 取标准化结构（含 message 字段而非 mes）
          try {
            const msgs = getChatMessages(mid);
            if (msgs && msgs.length) return msgs[0];
          } catch (e) {}
          // API 失败则用原始结构兜底（mes → message）
          return {
            message_id: mid,
            message: m.mes || '',
            role: 'assistant',
            is_hidden: !!m.is_hidden,
          };
        }
      }
    } catch (e) {}
    return null;
  }

  // 第四步：插入图片到对话
  //   append   → 追加到 AI 楼层 message 末尾（图片 markdown 用标记包裹，injection 时剔除）
  //   separate → 创建独立 system 楼层（同样用标记包裹，不进上下文）
  // 视觉增强：
  //   - 给图片外层包 <a href target="_blank">，点击新标签页看大图（像酒馆终端那样无限制查看原图）
  //   - 给 <img> 加 inline style：取消 max-width/max-height 限制，保证显示完整且清晰
  async function insertImage(imageUrl, messageId, settings) {
    const ig = settings.imageGen || {};
    const alt = '温记生图 ' + new Date().toLocaleTimeString('zh-CN');
    const safeUrl = String(imageUrl || '').replace(/"/g, '%22').replace(/'/g, '%27');
    // a 包 img：点击新标签页打开原图；img 样式去掉宽度限制、保持比例、加圆角视觉
    const html = '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" data-wm-img-link="1" title="点击新标签页查看原图（无限制大小）">'
      + '<img src="' + safeUrl + '" alt="' + alt + '"'
      + ' style="max-width:100%!important;max-height:none!important;width:auto!important;height:auto!important;display:block;margin:6px 0;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.15)" data-wm-img="1"'
      + ' /></a>';
    const wrapped = IMG_START + html + IMG_END;
    if (ig.displayMode === 'separate') {
      await createChatMessages([{ role: 'system', message: wrapped, is_hidden: false }], { refresh: 'affected' });
    } else {
      // 追加到指定 AI 楼层末尾
      const target = getLastAIMessage(messageId);
      if (!target) throw new Error('找不到目标 AI 楼层，无法追加图片');
      const newMessage = (target.message || '') + '\n\n' + wrapped;
      await setChatMessages([{ message_id: target.message_id, message: newMessage }], { refresh: 'affected' });
    }
  }

  // ── 完整流程入口 ──
  // opts.messageId：指定对哪条 AI 消息生图（默认取最新 assistant 楼层）
  // opts.silent：静默模式（不弹 toast，仅返回结果）—— 自动触发时用
  // opts.force：强制触发，忽略 autoTrigger（面板上「无限制立即生图」按钮用）
  // 返回 { ok, prompt, imageUrl, error }
  // —— 注意：已移除全局 _generating 防重入锁，允许连续点击多次排队生成 ——
  //   SD WebUI/ComfyUI 本身有任务队列，连续请求会自动排队，终端会依次显示多批出图结果（像酒馆那样）
  async function triggerImageGeneration(opts) {
    opts = opts || {};
    const settings = WM.Settings.load();
    const ig = settings.imageGen || {};
    if (ig.enabled === false) return { ok: false, error: '生图功能未开启（请在设置中开启）' };
    // autoTrigger 校验：仅 opts.force=false 且走自动触发分支时检查 autoTrigger 开关
    if (!opts.force && !ig.autoTrigger && opts.silent) {
      // 静默+非强制：自动触发分支，开关未开 → 静默跳过（不要报错）
      return { ok: false, error: 'autoTrigger 未开启，已跳过（可点「🎨 无限制立即生图」强制出图）', skipped: true };
    }

    if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 正在生成画面提示词…（可继续点击排队）');

    // 取目标 AI 楼层
    const aiMsg = getLastAIMessage(opts.messageId);
    if (!aiMsg || !aiMsg.message) {
      return { ok: false, error: '没有可用的 AI 消息' };
    }
    const aiText = aiMsg.message;

    // 第一步：LLM 整合画面提示词
    let imagePrompt;
    try {
      imagePrompt = await generateImagePrompt(aiText, settings);
    } catch (e) {
      if (WM.ErrLog) await WM.ErrLog.add('image-prompt', e, { stage: 'prompt-gen', aiTextPreview: aiText.slice(0, 200) });
      const msg = '提示词生成失败：' + (e.message || e);
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 ' + msg);
      return { ok: false, error: msg };
    }

    // 拼接完整生图 prompt
    const fullPrompt = buildFullPrompt(imagePrompt, settings);

    if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 提示词就绪，已送生图后端排队…（连续点击可追加多张）');

    // 第二步：调用生图后端
    let imageUrl;
    try {
      imageUrl = await generateImage(fullPrompt, settings);
    } catch (e) {
      if (WM.ErrLog) await WM.ErrLog.add('image-gen', e, { stage: 'image-gen', backend: ig.backendType, prompt: fullPrompt.slice(0, 300) });
      const msg = '生图失败：' + (e.message || e);
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 ' + msg);
      return { ok: false, error: msg, prompt: fullPrompt };
    }

    // 第三步：插入图片到对话
    try {
      await insertImage(imageUrl, aiMsg.message_id, settings);
    } catch (e) {
      if (WM.ErrLog) await WM.ErrLog.add('image-insert', e, { stage: 'insert', displayMode: ig.displayMode });
      const msg = '图片插入失败：' + (e.message || e);
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 ' + msg);
      return { ok: false, error: msg, prompt: fullPrompt, imageUrl };
    }

    if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 生图完成，已插入对话（继续点可生成更多）');
    return { ok: true, prompt: fullPrompt, imageUrl };
  }

  // 测试连接：走酒馆代理 ping 端点，快速验证连通性（不需要完整生图）
  //   SD WebUI：POST /api/sd/ping → 后端 GET {url}/sdapi/v1/options
  //   ComfyUI：POST /api/sd/comfy/ping → 后端 GET {url}/system_stats
  async function testConnection(settings) {
    const ig = (settings && settings.imageGen) || WM.Settings.load().imageGen || {};
    const type = ig.backendType || 'sd-webui';
    const base = (ig.apiUrl || '').replace(/0\.0\.0\.0/g, '127.0.0.1').replace(/\/+$/, '');
    if (type === 'cloud') {
      // 云端：用完整生图测试（云端有自己的 key，不走酒馆代理）
      if (!ig.apiUrl) return { success: false, error: '未配置后端地址（apiUrl）' };
      try {
        const testPrompt = 'a cute cat, simple test image';
        const url = await generateImage(testPrompt, { imageGen: ig });
        if (url) return { success: true, detail: '连通，已返回图片（' + (url.startsWith('data:') ? 'base64' : 'url') + '）' };
        return { success: false, error: '未返回图片' };
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    }
    if (!base) return { success: false, error: '未配置后端地址（apiUrl）' };
    try {
      const pingPath = type === 'comfyui' ? '/api/sd/comfy/ping' : '/api/sd/ping';
      const res = await stFetch(pingPath, { url: base, auth: '' });
      if (res.ok) return { success: true, detail: (type === 'comfyui' ? 'ComfyUI' : 'SD WebUI') + ' 连通（通过酒馆代理，无需开 CORS）' };
      const t = await res.text().catch(() => '');
      return { success: false, error: (type === 'comfyui' ? 'ComfyUI' : 'SD WebUI') + ' HTTP ' + res.status + '：' + t.slice(0, 200) };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  }

  // ── 楼层生图按钮注入：每条 AI 消息右上角加 🎨 按钮，点击就对该条消息生图 ──
  // 这就是「无限制生成图」：对任意楼层都能生成，不受"只能对最新一条"限制，连点可排队。
  let _floorBtnObserver = null;
  const INJECTED_FLAG = 'wm-img-btn-injected';

  // 从消息 DOM 元素提取 message_id（兼容多种酒馆版本/皮肤）
  function getMessageIdFromEl(el) {
    if (!el) return null;
    // 常见属性：data-message-id / data-mid / id="mes_xxx"
    const mid = el.getAttribute('data-message-id') || el.getAttribute('data-mid');
    if (mid != null && mid !== '') return isNaN(Number(mid)) ? mid : Number(mid);
    const idAttr = el.id || '';
    if (idAttr && idAttr.indexOf('mes_') === 0) {
      const n = idAttr.slice(4);
      return isNaN(Number(n)) ? n : Number(n);
    }
    return null;
  }

  // 判断是否为 AI/assistant 消息
  function isAIMessage(el) {
    if (!el) return false;
    // 常见类名：mes_assistant / assistant / ai-mes
    if (el.classList && (el.classList.contains('mes_assistant') || el.classList.contains('assistant') || el.classList.contains('ai-mes'))) return true;
    // 常见属性：data-role="assistant" / data-isuser="false"
    const role = el.getAttribute('data-role');
    if (role === 'assistant' || role === 'ai') return true;
    const isUser = el.getAttribute('data-isuser');
    if (isUser === 'false') return true;
    return false;
  }

  // 给单个消息元素加生图按钮
  function injectBtnToMessage(el) {
    if (!el || !el.classList) return;
    if (el.classList.contains(INJECTED_FLAG)) return;
    if (!isAIMessage(el)) return;
    const mid = getMessageIdFromEl(el);
    if (mid == null) return;

    const btn = document.createElement('button');
    btn.className = 'wm-floor-img-btn';
    btn.title = '🎨 温记：对本楼层无限制生图（连点可排队）';
    btn.textContent = '🎨';
    btn.style.cssText = [
      'position:absolute', 'top:6px', 'right:8px', 'z-index:10',
      'width:28px', 'height:28px', 'border-radius:50%', 'border:none',
      'background:linear-gradient(135deg,#6f5cff,#b347ff)', 'color:#fff',
      'font-size:14px', 'cursor:pointer', 'opacity:0', 'transition:opacity .2s',
      'display:flex', 'align-items:center', 'justify-content:center',
      'box-shadow:0 2px 6px rgba(0,0,0,.2)', 'padding:0',
    ].join(';');
    // 鼠标悬停在消息上时显示按钮
    el.style.position = el.style.position || 'relative';
    el.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!WM.ImageGen || typeof WM.ImageGen.triggerUnlimited !== 'function') return;
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
      try {
        await WM.ImageGen.triggerUnlimited(mid);
      } finally {
        setTimeout(() => {
          btn.style.opacity = '1';
          btn.style.pointerEvents = '';
        }, 500);
      }
    });
    el.appendChild(btn);
    el.classList.add(INJECTED_FLAG);
  }

  // 扫描整个聊天区，给所有 AI 消息加按钮
  function scanAllMessages() {
    const settings = WM.Settings ? WM.Settings.load() : {};
    const ig = settings.imageGen || {};
    if (ig.enabled === false) return;

    // 常见聊天容器选择器（兼容多种酒馆版本/皮肤）
    const selectors = ['#chat', '.chat_log', '#chat_log', '.chat', '[data-chat]'];
    let chatEl = null;
    for (const sel of selectors) {
      chatEl = document.querySelector(sel);
      if (chatEl) break;
    }
    if (!chatEl) return;

    // 常见消息元素选择器
    const msgSelectors = ['.mes', '.message', '.chat-message', '[data-message-id]'];
    let msgEls = [];
    for (const sel of msgSelectors) {
      msgEls = chatEl.querySelectorAll(sel);
      if (msgEls.length) break;
    }
    msgEls.forEach(injectBtnToMessage);
  }

  // 启动楼层按钮注入：先扫一遍已有的，然后用 MutationObserver 监听新增
  function initFloorButtons() {
    if (_floorBtnObserver) return; // 已启动
    // 等 DOM 就绪
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initFloorButtons, { once: true });
      return;
    }
    // 先扫一遍
    try { scanAllMessages(); } catch (e) { console.warn('[WarmMemo][image-gen] 首次扫描楼层按钮失败：', e); }

    // 监听聊天区 DOM 变化，新消息自动加按钮
    const chatSelectors = ['#chat', '.chat_log', '#chat_log', '.chat', '[data-chat]'];
    let chatEl = null;
    for (const sel of chatSelectors) {
      chatEl = document.querySelector(sel);
      if (chatEl) break;
    }
    if (!chatEl) {
      // 聊天区还没渲染出来，等 2 秒再试
      setTimeout(initFloorButtons, 2000);
      return;
    }
    _floorBtnObserver = new MutationObserver(() => {
      try { scanAllMessages(); } catch (_) {}
    });
    _floorBtnObserver.observe(chatEl, { childList: true, subtree: true });
    console.log('[WarmMemo][image-gen] 楼层生图按钮已启用');
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
  };

  // 自动启动楼层按钮注入（延迟到 DOM 就绪后）
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(initFloorButtons, 1000), { once: true });
    } else {
      setTimeout(initFloorButtons, 1000);
    }
  }
})();
