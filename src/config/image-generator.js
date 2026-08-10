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
    const result = (tagged || cleaned || '').trim();
    if (!result) throw new Error('LLM 未生成有效画面提示词');
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
  async function callSdWebui(prompt, settings) {
    const ig = settings.imageGen || {};
    const base = (ig.apiUrl || 'http://127.0.0.1:7860').replace(/0\.0\.0\.0/g, '127.0.0.1').replace(/\/+$/, '');
    const url = base + '/sdapi/v1/txt2img';
    const negative = buildFullNegative(settings);
    const body = {
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('SD WebUI HTTP ' + res.status + '：' + t.slice(0, 300));
    }
    const j = await res.json();
    if (!j.images || !j.images.length) throw new Error('SD WebUI 未返回图片');
    return 'data:image/png;base64,' + j.images[0];
  }

  // ── 后端适配 2：ComfyUI /prompt + /history 轮询 ──
  // 占位符列表：{{prompt}} {{negative}} {{width}} {{height}} {{steps}} {{cfg}} {{denoise}} {{seed}}
  // 留空则用内置 txt2img 默认工作流（含 KSampler/CheckpointLoader/VAEDecode/SaveImage）
  function defaultComfyWorkflow() {
    return {
      '3': { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: '{{steps}}', cfg: '{{cfg}}', sampler_name: 'euler', scheduler: 'normal', denoise: '{{denoise}}', model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
      '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'v1-5-pruned-emaonly.safetensors' } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: '{{width}}', height: '{{height}}', batch_size: 1 } },
      '6': { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}', clip: ['4', 1] } },
      '7': { class_type: 'CLIPTextEncode', inputs: { text: '{{negative}}', clip: ['4', 1] } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'WarmMemo', images: ['8', 0] } },
    };
  }
  async function callComfyui(prompt, settings) {
    const ig = settings.imageGen || {};
    const base = (ig.apiUrl || 'http://127.0.0.1:8188').replace(/0\.0\.0\.0/g, '127.0.0.1').replace(/\/+$/, '');
    let workflow;
    if (ig.comfyWorkflow && ig.comfyWorkflow.trim()) {
      try { workflow = JSON.parse(ig.comfyWorkflow); }
      catch (e) { throw new Error('ComfyUI 工作流 JSON 解析失败：' + e.message); }
    } else {
      workflow = defaultComfyWorkflow();
    }
    const neg = buildFullNegative(settings);
    const w = Number(ig.width) || 512;
    const h = Number(ig.height) || 768;
    const steps = Number(ig.steps) || 20;
    const cfg = Number(ig.cfgScale) || 7;
    const denoise = ig.denoisingStrength == null ? 1.0 : Math.max(0, Math.min(1, Number(ig.denoisingStrength)));
    const seed = resolveSeed(ig.seed);
    // 占位符替换
    let workflowStr = JSON.stringify(workflow);
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    workflowStr = workflowStr
      .replace(/\{\{prompt\}\}/g, esc(prompt))
      .replace(/\{\{negative\}\}/g, esc(neg))
      .replace(/\{\{width\}\}/g, String(w))
      .replace(/\{\{height\}\}/g, String(h))
      .replace(/\{\{steps\}\}/g, String(steps))
      .replace(/\{\{cfg\}\}/g, String(cfg))
      .replace(/\{\{denoise\}\}/g, String(denoise))
      .replace(/\{\{seed\}\}/g, String(seed));
    const res = await fetch(base + '/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: workflowStr,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('ComfyUI HTTP ' + res.status + '：' + t.slice(0, 300));
    }
    const j = await res.json();
    const promptId = j && j.prompt_id;
    if (!promptId) throw new Error('ComfyUI 未返回 prompt_id');
    return await pollComfyuiResult(promptId, base);
  }
  async function pollComfyuiResult(promptId, base) {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch(base + '/history/' + encodeURIComponent(promptId));
        if (!res.ok) continue;
        const j = await res.json();
        const item = j[promptId];
        if (!item || !item.outputs) continue;
        // 找到第一个含 images 的输出节点
        for (const nodeId of Object.keys(item.outputs)) {
          const out = item.outputs[nodeId];
          const imgs = out.images || out.gifs;
          if (imgs && imgs.length) {
            const img = imgs[0];
            const params = new URLSearchParams({
              filename: img.filename || '',
              subfolder: img.subfolder || '',
              type: img.type || 'output',
            });
            return base + '/view?' + params.toString();
          }
        }
      } catch (e) { /* 轮询中网络抖动忽略 */ }
    }
    throw new Error('ComfyUI 生成超时（90s 未出图）');
  }

  // ── 后端适配 3：云端 OpenAI 兼容 /images/generations（SiliconFlow / OpenAI 等）──
  // 注：OpenAI 官方 /images/generations 没有 negative_prompt 参数；部分兼容端点（如 SiliconFlow/Kolors）支持 seed
  async function callCloudApi(prompt, settings) {
    const ig = settings.imageGen || {};
    const base = (ig.apiUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('云端 API 未配置 apiUrl');
    const path = ig.cloudPath || '/images/generations';
    const url = base + path;
    const w = Number(ig.width) || 512;
    const h = Number(ig.height) || 512;
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
    // steps / cfg：兼容端点普遍支持通过 extra_body / query 参数；OpenAI 官方忽略未知字段不影响
    if (ig.steps) body.steps = Number(ig.steps) || 20;
    if (ig.cfgScale) body.cfg_scale = Number(ig.cfgScale) || 7;
    // negative_prompt：Kolors 等兼容端点支持；官方 OpenAI 忽略
    const neg = buildFullNegative(settings);
    if (neg) body.negative_prompt = neg;
    const headers = { 'Content-Type': 'application/json' };
    if (ig.apiKey) headers['Authorization'] = 'Bearer ' + ig.apiKey;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
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
  async function insertImage(imageUrl, messageId, settings) {
    const ig = settings.imageGen || {};
    const alt = '温记生图 ' + new Date().toLocaleTimeString('zh-CN');
    const markdown = '![' + alt + '](' + imageUrl + ')';
    const wrapped = IMG_START + markdown + IMG_END;
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
  // 返回 { ok, prompt, imageUrl, error }
  let _generating = false; // 防重入锁
  async function triggerImageGeneration(opts) {
    opts = opts || {};
    if (_generating) return { ok: false, error: '正在生图中，请稍候' };
    const settings = WM.Settings.load();
    const ig = settings.imageGen || {};
    if (ig.enabled === false) return { ok: false, error: '生图功能未开启（请在设置中开启）' };

    _generating = true;
    if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 正在生成画面提示词…');

    // 取目标 AI 楼层
    const aiMsg = getLastAIMessage(opts.messageId);
    if (!aiMsg || !aiMsg.message) {
      _generating = false;
      return { ok: false, error: '没有可用的 AI 消息' };
    }
    const aiText = aiMsg.message;

    // 第一步：LLM 整合画面提示词
    let imagePrompt;
    try {
      imagePrompt = await generateImagePrompt(aiText, settings);
    } catch (e) {
      _generating = false;
      if (WM.ErrLog) await WM.ErrLog.add('image-prompt', e, { stage: 'prompt-gen', aiTextPreview: aiText.slice(0, 200) });
      const msg = '提示词生成失败：' + (e.message || e);
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 ' + msg);
      return { ok: false, error: msg };
    }

    // 拼接完整生图 prompt
    const fullPrompt = buildFullPrompt(imagePrompt, settings);

    if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 提示词就绪，正在调用生图后端…');

    // 第二步：调用生图后端
    let imageUrl;
    try {
      imageUrl = await generateImage(fullPrompt, settings);
    } catch (e) {
      _generating = false;
      if (WM.ErrLog) await WM.ErrLog.add('image-gen', e, { stage: 'image-gen', backend: ig.backendType, prompt: fullPrompt.slice(0, 300) });
      const msg = '生图失败：' + (e.message || e);
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 ' + msg);
      return { ok: false, error: msg, prompt: fullPrompt };
    }

    // 第三步：插入图片到对话
    try {
      await insertImage(imageUrl, aiMsg.message_id, settings);
    } catch (e) {
      _generating = false;
      if (WM.ErrLog) await WM.ErrLog.add('image-insert', e, { stage: 'insert', displayMode: ig.displayMode });
      const msg = '图片插入失败：' + (e.message || e);
      if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 ' + msg);
      return { ok: false, error: msg, prompt: fullPrompt, imageUrl };
    }

    _generating = false;
    if (!opts.silent && WM.Launcher && WM.Launcher.toast) WM.Launcher.toast('🎨 生图完成，已插入对话');
    return { ok: true, prompt: fullPrompt, imageUrl };
  }

  // 测试连接：用极简 prompt 调一次生图后端，验证连通性
  async function testConnection(settings) {
    const ig = (settings && settings.imageGen) || WM.Settings.load().imageGen || {};
    if (!ig.apiUrl && ig.backendType !== 'sd-webui') {
      return { success: false, error: '未配置后端地址（apiUrl）' };
    }
    try {
      const testPrompt = 'a cute cat, simple test image';
      const url = await generateImage(testPrompt, { imageGen: ig });
      if (url) return { success: true, detail: '连通，已返回图片（' + (url.startsWith('data:') ? 'base64' : 'url') + '）' };
      return { success: false, error: '未返回图片' };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  }

  WM.ImageGen = {
    triggerImageGeneration,
    generateImage,
    generateImagePrompt,
    buildFullPrompt,
    insertImage,
    testConnection,
    IMG_START,
    IMG_END,
    isGenerating: () => _generating,
  };
})();
