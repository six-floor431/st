// 世界设定模块：
// 1) 客观读取：角色卡 description/personality、用户卡、世界书（lorebook）现有条目、当前总结。
// 2) 用 LLM 推断当前世界观设定（背景、势力、规则、地点等）。
// 3) 写回：存 chat_metadata（WM.MemoryStore.setWorld）+ 可选写入世界书条目（让所有对话共享世界观）。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 读取角色卡信息（酒馆全局）
  function getCharacterCard() {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      const card = (ctx && ctx.characters && ctx.characters[ctx.characterId]) || null;
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
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      const u = ctx && ctx.user;
      if (!u) return null;
      return { name: u.name || '', description: u.description || '' };
    } catch (e) { return null; }
  }

  // 读取世界书（lorebook）现有条目
  function getLorebookEntries() {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      const lore = ctx && ctx.extensionSettings && ctx.extensionSettings.worldInfo;
      if (lore && Array.isArray(lore)) {
        return lore.map((e) => ({ key: e.key || e.comment || '', content: e.content || '' }));
      }
      return [];
    } catch (e) { return []; }
  }

  // 把世界观写入世界书（新增/更新一条）
  async function writeToLorebook(title, content) {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext();
      const lore = ctx && ctx.extensionSettings && ctx.extensionSettings.worldInfo;
      if (!Array.isArray(lore)) return false;
      const uid = (ctx.extensionSettings && ctx.extensionSettings.worldInfo) || lore;
      const found = lore.find((e) => (e.comment || '').includes('[WarmMemo世界观]'));
      const entry = found || { key: [], content: '' };
      if (!found) { entry.comment = '[WarmMemo世界观] ' + title; lore.push(entry); }
      entry.content = content;
      if (!entry.key) entry.key = [];
      if (typeof window.SillyTavern.saveWorldInfo === 'function') await window.SillyTavern.saveWorldInfo();
      return true;
    } catch (e) { return false; }
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
    const extra = opts.extraInstruction || ''; // 用户自定义更新内容

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
    return out ? out.trim() : '';
  }

  WM.Worldbook = { getCharacterCard, getUserCard, getLorebookEntries, writeToLorebook, inferWorldview };
})();
