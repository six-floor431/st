// LLM 调用封装：全部走酒馆官方 generate（参考 lolocard-master 的做法）。
// 复用酒馆的源管理、代理预设、模型列表、流式等能力，不自己手写 fetch。
// 通过 custom_api 参数切换调用来源。
(function () {
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 取酒馆官方生成入口。扩展脚本运行时，酒馆会把 generate / SillyTavern.generate
  // 注入到当前脚本的全局作用域（与参考项目 iframe 版的 generate 同一套 API）。
  function getGenerate() {
    // 1) 顶层全局 generate（扩展脚本最常见）
    if (typeof window.generate === 'function') return window.generate;
    // 2) SillyTavern.getContext().generate
    try {
      const ST = window.SillyTavern;
      if (ST && typeof ST.getContext === 'function') {
        const ctx = ST.getContext();
        if (ctx && typeof ctx.generate === 'function') return ctx.generate;
      }
      if (ST && typeof ST.generate === 'function') return ST.generate;
    } catch (e) { /* ignore */ }
    // 3) 兼容 iframe 内 window.generateRaw
    if (typeof window.generateRaw === 'function') return window.generateRaw;
    return null;
  }

  // 由 profile 组装酒馆 custom_api 配置（custom 来源时）
  // 注意：酒馆 custom_api 结构是 { apiurl, key, source } 或 { proxy_preset, model } 或仅 { model }
  function buildCustomApi(p) {
    if (!p) return undefined;
    const api = {};
    if (p.proxyPreset) {
      api.proxy_preset = p.proxyPreset.trim();
    }
    if (p.apiUrl || p.apiKey || p.model) {
      if (p.apiUrl) api.apiurl = p.apiUrl.trim();
      if (p.apiKey) api.key = p.apiKey.trim();
      if (p.model) api.model = p.model.trim();
      // source 留给酒馆推断（有 apiurl 即为 openai 兼容）；这里不强制填 source
    }
    return (api.proxy_preset || api.apiurl || api.model) ? api : undefined;
  }

  // 核心：用酒馆官方 generate 完成一次对话补全
  // opts.profile: { source:'local'|'custom', proxyPreset?, apiUrl?, apiKey?, model? }
  // messages: [{role:'system'|'user', content}]
  async function complete(messages, opts) {
    opts = opts || {};
    const profile = opts.profile || { source: 'local' };
    const gen = getGenerate();
    if (!gen) {
      throw new Error('酒馆 generate 接口不可用（请确认在酒馆环境中运行，且扩展已正确加载）');
    }
    const sys = (messages || []).filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const userMsg = (messages || []).filter((m) => m.role !== 'system').map((m) => m.content).join('\n') || '';

    const config = {
      user_input: userMsg,
      should_stream: false,
      should_silence: true,
      max_new_tokens: opts.maxTokens || 512,
    };
    if (sys) {
      // 用 injects 注入系统提示词（in_chat 位置，作为 system 角色）
      config.injects = [{ role: 'system', content: sys, position: 'in_chat', depth: 0, should_scan: true }];
    }

    if (profile.source === 'custom') {
      const custom_api = buildCustomApi(profile);
      if (!custom_api) {
        throw new Error('自定义来源未配置（需填代理预设或 URL/Key/模型）');
      }
      config.custom_api = custom_api;
    }
    // local：不传 custom_api，用酒馆当前对话源
    const out = await gen(config);
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

  WM.LLMClient = { complete, testConnection, buildCustomApi, getGenerate };
})();
