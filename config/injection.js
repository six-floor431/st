// 注入服务：把已确认的「有温度记忆」以 extension prompt 注入上下文
// 对标 memoir 的 setExtensionPrompt 用法
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const KEY = 'warm_memo_summary';

  function wrap(text, tag) {
    if (!tag) return text;
    return `<${tag}>\n${text}\n</${tag}>`;
  }

  // 同步注入（常驻式，覆盖同一插槽避免堆叠）
  function sync(text, settings) {
    if (!window.SillyTavern || !window.SillyTavern.setExtensionPrompt) return false;
    if (!text || !text.trim()) {
      window.SillyTavern.setExtensionPrompt(KEY, '', 0, 0, false, 'system');
      return true;
    }
    const depth = (settings && settings.summaryDepth) || 1;
    const role = (settings && settings.summaryRole) || 'system';
    const tag = settings && settings.summaryWrapTag;
    const position = 0; // IN_PROMPT
    window.SillyTavern.setExtensionPrompt(KEY, wrap(text.trim(), tag), position, depth, false, role);
    return true;
  }

  function clear() {
    if (window.SillyTavern && window.SillyTavern.setExtensionPrompt) {
      window.SillyTavern.setExtensionPrompt(KEY, '', 0, 0, false, 'system');
    }
  }

  WM.Injection = { sync, clear, KEY };
})();
