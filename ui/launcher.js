// 启动器与 UI：输入框旁的「🌿 记忆」按钮 + 水墨风抽屉面板。
// 面板含：自动总结（含自定义楼层）、记忆检索、动态关系图、剧情线、物品追踪、世界设定、设置。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  let panelEl = null, btnEl = null, graphSvg = null, graphTimer = null;

  function findInputContainer() {
    const sel = ['#send_form .input-options', '#rightSendContainer .input-options', '#send_form', '#input-options', '.input-options'];
    for (const s of sel) { const el = document.querySelector(s); if (el) return el; }
    return null;
  }

  function ensurePanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'warmmemo-panel';
    panelEl.className = 'wm-panel';
    panelEl.innerHTML = `
      <div class="wm-header">
        <span class="wm-title">🌿 温记 · WarmMemo</span>
        <button class="wm-close" title="收起">×</button>
      </div>
      <div class="wm-tabs">
        <button data-tab="auto" class="active">自动总结</button>
        <button data-tab="mem">记忆</button>
        <button data-tab="rel">关系图</button>
        <button data-tab="plot">剧情线</button>
        <button data-tab="item">物品</button>
        <button data-tab="world">世界设定</button>
        <button data-tab="cfg">设置</button>
      </div>
      <div class="wm-body"></div>`;
    document.body.appendChild(panelEl);
    panelEl.querySelector('.wm-close').onclick = () => panelEl.classList.remove('open');
    panelEl.querySelectorAll('.wm-tabs button').forEach((b) => {
      b.onclick = () => {
        panelEl.querySelectorAll('.wm-tabs button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderTab(b.dataset.tab);
      };
    });
    return panelEl;
  }

  function injectButton() {
    const container = findInputContainer();
    if (!container) { setTimeout(injectButton, 800); return; }
    if (document.getElementById('warmmemo-btn')) return;
    btnEl = document.createElement('button');
    btnEl.id = 'warmmemo-btn';
    btnEl.className = 'wm-input-btn menu_button';
    btnEl.type = 'button';
    btnEl.title = '温记 · 记忆与世界观';
    btnEl.textContent = '🌿 记忆';
    btnEl.onclick = () => { ensurePanel(); panelEl.classList.toggle('open'); if (panelEl.classList.contains('open')) renderTab('auto'); };
    container.appendChild(btnEl);
  }

  // ── 各 Tab 渲染 ──
  function renderTab(tab) {
    const body = panelEl.querySelector('.wm-body');
    if (tab === 'auto') return renderAuto(body);
    if (tab === 'mem') return renderMem(body);
    if (tab === 'rel') return renderRel(body);
    if (tab === 'plot') return renderPlot(body);
    if (tab === 'item') return renderItem(body);
    if (tab === 'world') return renderWorld(body);
    if (tab === 'cfg') return renderCfg(body);
  }

  function renderAuto(body) {
    const s = WM.Settings.load();
    const total = (WM.Summary.getChatMessages && WM.Summary.getChatMessages().length) || 0;
    body.innerHTML = `
      <div class="wm-card">
        <div class="wm-h">自动总结（有温度记忆）</div>
        <label class="wm-row"><input type="checkbox" id="a-on" ${s.autoSummaryEnabled ? 'checked' : ''}/> 开启自动总结</label>
        <div class="wm-row">总结模式：
          <select id="a-mode">
            <option value="new" ${s.autoSummaryMode==='new'?'selected':''}>仅新增楼层</option>
            <option value="count" ${s.autoSummaryMode==='count'?'selected':''}>最近 N 条</option>
            <option value="range" ${s.autoSummaryMode==='range'?'selected':''}>自定义楼层区间</option>
          </select>
        </div>
        <div class="wm-row" id="a-count-row" style="${s.autoSummaryMode==='count'?'':'display:none'}">最近条数：
          <input type="number" id="a-count" value="${s.autoSummaryCount}" min="1" max="200" style="width:70px"/>
        </div>
        <div class="wm-row" id="a-range-row" style="${s.autoSummaryMode==='range'?'':'display:none'}">
          楼层 <input type="number" id="a-start" value="${s.autoSummaryStart}" min="0" style="width:64px"/> ~
          <input type="number" id="a-end" value="${s.autoSummaryEnd}" min="-1" style="width:64px"/>（终点 -1 表示最新，共 ${total} 层）
        </div>
        <label class="wm-row"><input type="checkbox" id="a-hide" ${s.autoHideFloors?'checked':''}/> 总结后隐藏已处理楼层</label>
        <div class="wm-h" style="margin-top:10px">自动抽取子任务</div>
        <label class="wm-row"><input type="checkbox" id="a-rel" ${s.autoRelation?'checked':''}/> 关系图</label>
        <label class="wm-row"><input type="checkbox" id="a-plot" ${s.autoPlot?'checked':''}/> 剧情线</label>
        <label class="wm-row"><input type="checkbox" id="a-world" ${s.autoWorld?'checked':''}/> 世界观设定</label>
        <label class="wm-row"><input type="checkbox" id="a-item" ${s.autoItems?'checked':''}/> 物品追踪</label>
        <div class="wm-actions">
          <button id="a-save" class="wm-btn">保存设置</button>
          <button id="a-run" class="wm-btn primary">立即总结</button>
        </div>
        <div class="wm-status" id="auto-status"></div>
      </div>`;
    const mode = body.querySelector('#a-mode');
    mode.onchange = () => {
      body.querySelector('#a-count-row').style.display = mode.value === 'count' ? '' : 'none';
      body.querySelector('#a-range-row').style.display = mode.value === 'range' ? '' : 'none';
    };
    body.querySelector('#a-save').onclick = () => {
      s.autoSummaryEnabled = body.querySelector('#a-on').checked;
      s.autoSummaryMode = mode.value;
      s.autoSummaryCount = parseInt(body.querySelector('#a-count').value, 10) || 20;
      s.autoSummaryStart = parseInt(body.querySelector('#a-start').value, 10) || 0;
      s.autoSummaryEnd = parseInt(body.querySelector('#a-end').value, 10) || -1;
      s.autoHideFloors = body.querySelector('#a-hide').checked;
      s.autoRelation = body.querySelector('#a-rel').checked;
      s.autoPlot = body.querySelector('#a-plot').checked;
      s.autoWorld = body.querySelector('#a-world').checked;
      s.autoItems = body.querySelector('#a-item').checked;
      WM.Settings.save(s);
      body.querySelector('#auto-status').textContent = '✓ 设置已保存';
    };
    body.querySelector('#a-run').onclick = async () => {
      const st = body.querySelector('#auto-status');
      st.textContent = '总结中…';
      const r = await WM.Summary.runSummary(s);
      st.textContent = r.ok ? `✓ 已提炼 ${r.count} 条记忆（楼层 ${r.range}），关系${r.results.relations||0}/剧情${r.results.plots||0}/世界${r.results.world?'✓':'×'}/物品${r.results.items||0}` : '✗ ' + (r.reason || '失败');
    };
  }

  function renderMem(body) {
    const mem = WM.MemoryStore.getMemories();
    let html = `<div class="wm-card"><div class="wm-h">有温度记忆（${mem.length}）</div>
      <input class="wm-search" id="mem-search" placeholder="检索记忆…"/>
      <div class="wm-list" id="mem-list">`;
    html += mem.slice().reverse().map((m) => `<div class="wm-item">${escapeHtml(m.text)}</div>`).join('') || '<div class="wm-empty">暂无记忆，先去「自动总结」生成</div>';
    html += `</div></div>`;
    body.innerHTML = html;
    body.querySelector('#mem-search').oninput = async (e) => {
      const q = e.target.value.trim();
      let list;
      if (q && WM.VectorStore && WM.VectorStore.enabled) {
        WM.VectorStore.lastQuery = q;
        list = WM.VectorStore.search(mem, q, 15);
      } else if (q) {
        list = mem.filter((m) => m.text.includes(q));
      } else list = mem;
      body.querySelector('#mem-list').innerHTML = (list.length ? list.reverse() : list).map((m) => `<div class="wm-item">${escapeHtml(m.text)}</div>`).join('') || '<div class="wm-empty">无匹配</div>';
    };
  }

  function renderRel(body) {
    body.innerHTML = `<div class="wm-card"><div class="wm-h">关系图（动态力导向）</div>
      <div class="wm-hint">线越粗=关系越强，可拖拽节点</div>
      <svg id="wm-graph" class="wm-graph" viewBox="0 0 320 320"></svg>
      <div class="wm-list" id="rel-list"></div></div>`;
    drawGraph(body.querySelector('#wm-graph'));
    const rels = WM.MemoryStore.getRelations();
    body.querySelector('#rel-list').innerHTML = rels.length ? rels.map((r) => `<div class="wm-item">${escapeHtml(r.from)} <span class="wm-weight">${'●'.repeat(r.weight)}</span> ${escapeHtml(r.label)} → ${escapeHtml(r.to)}</div>`).join('') : '<div class="wm-empty">暂无关系，先总结</div>';
  }

  function drawGraph(svg) {
    const rels = WM.MemoryStore.getRelations();
    const names = new Set();
    rels.forEach((r) => { names.add(r.from); names.add(r.to); });
    const nodes = Array.from(names).map((id) => ({ id }));
    if (!nodes.length) { svg.innerHTML = '<text x="160" y="160" text-anchor="middle" fill="#9b8579">暂无关系</text>'; return; }
    const W = 320, H = 320;
    WM.Relations.forceLayout(nodes, rels, W, H);
    const pos = {};
    nodes.forEach((n) => (pos[n.id] = { x: n.x, y: n.y }));
    let s = '';
    rels.forEach((r) => {
      const a = pos[r.from], b = pos[r.to];
      if (!a || !b) return;
      s += `<line x1="${a.x.toFixed(0)}" y1="${a.y.toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${b.y.toFixed(0)}" stroke="#8a9a8b" stroke-width="${r.weight}" stroke-opacity="0.6"/>`;
    });
    nodes.forEach((n) => {
      s += `<circle cx="${n.x.toFixed(0)}" cy="${n.y.toFixed(0)}" r="6" fill="#5b6e57" data-name="${escapeHtml(n.id)}" class="wm-node" style="cursor:grab"/>`;
      s += `<text x="${(n.x+8).toFixed(0)}" y="${(n.y+4).toFixed(0)}" font-size="9" fill="#5b4a3f">${escapeHtml(n.id.length>6?n.id.slice(0,6)+'…':n.id)}</text>`;
    });
    svg.innerHTML = s;
    // 拖拽
    svg.querySelectorAll('.wm-node').forEach((c) => {
      c.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const name = c.getAttribute('data-name');
        const move = (e) => {
          const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
          const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
          c.setAttribute('cx', loc.x); c.setAttribute('cy', loc.y);
        };
        const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      });
    });
  }

  function renderPlot(body) {
    const plots = WM.MemoryStore.getPlots();
    let html = `<div class="wm-card"><div class="wm-h">剧情线（${plots.length}）</div>
      <div class="wm-timeline" id="plot-tl">`;
    const order = { active: 0, done: 1, abandon: 2 };
    const sorted = plots.slice().sort((a, b) => order[a.status] - order[b.status]);
    html += sorted.map((p) => `<div class="wm-plot wm-plot-${p.status}">
        <div class="wm-plot-title">${escapeHtml(p.title)} <span class="wm-badge">${p.status}</span></div>
        <div class="wm-plot-sum">${escapeHtml(p.summary)}</div></div>`).join('') || '<div class="wm-empty">暂无剧情线</div>';
    html += `</div>
      <div class="wm-actions"><button id="plot-run" class="wm-btn primary">从记忆更新剧情线</button></div>
      <div class="wm-status" id="plot-status"></div></div>`;
    body.innerHTML = html;
    body.querySelector('#plot-run').onclick = async () => {
      const st = body.querySelector('#plot-status'); st.textContent = '归纳中…';
      const r = await WM.Summary.runSummary(WM.Settings.load());
      st.textContent = r.ok ? '✓ 剧情线已更新' : '✗ 失败';
      renderPlot(body);
    };
  }

  function renderItem(body) {
    const items = WM.MemoryStore.getItems();
    let html = `<div class="wm-card"><div class="wm-h">物品 / 持有物追踪（${items.length}）</div>
      <div class="wm-row"><input id="it-name" placeholder="物品名"/><input id="it-desc" placeholder="描述"/><input id="it-owner" placeholder="持有者"/></div>
      <button id="it-add" class="wm-btn primary">添加</button>
      <div class="wm-list" id="it-list">`;
    html += items.map((i) => `<div class="wm-item" data-id="${i.id}"><b>${escapeHtml(i.name)}</b> <span class="wm-muted">（${escapeHtml(i.owner||'未知')}）</span><br/>${escapeHtml(i.desc)} <span class="wm-del" data-id="${i.id}">✕</span></div>`).join('') || '<div class="wm-empty">暂无物品</div>';
    html += `</div></div>`;
    body.innerHTML = html;
    body.querySelector('#it-add').onclick = async () => {
      const n = body.querySelector('#it-name').value.trim();
      if (!n) return;
      await WM.MemoryStore.addItem(n, body.querySelector('#it-desc').value, body.querySelector('#it-owner').value);
      renderItem(body);
    };
    body.querySelectorAll('.wm-del').forEach((d) => d.onclick = async () => { await WM.MemoryStore.removeItem(d.dataset.id); renderItem(body); });
  }

  function renderWorld(body) {
    const s = WM.Settings.load();
    const world = WM.MemoryStore.getWorld();
    body.innerHTML = `<div class="wm-card"><div class="wm-h">世界设定</div>
      <div class="wm-hint">基于角色卡/用户卡/世界书/已有记忆推断，写入并注入上下文</div>
      <textarea id="world-ta" class="wm-ta" placeholder="世界观设定…">${escapeHtml(world)}</textarea>
      <div class="wm-row"><input id="world-extra" placeholder="自定义更新指令（可选）" style="flex:1"/></div>
      <label class="wm-row"><input type="checkbox" id="world-lore" ${s.worldToLorebook?'checked':''}/> 同步写入世界书（所有对话共享）</label>
      <div class="wm-actions">
        <button id="world-save" class="wm-btn">保存</button>
        <button id="world-gen" class="wm-btn primary">用 LLM 推断/更新</button>
      </div>
      <div class="wm-status" id="world-status"></div></div>`;
    body.querySelector('#world-save').onclick = async () => {
      await WM.MemoryStore.setWorld(body.querySelector('#world-ta').value);
      body.querySelector('#world-status').textContent = '✓ 已保存';
    };
    body.querySelector('#world-gen').onclick = async () => {
      const st = body.querySelector('#world-status'); st.textContent = '推断中…';
      const w = await WM.Worldbook.inferWorldview(s, { extraInstruction: body.querySelector('#world-extra').value });
      if (w) {
        body.querySelector('#world-ta').value = w;
        await WM.MemoryStore.setWorld(w);
        if (body.querySelector('#world-lore').checked) await WM.Worldbook.writeToLorebook('世界观', w);
        st.textContent = '✓ 世界观已更新';
      } else st.textContent = '✗ 推断失败，请检查模型配置';
    };
  }

  function renderCfg(body) {
    const s = WM.Settings.load();
    body.innerHTML = `<div class="wm-card"><div class="wm-h">设置 · 总结模型（真实 LLM 调用）</div>
      <label class="wm-row">Base URL<input id="c-base" value="${s.summaryBaseUrl}"/></label>
      <label class="wm-row">API Key<input id="c-key" type="password" value="${s.summaryApiKey}" placeholder="sk-..."/></label>
      <label class="wm-row">模型名<input id="c-model" value="${s.summaryModel}" placeholder="如 gpt-4o-mini"/></label>
      <label class="wm-row"><input type="checkbox" id="c-vec" ${s.vectorEnabled?'checked':''}/> 启用向量检索
        <span class="wm-muted">Embed:${s.embeddingBaseUrl||'未填'}</span></label>
      <label class="wm-row"><input type="checkbox" id="c-inj" ${s.injectMemories?'checked':''}/> 注入记忆到上下文（确保角色真的记得）
        <input type="checkbox" id="c-injw" ${s.injectWorld?'checked':''}/> 含世界观</label>
      <div class="wm-actions"><button id="c-save" class="wm-btn primary">保存设置</button></div>
      <div class="wm-hint">不填模型即回退酒馆自带 shared-api（textgeneration）。本地反代填 127.0.0.1。</div></div>`;
    body.querySelector('#c-save').onclick = () => {
      s.summaryBaseUrl = body.querySelector('#c-base').value;
      s.summaryApiKey = body.querySelector('#c-key').value;
      s.summaryModel = body.querySelector('#c-model').value;
      s.vectorEnabled = body.querySelector('#c-vec').checked;
      s.injectMemories = body.querySelector('#c-inj').checked;
      s.injectWorld = body.querySelector('#c-injw').checked;
      WM.Settings.save(s);
      body.querySelector('.wm-hint').textContent = '✓ 已保存';
    };
  }

  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function init() {
    injectButton();
    WM.Injection.init();
    // 自动总结：监听新楼层
    const es = (window.eventSource && window.eventSource.eventNames) ? window.eventSource : (window.SillyTavern && window.SillyTavern.eventSource);
    if (es && es.on) {
      const ev = (window.eventSource && window.eventSource.eventNames) ? window.eventSource.eventNames.MESSAGE_SENT : 'MESSAGE_SENT';
      es.on(ev, autoSummaryHook);
    }
  }

  async function autoSummaryHook() {
    const s = WM.Settings.load();
    if (!s.autoSummaryEnabled) return;
    let range = null;
    if (s.autoSummaryMode === 'count') {
      const total = WM.Summary.getChatMessages().length;
      range = { start: Math.max(0, total - s.autoSummaryCount), end: total - 1 };
    } else if (s.autoSummaryMode === 'range') {
      const total = WM.Summary.getChatMessages().length;
      range = { start: s.autoSummaryStart, end: s.autoSummaryEnd < 0 ? total - 1 : Math.min(s.autoSummaryEnd, total - 1) };
    }
    // 'new' 模式：runSummary 内部从 summaryPointer 继续
    setTimeout(async () => {
      const r = await WM.Summary.runSummary(s, range);
      if (r.ok && s.autoHideFloors && WM.FloorHider && WM.FloorHider.hideUntil) {
        await WM.FloorHider.hideUntil(r.range[1]);
      }
    }, 1500);
  }

  WM.Launcher = { init, renderTab };
})();
