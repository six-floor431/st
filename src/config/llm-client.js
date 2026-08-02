// LLM 调用封装：全部走酒馆官方 generate / generateRaw
// 复用酒馆的源管理、代理预设、模型列表、流式等能力，不自己手写 fetch。
// 通过 custom_api 参数切换调用来源（参考 lolocard-master 的做法）。
(function () {
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 取酒馆官方生成入口（插件在顶层 window 下运行）
  function getGenerate() {
    const ST = window.SillyTavern || {};
    return ST.generate || (ST.generateRaw ? null : null);
  }
  function getGenerateRaw() {
    const ST = window.SillyTavern || {};
    return ST.generateRaw || null;
  }

  // 把 {role,content} 消息列表转成 generateRaw 的 ordered_prompts
  function toOrderedPrompts(messages) {
    return (messages || []).map((m) => ({ role: m.role || 'user', content: m.content || '' }));
  }

  // 由 profile 组装酒馆 custom_api 配置（custom 来源时）
  function buildCustomApi(p) {
    if (!p) return null;
    // 优先使用酒馆代理预设（proxy_preset）
    if (p.proxyPreset) {
      return { proxy_preset: p.proxyPreset, preset_sources: [] };
    }
    if (p.apiUrl || p.apiKey || p.model) {
      const api = { source: 'custom', apiurl: p.apiUrl || '', key: p.apiKey || '', model: p.model || '' };
      return api;
    }
    return null;
  }

  // 核心：用酒馆官方接口完成一次对话补全
  // opts.profile: { source:'local'|'custom', proxyPreset?, apiUrl?, apiKey?, model? }
  async function complete(messages, opts) {
    opts = opts || {};
    const profile = opts.profile || { source: 'local' };
    const gr = getGenerateRaw();
    const gen = getGenerate();
    if (!gr && !gen) {
      throw new Error('酒馆 generate 接口不可用（请确认在酒馆环境中运行）');
    }
    const ordered_prompts = toOrderedPrompts(messages);

    if (profile.source === 'custom') {
      const custom_api = buildCustomApi(profile);
      if (!custom_api) {
        throw new Error('自定义来源未配置（需填代理预设或 URL/Key/模型）');
      }
      // 用 generateRaw 精确控制 system/user 提示词
      if (gr) {
        const out = await gr({ ordered_prompts, custom_api, max_new_tokens: opts.maxTokens || 512, temperature: opts.temperature });
        return extractText(out);
      }
      const out = await gen({ user_input: (messages[messages.length - 1] || {}).content || '', custom_api, max_new_tokens: opts.maxTokens || 512 });
      return extractText(out);
    }

    // local：用酒馆当前源（shared-api）
    if (gr) {
      const out = await gr({ ordered_prompts, max_new_tokens: opts.maxTokens || 512, temperature: opts.temperature });
      return extractText(out);
    }
    const out = await gen({ user_input: (messages[messages.length - 1] || {}).content || '', max_new_tokens: opts.maxTokens || 512 });
    return extractText(out);
  }

  // 解析酒馆 generate 返回的文本
  function extractText(out) {
    if (typeof out === 'string') return out;
    if (out && typeof out === 'object') {
      if (typeof out.reply === 'string') return out.reply;
      if (Array.isArray(out.choices) && out.choices[0]) {
        const m = out.choices[0].message || out.choices[0].text || {};
        return m.content || m.text || '';
      }
      if (typeof out.content === 'string') return out.content;
    }
    return String(out || '');
  }

  // 测试连接：按 profile 发一句测试
  async function testConnection(opts) {
    opts = opts || {};
    const profile = opts.profile || { source: 'local' };
    try {
      const out = await complete(
        [{ role: 'system', content: '你是测试助手。' }, { role: 'user', content: '回复一个字：好' }],
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

  WM.LLMClient = { complete, testConnection, buildCustomApi };
})();
