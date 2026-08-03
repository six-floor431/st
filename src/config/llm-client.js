// LLM 调用封装：只调用酒馆的 LLM 本体，不携带酒馆预设/角色卡/聊天历史。
// 使用 generateRaw + ordered_prompts（完全自定义提示词），
// 通过 custom_api 区分来源（local=当前源 / custom=代理预设或自定义URL）。
// 参考 lolocard-master 的 generateRaw 用法。
(function () {
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 取酒馆官方 generateRaw 入口。扩展脚本运行时，酒馆会把 generateRaw
  // 注入到当前脚本的全局作用域（与参考项目 iframe 版的 generateRaw 同一套 API）。
  function getGenerateRaw() {
    if (typeof window.generateRaw === 'function') return window.generateRaw;
    try {
      const ST = window.SillyTavern;
      if (ST && typeof ST.getContext === 'function') {
        const ctx = ST.getContext();
        if (ctx && typeof ctx.generateRaw === 'function') return ctx.generateRaw;
      }
      if (ST && typeof ST.generateRaw === 'function') return ST.generateRaw;
    } catch (e) { /* ignore */ }
    return null;
  }

  // 由 profile 组装酒馆 custom_api 配置（custom 来源时）
  function buildCustomApi(p) {
    if (!p) return undefined;
    const api = {};
    if (p.proxyPreset) api.proxy_preset = p.proxyPreset.trim();
    if (p.apiUrl) api.apiurl = p.apiUrl.trim();
    if (p.apiKey) api.key = p.apiKey.trim();
    if (p.model) api.model = p.model.trim();
    return (api.proxy_preset || api.apiurl || api.model) ? api : undefined;
  }

  // 酒馆注入的顶层全局函数 getPresetNames() / getPreset(name)
  // 参考 @types/function/preset.d.ts：它们是 `declare function`（直接挂在 window 上），
  // 不在 SillyTavern.getContext() 返回的 context 上。所以必须从 window 直接取。
  function getPresetNamesFn() {
    if (typeof window.getPresetNames === 'function') return window.getPresetNames;
    if (window.tavern_events && typeof window.tavern_events.getPresetNames === 'function') return window.tavern_events.getPresetNames;
    return null;
  }
  function getPresetFn() {
    if (typeof window.getPreset === 'function') return window.getPreset;
    if (window.tavern_events && typeof window.tavern_events.getPreset === 'function') return window.tavern_events.getPreset;
    return null;
  }
  // 暴露给 UI 取预设名列表
  function listPresetNames() {
    const f = getPresetNamesFn();
    if (typeof f !== 'function') return [];
    try { return f() || []; } catch (e) { return []; }
  }

  // preset prompt 的 role 是数字（0=system 1=user 2=assistant 3=neutral 4=system_example）
  // 转成 generateRaw 需要的字符串
  function mapRole(r) {
    if (r === 1) return 'user';
    if (r === 2) return 'assistant';
    return 'system'; // 0/3/4 或未知都当 system
  }

  // 取酒馆已保存预设中「启用且非空」的提示词（作为「预设前置」用）
  function getPresetPromptItems(name) {
    if (!name) return [];
    const getPreset = getPresetFn();
    if (typeof getPreset !== 'function') return [];
    let preset;
    try { preset = getPreset(name); } catch (e) { return []; }
    const prompts = (preset && preset.prompts) || [];
    return prompts
      .filter((p) => p && p.enabled !== false && p.content && String(p.content).trim().length > 0)
      .map((p) => ({ role: mapRole(p.role), content: String(p.content) }));
  }

  // 解析「预设前置」：返回拼在用户提示词之前的前缀 prompt 列表
  // settings.presetPrefix: { mode:'none'|'import'|'preset', importText, presetName }
  function resolvePrefix(settings) {
    const pp = (settings && settings.presetPrefix) || null;
    if (!pp || pp.mode === 'none') return [];
    if (pp.mode === 'import') {
      const t = (pp.importText || '').trim();
      return t ? [{ role: 'system', content: t }] : [];
    }
    if (pp.mode === 'preset') {
      return getPresetPromptItems(pp.presetName);
    }
    return [];
  }

  // 核心：只调用 LLM 本体，提示词完全由调用方控制
  // 支持两种签名（向后兼容）：
  //   新：complete(messages, opts)  —— messages: [{role:'system'|'user', content}]
  //   旧：complete(systemText, userText, settings, opts)
  async function complete(a, b, c, d) {
    let messages, opts;
    if (typeof b === 'string') {
      // 旧签名：complete(systemText, userText, settings, opts)
      messages = [{ role: 'system', content: a || '' }, { role: 'user', content: b || '' }];
      opts = Object.assign({}, d || {}, (c && c.llmConfig) ? { profile: c.llmConfig } : {});
    } else {
      // 新签名：complete(messages, opts)
      messages = a || [];
      opts = b || {};
    }
    opts = opts || {};
    const profile = opts.profile || { source: 'local' };
    const gr = getGenerateRaw();
    if (!gr) {
      throw new Error('酒馆 generateRaw 接口不可用（请确认在酒馆环境中运行，且扩展已正确加载）');
    }
    const ordered_prompts = (messages || []).map((m) => ({ role: m.role || 'user', content: m.content || '' }));
    // 输出 token 上限：优先用本次 opts.maxTokens，否则用统一配置 profile.maxTokens（所有功能共用），再兜底 512
    const maxTokens = opts.maxTokens || profile.maxTokens || 512;
    const config = {
      ordered_prompts,
      should_stream: false,
      max_new_tokens: maxTokens,
      // 低温度保证输出稳定、准确；让模型在 maxTokens 限制内完整输出
      temperature: opts.temperature != null ? opts.temperature : (profile.temperature != null ? profile.temperature : 0.3),
      // 隔离：默认不携带任何聊天历史（避免测试/摘要被当前对话污染）
      max_chat_history: opts.max_chat_history != null ? opts.max_chat_history : 0,
      should_silence: opts.should_silence != null ? opts.should_silence : true,
    };
    if (profile.source === 'custom') {
      const custom_api = buildCustomApi(profile);
      if (!custom_api) {
        throw new Error('自定义来源未配置（需填代理预设或 URL/Key/模型）');
      }
      config.custom_api = custom_api;
    }
    // local：不传 custom_api，用酒馆当前对话源
    const out = await gr(config);
    const text = typeof out === 'string' ? out : (out && out.reply) ? out.reply : String(out || '');
    // 清理：去首尾空白、去常见代码围栏，保证返回内容准确干净
    return text ? String(text).trim() : '';
  }

  // 测试连接：完全隔离的一次极简请求，不带入任何聊天历史/角色卡，避免"回答了其他问题"还拖很久
  async function testConnection(opts) {
    opts = opts || {};
    const profile = opts.profile || { source: 'local' };
    // 超时保护：测试最多等 20s，避免卡死浪费时间
    const timeoutMs = 20000;
    const guard = new Promise((_, reject) => setTimeout(() => reject(new Error('测试超时（' + (timeoutMs / 1000) + 's 无响应）')), timeoutMs));
    try {
      const out = await Promise.race([
        complete(
          [{ role: 'system', content: '你是一个连通性测试工具。只输出指令要求的内容，不要回答任何其它问题，不要使用聊天历史。' },
           { role: 'user', content: '请只回复「连通」两个字，不要回复其它任何内容。' }],
          { profile, maxTokens: 8, temperature: 0, max_chat_history: 0, should_silence: true }
        ),
        guard,
      ]);
      if (out && String(out).trim().length > 0) {
        return { success: true, detail: '连通，返回：' + String(out).trim().slice(0, 30) };
      }
      return { success: false, error: '返回为空' };
    } catch (e) {
      return { success: false, error: String(e && e.message ? e.message : e) };
    }
  }

  WM.LLMClient = { complete, testConnection, buildCustomApi, getGenerateRaw, resolvePrefix, getPresetPromptItems, listPresetNames };
})();
