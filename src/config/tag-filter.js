// 标签过滤模块：总结前对楼层文本做标签剔除（如 <think>...</think> 思考链）。
// 规则形态（同一标签可多重并存）：
//   wrap=true        => 成对/相同标签「删中间」（open...close 包裹内容删除，含标签本身）
//   singleBefore=true => 残缺单标签「删之前、留之后」（删第一个 open 之前全部，含 open）
//   singleAfter=true  => 残缺单标签「删之后、留之前」（删第一个 open 之后全部，含 open）
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 对单条文本应用单条规则
  function applyRule(text, r) {
    if (!r || !r.open) return text;
    const open = r.open;
    let out = text;

    // 形态①：包裹（成对/相同标签删中间）
    if (r.wrap) {
      const close = (r.close && r.close.trim()) || open; // 不填闭标签则同开标签成对
      const oRe = escapeRegExp(open);
      const cRe = escapeRegExp(close);
      // 贪婪匹配 open...close（含跨行），删掉整段（含标签）
      const re = new RegExp(oRe + '[\\s\\S]*?' + cRe, 'g');
      out = out.replace(re, '');
    }

    // 形态②：单标签-留之后（删第一个 open 之前，含 open）
    if (r.singleBefore) {
      const idx = out.indexOf(open);
      if (idx >= 0) out = out.slice(idx + open.length);
    }

    // 形态③：单标签-留之前（删第一个 open 之后，含 open）
    if (r.singleAfter) {
      const idx = out.indexOf(open);
      if (idx >= 0) out = out.slice(0, idx);
    }

    return out;
  }

  // 对文本应用全部启用的规则
  function strip(text, rules) {
    if (!text) return text;
    if (!Array.isArray(rules) || !rules.length) return text;
    let out = String(text);
    for (const r of rules) {
      if (r && r.enabled !== false && r.open) {
        try { out = applyRule(out, r); } catch (e) { /* 单条规则出错不影响其它 */ }
      }
    }
    // 顺手清理因删除产生的多余空行（连续 3+ 空行压成 2 空行）
    return out.replace(/\n{3,}/g, '\n\n');
  }

  WM.TagFilter = { strip, applyRule, escapeRegExp };
})();
