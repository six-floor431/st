// WarmMemo 入口（源码）
// 各模块为独立 IIFE，挂在 window.WarmMemo 上互相解耦。
// 用 esbuild 打包为本目录的 index.js（单产物，供酒馆加载，零子请求）。

// 构建版本标记：每次发布时同步修改，用于确认酒馆加载的是否为最新版
window.WarmMemo = window.WarmMemo || {};
window.WarmMemo.version = 'fix-summary-stale-settings';

import './config/settings.js';
import './config/storage.js';
import './config/errlog.js';
import './config/debug-log.js';
import './config/memory-store.js';
import './config/llm-client.js';
import './config/vector-store.js';
import './config/embedding-client.js';
import './config/rerank-client.js';
import './config/worldbook.js';
import './config/plot.js';
import './config/summary.js';
import './config/relations.js';
import './config/injection.js';
import './config/floor-hider.js';
import './ui/launcher.js';

// ── 启动 ──
if (window.WarmMemo && window.WarmMemo.Launcher) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.WarmMemo.Launcher.init());
  else window.WarmMemo.Launcher.init();
} else {
  console.error('[WarmMemo] 启动失败：Launcher 未定义');
}
console.log('[WarmMemo] 就绪');
