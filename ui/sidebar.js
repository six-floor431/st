// 侧边栏 UI：记忆列表 / 检索 / 重排结果 / 关系力图（SVG 自绘，无悬浮窗）
// 适配电脑（右侧抽屉 360px）与手机（全宽 92vw）
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  let settings = null;
  let memories = []; // {id, text, ts, vector?}

  function el(id) { return document.getElementById(id); }

  async function ensureSettings() {
    if (!settings) settings = await WM.Settings.load();
    WM._embedSettings = settings.embedding;
    WM._rerankSettings = settings.rerank;
    return settings;
  }

  function mount() {
    if (document.getElementById('wm-root')) return;
    const root = document.createElement('div');
    root.id = 'wm-root';
    root.innerHTML = `
      <button id="wm-toggle" title="温度记忆">💡</button>
      <div id="wm-panel" class="wm-hidden">
        <div class="wm-header">
          <span>🌡️ 温度记忆</span>
          <button id="wm-close">×</button>
        </div>
        <div class="wm-tabs">
          <button data-tab="memory" class="wm-active">记忆</button>
          <button data-tab="search">检索</button>
          <button data-tab="relation">关系图</button>
          <button data-tab="set">设置</button>
        </div>
        <div class="wm-body">
          <div class="wm-tab" id="wm-tab-memory">
            <button id="wm-summarize" class="wm-btn">✦ 总结当前对话并记忆</button>
            <div id="wm-memory-list"></div>
          </div>
          <div class="wm-tab wm-hidden" id="wm-tab-search">
            <input id="wm-query" placeholder="输入想回忆的事…" />
            <button id="wm-search-btn" class="wm-btn">检索</button>
            <div id="wm-search-result"></div>
          </div>
          <div class="wm-tab wm-hidden" id="wm-tab-relation">
            <button id="wm-relation-btn" class="wm-btn">生成关系力图</button>
            <div id="wm-relation-svg"></div>
          </div>
          <div class="wm-tab wm-hidden" id="wm-tab-set">
            <label>Embedding 启用 <input type="checkbox" id="wm-embed-on"></label>
            <select id="wm-embed-provider"></select>
            <input id="wm-embed-base" placeholder="baseUrl">
            <input id="wm-embed-model" placeholder="model">
            <input id="wm-embed-key" type="password" placeholder="apiKey（本地反代可空）">
            <label>Rerank 启用 <input type="checkbox" id="wm-rerank-on"></label>
            <input id="wm-rerank-base" placeholder="rerank baseUrl">
            <input id="wm-rerank-model" placeholder="rerank model">
            <input id="wm-rerank-key" type="password" placeholder="rerank apiKey">
            <label>总结后隐藏楼层 <input type="checkbox" id="wm-hide-on"></label>
            <button id="wm-save-set" class="wm-btn">保存设置</button>
            <span id="wm-set-msg"></span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    bindEvents();
    renderSettingsUI();
    refreshMemoryList();
  }

  function bindEvents() {
    el('wm-toggle').onclick = () => el('wm-panel').classList.toggle('wm-hidden');
    el('wm-close').onclick = () => el('wm-panel').classList.add('wm-hidden');
    document.querySelectorAll('.wm-tabs button').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.wm-tabs button').forEach((x) => x.classList.remove('wm-active'));
        b.classList.add('wm-active');
        const t = b.dataset.tab;
        ['memory', 'search', 'relation', 'set'].forEach((k) =>
          el('wm-tab-' + k).classList.toggle('wm-hidden', k !== t)
        );
      };
    });
    el('wm-summarize').onclick = doSummarize;
    el('wm-search-btn').onclick = doSearch;
    el('wm-relation-btn').onclick = doRelation;
    el('wm-save-set').onclick = saveSettingsUI;
  }

  async function doSummarize() {
    await ensureSettings();
    const ctx = window.SillyTavern && window.SillyTavern.getContext();
    if (!ctx || !ctx.chat) return alert('无法获取聊天');
    const chat = ctx.chat;
    const lastUserIdx = chat.map((m, i) => (!m.is_system ? i : -1)).filter((i) => i >= 0).pop();
    if (lastUserIdx == null) return;
    const start = 0, end = lastUserIdx;
    el('wm-summarize').textContent = '总结中…';
    try {
      const text = await WM.Summary.summarizeRange(start, end, settings);
      const id = 'mem_' + Date.now();
      memories.push({ id, text, ts: Date.now() });
      await WM.Storage.set('memories', memories);
      // 向量化（若启用）
      if (settings.embedding.enabled) {
        try {
          const vec = await WM.EmbeddingClient.embed(text, settings.embedding);
          await WM.VectorStore.insert(id, text, vec, {});
        } catch (e) { console.warn('向量化失败', e); }
      }
      // 注入上下文
      WM.Injection.sync(text, settings);
      // 隐藏已总结楼层
      if (settings.autoHideFloors) {
        await WM.FloorHider.applySummaryPointerHiding(end + 1, settings);
      }
      refreshMemoryList();
    } catch (e) {
      alert('总结失败：' + (e.message || e));
    } finally {
      el('wm-summarize').textContent = '✦ 总结当前对话并记忆';
    }
  }

  async function doSearch() {
    await ensureSettings();
    if (!settings.embedding.enabled) return alert('请先在设置启用 Embedding');
    const q = el('wm-query').value.trim();
    if (!q) return;
    const vec = await WM.EmbeddingClient.embed(q, settings.embedding);
    const res = await WM.VectorStore.search(vec, settings, settings.recallLimit);
    const box = el('wm-search-result');
    box.innerHTML = res.length ? res.map((r) => `<div class="wm-card">${esc(r.text)}</div>`).join('') : '无匹配记忆';
  }

  async function doRelation() {
    await ensureSettings();
    if (!settings.relationsEnabled) return alert('关系图已在设置关闭');
    const all = memories.map((m) => m.text).join('\n');
    if (!all.trim()) return alert('还没有记忆可生成关系图');
    el('wm-relation-btn').textContent = '生成中…';
    try {
      const rels = await WM.Relations.extractRelations(all, settings);
      renderRelationGraph(rels);
    } catch (e) {
      alert('关系图失败：' + (e.message || e));
    } finally {
      el('wm-relation-btn').textContent = '生成关系力图';
    }
  }

  function renderRelationGraph(rels) {
    const box = el('wm-relation-svg');
    if (!rels.length) { box.innerHTML = '未提取到关系'; return; }
    const nodes = {};
    rels.forEach((r) => { nodes[r.from] = 1; nodes[r.to] = 1; });
    const ids = Object.keys(nodes);
    const W = 320, H = 320, cx = W / 2, cy = H / 2, R = 120;
    const pos = {};
    ids.forEach((n, i) => {
      const a = (i / ids.length) * Math.PI * 2;
      pos[n] = [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    });
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
    rels.forEach((r) => {
      const p1 = pos[r.from], p2 = pos[r.to];
      if (!p1 || !p2) return;
      svg += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#e0799a" stroke-width="1.5"/>`;
      const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
      svg += `<text x="${mx}" y="${my}" font-size="9" fill="#a05a78" text-anchor="middle">${esc(r.label)}</text>`;
    });
    ids.forEach((n) => {
      const p = pos[n];
      svg += `<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="#ffb3c6"/>`;
      svg += `<text x="${p[0]}" y="${p[1] - 10}" font-size="10" fill="#d6336c" text-anchor="middle">${esc(n)}</text>`;
    });
    svg += `</svg>`;
    box.innerHTML = svg;
  }

  async function refreshMemoryList() {
    memories = (await WM.Storage.get('memories', [])) || [];
    const box = el('wm-memory-list');
    if (!box) return;
    box.innerHTML = memories.length
      ? memories.slice().reverse().map((m) => `<div class="wm-card"><small>${new Date(m.ts).toLocaleString()}</small>${esc(m.text)}</div>`).join('')
      : '还没有记忆，点上方按钮总结对话吧';
  }

  async function renderSettingsUI() {
    await ensureSettings();
    const p = el('wm-embed-provider');
    p.innerHTML = Object.entries(WM.EmbeddingClient.PROVIDERS)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    el('wm-embed-on').checked = settings.embedding.enabled;
    el('wm-embed-provider').value = settings.embedding.provider;
    el('wm-embed-base').value = settings.embedding.baseUrl;
    el('wm-embed-model').value = settings.embedding.model;
    el('wm-embed-key').value = settings.embedding.apiKey;
    el('wm-rerank-on').checked = settings.rerank.enabled;
    el('wm-rerank-base').value = settings.rerank.baseUrl;
    el('wm-rerank-model').value = settings.rerank.model;
    el('wm-rerank-key').value = settings.rerank.apiKey;
    el('wm-hide-on').checked = settings.autoHideFloors;
  }

  async function saveSettingsUI() {
    await ensureSettings();
    settings.embedding.enabled = el('wm-embed-on').checked;
    settings.embedding.provider = el('wm-embed-provider').value;
    settings.embedding.baseUrl = el('wm-embed-base').value;
    settings.embedding.model = el('wm-embed-model').value;
    settings.embedding.apiKey = el('wm-embed-key').value;
    settings.rerank.enabled = el('wm-rerank-on').checked;
    settings.rerank.baseUrl = el('wm-rerank-base').value;
    settings.rerank.model = el('wm-rerank-model').value;
    settings.rerank.apiKey = el('wm-rerank-key').value;
    settings.autoHideFloors = el('wm-hide-on').checked;
    WM._embedSettings = settings.embedding;
    WM._rerankSettings = settings.rerank;
    await WM.Settings.save(settings);
    el('wm-set-msg').textContent = '已保存';
    setTimeout(() => (el('wm-set-msg').textContent = ''), 2000);
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  WM.Sidebar = { mount, refreshMemoryList, refreshHidden: refreshMemoryList };
})();
