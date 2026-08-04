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
        <button data-tab="dbg">调试</button>
        <button data-tab="clear" class="wm-tab-danger">清空数据</button>
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
    if (tab === 'dbg') return renderDebug(body);
    if (tab === 'clear') return renderClear(body);
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
            <option value="floor" ${s.autoSummaryMode==='floor'?'selected':''}>按楼层区间（1-20,21-40…）</option>
          </select>
        </div>
        <div class="wm-row" id="a-count-row" style="${s.autoSummaryMode==='count'?'':'display:none'}">最近条数：
          <input type="number" id="a-count" value="${s.autoSummaryCount}" min="1" max="200" style="width:70px"/>
        </div>
        <div class="wm-row" id="a-range-row" style="${s.autoSummaryMode==='range'?'':'display:none'}">
          楼层 <input type="number" id="a-start" value="${s.autoSummaryStart}" min="0" style="width:64px"/> ~
          <input type="number" id="a-end" value="${s.autoSummaryEnd}" min="-1" style="width:64px"/>（终点 -1 表示最新，共 ${total} 层）
        </div>
        <div class="wm-row" id="a-floor-row" style="${s.autoSummaryMode==='floor'?'':'display:none'}">
          每 <input type="number" id="a-floor" value="${s.autoSummaryFloor}" min="1" max="500" style="width:64px"/> 层自动总结一段（如填 20：1-20、21-40、41-60…）
        </div>
        <label class="wm-row"><input type="checkbox" id="a-hide" ${s.autoHideFloors?'checked':''}/> 总结后隐藏已处理楼层</label>
        <details class="wm-fold" open>
          <summary>标签过滤（总结时剔除标签包裹内容）</summary>
          <div class="wm-hint">可自定义多条规则，同一标签也能「多重存在」：勾选多种形态同时生效。①<b>包裹</b>：成对/相同标签删中间（如 &lt;think&gt;…&lt;/think&gt;）；②<b>单标签-留之后</b>：只有开标签时删其<b>之前</b>；③<b>单标签-留之前</b>：只有开标签时删其<b>之后</b>。</div>
          <div id="tag-rules"></div>
          <div class="wm-row"><button id="tag-add" class="wm-btn">+ 新增标签规则</button></div>
        </details>
        <details class="wm-fold" open>
          <summary>自动抽取子任务</summary>
          <div class="wm-hint">记忆类（随总结一起跑）：世界观设定。<br/>物品追踪：<b>同时跟随「总结」和「剧情线」两个流程</b>各跑一次，确保不漏。<br/>剧情类（独立流程，与总结解耦）：剧情线 + 关系图 —— 触发时并联调用，并基于「已有剧情线」自我推进，总结不再顺带跑它们。</div>
          <label class="wm-row"><input type="checkbox" id="a-plotflow" ${s.autoPlotEnabled!==false?'checked':''}/> 启用剧情线独立推进（含关系图）</label>
          <label class="wm-row"><input type="checkbox" id="a-rel" ${s.autoRelation!==false?'checked':''}/> 关系图（随剧情线一并跑）</label>
          <label class="wm-row"><input type="checkbox" id="a-plot" ${s.autoPlot!==false?'checked':''}/> 剧情线</label>
          <label class="wm-row"><input type="checkbox" id="a-world" ${s.autoWorld!==false?'checked':''}/> 世界观设定</label>
          <label class="wm-row"><input type="checkbox" id="a-item" ${s.autoItems!==false?'checked':''}/> 物品追踪（跟总结+剧情线）</label>
        </details>
        <details class="wm-fold">
          <summary>自动大总结（小总结攒够自动整合）</summary>
          <div class="wm-hint">每累计 N 次「小总结」后，自动把近期小总结整合为一份长期记忆（大总结）。大总结与小总结用同一份提示词。攒够即触发，无需手动。</div>
          <label class="wm-row"><input type="checkbox" id="a-big" ${s.bigSummaryEnabled!==false?'checked':''}/> 开启自动大总结</label>
          <label class="wm-row">每 <input type="number" id="a-big-every" value="${Number(s.bigSummaryEvery)||5}" min="2" max="100" style="width:64px"/> 次小总结，自动整合一次大总结</label>
          <label class="wm-row">一次大总结最多回顾 <input type="number" id="a-big-max" value="${Number(s.bigSummaryMaxSegments)||0}" min="0" max="200" style="width:64px"/> 段小总结（0=不限）</label>
        </details>
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
      body.querySelector('#a-floor-row').style.display = mode.value === 'floor' ? '' : 'none';
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
      s.autoSummaryFloor = parseInt(body.querySelector('#a-floor').value, 10) || 20;
      s.autoSummaryStart = parseInt(body.querySelector('#a-start').value, 10) || 0;
      s.autoSummaryEnd = parseInt(body.querySelector('#a-end').value, 10) || -1;
      s.autoHideFloors = body.querySelector('#a-hide').checked;
      s.autoPlotEnabled = body.querySelector('#a-plotflow').checked;
      s.autoRelation = body.querySelector('#a-rel').checked;
      s.autoPlot = body.querySelector('#a-plot').checked;
      s.autoWorld = body.querySelector('#a-world').checked;
      s.autoItems = body.querySelector('#a-item').checked;
      s.autoPlotMode = mode.value;
      s.autoPlotCount = parseInt(body.querySelector('#a-count').value, 10) || 20;
      s.autoPlotFloor = parseInt(body.querySelector('#a-floor').value, 10) || 20;
      s.autoPlotStart = parseInt(body.querySelector('#a-start').value, 10) || 0;
      s.autoPlotEnd = parseInt(body.querySelector('#a-end').value, 10) || -1;
      // 自动大总结配置
      s.bigSummaryEnabled = body.querySelector('#a-big').checked;
      s.bigSummaryEvery = Math.max(2, parseInt(body.querySelector('#a-big-every').value, 10) || 5);
      s.bigSummaryMaxSegments = parseInt(body.querySelector('#a-big-max').value, 10) || 0;
      // 各任务独立输出 Token（二级控制）
      s.taskTokens = s.taskTokens || {};
      s.taskTokens.summary = parseInt(body.querySelector('#tk-summary').value, 10) || 0;
      s.taskTokens.relations = parseInt(body.querySelector('#tk-relations').value, 10) || 0;
      s.taskTokens.plot = parseInt(body.querySelector('#tk-plot').value, 10) || 0;
      s.taskTokens.world = parseInt(body.querySelector('#tk-world').value, 10) || 0;
      s.taskTokens.items = parseInt(body.querySelector('#tk-items').value, 10) || 0;
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
      st.textContent = '处理中…';
      try {
        // 强制重新读取已保存设置，避免用到面板打开时的旧配置（未保存的 BaseURL 不会漏）
        const fresh = WM.Settings.load();
        // 「立即处理」= 强制全部楼层：先写记忆（总结），再独立推进剧情线（并联关系线）
        const r = await WM.Summary.runSummary(fresh, { forceAll: true });
        let msg = '';
        if (r && r.ok) {
          msg += `✓ 记忆 ${r.count} 条（楼层 ${r.range[0]}-${r.range[1]}），世界${r.results.world ? '✓' : '×'} 物品${r.results.items}` + '\n';
        } else {
          msg += '✗ 记忆：' + (r && r.reason ? r.reason : '失败') + '\n';
        }
        const rp = await WM.Summary.triggerPlot(fresh, { forceAll: true });
        if (rp && rp.ok) {
          msg += `✓ 剧情线推进 ${rp.count} 条（关系${rp.results.relations} 剧情${rp.results.plots}）`;
        } else {
          msg += '✗ 剧情线：' + (rp && rp.reason ? rp.reason : '失败');
        }
        st.textContent = msg;
      } catch (e) {
        st.textContent = '✗ ' + (e.message || e);
      }
    };
  }

  // 相对时间（如「3天前」「刚刚」），用于记忆/物品等列表项
  function relTime(ts) {
    if (!ts) return '';
    const d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 86400000 * 30) return Math.floor(d / 86400000) + ' 天前';
    const dt = new Date(ts);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  function renderMem(body) {
    // 记忆 = 手动记忆(memories) + 总结(summaries，即「以真实视角写的开始/经过/结果」叙事)
    const mem = WM.MemoryStore.getMemories().map((m) => ({ ts: m.ts, kind: '记忆', text: m.text }));
    const sums = (WM.MemoryStore.getSummaries() || []).map((s) => ({ ts: s.ts, kind: (s.kind === 'plot' ? '剧情摘要' : '总结'), text: s.text, title: s.title }));
    const all = mem.concat(sums).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    let html = `<div class="wm-card"><div class="wm-h">有温度记忆（${all.length}）</div>
      <div class="wm-hint">包含手动记忆与每次「总结」生成的叙事（按真实视角记录事情的开始、经过、结果）。按时间倒序排列。</div>
      <div class="wm-actions">
        <button id="mem-export" class="wm-btn">导出</button>
        <button id="mem-import" class="wm-btn">导入</button>
      </div>
      <div class="wm-list" id="mem-list">`;
    html += all.length ? all.map((m) => `<div class="wm-item"><div class="wm-item-head"><span class="wm-tag">${escapeHtml(m.kind || '记忆')}</span>${m.ts ? `<span class="wm-ts">${relTime(m.ts)}</span>` : ''}</div>${escapeHtml(m.text)}</div>`).join('') : '<div class="wm-empty">暂无记忆，先去「自动总结」生成</div>';
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

  // 取得对话中的 user 名字（作为关系图中心）
  function getUserName() {
    try {
      const ctx = window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext();
      if (ctx) {
        if (ctx.user && ctx.user.name) return ctx.user.name;
        if (ctx.name1) return ctx.name1;
        const um = (ctx.chat || []).find((m) => m.is_user && m.name);
        if (um) return um.name;
        // 最后尝试从最近一条 user 消息的 content 中提取自称（如"我叫xxx""我是xxx"）
        const lastUserMsg = [...(ctx.chat || [])].reverse().find((m) => m.is_user && m.mes);
        if (lastUserMsg && lastUserMsg.mes) {
          const selfIntro = lastUserMsg.mes.match(/我叫[「"]?([^」"\n,，。]{1,8})[」"]?/) || lastUserMsg.mes.match(/我是[「"]?([^」"\n,，。]{1,8})[」"]?/);
          if (selfIntro) return selfIntro[1].trim();
        }
      }
    } catch (e) {}
    return '我'; // 用"我"代替"用户"，更自然
  }

  // 关系图：以 user 为中心，关系线向外辐射（中心 + 内环直接关联 + 外环间接关联）
  function drawGraph(svg) {
    const rels = WM.MemoryStore.getRelations();
    const names = new Set();
    rels.forEach((r) => { if (r.from) names.add(r.from); if (r.to) names.add(r.to); });
    const nodes = Array.from(names).map((id) => ({ id }));
    if (!nodes.length) { svg.innerHTML = '<text x="160" y="160" text-anchor="middle" fill="#9b8579">暂无关系</text>'; return; }

    const W = 320, H = 320, cx = W / 2, cy = H / 2;
    // 1) 选定中心：优先对话 user 名；否则取度数最高的实体
    const user = getUserName();
    const degree = {};
    rels.forEach((r) => { degree[r.from] = (degree[r.from] || 0) + 1; degree[r.to] = (degree[r.to] || 0) + 1; });
    let center = nodes.find((n) => n.id === user);
    if (!center) {
      let best = null, bestD = -1;
      nodes.forEach((n) => { if ((degree[n.id] || 0) > bestD) { bestD = degree[n.id] || 0; best = n; } });
      center = best || nodes[0];
    }
    // 2) 计算每个节点到中心的最短跳数（BFS），决定环层
    const adj = {};
    rels.forEach((r) => {
      (adj[r.from] = adj[r.from] || []).push(r.to);
      (adj[r.to] = adj[r.to] || []).push(r.from);
    });
    const dist = { [center.id]: 0 };
    const q = [center.id];
    while (q.length) {
      const cur = q.shift();
      (adj[cur] || []).forEach((nb) => {
        if (dist[nb] == null) { dist[nb] = dist[cur] + 1; q.push(nb); }
      });
    }
    nodes.forEach((n) => { if (dist[n.id] == null) dist[n.id] = 99; }); // 孤立节点丢最外环

    const pos = {};
    pos[center.id] = { x: cx, y: cy };
    // 按环层分组
    const rings = {};
    nodes.forEach((n) => { if (n.id === center.id) return; const d = Math.min(dist[n.id], 3); (rings[d] = rings[d] || []).push(n); });
    const ringRadius = { 1: 95, 2: 140, 3: 150 };
    Object.keys(rings).forEach((d) => {
      const arr = rings[d];
      const R = ringRadius[d] || 150;
      arr.forEach((n, i) => {
        const a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
        pos[n.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
      });
    });

    let s = '';
    rels.forEach((r) => {
      const a = pos[r.from], b = pos[r.to];
      if (!a || !b) return;
      const w = Number.isFinite(r.weight) ? r.weight : 2;
      const isUserEdge = (r.from === center.id || r.to === center.id);
      s += `<line x1="${a.x.toFixed(0)}" y1="${a.y.toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${b.y.toFixed(0)}" stroke="var(--wm-jade)" stroke-width="${Math.min(w, 6)}" stroke-opacity="${isUserEdge ? 0.85 : 0.45}" class="wm-edge"/>`;
    });
    nodes.forEach((n) => {
      const isCenter = n.id === center.id;
      s += `<circle cx="${pos[n.id].x.toFixed(0)}" cy="${pos[n.id].y.toFixed(0)}" r="${isCenter ? 9 : 6}" fill="${isCenter ? 'var(--wm-rose)' : 'var(--wm-jade)'}" data-name="${escapeHtml(n.id)}" class="wm-node" style="cursor:grab"/>`;
      const lbl = n.id.length > 6 ? n.id.slice(0, 6) + '…' : n.id;
      s += `<text x="${(pos[n.id].x + (isCenter ? 11 : 8)).toFixed(0)}" y="${(pos[n.id].y + 4).toFixed(0)}" font-size="${isCenter ? 10 : 9}" fill="var(--wm-ink-soft)" ${isCenter ? 'font-weight="bold"' : ''}>${escapeHtml(lbl)}</text>`;
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

  // ── 通用弹窗：fields=[{key,label,type,value,placeholder,hint,options}] ──
  // 返回 Promise，确定时 resolve 表单对象，取消时 resolve null。
  function openModal(opts) {
    return new Promise((resolve) => {
      const fields = opts.fields || [];
      const mask = document.createElement('div');
      mask.className = 'wm-modal-mask';
      const fieldHtml = fields.map((f) => {
        const v = f.value == null ? '' : String(f.value);
        let ctrl;
        if (f.type === 'textarea') {
          ctrl = `<textarea id="wmf-${f.key}" placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(v)}</textarea>`;
        } else if (f.type === 'select') {
          ctrl = `<select id="wmf-${f.key}">${(f.options || []).map((o) =>
            `<option value="${escapeHtml(o.value)}" ${String(o.value) === v ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
        } else if (f.type === 'multiselect') {
          ctrl = `<select id="wmf-${f.key}" multiple size="${Math.min(5, Math.max(2, (f.options || []).length))}">${(f.options || []).map((o) =>
            `<option value="${escapeHtml(o.value)}" ${(Array.isArray(f.value) && f.value.map(String).includes(String(o.value))) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
        } else {
          ctrl = `<input type="text" id="wmf-${f.key}" value="${escapeHtml(v)}" placeholder="${escapeHtml(f.placeholder || '')}"/>`;
        }
        return `<div class="wm-field"><label for="wmf-${f.key}">${escapeHtml(f.label)}</label>${ctrl}${
          f.hint ? `<div class="wm-field-hint">${escapeHtml(f.hint)}</div>` : ''}</div>`;
      }).join('');
      mask.innerHTML = `<div class="wm-modal" role="dialog" aria-modal="true">
        <div class="wm-modal-head">
          <div class="wm-modal-title">${escapeHtml(opts.title || '')}</div>
          <button class="wm-ctrl" data-act="x" aria-label="关闭">×</button>
        </div>
        <div class="wm-modal-body">${fieldHtml}</div>
        <div class="wm-modal-foot">
          <button class="wm-btn" data-act="cancel">取消</button>
          <button class="wm-btn primary" data-act="ok">${escapeHtml(opts.okText || '保存')}</button>
        </div>
      </div>`;
      // 关键：挂到 documentElement(<html>) 而非 body。
      // 手机版/部分皮肤下 document.body 会被酒馆 UI 框架施加 transform/will-change，
      // 导致 position:fixed 的弹窗被相对 body 定位并溢出视口、肉眼"看不见"。
      // <html> 默认无 transform 祖先，挂这里可彻底规避该问题。
      const mountRoot = document.documentElement || document.body;
      mountRoot.appendChild(mask);
      const close = (val) => { if (mask.parentNode) mask.parentNode.removeChild(mask); resolve(val); };
      const collect = () => {
        const out = {};
        for (const f of fields) {
          const el = mask.querySelector('#wmf-' + f.key);
          if (!el) continue;
          if (f.type === 'multiselect') out[f.key] = Array.from(el.selectedOptions || []).map((o) => o.value);
          else out[f.key] = el.value;
        }
        return out;
      };
      mask.querySelector('[data-act="x"]').onclick = () => close(null);
      mask.querySelector('[data-act="cancel"]').onclick = () => close(null);
      mask.querySelector('[data-act="ok"]').onclick = () => close(collect());
      mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(null); });
      const onKey = (e) => {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); }
      };
      document.addEventListener('keydown', onKey);
      setTimeout(() => { const first = mask.querySelector('.wm-modal-body input, .wm-modal-body textarea, .wm-modal-body select'); if (first) first.focus(); }, 30);
    });
  }

  function fmtTs(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch (e) { return ''; }
  }

  // 剧情线：最新在上；左列时间，右列内容
  function renderPlot(body) {
    const plots = WM.MemoryStore.getPlotsSorted
      ? WM.MemoryStore.getPlotsSorted()
      : WM.MemoryStore.getPlots().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));

    const rows = plots.map((p) => {
      const recTime = fmtTs(p.ts);
      const mainTime = p.time || recTime.split(' ')[0] || '未标注';
      const subTime = p.time ? recTime : (recTime.split(' ')[1] || '');
      return `<div class="wm-plot" data-id="${p.id}">
        <div class="wm-plot-time">
          <div class="wm-plot-time-main">${escapeHtml(mainTime)}</div>
          ${subTime ? `<div class="wm-plot-time-sub">${escapeHtml(subTime)}</div>` : ''}
        </div>
        <div class="wm-plot-body">
          <div class="wm-plot-head">
            <span class="wm-plot-title">${escapeHtml(p.title || '（未命名）')}</span>
          </div>
          <div class="wm-plot-sum">${escapeHtml(p.summary || '')}</div>
          <div class="wm-plot-acts">
            <button class="wm-btn" data-act="edit" data-id="${p.id}">编辑</button>
            <button class="wm-btn" data-act="del" data-id="${p.id}">删除</button>
          </div>
        </div>
      </div>`;
    }).join('');

    body.innerHTML = `<div class="wm-card">
      <div class="wm-h">剧情线（${plots.length}）</div>
      <div class="wm-hint">按时间倒序排列，最新的在最上面；左侧为时间，右侧为内容。所有改动会同步到当前记忆世界书。</div>
      <div class="wm-actions">
        <button data-act="plot-add" class="wm-btn primary">＋ 添加剧情</button>
        <button data-act="plot-run" class="wm-btn">从记忆更新剧情线</button>
      </div>
      <div class="wm-timeline">${rows || '<div class="wm-empty">暂无剧情线</div>'}</div>
      <div class="wm-status"></div></div>`;

    const plotFields = (p) => ([
      { key: 'time', label: '时间（剧情内时间，显示在最左侧）', value: (p && p.time) || '', placeholder: '如：第三日清晨 / 建元七年春' },
      { key: 'title', label: '标题', value: (p && p.title) || '', placeholder: '这段剧情叫什么' },
      { key: 'summary', label: '内容', type: 'textarea', value: (p && p.summary) || '', placeholder: '这段剧情发生了什么' },
    ]);

    const plotAdd = body.querySelector('[data-act="plot-add"]');
    if (plotAdd) plotAdd.onclick = async () => {
      const r = await openModal({ title: '添加剧情', fields: plotFields(null), okText: '添加' });
      if (!r) return;
      if (!r.title.trim() && !r.summary.trim()) { toast('🌿 温记：标题和内容不能都为空'); return; }
      await WM.MemoryStore.addPlot(r);
      toast('🌿 温记：剧情已添加并同步世界书');
      renderPlot(body);
    };
    const plotRun = body.querySelector('[data-act="plot-run"]');
    if (plotRun) plotRun.onclick = async () => {
      const st = body.querySelector('.wm-status');
      if (st) st.textContent = '归纳中…';
      const r = await WM.Summary.triggerPlot(WM.Settings.load());
      if (st) st.textContent = r && r.ok ? '✓ 剧情线已推进' : (r ? '✗ ' + (r.reason || '失败') : '✗ 失败');
      renderPlot(body);
    };
    body.querySelectorAll('[data-act="edit"]').forEach((b) => {
      b.onclick = async () => {
        const p = WM.MemoryStore.getPlots().find((x) => x.id === b.dataset.id);
        if (!p) return;
        const r = await openModal({ title: '编辑剧情', fields: plotFields(p), okText: '保存' });
        if (!r) return;
        await WM.MemoryStore.updatePlot(p.id, r);
        toast('🌿 温记：剧情已更新并同步世界书');
        renderPlot(body);
      };
    });
    body.querySelectorAll('[data-act="del"]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('确定删除这条剧情？世界书中的对应条目也会一并移除。')) return;
        await WM.MemoryStore.removePlot(b.dataset.id);
        toast('🌿 温记：剧情已删除并同步世界书');
        renderPlot(body);
      };
    });
  }

  // 物品：弹窗添加/编辑；卡片布局 = 上名称 / 中作用 / 下持有者
  function renderItem(body) {
    const items = WM.MemoryStore.getItems();
    const plots = WM.MemoryStore.getPlots();
    const plotTitle = {};
    for (const p of plots) plotTitle[p.id] = p.title || p.time || p.id;

    const cards = items.map((i) => {
      const rel = (i.relatedPlots || []).map((pid) => plotTitle[pid]).filter(Boolean);
      return `<div class="wm-item-card" data-id="${i.id}">
        <div class="wm-item-name">${escapeHtml(i.name || '（未命名）')}${
          i.origin ? `<span class="wm-tag">来历：${escapeHtml(i.origin)}</span>` : ''}</div>
        <div class="wm-item-effect">${escapeHtml(i.desc || '（未填写作用）')}</div>
        <div class="wm-item-owner">
          <span><b>持有者：</b>${escapeHtml(i.owner || '未知')}</span>
          ${rel.length ? `<span><b>关联剧情：</b>${escapeHtml(rel.join('、'))}</span>` : ''}
        </div>
        <div class="wm-item-acts">
          <button class="wm-btn" data-act="edit" data-id="${i.id}">编辑</button>
          <button class="wm-btn" data-act="del" data-id="${i.id}">删除</button>
        </div>
      </div>`;
    }).join('');

    body.innerHTML = `<div class="wm-card">
      <div class="wm-h">物品 / 持有物追踪（${items.length}）</div>
      <div class="wm-hint">卡片自上而下为：物品名称 → 物品作用 → 持有者。物品会关联到角色与剧情线，改动即同步当前记忆世界书。</div>
      <div class="wm-actions"><button data-act="it-add" class="wm-btn primary">＋ 添加物品</button></div>
      <div class="wm-item-list">${cards || '<div class="wm-empty">暂无物品，点上方「添加物品」新建</div>'}</div>
    </div>`;

    const itemFields = (it) => ([
      { key: 'name', label: '物品名称', value: (it && it.name) || '', placeholder: '如：青玉葫芦' },
      { key: 'desc', label: '物品作用', type: 'textarea', value: (it && it.desc) || '', placeholder: '这件物品有什么用途 / 效果' },
      { key: 'owner', label: '持有者（角色名）', value: (it && it.owner) || '', placeholder: '现在在谁手上' },
      { key: 'origin', label: '来历（可选）', value: (it && it.origin) || '', placeholder: '从哪来的' },
      {
        key: 'relatedPlots', label: '关联剧情线（可多选）', type: 'multiselect',
        value: (it && it.relatedPlots) || [],
        options: plots.map((p) => ({ value: p.id, label: p.title || p.time || p.id })),
        hint: plots.length ? '按住 Ctrl / Cmd 可多选' : '暂无剧情线，可先到「剧情线」页添加',
      },
    ]);

    const addBtn = body.querySelector('[data-act="it-add"]');
    if (addBtn) addBtn.onclick = async () => {
      const r = await openModal({ title: '添加物品', fields: itemFields(null), okText: '添加' });
      if (!r) return;
      if (!r.name.trim()) { toast('🌿 温记：物品名称不能为空'); return; }
      await WM.MemoryStore.addItem(r);
      toast('🌿 温记：物品已添加并同步世界书');
      renderItem(body);
    };
    body.querySelectorAll('[data-act="edit"]').forEach((b) => {
      b.onclick = async () => {
        const it = WM.MemoryStore.getItems().find((x) => x.id === b.dataset.id);
        if (!it) return;
        const r = await openModal({ title: '编辑物品', fields: itemFields(it), okText: '保存' });
        if (!r) return;
        if (!r.name.trim()) { toast('🌿 温记：物品名称不能为空'); return; }
        await WM.MemoryStore.updateItem(it.id, r);
        toast('🌿 温记：物品已更新并同步世界书');
        renderItem(body);
      };
    });
    body.querySelectorAll('[data-act="del"]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('确定删除这个物品？世界书中的对应条目也会一并移除。')) return;
        await WM.MemoryStore.removeItem(b.dataset.id);
        toast('🌿 温记：物品已删除并同步世界书');
        renderItem(body);
      };
    });
  }

  // 世界设定：顶部「世界名 + 世界类型 + 简述」，下方按条目列出具体设定
  async function renderWorld(body) {
    const settings = WM.Settings.load();
    const meta = WM.MemoryStore.getWorldMeta ? WM.MemoryStore.getWorldMeta() : { name: '', kind: '', desc: '' };
    // 过滤掉历史数据中误存的具体实体条目（物品/角色/势力/地点名），仅展示世界规则设定
    const ENTITY_NOISE = /(物品|道具|物件|武器|装备|信物|角色|人物|地点|场所|城市|城镇|村庄|村落|门派|宗门|势力|公会|家族|国家|组织|帮派|商店|店铺|NPC|具体人名)/;
    const secs = (WM.MemoryStore.getWorldSections ? WM.MemoryStore.getWorldSections() : [])
      .filter((w) => !(w.title && ENTITY_NOISE.test(w.title) && /[:：·]/.test(w.title)));
    // 注意：loreCount 仅用于展示「现有 N 条」，绝不能让它的 await 阻塞下方按钮绑定。
    // 若 Worldbook.listEntries 在手机端抛错/卡住，旧代码会把所有编辑按钮的绑定 delay 到 await 之后，
    // 导致「编辑世界/添加设定」点击毫无反应（面板不出现）。改为先渲染+绑定，再异步回填数字。
    let loreCount = 0;

    const secHtml = secs.map((w) => `<div class="wm-world-sec" data-id="${w.id}">
      <div class="wm-world-sec-title">${escapeHtml(w.title || '（未命名设定）')}</div>
      <div class="wm-world-sec-body">${escapeHtml(w.body || '')}</div>
      <div class="wm-world-acts">
        <button class="wm-btn" data-act="sec-edit" data-id="${w.id}">编辑</button>
        <button class="wm-btn" data-act="sec-del" data-id="${w.id}">删除</button>
      </div>
    </div>`).join('');

    body.innerHTML = `<div class="wm-card">
      <div class="wm-h">世界设定</div>
      <div class="wm-hint">顶部是这个世界「叫什么、是什么类型」，下面按条目写具体设定（如修炼体系、势力分布）。所有改动即同步当前记忆世界书${loreCount ? `（现有 ${loreCount} 条）` : ''}。</div>

      <div class="wm-world-head">
        <div class="wm-world-name">${escapeHtml(meta.name || '未命名世界')}</div>
        ${meta.kind ? `<span class="wm-world-kind">${escapeHtml(meta.kind)}</span>` : ''}
        <div class="wm-world-desc">${escapeHtml(meta.desc || '（还没有世界简述，点下方「编辑世界」补充）')}</div>
      </div>

      <div class="wm-actions">
        <button data-act="world-edit" class="wm-btn primary">编辑世界</button>
        <button data-act="sec-add" class="wm-btn">＋ 添加设定条目</button>
        <button data-act="world-gen" class="wm-btn">AI 补全设定</button>
      </div>

      <div class="wm-h" style="margin-top:12px">具体设定（${secs.length}）</div>
      <div class="wm-world-secs">${secHtml || '<div class="wm-empty">暂无设定条目，点上方「添加设定条目」新建</div>'}</div>

      <div class="wm-divider"></div>
      <div class="wm-row"><input data-act="world-lorename" placeholder="世界书名（同步用，如 WarmMemo）" value="${escapeHtml(settings.lorebookName || '')}" style="flex:1"/></div>
      <label class="wm-row"><input type="checkbox" data-act="world-lore" ${settings.worldToLorebook !== false ? 'checked' : ''}/> 同步写入当前记忆世界书</label>
      <div class="wm-actions"><button data-act="world-lore-save" class="wm-btn">保存同步设置</button></div>
      <div class="wm-status"></div>
    </div>`;

    const wEdit = body.querySelector('[data-act="world-edit"]');
    if (wEdit) wEdit.onclick = async () => {
      const r = await openModal({
        title: '编辑世界', okText: '保存',
        fields: [
          { key: 'name', label: '世界名称', value: meta.name, placeholder: '如：九霄大陆' },
          { key: 'kind', label: '世界类型', value: meta.kind, placeholder: '如：修仙世界 / 赛博朋克 / westeros 式中世纪' },
          { key: 'desc', label: '世界简述', type: 'textarea', value: meta.desc, placeholder: '一两句话说明这是个什么样的世界' },
        ],
      });
      if (!r) return;
      await WM.MemoryStore.setWorldMeta(r);
      toast('🌿 温记：世界信息已保存并同步世界书');
      renderWorld(body);
    };

    const secAdd = body.querySelector('[data-act="sec-add"]');
    if (secAdd) secAdd.onclick = async () => {
      const r = await openModal({
        title: '添加设定条目', okText: '添加',
        fields: [
          { key: 'title', label: '设定名称', value: '', placeholder: '如：修炼体系 / 势力分布 / 货币与度量' },
          { key: 'body', label: '设定内容', type: 'textarea', value: '', placeholder: '围绕这个世界类型展开的具体规则' },
        ],
      });
      if (!r) return;
      if (!r.title.trim() && !r.body.trim()) { toast('🌿 温记：名称和内容不能都为空'); return; }
      await WM.MemoryStore.addWorldSection(r.title, r.body);
      toast('🌿 温记：设定已添加并同步世界书');
      renderWorld(body);
    };

    body.querySelectorAll('[data-act="sec-edit"]').forEach((b) => {
      b.onclick = async () => {
        const w = (WM.MemoryStore.getWorldSections() || []).find((x) => x.id === b.dataset.id);
        if (!w) return;
        const r = await openModal({
          title: '编辑设定条目', okText: '保存',
          fields: [
            { key: 'title', label: '设定名称', value: w.title },
            { key: 'body', label: '设定内容', type: 'textarea', value: w.body },
          ],
        });
        if (!r) return;
        await WM.MemoryStore.updateWorldSection(w.id, r);
        toast('🌿 温记：设定已更新并同步世界书');
        renderWorld(body);
      };
    });
    body.querySelectorAll('[data-act="sec-del"]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('确定删除这条设定？世界书中的对应条目也会一并移除。')) return;
        await WM.MemoryStore.removeWorldSection(b.dataset.id);
        toast('🌿 温记：设定已删除并同步世界书');
        renderWorld(body);
      };
    });

    const loreSave = body.querySelector('[data-act="world-lore-save"]');
    if (loreSave) loreSave.onclick = async () => {
      const nameEl = body.querySelector('[data-act="world-lorename"]');
      const loreEl = body.querySelector('[data-act="world-lore"]');
      if (nameEl) settings.lorebookName = nameEl.value.trim();
      if (loreEl) settings.worldToLorebook = loreEl.checked;
      WM.Settings.save(settings);
      if (settings.worldToLorebook) await WM.MemoryStore.dispatchLorebook();
      const st = body.querySelector('.wm-status');
      if (st) st.textContent = '✓ 同步设置已保存';
    };

    const wGen = body.querySelector('[data-act="world-gen"]');
    if (wGen) wGen.onclick = async () => {
      const st = body.querySelector('.wm-status');
      if (st) st.textContent = '推断中…';
      try {
        const w = await WM.Worldbook.inferWorldview(settings, {});
        const parsed = WM.Worldbook.parseWorldview ? WM.Worldbook.parseWorldview(w) : null;
        if (parsed) {
          if (parsed.name || parsed.kind || parsed.desc) {
            await WM.MemoryStore.setWorldMeta({
              name: parsed.name || meta.name,
              kind: parsed.kind || meta.kind,
              desc: parsed.desc || meta.desc,
            });
          }
          for (const sec of parsed.sections) {
            const exist = (WM.MemoryStore.getWorldSections() || []).find((x) => x.title === sec.title);
            if (exist) await WM.MemoryStore.updateWorldSection(exist.id, { body: sec.body });
            else await WM.MemoryStore.addWorldSection(sec.title, sec.body);
          }
          if (st) st.textContent = `✓ 已补全（${parsed.sections.length} 条设定）并同步世界书`;
        } else {
          await WM.MemoryStore.setWorld(w);
          if (st) st.textContent = '✓ 已补全';
        }
        renderWorld(body);
      } catch (e) {
        if (st) st.textContent = '✗ ' + (e.message || e);
      }
    };

    // 异步回填「世界书现有 N 条」数字（不阻塞上面的按钮绑定，失败也不影响编辑功能）
    if (WM.Worldbook && WM.Worldbook.listEntries) {
      WM.Worldbook.listEntries().then((list) => {
        const cnt = Array.isArray(list) ? list.length : 0;
        const hint = body.querySelector('.wm-hint');
        if (hint && cnt) {
          hint.textContent = hint.textContent.replace(/（现有 \d+ 条）/, '') + `（现有 ${cnt} 条）`;
        }
      }).catch(() => {});
    }
  }

  // 统一的 LLM 调用配置（所有功能共用这一个）
  function renderPaneLlm(s) {
    const c = s.llmConfig || { source: 'local', apiUrl: '', apiKey: '', model: '' };
    const pp = s.presetPrefix || { mode: 'none', importText: '', presetName: '' };
    const tt = s.taskTokens || {};
    const prompts = s.prompts || {};
    // 读取酒馆已保存预设名（修复：getPresetNames 是酒馆注入的顶层全局函数）
    let presetNames = [];
    try { presetNames = (WM.LLMClient && WM.LLMClient.listPresetNames) ? WM.LLMClient.listPresetNames() : []; } catch (e) { presetNames = []; }
    // 提示词编辑区块（可编辑：总结 / 关系 / 剧情 / 世界观）
    // 注意：def 必须与 settings.js DEFAULTS.prompts 保持完全一致，否则用户未保存时看到的是旧版
    const promptEditors = [
      { key: 'summary', title: '总结提示词', holder: '支持 {{recent}}', def: '你是一位剧情档案整理员。请把【最近对话】中真实发生的事写成一段「可直接续写的叙事记忆」。\n\n写作原则（违反任意一条即判定无效）：\n1. 🛑 只写已经发生的事实：人物、时间、地点、动作、关键对话内容、结果。不写猜测、评价、气氛渲染、心理分析。\n2. 🛑 只记录与【已登场角色】直接相关、且对剧情推进有实际作用的内容；与角色无关的闲聊、环境描写、路人甲乙的无关举动一律丢弃，不要写进记忆。\n3. 🛑 严禁使用以下词汇及其变体：总结、梳理、概括、归纳、回顾、记录、时间线、时间顺序、按时间、状态标记、供后续参考、核心事件、关键信息、要点、摘要、概述、概要、简述、备注、注记、梳理如下、整理如下、汇总如下、分析如下、描述如下、说明如下。\n4. 🛑 严禁主观臆断与心理分析（如"A对B有占有欲""两人气氛暧昧""存在某种张力"），只写客观发生的行为和对话。\n5. 🛑 严禁输出分析评论当叙事（如"这表明…""这暗示着…"），严禁用"第一/第二/第三/首先/其次/最后"序号词罗列——要连贯的叙事流。\n6. 🛑 严禁在正文前加任何引导语/声明句（如"以下是…""根据对话…""用户让我…"），直接从故事内容起笔。\n7. 🛑 严禁编造对话中没有的情节、人物、地点、物品或后续发展。\n\n【正确示例（这是要的输出风格）】\n黄昏的图书馆里，林清玄翻到借书卡背面那一栏，指尖停在一个名字上很久。"原来你也看过这本。"身后传来温如玉的声音，她手里提着两杯还冒热气的奶茶。\n【错误示例（全部禁止，严禁输出）】\n✗ 根据对话内容，总结如下：……（用了"总结""根据"等禁词）\n✗ 时间线梳理如下：（含状态标记，供后续参考）：（指令回显，不是叙事）\n✗ 两人之间的气氛变得微妙而充满张力，似乎暗生情愫（心理分析+环境渲染，与角色实际行为无关）\n✗ 路边的梧桐树影随风摇曳，城市在暮色中安静下来（与角色无关的闲笔环境描写）\n\n【最近对话】\n{{recent}}' },
      { key: 'relations', title: '关系提示词', holder: '支持 {{historySummary}} {{recent}}', def: '你是关系图谱构建器。你的唯一任务：从对话中提取「人物之间的直接关系」。\n\n【最高级禁令（违反则输出无效）】\n1. 🛑 每行只能是一个「三元组」，格式严格为：人物A → 人物B：关系词\n2. 🛑 「关系词」必须是 2-6 个字的简短标签，如：恋人、师徒、敌对、暗恋、主仆、同伴、竞争者\n3. 🛑 绝对禁止输出分析句、描述句、长句子，绝对禁止任何「对...有...感」「存在潜在...」「某种...纠葛」这类主观推断。\n4. 🛑 只提取**两个具体人物之间、且有明确互动**的关系。不提取「对用户的感受」「与...存在...」这种单向分析（这类不是关系，必须丢弃）。\n5. 如果两个人之间没有明确互动关系，就不要写。宁缺毋滥。\n6. 最多 8 条。\n\n【正确示例】\n小明 → 小红：恋人\n小红 → 小刚：敌对\n【错误示例（全部禁止，严禁输出）】\n✗ 小明对用户有依赖感（这是分析，不是关系）\n✗ 李华与张伟之间存在潜在冲突（描述句）\n✗ 张伟对用户才具有依赖感（单向分析）\n✗ A对B有某种复杂的情感纠葛（主观推断）\n\n【历史总结】\n{{historySummary}}\n\n【最近对话】\n{{recent}}' },
      { key: 'plot', title: '剧情提示词', holder: '支持 {{relations}} {{recent}}', def: '你是一位轻小说剧情编辑。请基于「关系」和「最近对话」，提取这一段发生的**剧情事件**。\n\n每行一条，严格用竖线分隔，格式：\n时间｜标题｜事件叙述｜状态\n\n【绝对禁止（出现即判定为无效输出）】\n1. 🛑 严禁在输出前加任何引导语/声明句/格式说明（如"时间线梳理如下""剧情事件如下""按时间顺序""含状态标记""供后续参考""以下是…"）。直接从第一条事件开始写。\n2. 🛑 严禁使用以下词汇及其变体：时间线、梳理、整理、汇总、概括、归纳、回顾、记录、核心事件、关键信息、要点、摘要、概述、状态标记、供后续参考、分析如下、描述如下、说明如下。\n3. 🛑 严格只记录【最近对话】中真实发生的剧情事件。严禁编造未发生的情节，严禁加入无关内容（世界观说明、人物背景闲笔）。\n4. 🛑 严禁输出分析评论（如"这表明…""这暗示着…"）或心理推测——只写发生了什么客观事件。\n5. 🛑 每行的「事件叙述」要有画面感（人物动作+场景），不要写干巴巴的"双方进行了讨论"。\n\n写作要求（像轻小说章节大纲）：\n- 标题：给这段剧情起一个有画面感的短标题（如「雨夜的告白」「剑锋相对的瞬间」），不超过 12 字\n- 事件叙述：用 1-2 句话描述发生了什么（有人物动作、场景变化、关键转折），要有画面感\n- 时间：剧情内的时间点（如「第三日清晨」）。未提及则写「未标注」\n- 状态：只能填 进行中 / 已完结 / 已废弃 三者之一\n\n【正确示例】\n第三日清晨｜雨夜的告白｜小明在屋檐下把星空画册递给小红，说「这本该和你一起看」｜已完结\n【错误示例（全部禁止，严禁输出）】\n✗ 时间线梳理如下（含状态标记，供后续参考）：（这是指令回显，不是事件列表）\n✗ 未标注｜氛围紧张｜两人之间的气氛变得微妙而充满张力（这是分析，不是事件）｜进行中\n\n不要输出表头、编号、额外说明。最多 8 条。\n\n【关系】\n{{relations}}\n\n【最近对话】\n{{recent}}' },
      { key: 'worldview', title: '世界观提示词', holder: '支持 {{plot}} {{recent}}', def: '你是世界观提炼者。请基于【剧情线】【最近对话】，提炼这个故事所处世界本身的「底层规则设定」。\n\n【最高级禁令（违反则输出无效）】\n1. 🛑 「世界设定」只写世界本身的通用规则、法则、历史背景、力量体系，**绝不写**单个具体物品、单个具体角色姓名、单个具体地点名称、单次具体事件。\n2. 🛑 只提炼能从剧情中归纳出的、可复用的世界运行规律。严禁把某一段剧情、某一个人、某一个地点当成「设定」写进来。\n3. 🛑 严禁编造与剧情毫无关联的宏大设定；设定必须能从【剧情线】【最近对话】中找到依据或合理延伸。\n\n严格按以下格式输出，不要添加任何多余说明：\n\n世界名：（这个世界/大陆/城市叫什么，没有就起一个贴切的）\n世界类型：（用一个词概括，如：修仙世界、赛博朋克、蒸汽朋克、现代都市、剑与魔法）\n简述：（一到两句话说明这是个什么样的世界）\n\n## 设定标题一\n（围绕"世界类型"展开的具体规则与法则。例如修仙世界就写修炼体系的境界划分、灵气运行法则；赛博朋克就写义体改造规则、企业与财阀的运行法则）\n\n## 设定标题二\n（内容）\n\n要求：\n1. 「世界类型」决定了下面写什么。修仙世界就必须写修炼体系、灵气、法则等，不要写无关内容。\n2. 每条设定要具体、可被后续剧情引用，不要空泛。\n3. 输出 3-6 条设定条目。\n\n【正确示例】\n## 灵气运行法则\n灵气自子夜起最为充盈，修者需在此时吐纳方能进阶。\n【错误示例（严禁）】\n## 小明的身世\n小明是孤儿，幼年被送至宗门。（这是角色，不是世界设定）\n## 落霞镇\n落霞镇位于大陆东陲。（这是地点，不是世界设定）\n\n【剧情线】\n{{plot}}\n\n【最近对话】\n{{recent}}' },
    ];
    const promptHtml = `
      <div class="wm-subtabs lv3" data-lv3="prompts">
        ${promptEditors.map((p, i) => `<button data-ptab="${p.key}" class="${i === 0 ? 'active' : ''}">${p.title.replace('提示词', '')}</button>`).join('')}
      </div>
      <div class="wm-ptabs">
        ${promptEditors.map((p, i) => `
          <div class="wm-ptab-pane" data-ptab-pane="${p.key}" style="${i === 0 ? '' : 'display:none'}">
            <div class="wm-hint">占位符：${p.holder}（运行时自动替换为真实数据）</div>
            <textarea id="pprompt-${p.key}" rows="${p.key==='summary'?4:3}" style="width:100%;font-family:monospace;font-size:12px">${escapeHtml(prompts[p.key] != null ? prompts[p.key] : p.def)}</textarea>
          </div>`).join('')}
      </div>`;
    return `
      <div class="wm-card"><div class="wm-h">LLM 调用配置（统一）</div>
        <div class="wm-hint">所有功能（总结/关系/剧情/世界观/物品）共用这一个 LLM 配置。<b>必须填写 Base URL</b>（直接调用该地址，自适应 OpenAI / DeepSeek / 火山引擎 等任意 OpenAI 兼容服务，无需选厂家）。配完可点「测试连接」验证可用性。</div>
        <div id="llm-custom" style="margin-top:6px">
          <label class="wm-row">Base URL<input id="llm-url" value="${escapeHtml(c.apiUrl)}" placeholder="https://api.openai.com/v1、https://ark.cn-beijing.volces.com/api/v3、https://api.deepseek.com/v1"/></label>
          <div class="wm-hint">直接填任意厂家的 Base URL 即可，自动按 OpenAI 兼容协议请求（火山引擎填 <code>https://ark.cn-beijing.volces.com/api/v3</code>，DeepSeek 填 <code>https://api.deepseek.com/v1</code>）。</div>
          <label class="wm-row">API Key<input id="llm-key" type="password" value="${escapeHtml(c.apiKey)}" placeholder="sk-..."/></label>
          <label class="wm-row">模型名<input id="llm-model" value="${escapeHtml(c.model)}" placeholder="如 gpt-4o-mini / deepseek-chat / doubao-pro"/></label>
          <label class="wm-row"><input type="checkbox" id="llm-deep" ${c.deepThinking ? 'checked' : ''}/> 深度思考（推理模型）</label>
          <div class="wm-hint" style="margin:-2px 0 4px">开启后按模型自动适配深度思考参数：OpenAI o 系列用 reasoning_effort；DeepSeek reasoner 走原生思考链；豆包/Qwen 思考模型用 thinking 块。普通模型（如 gpt-4o）开启无效，可放心留开。</div>
          <label class="wm-row">输出 Token 上限<input id="llm-maxtok" type="number" min="50" max="4000" step="50" value="${Number(c.maxTokens) || 700}" title="限制模型输出长度，所有功能共用此上限"/> <span class="wm-hint" style="margin:0">所有功能共用默认上限，下面可对每个任务单独覆盖</span></label>
          <details class="wm-fold">
            <summary>各任务独立输出 Token 上限（二级控制）</summary>
            <div class="wm-hint">留空或填 0 = 用上面的共用上限。可分别限制：总结 / 关系 / 剧情 / 世界观 / 物品 各自最长输出，避免长任务挤占、短任务不够。</div>
            <label class="wm-row">总结 Token<input id="tk-summary" type="number" min="0" max="4000" step="50" value="${Number(tt.summary)||0}"/></label>
            <label class="wm-row">关系 Token<input id="tk-relations" type="number" min="0" max="4000" step="50" value="${Number(tt.relations)||0}"/></label>
            <label class="wm-row">剧情 Token<input id="tk-plot" type="number" min="0" max="4000" step="50" value="${Number(tt.plot)||0}"/></label>
            <label class="wm-row">世界观 Token<input id="tk-world" type="number" min="0" max="4000" step="50" value="${Number(tt.world)||0}"/></label>
            <label class="wm-row">物品 Token<input id="tk-items" type="number" min="0" max="4000" step="50" value="${Number(tt.items)||0}"/></label>
          </details>
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

  // ── 调试面板：分别查看 LLM / Embedding / Rerank 的「请求 message」与「AI 输出结果」 ──
  function renderDebug(body) {
    body.innerHTML = `
      <div class="wm-card">
        <div class="wm-h">调用调试（请求 / 结果）</div>
        <div class="wm-hint">分别记录 LLM、向量(Embedding)、重排序(Rerank) 三类调用的<b>请求内容</b>与<b>AI 返回结果</b>，互不混合。每次实际调用自动记录，最多保留 ${WM.DebugLog ? WM.DebugLog.MAX : 30} 条。</div>
        <div class="wm-debug-toolbar">
          <button class="wm-btn" data-dbg="llm">LLM</button>
          <button class="wm-btn" data-dbg="embedding">向量</button>
          <button class="wm-btn" data-dbg="rerank">重排序</button>
          <button class="wm-btn wm-btn-ghost" id="dbg-clear">清空全部</button>
          <button class="wm-btn wm-btn-ghost" id="dbg-refresh">刷新</button>
        </div>
        <div id="dbg-llm" class="wm-debug-sec"></div>
        <div id="dbg-embedding" class="wm-debug-sec"></div>
        <div id="dbg-rerank" class="wm-debug-sec"></div>
      </div>`;

    const secs = {
      llm: body.querySelector('#dbg-llm'),
      embedding: body.querySelector('#dbg-embedding'),
      rerank: body.querySelector('#dbg-rerank'),
    };
    const titles = { llm: 'LLM 调用', embedding: '向量 Embedding', rerank: '重排序 Rerank' };

    function fmt(v) {
      if (v === undefined) return '—';
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); }
    }
    function renderSec(kind) {
      const el = secs[kind];
      const logs = WM.DebugLog ? WM.DebugLog.get(kind) : [];
      if (!logs.length) { el.innerHTML = `<div class="wm-debug-title">${titles[kind]}</div><div class="wm-empty">暂无记录，先去触发一次调用（如点测试连接 / 总结）</div>`; return; }
      // 倒序：最新在上
      const html = logs.slice().reverse().map((e) => {
        const t = new Date(e.ts).toLocaleTimeString();
        const dirLabel = e.dir === 'request' ? '请求' : (e.dir === 'response' ? '结果' : '错误');
        const dirCls = e.dir === 'request' ? 'req' : (e.dir === 'response' ? 'res' : 'err');
        let bodyHtml = '';
        if (e.dir === 'request') {
          const d = e.data || {};
          if (kind === 'llm') {
            bodyHtml = 'URL: ' + (d.url || '') + '\n模型: ' + (d.model || '') + '\n\n【Messages】\n' +
              (d.messages || []).map((m) => '[' + m.role + ']\n' + m.content).join('\n\n');
          } else if (kind === 'embedding') {
            bodyHtml = 'URL: ' + (d.url || '') + '\n方法: ' + (d.method || 'POST') + '\n模型: ' + (d.model || '') + '\n\n【请求体预览】\n' + (d.bodyPreview || '');
          } else {
            bodyHtml = 'URL: ' + (d.url || '') + '\n方法: ' + (d.method || 'POST') + '\n模型: ' + (d.model || '') + '\nQuery: ' + (d.query || '') + '\n\n【Documents】\n' + (Array.isArray(d.documents) ? d.documents.join('\n') : '');
          }
        } else if (e.dir === 'response') {
          const d = e.data || {};
          if (kind === 'llm') {
            bodyHtml = '模型: ' + (d.model || '') + '\nfinish_reason: ' + (d.finish_reason || '') + '\nusage: ' + fmt(d.usage) + '\n\n【AI 输出】\n' + (d.output || '');
          } else if (kind === 'embedding') {
            bodyHtml = 'HTTP ' + (d.httpStatus || '') + '\n维度: ' + (d.dimension || '') + '\n\n【响应预览】\n' + (d.responsePreview || '');
          } else {
            bodyHtml = 'HTTP ' + (d.httpStatus || '') + '\n\n【Scores】\n' + fmt(d.scores) + '\n\n【响应预览】\n' + (d.responsePreview || '');
          }
        } else {
          const d = e.data || {};
          bodyHtml = '错误: ' + (d.error || '') + (d.httpStatus ? ('\nHTTP ' + d.httpStatus) : '') + (d.response || d.responsePreview ? ('\n\n' + (d.response || d.responsePreview)) : '');
        }
        return `<div class="wm-debug-item ${dirCls}">
          <div class="wm-debug-meta"><span class="wm-debug-dir">${dirLabel}</span><span class="wm-debug-time">${t}</span></div>
          <pre class="wm-debug-body">${escapeHtml(bodyHtml)}</pre>
        </div>`;
      }).join('');
      el.innerHTML = `<div class="wm-debug-title">${titles[kind]}（${logs.length}）</div>` + html;
    }
    function renderAll() { renderSec('llm'); renderSec('embedding'); renderSec('rerank'); }

    body.querySelectorAll('[data-dbg]').forEach((b) => {
      b.onclick = () => {
        body.querySelectorAll('[data-dbg]').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        // 只展开所选类别
        Object.keys(secs).forEach((k) => { secs[k].style.display = (k === b.dataset.dbg) ? '' : 'none'; });
        renderSec(b.dataset.dbg);
      };
    });
    body.querySelector('#dbg-clear').onclick = () => { if (WM.DebugLog) WM.DebugLog.clear(); renderAll(); };
    body.querySelector('#dbg-refresh').onclick = renderAll;

    // 默认展开 LLM
    body.querySelector('[data-dbg="llm"]').classList.add('active');
    Object.keys(secs).forEach((k) => { secs[k].style.display = (k === 'llm') ? '' : 'none'; });
    renderAll();
  }

  // ── 清空数据：一键清空当前角色卡全部记忆数据（不可还原） ──
  function renderClear(body) {
    const s = WM.Settings.load();
    const msgs = (WM.Summary.getChatMessages && WM.Summary.getChatMessages()) || [];
    const hiddenCount = msgs.filter((m) => m && m.is_wm_hidden).length;
    body.innerHTML = `
      <div class="wm-card wm-card-danger">
        <div class="wm-h">清空当前角色卡数据</div>
        <div class="wm-hint">此操作将<b>永久删除</b>当前角色卡下由温记记录的全部数据，<b>不可还原</b>：
          <ul style="margin:6px 0 0 18px;line-height:1.8">
            <li>记忆条目、总结、关系图、剧情线、物品、世界观设定</li>
            <li>总结指针（隐藏楼层的记录会被清除）</li>
          </ul>
          清空后，之前因总结被隐藏的 <b>${hiddenCount}</b> 条楼层将<b>恢复显示</b>。<br>
          <span style="color:var(--wm-seal)">注意：全局设置（自动总结开关等）不受影响，不会因清空而突然自动总结。</span>
        </div>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
          <button id="clr-confirm" class="wm-btn wm-btn-danger">我确认，清空全部数据</button>
        </div>
        <div id="clr-result" class="wm-test-box" style="margin-top:10px"></div>
      </div>`;
    const btn = body.querySelector('#clr-confirm');
    const box = body.querySelector('#clr-result');
    btn.onclick = async () => {
      // 二次确认，避免误触
      if (!window.confirm('真的要清空当前角色卡的全部温记数据吗？\n此操作不可还原！')) return;
      btn.disabled = true;
      box.innerHTML = '<div class="wm-test-item">⏳ 清空中…</div>';
      try {
        await WM.MemoryStore.clearAll();
        box.innerHTML = '<div class="wm-test-item wm-ok">✅ 已清空当前角色卡全部温记数据，被隐藏楼层已恢复显示。</div>';
        toast('🌿 已清空当前角色卡数据');
        // 同步刷新其它已开面板数据
        if (WM.Relations && WM.Sidebar && WM.Sidebar.refreshHidden) WM.Sidebar.refreshHidden();
      } catch (e) {
        box.innerHTML = '<div class="wm-test-item wm-bad">❌ 清空失败：' + String(e && e.message ? e.message : e) + '</div>';
      } finally {
        btn.disabled = false;
      }
    };
  }

  function renderCfg(body) {
    const s = WM.Settings.load();
    // cfg 内按功能分组的子面板：点某个按钮只显示对应的那一块配置
    const tabs = [
      { key: 'llm', label: 'LLM 调用' },
      { key: 'mem', label: '记忆与注入' },
      { key: 'vec', label: '向量(Embedding)' },
      { key: 'rerank', label: '重排序(Rerank)' },
      { key: 'lore', label: '世界书' },
      { key: 'err', label: '错误报告' },
    ];
    const active = (WM._cfgTab) || 'llm';
    body.innerHTML = `
      <div class="wm-subtabs" id="cfg-tabs">
        ${tabs.map((t) => `<button data-tab="${t.key}" class="${t.key === active ? 'active' : ''}">${t.label}</button>`).join('')}
      </div>
      <div id="cfg-pane">${active === 'llm' ? renderPaneLlm(s) : active === 'mem' ? renderPaneMemory(s) : active === 'vec' ? renderPaneVector(s) : active === 'rerank' ? renderPaneRerank(s) : active === 'lore' ? renderPaneLore(s) : active === 'err' ? renderPaneErrors(s) : renderPaneLlm(s)}</div>
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
        else if (key === 'rerank') pane.innerHTML = renderPaneRerank(s);
        else if (key === 'lore') pane.innerHTML = renderPaneLore(s);
        else if (key === 'err') pane.innerHTML = renderPaneErrors(s);
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
  // scope 为空时同步所有已渲染面板；传具体 key（如 'vec'）时只同步该二级标签对应的字段
  function syncPaneToSettings(body, s, scope) {
    const q = (sel) => body.querySelector(sel);
    if (!scope || scope === 'llm') {
      if (q('#llm-url') !== null) {
        // 直接调用用户填写的 Base URL（OpenAI 兼容协议），不再使用酒馆本地源
        const apiUrl = q('#llm-url').value.trim();
        s.llmConfig = {
          source: apiUrl ? 'custom' : 'local',
          apiUrl,
          apiKey: q('#llm-key') ? q('#llm-key').value.trim() : '',
          model: q('#llm-model') ? q('#llm-model').value.trim() : '',
          maxTokens: Math.max(50, parseInt(q('#llm-maxtok').value, 10) || 700),
          deepThinking: !!(q('#llm-deep') && q('#llm-deep').checked),
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
    }
    if (!scope || scope === 'mem') {
      if (q('#c-inj')) {
        s.injectMemories = q('#c-inj').checked;
        s.injectWorld = q('#c-injw').checked;
      }
    }
    if (!scope || scope === 'vec') {
      if (q('#c-vec')) {
        s.vectorEnabled = q('#c-vec').checked;
      }
      if (q('#c-emb-url') !== null) {
        s.embeddingBaseUrl = q('#c-emb-url').value;
        s.embeddingApiKey = q('#c-emb-key') ? q('#c-emb-key').value : s.embeddingApiKey;
        s.embeddingModel = q('#c-emb-model') ? q('#c-emb-model').value : s.embeddingModel;
        s.embeddingUseLLM = q('#c-emb-usellm') ? q('#c-emb-usellm').checked : (s.embeddingUseLLM !== false);
        s.takeoverEmbedding = q('#c-take-emb') ? q('#c-take-emb').checked : s.takeoverEmbedding;
      }
    }
    if (!scope || scope === 'rerank') {
      if (q('#c-rerank')) {
        s.rerankEnabled = q('#c-rerank').checked;
      }
      if (q('#c-rk-url') !== null) {
        s.rerankBaseUrl = q('#c-rk-url').value;
        s.rerankApiKey = q('#c-rk-key') ? q('#c-rk-key').value : s.rerankApiKey;
        s.rerankModel = q('#c-rk-model') ? q('#c-rk-model').value : s.rerankModel;
        s.rerankInstruction = q('#c-rk-inst') ? q('#c-rk-inst').value : s.rerankInstruction;
        s.takeoverRerank = q('#c-take-re') ? q('#c-take-re').checked : s.takeoverRerank;
      }
    }
    if (!scope || scope === 'lore') {
      if (q('#c-lore')) {
        s.lorebookName = q('#c-lore').value.trim();
        s.worldToLorebook = q('#c-wlore').checked;
      }
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

    // 三级标签：任意 [data-lv3] 容器内按钮切换对应 [data-ptab-pane]
    body.querySelectorAll('.wm-subtabs[data-lv3]').forEach((bar) => {
      const group = bar.getAttribute('data-lv3');
      const paneWrap = bar.parentElement.querySelector('.wm-ptabs');
      bar.querySelectorAll('button').forEach((btn) => {
        btn.onclick = () => {
          const key = btn.dataset.ptab;
          bar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
          if (paneWrap) paneWrap.querySelectorAll('.wm-ptab-pane').forEach((p) => {
            p.style.display = (p.getAttribute('data-ptab-pane') === key) ? '' : 'none';
          });
        };
      });
    });

    // 保存：只把「当前二级标签」面板的值同步进 s 后保存，不影响其它未改动的分组
    const saveBtn = body.querySelector('#c-save');
    if (saveBtn) saveBtn.onclick = () => {
      const scope = WM._cfgTab || 'llm';
      syncPaneToSettings(body, s, scope);
      WM.Settings.save(s);
      if (scope === 'lore' && WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook();
      const labelMap = { llm: 'LLM 调用', mem: '记忆与注入', vec: '向量(Embedding)', rerank: '重排序(Rerank)', lore: '世界书', err: '错误报告' };
      toast('🌿 已保存「' + (labelMap[scope] || scope) + '」设置');
    };

    // 测试连接：仅验证「当前二级标签」对应的服务，避免全部一起测
    const testBtn = body.querySelector('#c-test');
    if (testBtn) testBtn.onclick = async () => {
      const scope = WM._cfgTab || 'llm';
      // 先把当前面板最新输入同步进 s，确保测试用的是刚填的值
      // 同时若 LLM 输入框存在（当前停在 LLM 子面板），也强制同步一次，避免 scope 非 llm 时漏读 BaseURL
      syncPaneToSettings(body, s, scope);
      if (body.querySelector('#llm-url') !== null) syncPaneToSettings(body, s, 'llm');
      const box = body.querySelector('#c-test-result');
      const tmp = Object.assign({}, s);
      box.innerHTML = '<div class="wm-test-item">⏳ 测试中…</div>';
      const rows = [];
      const add = (name, r, detail) => {
        const ok = r && r.success;
        rows.push(`<div class="wm-test-item ${ok?'wm-ok':'wm-bad'}">${ok?'✅':'❌'} ${name}${ok?('：'+(detail||'')):('：'+(r&&r.error||'失败'))}</div>`);
      };
      const testLlm = async () => {
        const tmpLlm = tmp.llmConfig || {};
        try {
          const r = await WM.LLMClient.testConnection({ profile: tmpLlm });
          add('LLM(' + (tmpLlm.apiUrl ? '自定义 BaseURL' : '未配置') + ')', r, '');
        } catch (e) { add('LLM(统一配置)', { success: false }, String(e.message || e)); }
      };
      const testWorld = async () => {
        try {
          const wbOk = WM.Worldbook && WM.Worldbook.available && WM.Worldbook.available();
          if (wbOk) { const b = await WM.Worldbook.ensureLorebook(); add('世界书(酒馆)', { success: b }, b ? ('已就绪：'+WM.Worldbook.targetName()) : ''); }
          else add('世界书(酒馆)', { success: false }, 'TavernHelper 不可用');
        } catch (e) { add('世界书(酒馆)', { success: false }, String(e.message || e)); }
      };
      const testEmb = async () => {
        try {
          const embTestable = !!(tmp.embeddingBaseUrl || tmp.embeddingApiKey || tmp.embeddingModel);
          if (embTestable) add('Embedding(向量)', await WM.EmbeddingClient.testConnection(tmp), 'BaseURL=' + (tmp.embeddingBaseUrl || '(用APIKey/模型)'));
          else add('Embedding(向量)', { success: true }, '未填，跳过（可留空用酒馆内置）');
        } catch (e) { add('Embedding(向量)', { success: false }, String(e.message || e)); }
      };
      const testRk = async () => {
        try {
          const rkTestable = !!(tmp.rerankEnabled || tmp.rerankBaseUrl || tmp.rerankApiKey || tmp.rerankModel);
          if (rkTestable) add('Rerank(重排)', await WM.RerankClient.testConnection(tmp), 'BaseURL=' + (tmp.rerankBaseUrl || '(用APIKey/模型)'));
          else add('Rerank(重排)', { success: true }, '未填，跳过（可留空用酒馆内置）');
        } catch (e) { add('Rerank(重排)', { success: false }, String(e.message || e)); }
      };
      // 按当前二级标签决定测哪些
      if (scope === 'llm') { await testLlm(); await testWorld(); }
      else if (scope === 'mem') { await testWorld(); }
      else if (scope === 'vec') { await testEmb(); }
      else if (scope === 'rerank') { await testRk(); }
      else if (scope === 'lore') { await testWorld(); }
      else { await testLlm(); await testWorld(); } // err 等其它：默认测 LLM+世界书
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
      <div class="wm-hint">向量 / 重排的具体服务配置在「向量(Embedding)」「重排序(Rerank)」两个面板。</div>
    </div>`;
  }

  // 向量(Embedding)面板：直接填 Base URL 自适应任意 OpenAI 兼容 / 本地反代 / Gemini，无需选厂家
  function renderPaneVector(s) {
    return `<div class="wm-card">
      <div class="wm-h">Embedding（向量）配置</div>
      <div class="wm-hint">默认情况下你<b>什么都不用配</b>：勾下面的「接管向量检索」后，温记会直接用你<b>已经填好的 LLM 地址</b>做向量召回（DeepSeek/火山/OpenAI/Ollama 都支持 /embeddings 接口），零配置真接管。只有想换独立 embedding 服务时才填下面地址。</div>
      <label class="wm-row"><input type="checkbox" id="c-vec" ${s.vectorEnabled?'checked':''}/> 启用向量检索（接管时必须）</label>
      <label class="wm-row"><input type="checkbox" id="c-emb-usellm" ${s.embeddingUseLLM!==false?'checked':''}/> 复用 LLM 地址做 Embedding（默认开，免配置）</label>
      <div class="wm-hint" style="margin:-2px 0 4px">开启时，下方留空会自动用「LLM 配置」里的 Base URL。若下方已填独立地址则以此为准。</div>
      <label class="wm-row">独立 Base URL（可选）<input id="c-emb-url" value="${s.embeddingBaseUrl}" placeholder="留空=自动用 LLM 地址；如 https://api.siliconflow.cn/v1"/></label>
      <div class="wm-hint">想用独立 embedding 服务才填：<br/>· 硅基流动等云端：<code>https://api.siliconflow.cn/v1</code><br/>· 本地 Ollama：<code>http://127.0.0.1:11434/v1</code><br/>· Gemini：<code>https://generativelanguage.googleapis.com/v1beta</code></div>
      <label class="wm-row">API Key<input id="c-emb-key" type="password" value="${s.embeddingApiKey}" placeholder="可选（复用 LLM 时留空）"/></label>
      <label class="wm-row">模型<input id="c-emb-model" value="${s.embeddingModel}" placeholder="text-embedding-3-small"/></label>
      <div class="wm-divider"></div>
      <label class="wm-row"><input type="checkbox" id="c-take-emb" ${s.takeoverEmbedding?'checked':''}/> 接管向量检索（用温记自己的 embedding 召回，替代酒馆原生召回）</label>
      <div class="wm-hint" style="margin:-2px 0 4px">勾选即<b>立刻真接管</b>：温记内容不再拆写酒馆世界书，改由温记用向量召回 topK 注入（默认复用 LLM 地址，零配置）。不勾则交回酒馆世界书原生激活。</div>
    </div>`;
  }

  // 重排序(Rerank)面板：直接填 Base URL 自适应任意 OpenAI 兼容 / 本地反代
  function renderPaneRerank(s) {
    return `<div class="wm-card">
      <div class="wm-h">Rerank（重排序）配置</div>
      <label class="wm-row"><input type="checkbox" id="c-rerank" ${s.rerankEnabled?'checked':''}/> 启用重排序(Rerank)</label>
      <label class="wm-row">Base URL<input id="c-rk-url" value="${s.rerankBaseUrl}" placeholder="https://api.siliconflow.cn/v1/rerank 或 http://127.0.0.1:8080/vec/v1/rerank"/></label>
      <div class="wm-hint">直接填任意服务的 Base URL，自动适配：<br/>· 本地反代/同源代理：<code>http://127.0.0.1:8080/vec</code>（自动补 /v1/rerank）<br/>· 硅基流动等云端：<code>https://api.siliconflow.cn/v1/rerank</code></div>
      <label class="wm-row">API Key<input id="c-rk-key" type="password" value="${s.rerankApiKey}" placeholder="可选（本地反代留空）"/></label>
      <label class="wm-row">模型<input id="c-rk-model" value="${s.rerankModel}" placeholder="BAAI/bge-reranker-v2-m3"/></label>
      <label class="wm-row" style="flex-direction:column;align-items:stretch">Rerank 指令（告诉模型按什么标准排序）
        <textarea id="c-rk-inst" rows="3" style="width:100%;font-family:monospace;font-size:12px">${escapeHtml(s.rerankInstruction||'')}</textarea>
      </label>
      <div class="wm-divider"></div>
      <label class="wm-row"><input type="checkbox" id="c-take-re" ${s.takeoverRerank?'checked':''}/> 接管重排序（在向量接管基础上，用温记自己的 Rerank 重排召回结果）</label>
      <div class="wm-hint" style="margin:-2px 0 4px">需配合「接管向量检索」一起开启才生效：向量召回后再用你配置的 Rerank 服务重排，提升相关性。单独开启无效。</div>
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

  // 错误报告面板：展示所有捕获到的错误与 bug（来自 WM.ErrLog）
  function renderPaneErrors(s) {
    const list = (WM.ErrLog && WM.ErrLog.get) ? WM.ErrLog.get() : [];
    let pane = `<div class="wm-card">
      <div class="wm-h">🐞 错误与异常报告</div>
      <div class="wm-hint">所有功能（总结/关系/剧情/世界观/物品/世界书等）运行时抛出的错误与异常都会自动记录在此，便于排查。</div>`;
    if (!list.length) {
      pane += `<div class="wm-row wm-muted">当前对话暂无记录的错误。</div>`;
    } else {
      pane += `<div class="wm-row wm-muted">共 ${list.length} 条（最新在前）。</div>`;
      pane += `<div class="wm-err-list">`;
      for (const it of list) {
        const t = new Date(it.ts);
        const time = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
        pane += `<details class="wm-fold wm-err-item">
          <summary><span class="wm-err-scope">[${escapeHtml(it.scope)}]</span> ${escapeHtml(it.message)} <span class="wm-ts">${time}</span></summary>
          ${it.extra ? `<div class="wm-err-extra">上下文：${escapeHtml(JSON.stringify(it.extra))}</div>` : ''}
          ${it.stack ? `<pre class="wm-err-stack">${escapeHtml(it.stack)}</pre>` : ''}
        </details>`;
      }
      pane += `</div>`;
      pane += `<div class="wm-row">
        <button id="err-copy" class="wm-btn">复制为文本</button>
        <button id="err-download" class="wm-btn">导出 JSON</button>
        <button id="err-clear" class="wm-btn">清空本报告</button>
      </div>`;
    }
    pane += `</div>`;
    setTimeout(() => {
      const copyBtn = document.getElementById('err-copy');
      if (copyBtn) copyBtn.onclick = () => {
        const txt = (WM.ErrLog && WM.ErrLog.toText) ? WM.ErrLog.toText() : '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(() => toast('已复制错误报告到剪贴板'), () => toast('复制失败，请手动选择'));
        } else {
          toast('当前环境不支持剪贴板');
        }
      };
      const dlBtn = document.getElementById('err-download');
      if (dlBtn) dlBtn.onclick = () => {
        const json = (WM.ErrLog && WM.ErrLog.exportJSON) ? WM.ErrLog.exportJSON() : '{}';
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'warmmemo_errors_' + Date.now() + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
      };
      const btn = document.getElementById('err-clear');
      if (btn) btn.onclick = async () => {
        if (WM.ErrLog && WM.ErrLog.clear) { await WM.ErrLog.clear(); renderCfg(s); }
      };
    }, 0);
    return pane;
  }

  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function init() {
    injectButton();
    // 绑定 WarmMemo 世界书到当前角色卡，实现「每个角色卡数据隔离」
    if (WM.Worldbook && WM.Worldbook.ensureLorebook) WM.Worldbook.ensureLorebook().catch((e) => console.warn('[WarmMemo] 世界书绑定失败', e));
    WM.Injection.init();
    // 自动总结：监听 AI 回复流式输出「完成并落库」后触发，确保不抢在半截输出上总结
    const es = (window.eventSource && window.eventSource.eventNames) ? window.eventSource : (window.SillyTavern && window.SillyTavern.eventSource);
    if (es && es.on) {
      const names = (window.eventSource && window.eventSource.eventNames) ? window.eventSource.eventNames : {};
      // 优先 MESSAGE_RECEIVED（AI 完整回复已写入楼层）；缺失时回退 MESSAGE_SENT（用户发送）
      const evReceived = names.MESSAGE_RECEIVED || 'MESSAGE_RECEIVED';
      const evSent = names.MESSAGE_SENT || 'MESSAGE_SENT';
      es.on(evReceived, autoSummaryHook); // 主：流式真正结束后
      es.on(evSent, autoSummaryHook);    // 备：兼容旧版/无 RECEIVED 环境
    }
  }

  let _lastAutoAt = 0; // 去重：避免 MESSAGE_SENT + MESSAGE_RECEIVED 双触发重复
  async function autoSummaryHook() {
    const s = WM.Settings.load();
    if (!s.autoSummaryEnabled && s.autoPlotEnabled !== false) { /* 仍可跑剧情线 */ }
    if (!s.autoSummaryEnabled && s.autoPlotEnabled === false) return;
    const now = Date.now();
    if (now - _lastAutoAt < 1200) return; // 1.2s 内只跑一次
    _lastAutoAt = now;
    // 注意：本 hook 主要绑定在 MESSAGE_RECEIVED（AI 流式输出完成且楼层落库之后），
    // 因此这里不需要长延时等待流式，只留极小缓冲让 chat 元数据稳定。
    setTimeout(async () => {
      try {
        // 流程一：纯记忆总结（summary + 世界观 + 物品），与剧情线完全独立
        if (s.autoSummaryEnabled) {
          let r = await WM.Summary.triggerSummary(s);
          if (r && !r.ok && s.autoSummaryMode === 'floor') {
            const total = (WM.Summary.getRecentMessages && WM.Summary.getRecentMessages(1000).length) || 0;
            const ptr = WM.MemoryStore.getSummaryPointer();
            if (ptr < total) r = await WM.Summary.triggerSummary(s, { forceEnd: true });
          }
          if (s.autoHideFloors && r && r.ok && WM.FloorHider && WM.FloorHider.hideUntil) {
            await WM.FloorHider.hideUntil(r.range[1]);
          }
          if (r && r.ok) {
            const extra = r.partial ? '（部分提炼失败，见错误报告）' : '';
            toast(`🌿 温记：已写入 ${r.count} 条记忆（楼层 ${r.range[0]}-${r.range[1]}）${extra}`);
          }
        }
        // 流程二：剧情线独立推进（同时并联关系线 LLM），独立于总结
        if (s.autoPlotEnabled !== false) {
          let rp = await WM.Summary.triggerPlot(s);
          if (rp && !rp.ok && s.autoPlotMode === 'floor') {
            const total = (WM.Summary.getRecentMessages && WM.Summary.getRecentMessages(1000).length) || 0;
            const ptr = WM.MemoryStore.getPlotPointer();
            if (ptr < total) rp = await WM.Summary.triggerPlot(s, { forceEnd: true });
          }
          if (rp && rp.ok) {
            const extra = rp.partial ? '（部分失败，见错误报告）' : '';
            toast(`🌿 温记：剧情线已推进 ${rp.count} 条（楼层 ${rp.range[0]}-${rp.range[1]}）${extra}`);
          }
        }
      } catch (e) {
        toast(`🌿 温记：自动处理失败 - ${e.message || e}`);
      }
    }, 400);
  }

  // 轻量 toast 提示（面板未开也能看到）
  function toast(msg) {
    let t = document.getElementById('warmmemo-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'warmmemo-toast';
      t.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(91,110,87,.95);color:#fff;padding:6px 14px;border-radius:12px;font-size:12px;z-index:100002;box-shadow:0 4px 14px rgba(0,0,0,.2)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .5s'; }, 3200);
  }

  WM.Launcher = { init, renderTab, renderCfg, renderWorld, renderAuto, renderMem, renderRel, renderItem, renderPlot };
})();

