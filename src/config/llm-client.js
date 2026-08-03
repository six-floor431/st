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

  // 取酒馆已保存预设的提示词内容（作为「预设前置」用）
  function getPresetPromptItems(name) {
    if (!name) return [];
    let getPreset = null;
    if (typeof window.getPreset === 'function') getPreset = window.getPreset;
    else if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
      try { const ctx = window.SillyTavern.getContext(); if (ctx && typeof ctx.getPreset === 'function') getPreset = ctx.getPreset; } catch (e) {}
    }
    if (!getPreset) return [];
    let preset;
    try { preset = getPreset(name); } catch (e) { return []; }
    const prompts = (preset && preset.prompts) || [];
    return prompts
      .filter((p) => p && p.enabled !== false && p.content && String(p.content).trim().length > 0)
      .map((p) => ({ role: p.role || 'system', content: String(p.content) }));
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
  // messages: [{role:'system'|'user', content}]
  async function complete(messages, opts) {
    opts = opts || {};
    const profile = opts.profile || { source: 'local' };
    const gr = getGenerateRaw();
    if (!gr) {
      throw new Error('酒馆 generateRaw 接口不可用（请确认在酒馆环境中运行，且扩展已正确加载）');
    }
    const ordered_prompts = (messages || []).map((m) => ({ role: m.role || 'user', content: m.content || '' }));
    const config = {
      ordered_prompts,
      should_stream: false,
      max_new_tokens: opts.maxTokens || 512,
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
    return typeof out === 'string' ? out : (out && out.reply) ? out.reply : String(out || '');
  }

  // 测试连接：按 profile 发一句测试
  async function testConnection(opts) {
    opts = opts || {};
    const profile = opts.profile || { source: 'local' };
    try {
      const out = await complete(
        [{ role: 'system', content: '你是测试助手。' }, { role: 'user', content: '只回复一个字：好' }],
        { profile, maxTokens: 16 }
      );
      if (out && String(out).trim().length > 0) {
        return { success: true, detail: '连通，返回：' + String(out).trim().slice(0, 30) };
      }
      return { success: false, error: '返回为空' };
    } catch (e) {
      return { success: false, error: String(e && e.message ? e.message : e) };
    }
  }

  WM.LLMClient = { complete, testConnection, buildCustomApi, getGenerateRaw, resolvePrefix, getPresetPromptItems };
})();
