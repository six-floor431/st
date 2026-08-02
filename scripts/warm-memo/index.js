// WarmMemo 温度记忆 —— 引导加载器（仅负责按顺序加载模块，逻辑在各模块内）
(function () {
  'use strict';
  if (window.WarmMemo && window.WarmMemo.loaded) {
    console.warn('[WarmMemo] 已加载，跳过重复初始化');
    return;
  }
  const WM = (window.WarmMemo = window.WarmMemo || {});
  WM.loaded = false;
  WM.version = '1.0.0';
  WM.baseUrl = new URL('./', import.meta.url).href;

  // 依赖顺序：底层工具 -> 业务服务 -> UI
  const modules = [
    'config/storage.js',
    'config/settings.js',
    'config/embedding-client.js',
    'config/rerank-client.js',
    'config/vector-store.js',
    'config/floor-hider.js',
    'config/summary.js',
    'config/injection.js',
    'config/relations.js',
    'ui/sidebar.js',
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = WM.baseUrl + src + '?v=' + WM.version;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = (e) => reject(new Error('加载失败: ' + src + ' ' + e));
      document.head.appendChild(s);
    });
  }

  async function boot() {
    for (const m of modules) {
      try {
        await loadScript(m);
      } catch (err) {
        console.error('[WarmMemo] 模块加载错误', err);
      }
    }
    WM.loaded = true;
    if (WM.Sidebar && typeof WM.Sidebar.mount === 'function') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => WM.Sidebar.mount());
      } else {
        WM.Sidebar.mount();
      }
    }
    console.log('[WarmMemo] 初始化完成 v' + WM.version);
  }

  boot();
})();
