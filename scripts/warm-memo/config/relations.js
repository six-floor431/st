// 关系图：从有温度记忆里抽取「实体-关系」节点，供 SVG 力图渲染
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 使用 LLM 从总结文本抽取关系三元组，返回 [{from, to, label}]
  async function extractRelations(memoryText, settings) {
    if (!memoryText || !memoryText.trim()) return [];
    const sys = `从下面的「有温度记忆」中，抽取角色与用户之间、以及角色与角色/事物之间的关系。
要求：每行一个三元组，格式严格为 实体A|关系|实体B（用竖线分隔，不要其他符号）。
只抽取明确提到或明显暗示的关系。最多 15 条。`;
    try {
      const raw = await WM.Summary.callLLM(sys, memoryText, settings);
      if (!raw) return [];
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('|'))
        .map((l) => {
          const [from, label, to] = l.split('|').map((x) => x.trim());
          return from && to ? { from, label: label || '关联', to } : null;
        })
        .filter(Boolean);
    } catch (e) {
      console.warn('[WarmMemo] 关系抽取失败', e);
      return [];
    }
  }

  WM.Relations = { extractRelations };
})();
