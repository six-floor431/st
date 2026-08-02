// 入口：SillyTavern 以动态 <script src> 加载本文件，且不保证是 module，
// 因此 document.currentScript / import.meta 都可能不可用。
// 用「遍历 document.scripts 找自身 URL」的方式定位扩展根目录，兼容所有加载方式。
console.log('[WarmMemo] 加载中…');
function getBaseUrl() {
  const cand = [];
  for (const s of document.scripts) {
    if (s.src && /warm_memo\/index\.js(\?.*)?$/.test(s.src)) cand.push(s.src);
  }
  if (cand.length) return cand[cand.length - 1].replace(/index\.js(\?.*)?$/, '');
  // 回退到酒馆第三方扩展约定路径
  return '/scripts/extensions/third-party/warm_memo/';
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('加载失败 ' + src));
    document.head.appendChild(s);
  });
}
(async () => {
  const base = getBaseUrl();
  const files = [
    'config/settings.js',
    'config/storage.js',        // 兼容旧引用（向量缓存仍用）
    'config/memory-store.js',   // 核心：chat_metadata 结构化记忆（仿万楼不忘记）
    'config/llm-client.js',
    'config/vector-store.js',
    'config/embedding-client.js',
    'config/rerank-client.js',
    'config/worldbook.js',      // 角色卡/用户卡/世界书/世界观
    'config/plot.js',           // 剧情线
    'config/summary.js',        // 真实 LLM 总结（分派子任务）
    'config/relations.js',      // 动态力导向关系图
    'config/injection.js',      // 真实注入上下文
    'config/floor-hider.js',
    'ui/launcher.js',           // 输入框旁按钮 + 面板
  ];
  for (const f of files) {
    try { await loadScript(base + f); } catch (e) { console.error(e); }
  }
  if (window.WarmMemo && window.WarmMemo.Launcher) window.WarmMemo.Launcher.init();
  console.log('[WarmMemo] 就绪');
})();
