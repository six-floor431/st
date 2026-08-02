// 总结服务：用 LLM 把聊天楼层提炼为「有温度的记忆」
// 对标 memoir 的事实骨架，但明确要求保留情绪/语气/互动细节/关系温度
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 有温度的总结系统提示词
  const WARM_SYSTEM = `你是一位温柔而敏锐的「记忆整理者」。
任务：把一段角色与用户的对话，提炼成角色能长久记住、且「有温度」的记忆。

记录原则：
1. 既要客观事实（发生了什么、谁在场、关键对话原话、决定与约定），也要保留「温度」：
   - 角色或用户的情绪、语气、小习惯、昵称、玩笑方式；
   - 互动中流露的在意、依赖、试探、安心等关系信号；
   - 让这段回忆读起来像「角色亲身经历后舍不得忘的事」，而非冷冰冰的档案。
2. 禁止编造未发生的日期、动机或因果；不确定就写「似乎/也许」。
3. 输出纯文本，用以下分段标题：

【主线记忆】
（连贯的前因后果，带情绪与细节）

【支线/闲聊】
（轻松互动、梗、习惯、语气）

【关系温度】
（角色对用户的感受变化：亲近/戒备/依赖/暧昧/安心…以及用户的态度）

【状态变更】
人物身份：
关系变化：
关键物品/约定：
未解决事项：`;

  const USER_TPL = `请从第 {{start_floor}} 层到第 {{end_floor}} 层对话中，整理出有温度的记忆：\n\n{{chat_history}}`;

  function buildUserPrompt(start, end, history) {
    return USER_TPL.replace('{{start_floor}}', start).replace('{{end_floor}}', end).replace('{{chat_history}}', history);
  }

  // 调用 LLM：优先独立 API，否则用酒馆已配 API
  async function callLLM(system, user, settings) {
    const mode = (settings && settings.summaryMode) || 'independent-api';
    if (mode === 'independent-api' && settings && settings.embedding && settings.embedding.apiKey) {
      // 复用 embedding 配置的 key 作为独立总结 API（可改为专门 summary apiKey）
      const base = WM.EmbeddingClient.normalizeBaseUrl(settings.embedding.baseUrl) || 'https://api.openai.com/v1';
      const url = base.replace(/\/?v1\/?$/, '') + '/v1/chat/completions';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + settings.embedding.apiKey,
        },
        body: JSON.stringify({
          model: settings.summaryModel || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.7,
        }),
      });
      const j = await r.json();
      return j.choices && j.choices[0] && j.choices[0].message.content;
    }
    // 回退：酒馆已配 API
    if (window.SillyTavern && window.SillyTavern.sendGenerateRequest) {
      // 走酒馆 world/extension 生成（简化：用 main_api 直连）
    }
    // 通用回退：使用 SillyTavern 的 textgeneration
    if (window.textgeneration && window.textgeneration.generate) {
      return await window.textgeneration.generate([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);
    }
    throw new Error('未配置可用的总结 LLM（请填 independent-api 的 apiKey 或使用酒馆 API）');
  }

  // 对聊天区间做有温度的总结
  async function summarizeRange(start, end, settings) {
    const ctx = window.SillyTavern ? window.SillyTavern.getContext() : null;
    if (!ctx || !ctx.chat) throw new Error('无法获取聊天上下文');
    const slice = ctx.chat.slice(start, end + 1).filter((m) => m && !m.is_system);
    const history = slice.map((m, i) => `${m.is_user ? '用户' : '角色'}：${m.mes}`).join('\n');
    const text = await callLLM(WARM_SYSTEM, buildUserPrompt(start + 1, end + 1, history), settings);
    return text;
  }

  WM.Summary = { WARM_SYSTEM, buildUserPrompt, summarizeRange, callLLM };
})();
