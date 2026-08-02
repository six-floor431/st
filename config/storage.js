// 本地持久化：记忆条目、总结指针、向量目录、设置
// 优先 IndexedDB（localforage 风格封装），降级到 localStorage
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const DB_NAME = 'warm_memo';
  const STORE = 'kv';
  let _db = null;

  function openDB() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function get(key, fallback) {
    _db = _db || (await openDB());
    if (_db) {
      return new Promise((resolve) => {
        const tx = _db.transaction(STORE, 'readonly');
        const rq = tx.objectStore(STORE).get(key);
        rq.onsuccess = () => resolve(rq.result !== undefined ? rq.result : fallback);
        rq.onerror = () => resolve(fallback);
      });
    }
    try {
      const v = localStorage.getItem('wm:' + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  async function set(key, value) {
    _db = _db || (await openDB());
    if (_db) {
      return new Promise((resolve) => {
        const tx = _db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    }
    try {
      localStorage.setItem('wm:' + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  WM.Storage = { get, set, openDB };
})();
