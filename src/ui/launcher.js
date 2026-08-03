// 启动器与 UI：输入框旁的「🌿 记忆」按钮 + 水墨风抽屉面板。
// 面板含：自动总结（含自定义楼层）、记忆检索、动态关系图、剧情线、物品追踪、世界设定、设置。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});

  let panelEl = null, btnEl = null, graphSvg = null, graphTimer = null;

  // 输入框旁的挂载点：优先输入框选项区（桌面/新版通用），逐级回退。
  function findInputContainer() {
    const sel = [
      '#send_form .input-options',
      '#rightSendContainer .input-options',
      '.input-options',
      '#send_form',
      '#input-options',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  // 保底：若找不到输入框容器（某些皮肤/移动端），挂固定悬浮按钮，保证一定可见可点。
  function ensureFloatingButton() {
    if (document.getElementById('warmmemo-btn')) return;
    btnEl = document.createElement('button');
    btnEl.id = 'warmmemo-btn';
    btnEl.className = 'wm-input-btn menu_button wm-float';
    btnEl.type = 'button';
    btnEl.title = '温记 · 记忆与世界观';
    btnEl.textContent = '🌿 记忆';
    btnEl.onclick = openPanel;
    document.body.appendChild(btnEl);
  }

  // 是否窄屏（手机/平板竖屏）。参考柚月记忆：用 matchMedia 判定，决定面板全屏比例
  function isNarrowScreen() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  function ensurePanel() {
    if (panelEl) return panelEl;
    // 遮罩层（点击空白关闭，参考柚月 .acu-window-overlay）
    let overlay = document.getElementById('warmmemo-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'warmmemo-overlay';
      overlay.className = 'wm-overlay';
      overlay.onclick = (e) => { if (e.target === overlay) closePanel(); };
      document.body.appendChild(overlay);
    }
    panelEl = document.createElement('div');
    panelEl.id = 'warmmemo-panel';
    panelEl.className = 'wm-panel';
    panelEl.innerHTML = `
      <div class="wm-header">
        <span class="wm-title">🌿 温记 · WarmMemo</span>
        <div class="wm-controls">
          <button class="wm-ctrl" id="wm-max" title="全屏/还原">⤢</button>
          <button class="wm-ctrl wm-close" title="收起">×</button>
        </div>
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
    overlay.appendChild(panelEl);

    panelEl.querySelector('.wm-close').onclick = closePanel;
    panelEl.querySelector('#wm-max').onclick = () => {
      panelEl.classList.toggle('wm-maximized');
      if (panelEl.classList.contains('wm-maximized')) renderTab(currentTab);
    };
    panelEl.querySelectorAll('.wm-tabs button').forEach((b) => {
      b.onclick = () => {
        panelEl.querySelectorAll('.wm-tabs button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderTab(b.dataset.tab);
      };
    });

    // 窄屏打开时默认全屏，确保不被手机输入栏/导航栏遮挡
    if (isNarrowScreen()) panelEl.classList.add('wm-maximized');
    return panelEl;
  }

  let currentTab = 'auto';
  function closePanel() {
    if (panelEl) panelEl.classList.remove('open', 'wm-maximized');
    const ov = document.getElementById('warmmemo-overlay');
    if (ov) ov.classList.remove('open');
  }

  function openPanel() {
    ensurePanel();
    const ov = document.getElementById('warmmemo-overlay');
    if (ov) ov.classList.add('open');
    panelEl.classList.add('open');
    if (isNarrowScreen()) panelEl.classList.add('wm-maximized');
    renderTab(currentTab);
  }

  // 元素是否实际可见（在视口内、非隐藏、有尺寸）。用于手机端判断挂入的容器是否真的能显示按钮。
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    // 有尺寸且至少有一边在视口内
    if (r.width < 4 && r.height < 4) return false;
    return r.bottom > 0 && r.top < (window.innerHeight || 9999);
  }

  function injectButton() {
    if (document.getElementById('warmmemo-btn')) return;
    const container = findInputContainer();
    if (container && isVisible(container)) {
      btnEl = document.createElement('button');
      btnEl.id = 'warmmemo-btn';
      btnEl.className = 'wm-input-btn menu_button';
      btnEl.type = 'button';
      btnEl.title = '温记 · 记忆与世界观';
      btnEl.textContent = '🌿 记忆';
      btnEl.onclick = openPanel;
      container.appendChild(btnEl);
      // 挂上后再校验一次：若按钮本身仍不可见（容器溢出/负边距遮挡），降级为悬浮按钮
      if (!isVisible(btnEl)) {
        btnEl.remove();
        btnEl = null;
        ensureFloatingButton();
      }
    } else {
      // 手机端/非常规皮肤下输入框容器选择器可能不匹配或不可见：直接降级为悬浮按钮，
      // 保证一定可见可点（避免按钮挂进隐藏容器导致"点了没反应/看不见面板"）。
      ensureFloatingButton();
    }
  }

  // ── 各 Tab 渲染 ──
  function renderTab(tab) {
    currentTab = tab || 'auto';
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
        <div class="wm-h" style="margin-top:10px">标签过滤（总结时剔除标签包裹内容）</div>
        <div class="wm-hint">可自定义多条规则，同一标签也能「多重存在」：勾选多种形态同时生效。①<b>包裹</b>：成对/相同标签删中间（如 &lt;think&gt;…&lt;/think&gt;）；②<b>单标签-留之后</b>：只有开标签时删其<b>之前</b>（如 <code>xxxx &lt;a&gt; 像这种</code> → <code>像这种</code>）；③<b>单标签-留之前</b>：只有开标签时删其<b>之后</b>（如 <code>可见&lt;a&gt;秘密</code> → <code>可见</code>）。</div>
        <div id="tag-rules"></div>
        <div class="wm-row"><button id="tag-add" class="wm-btn">+ 新增标签规则</button></div>
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

    // 标签过滤规则渲染（同一标签可多重形态并存）
    function renderTagRules() {
      const box = body.querySelector('#tag-rules');
      const rules = s.tagStripRules || (s.tagStripRules = []);
      box.innerHTML = rules.map((r, i) => `
        <div class="wm-tag-rule" data-idx="${i}" style="margin:8px 0;padding:6px;border:1px solid #d8cfbf;border-radius:6px">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="checkbox" class="t-on" ${r.enabled ? 'checked' : ''} title="启用整条"/>
            <input class="t-open" value="${escapeHtml(r.open || '')}" placeholder="开标签如 &lt;think&gt;" style="flex:1;min-width:80px"/>
            <span>…</span>
            <input class="t-close" value="${escapeHtml(r.close || '')}" placeholder="闭标签（留空可不填）" style="flex:1;min-width:80px"/>
            <button class="t-del wm-btn" style="padding:2px 8px">删</button>
          </div>
          <div style="display:flex;gap:14px;margin-top:6px;font-size:12px;flex-wrap:wrap">
            <label><input type="checkbox" class="t-wrap" ${r.wrap ? 'checked' : ''}/> 包裹(删中间)</label>
            <label><input type="checkbox" class="t-sb" ${r.singleBefore ? 'checked' : ''}/> 单标签-留之后(删前)</label>
            <label><input type="checkbox" class="t-sa" ${r.singleAfter ? 'checked' : ''}/> 单标签-留之前(删后)</label>
          </div>
        </div>`).join('');
      box.querySelectorAll('.t-del').forEach((btn) => {
        btn.onclick = () => {
          const idx = parseInt(btn.closest('.wm-tag-rule').dataset.idx, 10);
          s.tagStripRules.splice(idx, 1);
          renderTagRules();
        };
      });
    }
    renderTagRules();
    body.querySelector('#tag-add').onclick = () => {
      s.tagStripRules = s.tagStripRules || [];
      // 默认新增：开闭标签都填 + 包裹+单标签留之后都勾（最常用多重组合）
      s.tagStripRules.push({ name: 'new', open: '<new>', close: '</new>', wrap: true, singleBefore: true, singleAfter: false, enabled: true });
      renderTagRules();
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
      // 收集标签过滤规则（以 DOM 当前输入为准，确保勾选/文本改动都已同步）
      s.tagStripRules = Array.from(body.querySelectorAll('#tag-rules .wm-tag-rule')).map((row) => {
        const close = row.querySelector('.t-close').value.trim();
        return {
          name: (row.querySelector('.t-open').value.match(/<([^>\s/]+)/) || [,''])[1] || 'rule',
          open: row.querySelector('.t-open').value.trim(),
          close,
          wrap: row.querySelector('.t-wrap') ? row.querySelector('.t-wrap').checked : false,
          singleBefore: row.querySelector('.t-sb') ? row.querySelector('.t-sb').checked : false,
          singleAfter: row.querySelector('.t-sa') ? row.querySelector('.t-sa').checked : false,
          enabled: row.querySelector('.t-on').checked,
        };
      }).filter((r) => r.open);
      WM.Settings.save(s);
      body.querySelector('#auto-status').textContent = '✓ 设置已保存';
    };
    body.querySelector('#a-run').onclick = async () => {
      const st = body.querySelector('#auto-status');
      st.textContent = '总结中…';
      try {
        const r = await WM.Summary.runSummary(s);
        st.textContent = r.ok
          ? `✓ 已提炼 ${r.count} 条记忆（楼层 ${r.range[0]}-${r.range[1]}），关系${r.results.relations} 剧情${r.results.plots} 世界${r.results.world ? '✓' : '×'} 物品${r.results.items}`
          : '✗ ' + (r.reason || '失败');
      } catch (e) {
        st.textContent = '✗ ' + (e.message || e);
      }
    };
  }

  function renderMem(body) {
    const mem = WM.MemoryStore.getMemories();
    let html = `<div class="wm-card"><div class="wm-h">有温度记忆（${mem.length}）</div>
      <div class="wm-hint">全部记忆按时间倒序直接列出，滚轮 / 手指即可划动浏览</div>
      <div class="wm-actions">
        <button id="mem-export" class="wm-btn">导出</button>
        <button id="mem-import" class="wm-btn">导入</button>
      </div>
      <div class="wm-list" id="mem-list">`;
    html += mem.slice().reverse().map((m) => `<div class="wm-item">${escapeHtml(m.text)}</div>`).join('') || '<div class="wm-empty">暂无记忆，先去「自动总结」生成</div>';
    html += `</div></div>`;
    body.innerHTML = html;
    // 导出
    body.querySelector('#mem-export').onclick = () => {
      const blob = new Blob([WM.MemoryStore.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'warmmemo-memory-' + Date.now() + '.json';
      a.click();
    };
    // 导入
    body.querySelector('#mem-import').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = async () => {
        const txt = await inp.files[0].text();
        try { await WM.MemoryStore.importJSON(txt); renderMem(body); toast('🌿 记忆已导入'); }
        catch (e) { toast('🌿 导入失败：' + (e.message || e)); }
      };
      inp.click();
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
    // 点击节点：显示该实体关系详情
    svg.querySelectorAll('.wm-node').forEach((c) => {
      c.addEventListener('click', () => {
        const name = c.getAttribute('data-name');
        const rels = WM.MemoryStore.getRelations().filter((r) => r.from === name || r.to === name);
        const listEl = document.getElementById('rel-list');
        if (!rels.length) { listEl.innerHTML = `<div class="wm-empty">「${escapeHtml(name)}」暂无关系</div>`; return; }
        listEl.innerHTML = `<div class="wm-h">「${escapeHtml(name)}」的关系（${rels.length}）</div>` + rels.map((r) => {
          const other = r.from === name ? r.to : r.from;
          const dir = r.from === name ? '→' : '←';
          return `<div class="wm-item">${escapeHtml(name)} <span class="wm-weight">${'●'.repeat(r.weight)}</span> ${r.label} ${dir} ${escapeHtml(other)}</div>`;
        }).join('');
      });
    });
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

  async function renderWorld(body) {
    const settings = WM.Settings.load();
    const world = WM.MemoryStore.getWorld();
    // 取「当前角色卡」名称（SillyTavern 上下文），明确这是写当前卡的世界设定
    let charName = '';
    try {
      const ctx = (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext()) || null;
      charName = (ctx && (ctx.name1 || (ctx.characters && ctx.character_card && ctx.character_card.data && ctx.character_card.data.name))) || '';
    } catch (e) { charName = ''; }
    let loreCount = 0;
    try { loreCount = WM.Worldbook.listEntries ? (await WM.Worldbook.listEntries()).length : 0; } catch (e) { loreCount = 0; }
    body.innerHTML = `<div class="wm-card"><div class="wm-h">世界设定 · ${escapeHtml(charName || '当前角色卡')}</div>
      <div class="wm-hint">这是本张角色卡的世界设定，直接书写并保存，会自动注入上下文${(loreCount ? `（已同步世界书 ${loreCount} 条）` : '')}</div>
      <textarea id="world-ta" class="wm-ta" placeholder="直接写下当前角色卡的世界观设定，例如：大陆名、势力、规则、时间线……">${escapeHtml(world)}</textarea>
      <div class="wm-row"><input id="world-extra" placeholder="让 AI 帮你润色/补全的指令（可选，留空则不改写）" style="flex:1"/></div>
      <div class="wm-row"><input id="world-lorename" placeholder="世界书名（同步世界书用，如 lorebook）" value="${settings.lorebookName || ''}" style="flex:1"/></div>
      <label class="wm-row"><input type="checkbox" id="world-lore" ${settings.worldToLorebook?'checked':''}/> 同步写入世界书（所有对话共享）</label>
      <div class="wm-actions">
        <button id="world-save" class="wm-btn primary">保存设定</button>
        <button id="world-gen" class="wm-btn">AI 润色补全</button>
      </div>
      <div class="wm-status" id="world-status"></div></div>`;
    body.querySelector('#world-save').onclick = async () => {
      settings.lorebookName = body.querySelector('#world-lorename').value.trim();
      WM.Settings.save(settings);
      await WM.MemoryStore.setWorld(body.querySelector('#world-ta').value);
      body.querySelector('#world-status').textContent = '✓ 已保存（注入当前角色卡上下文）';
    };
    body.querySelector('#world-gen').onclick = async () => {
      const st = body.querySelector('#world-status'); st.textContent = '润色中…';
      try {
        settings.lorebookName = body.querySelector('#world-lorename').value.trim();
        WM.Settings.save(settings);
        const w = await WM.Worldbook.inferWorldview(settings, { extraInstruction: body.querySelector('#world-extra').value });
        body.querySelector('#world-ta').value = w;
        await WM.MemoryStore.setWorld(w);
        if (body.querySelector('#world-lore').checked) {
          await WM.Worldbook.writeWorld(w);
          st.textContent = '✓ 已润色并写入世界书（独立条目）';
        } else {
          st.textContent = '✓ 已润色（仅当前角色卡记忆+注入）';
        }
      } catch (e) {
        st.textContent = '✗ ' + (e.message || e);
      }
    };
  }

  // 统一的 LLM 调用配置（所有功能共用这一个）
  function renderPaneLlm(s) {
    const c = s.llmConfig || { source: 'local', proxyPreset: '', apiUrl: '', apiKey: '', model: '' };
    const pp = s.presetPrefix || { mode: 'none', importText: '', presetName: '' };
    const prompts = s.prompts || {};
    // 读取酒馆已保存预设名（修复：getPresetNames 是酒馆注入的顶层全局函数）
    let presetNames = [];
    try { presetNames = (WM.LLMClient && WM.LLMClient.listPresetNames) ? WM.LLMClient.listPresetNames() : []; } catch (e) { presetNames = []; }
    // 提示词编辑区块（可编辑：总结 / 关系 / 剧情 / 世界观）
    const promptEditors = [
      { key: 'summary', title: '总结提示词', holder: '支持 {{recent}}', def: '你是我的专属记录员。请基于【最近对话】，按时间顺序提炼关键事实、约定、状态变化、人名/地点/组织、未完成待办。输出条目，每条一行。\n\n【最近对话】\n{{recent}}' },
      { key: 'relations', title: '关系提示词', holder: '支持 {{historySummary}} {{recent}}', def: '你是关系分析师。请基于【历史总结】和【最近对话】，分析「我（用户）与角色之间」的关系状态、亲密度、张力、未解心结。输出结构化条目，每条一行。\n\n【历史总结】\n{{historySummary}}\n\n【最近对话】\n{{recent}}' },
      { key: 'plot', title: '剧情提示词', holder: '支持 {{relations}} {{recent}}', def: '你是剧情梳理者。请基于【关系】和【最近对话】，梳理当前剧情主线、支线、悬念与下一步可能发展。输出条目，每条一行。\n\n【关系】\n{{relations}}\n\n【最近对话】\n{{recent}}' },
      { key: 'worldview', title: '世界观提示词', holder: '支持 {{plot}} {{recent}}', def: '你是世界观提炼者。请基于【剧情线】和【最近对话】，抽取本世界的关键设定：地点、势力、规则、物品、概念。输出条目，每条一行。\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}' },
    ];
    const promptHtml = promptEditors.map((p) => `
      <div style="margin:8px 0">
        <div class="wm-h" style="margin:4px 0">${p.title}</div>
        <div class="wm-hint">占位符：${p.holder}（运行时自动替换为真实数据）</div>
        <textarea id="pprompt-${p.key}" rows="${p.key==='summary'?4:3}" style="width:100%;font-family:monospace;font-size:12px">${escapeHtml(prompts[p.key] != null ? prompts[p.key] : p.def)}</textarea>
      </div>`).join('');
    return `
      <div class="wm-card"><div class="wm-h">LLM 调用配置（统一）</div>
        <div class="wm-hint">所有功能（总结/关系/剧情/世界观/物品）共用这一个 LLM 配置。选择 <b>本地酒馆</b> 即用酒馆当前对话源；选择 <b>自定义配置</b> 可指定代理预设或独立 API。配完可点「测试连接」验证可用性。</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0">
          <span class="wm-h" style="margin:0">调用来源</span>
          <select id="llm-src" title="调用来源">
            <option value="local" ${c.source === 'local' ? 'selected' : ''}>本地酒馆(当前源)</option>
            <option value="custom" ${c.source === 'custom' ? 'selected' : ''}>自定义配置</option>
          </select>
        </div>
        <div id="llm-custom" style="${c.source === 'custom' ? '' : 'display:none'};margin-top:6px">
          <label class="wm-row">代理预设名<input id="llm-preset" value="${escapeHtml(c.proxyPreset)}" placeholder="留空则填下方 URL（酒馆代理预设名）"/></label>
          <label class="wm-row">API URL<input id="llm-url" value="${escapeHtml(c.apiUrl)}" placeholder="https://api.openai.com/v1"/></label>
          <label class="wm-row">API Key<input id="llm-key" type="password" value="${escapeHtml(c.apiKey)}" placeholder="sk-..."/></label>
          <label class="wm-row">模型名<input id="llm-model" value="${escapeHtml(c.model)}" placeholder="如 gpt-4o-mini"/></label>
          <label class="wm-row">输出 Token 上限<input id="llm-maxtok" type="number" min="50" max="4000" step="50" value="${Number(c.maxTokens) || 700}" title="限制模型输出长度，所有功能共用此上限"/> <span class="wm-hint" style="margin:0">所有功能（总结/关系/剧情/世界观）共用，模型会在该范围内完整输出</span></label>
        </div>
        <div class="wm-divider"></div>
        <div class="wm-h" style="margin-top:0">预设前置（拼在我们提示词之前）</div>
        <div class="wm-hint">可选。开启后，会在我们自己编写的提示词<b>前面</b>拼接一段「前置」。<b>导入</b>：直接粘贴/编辑文本；<b>调用酒馆预设</b>：直接引用酒馆里已保存的预设（取其启用的提示词）。</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:6px 0">
          <label><input type="radio" name="pp-mode" value="none" ${pp.mode==='none'?'checked':''}/> 不使用</label>
          <label><input type="radio" name="pp-mode" value="import" ${pp.mode==='import'?'checked':''}/> 导入文本</label>
          <label><input type="radio" name="pp-mode" value="preset" ${pp.mode==='preset'?'checked':''}/> 调用酒馆预设</label>
        </div>
        <div id="pp-import" style="${pp.mode==='import'?'':'display:none'};margin-top:6px">
          <label class="wm-row" style="flex-direction:column;align-items:stretch">前置文本（可编辑）
            <textarea id="pp-import-text" rows="4" style="width:100%;font-family:monospace">${escapeHtml(pp.importText||'')}</textarea>
          </label>
        </div>
        <div id="pp-preset" style="${pp.mode==='preset'?'':'display:none'};margin-top:6px">
          <label class="wm-row">酒馆已保存预设
            <select id="pp-preset-name">
              ${(presetNames||[]).map((n)=>`<option value="${escapeHtml(n)}" ${n===pp.presetName?'selected':''}>${escapeHtml(n)}</option>`).join('') || '<option value="">（无可用预设）</option>'}
            </select>
          </label>
        </div>
        <div class="wm-divider"></div>
        <div class="wm-h" style="margin-top:0">扩展提示词（均可编辑）</div>
        <div class="wm-hint">下面四套提示词负责「总结 / 关系 / 剧情 / 世界观」的具体写法，<b>直接改即可生效</b>。可保留 <code>{{recent}}</code> 等占位符，运行时会自动替换成真实数据。</div>
        ${promptHtml}
      </div>`;
  }

  function renderCfg(body) {
    const s = WM.Settings.load();
    // cfg 内按功能分组的子面板：点某个按钮只显示对应的那一块配置
    const tabs = [
      { key: 'llm', label: 'LLM 调用' },
      { key: 'mem', label: '记忆与注入' },
      { key: 'vec', label: '向量与重排' },
      { key: 'lore', label: '世界书' },
    ];
    const active = (WM._cfgTab) || 'llm';
    body.innerHTML = `
      <div class="wm-subtabs" id="cfg-tabs">
        ${tabs.map((t) => `<button data-tab="${t.key}" class="${t.key === active ? 'active' : ''}">${t.label}</button>`).join('')}
      </div>
      <div id="cfg-pane">${renderPaneLlm(s)}</div>
      <div class="wm-actions" style="margin-top:12px">
        <button id="c-test" class="wm-btn">测试连接</button>
        <button id="c-save" class="wm-btn primary">保存设置</button>
      </div>
      <div id="c-test-result" class="wm-test-box"></div>`;
    // 子面板切换：点按钮只渲染对应功能块
    body.querySelector('#cfg-tabs').querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.tab;
        // 切换前先把当前面板未保存的改动同步回 s，避免切换丢值
        syncPaneToSettings(body, s);
        WM._cfgTab = key;
        body.querySelectorAll('#cfg-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
        const pane = body.querySelector('#cfg-pane');
        if (key === 'llm') pane.innerHTML = renderPaneLlm(s);
        else if (key === 'mem') pane.innerHTML = renderPaneMemory(s);
        else if (key === 'vec') pane.innerHTML = renderPaneVector(s);
        else if (key === 'lore') pane.innerHTML = renderPaneLore(s);
        bindPaneEvents(body, s);
      };
    });
    bindPaneEvents(body, s);

    // 来源切换时显示/隐藏自定义字段（仅当 LLM pane 在 DOM 中时）
    const srcSel = body.querySelector('#llm-src');
    const customBox = body.querySelector('#llm-custom');
    if (srcSel && customBox) {
      // 依据当前值先纠正一次显示
      customBox.style.display = srcSel.value === 'custom' ? '' : 'none';
      srcSel.onchange = () => { customBox.style.display = srcSel.value === 'custom' ? '' : 'none'; };
    }
    // 预设前置 mode 切换显示
    const ppImport = body.querySelector('#pp-import');
    const ppPreset = body.querySelector('#pp-preset');
    const syncPp = () => {
      const m = (body.querySelector('input[name="pp-mode"]:checked') || {}).value || 'none';
      if (ppImport) ppImport.style.display = m === 'import' ? '' : 'none';
      if (ppPreset) ppPreset.style.display = m === 'preset' ? '' : 'none';
    };
    body.querySelectorAll('input[name="pp-mode"]').forEach((r) => { r.onchange = syncPp; });
    syncPp();
  }

  // 把当前已渲染面板内的输入值同步回 s（保证切面板不丢未保存的改动）
  function syncPaneToSettings(body, s) {
    const q = (sel) => body.querySelector(sel);
    if (q('#llm-src')) {
      s.llmConfig = {
        source: q('#llm-src').value,
        proxyPreset: q('#llm-preset').value.trim(),
        apiUrl: q('#llm-url').value.trim(),
        apiKey: q('#llm-key').value.trim(),
        model: q('#llm-model').value.trim(),
        maxTokens: Math.max(50, parseInt(q('#llm-maxtok').value, 10) || 700),
      };
      s.presetPrefix = {
        mode: (q('input[name="pp-mode"]:checked') || {}).value || 'none',
        importText: q('#pp-import-text') ? q('#pp-import-text').value : '',
        presetName: q('#pp-preset-name') ? q('#pp-preset-name').value : '',
      };
      s.prompts = {
        summary: q('#pprompt-summary') ? q('#pprompt-summary').value : s.prompts.summary,
        relations: q('#pprompt-relations') ? q('#pprompt-relations').value : s.prompts.relations,
        plot: q('#pprompt-plot') ? q('#pprompt-plot').value : s.prompts.plot,
        worldview: q('#pprompt-worldview') ? q('#pprompt-worldview').value : s.prompts.worldview,
      };
    }
    if (q('#c-vec')) {
      s.vectorEnabled = q('#c-vec').checked;
      s.rerankEnabled = q('#c-rerank').checked;
      s.injectMemories = q('#c-inj').checked;
      s.injectWorld = q('#c-injw').checked;
    }
    if (q('#c-emb-url')) {
      s.embeddingBaseUrl = q('#c-emb-url').value;
      s.embeddingApiKey = q('#c-emb-key').value;
      s.embeddingModel = q('#c-emb-model').value;
      s.rerankBaseUrl = q('#c-rk-url').value;
      s.rerankApiKey = q('#c-rk-key').value;
      s.rerankModel = q('#c-rk-model').value;
      s.takeoverEmbedding = q('#c-take-emb').checked;
      s.takeoverRerank = q('#c-take-re').checked;
    }
    if (q('#c-lore')) {
      s.lorebookName = q('#c-lore').value.trim();
      s.worldToLorebook = q('#c-wlore').checked;
    }
  }

  // 绑定 cfg 内各面板的交互事件（每次渲染面板后调用）
  function bindPaneEvents(body, s) {
    // 任何输入变更都实时同步回 s，保证切换面板 / 保存不丢未保存的改动
    const pane = body.querySelector('#cfg-pane');
    if (pane) pane.querySelectorAll('input, textarea, select').forEach((el) => {
      el.addEventListener('change', () => syncPaneToSettings(body, s));
      el.addEventListener('input', () => syncPaneToSettings(body, s));
    });
    // 来源切换显示
    const srcSel = body.querySelector('#llm-src');
    const customBox = body.querySelector('#llm-custom');
    if (srcSel && customBox) srcSel.onchange = () => { customBox.style.display = srcSel.value === 'custom' ? '' : 'none'; };
    // 预设前置 mode 切换
    const ppImport = body.querySelector('#pp-import');
    const ppPreset = body.querySelector('#pp-preset');
    body.querySelectorAll('input[name="pp-mode"]').forEach((r) => {
      r.onchange = () => {
        const m = (body.querySelector('input[name="pp-mode"]:checked') || {}).value || 'none';
        if (ppImport) ppImport.style.display = m === 'import' ? '' : 'none';
        if (ppPreset) ppPreset.style.display = m === 'preset' ? '' : 'none';
      };
    });

    // 保存：把当前面板值同步进 s 后整体保存
    const saveBtn = body.querySelector('#c-save');
    if (saveBtn) saveBtn.onclick = () => {
      syncPaneToSettings(body, s);
      WM.Settings.save(s);
      if (WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook();
      toast('🌿 设置已保存');
    };

    // 测试连接：验证统一 LLM 配置 + 世界书 + 向量/重排
    const testBtn = body.querySelector('#c-test');
    if (testBtn) testBtn.onclick = async () => {
      syncPaneToSettings(body, s);
      const box = body.querySelector('#c-test-result');
      const tmpLlm = s.llmConfig || { source: 'local' };
      const tmp = Object.assign({}, s);
      box.innerHTML = '<div class="wm-test-item">⏳ 测试中…</div>';
      const rows = [];
      const add = (name, r, detail) => {
        const ok = r && r.success;
        rows.push(`<div class="wm-test-item ${ok?'wm-ok':'wm-bad'}">${ok?'✅':'❌'} ${name}${ok?('：'+(detail||'')):('：'+(r&&r.error||'失败'))}</div>`);
      };
      try {
        const r = await WM.LLMClient.testConnection({ profile: tmpLlm });
        add('LLM(' + (tmpLlm.source === 'local' ? '本地酒馆' : '自定义') + ')', r, '');
      } catch (e) { add('LLM(统一配置)', { success: false }, String(e.message || e)); }
      try {
        const wbOk = WM.Worldbook && WM.Worldbook.available && WM.Worldbook.available();
        if (wbOk) { const b = await WM.Worldbook.ensureLorebook(); add('世界书(酒馆)', { success: b }, b ? ('已就绪：'+WM.Worldbook.targetName()) : ''); }
        else add('世界书(酒馆)', { success: false }, 'TavernHelper 不可用');
      } catch (e) { add('世界书(酒馆)', { success: false }, String(e.message || e)); }
      try {
        if (tmp.embeddingBaseUrl || tmp.embeddingApiKey || tmp.embeddingModel)
          add('Embedding(向量)', await WM.EmbeddingClient.testConnection(tmp), '');
        else add('Embedding(向量)', { success: true }, '未填，跳过（可留空用酒馆内置）');
      } catch (e) { add('Embedding(向量)', { success: false }, String(e.message || e)); }
      try {
        if (tmp.rerankEnabled || tmp.rerankBaseUrl || tmp.rerankApiKey || tmp.rerankModel)
          add('Rerank(重排)', await WM.RerankClient.testConnection(tmp), '');
        else add('Rerank(重排)', { success: true }, '未填，跳过（可留空用酒馆内置）');
      } catch (e) { add('Rerank(重排)', { success: false }, String(e.message || e)); }
      box.innerHTML = rows.join('');
    };
  }

  // 记忆与注入面板
  function renderPaneMemory(s) {
    return `<div class="wm-card">
      <div class="wm-h">记忆与注入</div>
      <div class="wm-hint">控制记忆如何被检索、重排序并注入到对话上下文中，让角色真正「记得」。</div>
      <label class="wm-row"><input type="checkbox" id="c-vec" ${s.vectorEnabled?'checked':''}/> 启用向量检索</label>
      <label class="wm-row"><input type="checkbox" id="c-rerank" ${s.rerankEnabled?'checked':''}/> 启用重排序(Rerank)</label>
      <label class="wm-row"><input type="checkbox" id="c-inj" ${s.injectMemories?'checked':''}/> 注入记忆到上下文（确保角色真的记得）</label>
      <label class="wm-row"><input type="checkbox" id="c-injw" ${s.injectWorld?'checked':''}/> 注入时含世界观</label>
      <div class="wm-hint">向量 / 重排的具体服务配置在「向量与重排」面板。</div>
    </div>`;
  }

  // 向量与重排面板
  function renderPaneVector(s) {
    return `<div class="wm-card">
      <div class="wm-h">Embedding（向量）配置</div>
      <label class="wm-row">Base URL<input id="c-emb-url" value="${s.embeddingBaseUrl}" placeholder="https://api.openai.com/v1"/></label>
      <label class="wm-row">API Key<input id="c-emb-key" type="password" value="${s.embeddingApiKey}" placeholder="可选"/></label>
      <label class="wm-row">模型<input id="c-emb-model" value="${s.embeddingModel}" placeholder="text-embedding-3-small"/></label>
      <div class="wm-h">Rerank（重排序）配置</div>
      <label class="wm-row">Base URL<input id="c-rk-url" value="${s.rerankBaseUrl}" placeholder="https://api.siliconflow.cn/v1/rerank"/></label>
      <label class="wm-row">API Key<input id="c-rk-key" type="password" value="${s.rerankApiKey}" placeholder="可选"/></label>
      <label class="wm-row">模型<input id="c-rk-model" value="${s.rerankModel}" placeholder="BAAI/bge-reranker-v2-m3"/></label>
      <div class="wm-divider"></div>
      <div class="wm-h">接管酒馆向量 / 重排序</div>
      <label class="wm-row"><input type="checkbox" id="c-take-emb" ${s.takeoverEmbedding?'checked':''}/> 接管向量检索（用我们自己的向量召回世界书条目）</label>
      <label class="wm-row"><input type="checkbox" id="c-take-re" ${s.takeoverRerank?'checked':''}/> 接管重排序（用我们自己的 Rerank 重排召回结果）</label>
    </div>`;
  }

  // 世界书面板（数据按角色卡隔离）
  function renderPaneLore(s) {
    return `<div class="wm-card">
      <div class="wm-h">世界书（数据按角色卡隔离）</div>
      <div class="wm-hint">记忆、关系、剧情会按当前角色卡写入对应世界书，互不串档。</div>
      <label class="wm-row">世界书名<input id="c-lore" value="${s.lorebookName}" placeholder="WarmMemo"/></label>
      <label class="wm-row"><input type="checkbox" id="c-wlore" ${s.worldToLorebook?'checked':''}/> 拆分写入世界书条目（总结/物品/关系各自独立条目）</label>
    </div>`;
  }

  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function init() {
    injectButton();
    // 绑定 WarmMemo 世界书到当前角色卡，实现「每个角色卡数据隔离」
    if (WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook().catch((e) => console.warn('[WarmMemo] 世界书绑定失败', e));
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
    setTimeout(async () => {
      try {
        const r = await WM.Summary.runSummary(s, range);
        if (r.ok) {
          if (s.autoHideFloors && WM.FloorHider && WM.FloorHider.hideUntil) {
            await WM.FloorHider.hideUntil(r.range[1]);
          }
          toast(`🌿 温记：已提炼 ${r.count} 条记忆`);
        } else {
          toast(`🌿 温记：总结未执行（${r.reason}）`);
        }
      } catch (e) {
        toast(`🌿 温记：总结失败 - ${e.message || e}`);
      }
    }, 1500);
  }

  // 轻量 toast 提示（面板未开也能看到）
  function toast(msg) {
    let t = document.getElementById('warmmemo-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'warmmemo-toast';
      t.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(91,110,87,.95);color:#fff;padding:6px 14px;border-radius:12px;font-size:12px;z-index:10000;box-shadow:0 4px 14px rgba(0,0,0,.2)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .5s'; }, 3200);
  }

  WM.Launcher = { init, renderTab, renderCfg, renderWorld, renderAuto };
})();

