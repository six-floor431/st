// 关系图：动态力导向图（force-directed）
// 实体为节点，互动为带权边；支持拖拽、碰撞、自动布局、随对话实时更新权重。
// 数据存 chat_metadata（WM.MemoryStore），不占上下文。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 用 LLM 从总结文本抽取关系三元组（带权重），返回 [{from,to,label,weight}]
  // 提示词可编辑：settings.prompts.relations（支持 {{historySummary}} {{recent}} 占位符）
  async function extractRelations(memoryText, settings) {
    if (!memoryText || !memoryText.trim()) return [];
    const tpl = (settings && settings.prompts && settings.prompts.relations) ||
      '从下面的「有温度记忆」中，抽取实体（角色、用户、地点、事物）之间的关系。\n要求：每行一个三元组，格式严格为 实体A|关系|实体B|权重(1-5)。\n权重表示关系强度/互动频率。只抽取明确提到或明显暗示的关系。最多 18 条。\n\n【最近对话】\n{{recent}}';
    const sys = WM.Summary.fillTemplate(tpl, { recent: memoryText, historySummary: memoryText });
    try {
      const raw = await WM.Summary.callLLM(sys, memoryText, settings, {});
      if (!raw) return [];
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('|'))
        .map((l) => {
          const parts = l.split('|').map((x) => x.trim());
          const [from, label, to, w] = parts;
          const weight = Math.max(1, Math.min(5, parseInt(w, 10) || 2));
          return from && to ? { from, label: label || '关联', to, weight } : null;
        })
        .filter(Boolean);
    } catch (e) {
      console.warn('[WarmMemo] 关系抽取失败', e);
      return [];
    }
  }

  // 合并新旧关系（同边累加权重，去重）
  function mergeRelations(oldList, newList) {
    const map = new Map();
    oldList.forEach((r) => map.set(r.from + '\u0001' + r.to + '\u0001' + r.label, r));
    newList.forEach((r) => {
      const k = r.from + '\u0001' + r.to + '\u0001' + r.label;
      const ex = map.get(k);
      if (ex) ex.weight = Math.min(5, (ex.weight || 2) + (r.weight || 1));
      else map.set(k, Object.assign({}, r));
    });
    return Array.from(map.values());
  }

  // 简单力导向布局：迭代若干步后返回每个节点坐标
  function forceLayout(nodes, edges, W, H) {
    const cx = W / 2, cy = H / 2;
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      n.x = cx + 90 * Math.cos(a);
      n.y = cy + 90 * Math.sin(a);
      n.vx = 0; n.vy = 0;
    });
    for (let step = 0; step < 220; step++) {
      // 斥力
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy + 0.01;
          const f = 900 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // 引力（边）
      edges.forEach((e) => {
        const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const target = 70 - e.weight * 6; // 强关系更近
        const f = (d - target) * 0.02;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      // 向心力 + 阻尼 + 位移
      nodes.forEach((n) => {
        n.vx += (cx - n.x) * 0.004;
        n.vy += (cy - n.y) * 0.004;
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(14, Math.min(W - 14, n.x));
        n.y = Math.max(14, Math.min(H - 14, n.y));
      });
    }
    return nodes;
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

  WM.Relations = { extractRelations, mergeRelations, forceLayout, groupByPerson };
})();
