// 服务端代理：借鉴酒馆原生 SD 模块的服务端转发机制，
// 通过酒馆后端 /proxy/:url(*) 端点把浏览器请求转发到任意外部 URL。
//   原理：前端 → 酒馆后端（同源无 CORS）→ 目标服务（服务器到服务器无 CORS）
//   这就是酒馆自带 SD 模块能从外网连接本地 ComfyUI 的核心秘密。
//   同理，向量/embedding/rerank 服务也能走这条路，彻底干掉同源代理改写。
//
// 酒馆 CORS Proxy 端点：
//   路由：ALL /proxy/:url(*)  （:url 是通配参数，匹配 URL 剩余部分）
//   启用条件：config.yaml 中 enableCorsProxy: true，或 CLI --corsProxy
//   认证：需要登录（session cookie，浏览器自带）
//   CSRF：显式跳过（不需要 X-CSRF-Token）
//   限制：禁止循环请求（不能代理回自身 URL）；无 URL 白名单
//   转发：method/headers/body 原样转发（移除 host/cookie/origin 等敏感头）
//   响应：状态码+头+体流式转发（支持 SSE）
//
// 如果 /proxy/ 不可用（未启用），回退到旧的 applyVecProxy 同源代理改写。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  // 代理可用性缓存：null=未检测, true=可用, false=不可用
  let _proxyAvailable = null;
  let _detecting = null;

  // 检测酒馆 /proxy/ 端点是否可用
  // 策略：发一个 HEAD 请求到 /proxy/http://127.0.0.1:1/_wm_probe
  //   - 返回非 404 → 代理已启用（即使目标是连接失败也是代理在转发）
  //   - 返回 404 → 代理未启用（酒馆返回 "CORS proxy is disabled" 消息）
  async function detectProxy() {
    if (_proxyAvailable !== null) return _proxyAvailable;
    if (_detecting) return _detecting;
    _detecting = (async () => {
      try {
        // 用一个几乎必定连接失败但路径合法的 URL 做探测
        // 代理启用时：酒馆后端会尝试 fetch 这个 URL → 连接失败 → 返回 500
        // 代理禁用时：酒馆后端直接返回 404 + "CORS proxy is disabled" 消息
        const res = await fetch('/proxy/http://127.0.0.1:1/_wm_probe', {
          method: 'HEAD',
          // 不需要 CSRF token（/proxy/ 路径显式跳过）
        });
        // 404 = 代理未启用；其他状态码（500 等）= 代理已启用但目标不可达
        _proxyAvailable = res.status !== 404;
      } catch (e) {
        // fetch 本身失败（网络问题）→ 保守判断为不可用
        _proxyAvailable = false;
      }
      _detecting = null;
      try { console.log('[WarmMemo][server-proxy] /proxy/ 端点可用性：' + _proxyAvailable); } catch (_) {}
      return _proxyAvailable;
    })();
    return _detecting;
  }

  // 把外部 URL 改写为 /proxy/<url> 格式（如果代理可用）
  // 如果代理不可用或 URL 已是同源/相对路径，原样返回
  function proxyRewrite(url) {
    if (!url) return url;
    // 相对路径/非 http(s) → 已是同源，不需要代理
    if (!/^https?:\/\//i.test(url)) return url;
    // 代理不可用 → 原样返回（由调用方决定是否走 applyVecProxy 等旧方案）
    if (_proxyAvailable !== true) return url;
    // 已经是 /proxy/ 开头 → 不重复改写
    if (/^\/proxy\//i.test(url)) return url;
    return '/proxy/' + url;
  }

  // 统一 fetch 包装：自动检测代理可用性并改写 URL
  //   代理可用 → 请求 /proxy/<原始url>（同源，无 CORS）
  //   代理不可用 → 原始 URL 直连（浏览器可能遇到 CORS，由调用方处理错误）
  // opts: { headers, method, body, signal }
  async function proxyFetch(url, opts) {
    // 确保 proxy 检测已发起（如果还没检测过）
    if (_proxyAvailable === null) {
      await detectProxy();
    }
    const finalUrl = proxyRewrite(url);
    const finalOpts = opts || {};
    // 代理模式下去掉手动设置的 CORS 相关头（代理会处理）
    // 但保留 Authorization（代理不移除它，需要转发给目标 API）
    return fetch(finalUrl, finalOpts);
  }

  // 检测是否需要同源代理改写（旧的 applyVecProxy 方案）
  // 当 /proxy/ 可用时返回 false（不需要同源代理了）
  // 当 /proxy/ 不可用时返回 true（需要同源代理改写）
  function needsLegacyProxy() {
    return _proxyAvailable !== true;
  }

  // 判断当前是否外网访问（非本地 8000/8001 端口）
  function isExternalAccess() {
    try {
      const origin = (window.top && window.top.location && window.top.location.origin) || window.location.origin;
      if (!origin || origin === 'null') return false;
      const u = new URL(origin);
      const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      // 本地端口：8000/8001 → 本地访问，不需要任何代理
      if (port === '8000' || port === '8001') return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  WM.ServerProxy = {
    detectProxy,
    proxyRewrite,
    proxyFetch,
    needsLegacyProxy,
    isExternalAccess,
    // 直接暴露可用性状态（供 UI 显示）
    isAvailable: () => _proxyAvailable === true,
  };

  // 启动时立即检测（不阻塞页面加载，detectProxy 本身是异步的）
  if (typeof window !== 'undefined') {
    detectProxy().catch(() => {});
  }
})();
