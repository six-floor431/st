// 关系图：实体为节点，互动为带权边；数据存 chat_metadata（WM.MemoryStore），不占上下文。
// 关系抽取由 summary.js 负责（prompt=settings.prompts.relations），本模块只做分组与合并。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 合并新旧关系（同边累加权重，去重）
  function mergeRelations(oldList, newList) {
    const map = new Map();
    // 补默认 weight=1：parseRelations 输出无 weight 字段，历史数据也可能缺，
    //   缺失时渲染层 '●'.repeat(undefined) 会抛 RangeError，整个关系列表会因此空白。
    oldList.forEach((r) => map.set(r.from + '\u0001' + r.to + '\u0001' + r.label, Object.assign({ weight: 1 }, r)));
    newList.forEach((r) => {
      const k = r.from + '\u0001' + r.to + '\u0001' + r.label;
      const ex = map.get(k);
      if (ex) ex.weight = Math.min(5, (ex.weight || 1) + (r.weight || 1));
      else map.set(k, Object.assign({ weight: 1 }, r));
    });
    return Array.from(map.values());
  }

  // 按「主体人物」分组关系：返回 [{ person, keys:[person], text:'与A是…、与B是…' }, ...]
  // 同一人的多条关系挤在一起，不同人分开（满足用户要求）。
  function groupByPerson(relations) {
    if (!relations || !Array.isArray(relations.pairs)) return [];
    const map = {}; // person -> [{other, rel}]
    const pushRel = (person, other, rel) => {
      if (!person || !other) return;
      (map[person] = map[person] || []).push({ other, rel });
    };
    for (const p of relations.pairs) {
      if (!p.from || !p.to) continue;
      const relText = p.label || p.relation || p.rel || '关联';
      pushRel(p.from, p.to, relText);
      pushRel(p.to, p.from, p.label); // 双向：两人各自条目都记录这段关系
    }
    return Object.keys(map).map((person) => {
      const lines = map[person].map((x) => `与${x.other}是${x.rel}`);
      return { person, keys: [person], text: lines.join('、') };
    });
  }

  WM.Relations = { mergeRelations, groupByPerson };
})();
