// 世界设定模块：
// 1) 客观读取：角色卡 description/personality、用户卡、世界书（lorebook）现有条目、当前总结。
// 2) 用 LLM 推断当前世界观设定（背景、势力、规则、地点等）。
// 3) 写回：存 chat_metadata（WM.MemoryStore.setWorld，真实持久化+注入）；
//    可选写入世界书（需真实 API：ctx.saveWorldInfo(name, data)，name 在设置里填）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function getCtx() {
    return window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
  }

  // 读取角色卡信息（真实字段）
  function getCharacterCard() {
    try {
      const ctx = getCtx();
      const id = ctx && (ctx.characterId !== undefined ? ctx.characterId : ctx.currentCharacterId);
      const card = (ctx && ctx.characters && ctx.characters[id]) || (ctx && ctx.character);
      if (!card) return null;
      return {
        name: card.name,
        description: card.description || '',
        personality: card.personality || '',
        scenario: card.scenario || '',
        first_mes: card.first_mes || '',
      };
    } catch (e) { return null; }
  }

  // 读取用户卡 / 人物卡
  function getUserCard() {
    try {
      const ctx = getCtx();
      const u = ctx && ctx.user;
      if (!u) return null;
      return { name: u.name || '', description: u.description || '' };
    } catch (e) { return null; }
  }

  // 读取世界书（lorebook）现有条目（尽力而为：优先 extensionSettings.worldInfo 数组）
  function getLorebookEntries() {
    try {
      const ctx = getCtx();
      const wi = ctx && ctx.extensionSettings && ctx.extensionSettings.worldInfo;
      if (Array.isArray(wi)) {
        return wi.map((e) => ({ key: (e && (e.key || e.comment)) || '', content: (e && e.content) || '' }));
      }
      return [];
    } catch (e) { return []; }
  }

  // 写入世界书（真实 API：ctx.saveWorldInfo(name, data)）
  // 需要世界书名（settings.lorebookName）。无名字则仅在 chat_metadata 存（仍注入）。
  async function writeToLorebook(title, content) {
    const ctx = getCtx();
    const s = WM.Settings.load();
    const name = s.lorebookName;
    if (!name) return { ok: false, reason: 'no_name' };
    if (!ctx || typeof ctx.saveWorldInfo !== 'function') return { ok: false, reason: 'api_missing' };
    try {
      // 世界书 v2 结构：{ entries: { [uid]: { comment, content, ... } } }
      const data = { entries: {} };
      const uid = Date.now();
      data.entries[uid] = {
        comment: '[WarmMemo世界观] ' + (title || '世界观'),
        content,
        constant: true,
        enabled: true,
        insertion_order: 0,
        position: 'before_char',
        depth: 4,
      };
      await ctx.saveWorldInfo(name, data);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message || 'write_failed' };
    }
  }

  // 推断世界观：综合角色卡+用户卡+世界书+当前总结
  async function inferWorldview(settings, opts) {
    opts = opts || {};
    const char = getCharacterCard() || {};
    const user = getUserCard() || {};
    const lore = getLorebookEntries();
    const prevWorld = WM.MemoryStore.getWorld() || '';
    const memories = WM.MemoryStore.getMemories();
    const recent = memories.slice(-40).map((m) => m.text).join('\n');
    const extra = opts.extraInstruction || '';

    const sys = `你是世界观整理助手。请基于以下【素材】整理/更新【世界观设定】。
素材包含：角色卡设定、用户卡、世界书现有条目、已有的世界观、近期有温度记忆、用户补充指令。
要求：
- 输出纯文本「世界观设定」，分段清晰（背景/势力与组织/地点/规则与常识/特殊设定等）。
- 保持与已有世界观一致；若素材矛盾以近期记忆为准；不要编造素材没有的根本性设定。
- 语言风格与角色设定贴合，简洁有温度。长度适中。`;

    let userMsg = `【角色卡】\n名称：${char.name || '未知'}\n描述：${char.description || '无'}\n性格：${char.personality || '无'}\n场景：${char.scenario || '无'}\n\n`;
    userMsg += `【用户卡】\n名称：${user.name || '未知'}\n描述：${user.description || '无'}\n\n`;
    userMsg += `【世界书现有条目】\n` + (lore.length ? lore.map((l) => `· ${l.key}: ${l.content.slice(0, 200)}`).join('\n') : '（无）') + `\n\n`;
    userMsg += `【已有世界观】\n${prevWorld || '（无）'}\n\n`;
    userMsg += `【近期记忆】\n${recent || '（无）'}\n\n`;
    if (extra) userMsg += `【用户补充/自定义更新】\n${extra}\n\n`;
    userMsg += `请输出更新后的世界观设定：`;

    const out = await WM.Summary.callLLM(sys, userMsg, settings, { maxTokens: 1200 });
    if (!out || !out.trim()) throw new Error('世界观 LLM 调用失败（未返回内容，检查模型配置）');
    return out.trim();
  }

  WM.Worldbook = { getCharacterCard, getUserCard, getLorebookEntries, writeToLorebook, inferWorldview };
})();
