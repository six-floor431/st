// 全局设置 + 默认值
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const KEY = 'settings';

  const DEFAULTS = {
    // 总结
    summaryEnabled: true,
    summaryDelay: 2,          // 总结指针后再保留多少楼层才隐藏
    summaryDepth: 1,          // 注入深度（越靠近最新消息）
    summaryRole: 'system',    // system / user / assistant
    summaryWrapTag: 'memory', // 包裹标签
    summaryMode: 'independent-api', // independent-api / shared-api
    autoHideFloors: true,     // 总结后隐藏楼层不进上下文
    // embedding
    embedding: {
      enabled: false,
      provider: 'siliconflow',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'BAAI/bge-m3',
      apiKey: '',
    },
    // rerank
    rerank: {
      enabled: false,
      baseUrl: 'https://api.siliconflow.cn/v1/rerank',
      model: 'BAAI/bge-reranker-v2-m3',
      apiKey: '',
      timeoutMs: 3000,
    },
    // 检索
    recallLimit: 6,
    threshold: 0.3,
    // 关系图
    relationsEnabled: true,
  };

  async function load() {
    const saved = (await WM.Storage.get(KEY, null)) || {};
    return Object.assign({}, DEFAULTS, saved, {
      embedding: Object.assign({}, DEFAULTS.embedding, saved.embedding || {}),
      rerank: Object.assign({}, DEFAULTS.rerank, saved.rerank || {}),
    });
  }

  async function save(s) {
    return WM.Storage.set(KEY, s);
  }

  WM.Settings = { DEFAULTS, load, save };
})();
