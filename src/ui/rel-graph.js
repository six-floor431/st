// 动态关系图（力导向）：纯 SVG + JS 物理模拟，零依赖。
//   交互：拖节点重排 / 拖空白平移 / 滚轮缩放 / 点节点或名字查看关系 / 触摸支持。
//   设计：节点间排斥 + 边弹簧 + 中心引力 + 阻尼；稳定后自动停帧省电，拖动时重启。
//   视觉沿用水墨变量（--wm-jade/--wm-rose），缺失时回退到内置色板，保证脱离面板样式也能显示。
(function () {
  'use strict';
  const WM = window.WarmMemo || (window.WarmMemo = {});
  const SVGNS = 'http://www.w3.org/2000/svg';

  // 样式只注入一次。变量缺失时用回退色，避免依赖面板全局样式。
  function ensureStyle() {
    if (document.getElementById('wm-relgraph-style')) return;
    const st = document.createElement('style');
    st.id = 'wm-relgraph-style';
    st.textContent = `
.wm-graph-wrap{position:relative;width:100%;height:380px;background:var(--wm-paper,#f6f1ea);border:1px solid var(--wm-line,#d8cdbf);border-radius:8px;overflow:hidden;cursor:grab;touch-action:none}
.wm-graph-wrap.panning{cursor:grabbing}
.wm-graph{width:100%;height:100%;display:block;touch-action:none;user-select:none}
.wm-graph .wm-edge{stroke:var(--wm-jade,#6b8e7f);transition:opacity .2s}
.wm-graph .wm-edge.dim{opacity:.1}
.wm-graph .wm-edge.hi{stroke:var(--wm-rose,#b56a6a);opacity:.95}
.wm-graph .wm-node{stroke:var(--wm-paper,#f6f1ea);stroke-width:2;cursor:grab;transition:r .12s}
.wm-graph .wm-node-g.dragging .wm-node{cursor:grabbing}
.wm-graph .wm-node.dim{opacity:.25}
.wm-graph .wm-node.hi{stroke:var(--wm-rose,#b56a6a);stroke-width:3}
.wm-graph text{fill:var(--wm-ink-soft,#5a4a3a);user-select:none;pointer-events:none;font-family:inherit}
.wm-graph text.hi{fill:var(--wm-rose,#b56a6a);font-weight:bold}
.wm-graph text.dim{opacity:.3}
.wm-graph-ctrls{position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:4px;opacity:.85}
.wm-graph-ctrls button{width:30px;height:30px;border-radius:6px;border:1px solid var(--wm-line,#d8cdbf);background:var(--wm-paper,#f6f1ea);color:var(--wm-ink,#3a2a1a);cursor:pointer;font-size:16px;line-height:1;padding:0}
.wm-graph-ctrls button:hover{background:var(--wm-jade-soft,#d8e4dc)}
.wm-rel-names{display:flex;flex-wrap:wrap;gap:6px;padding:10px 2px 4px}
.wm-name-chip{padding:3px 11px;border-radius:13px;background:var(--wm-jade-soft,#d8e4dc);color:var(--wm-ink,#3a2a1a);font-size:12px;cursor:pointer;border:1px solid transparent;transition:all .15s;user-select:none}
.wm-name-chip:hover{border-color:var(--wm-jade,#6b8e7f)}
.wm-name-chip.active{background:var(--wm-rose,#b56a6a);color:#fff;border-color:var(--wm-rose,#b56a6a)}
.wm-rel-detail{margin-top:4px}
.wm-rel-row{padding:5px 10px;border-left:3px solid var(--wm-jade,#6b8e7f);margin:4px 0;background:var(--wm-jade-soft,#eef3ef);border-radius:0 5px 5px 0;font-size:13px}
.wm-rel-row .wm-arrow{color:var(--wm-jade,#6b8e7f);margin:0 6px;font-weight:bold}
.wm-rel-row .wm-lbl{color:var(--wm-rose,#b56a6a);font-weight:600}`;
    document.head.appendChild(st);
  }

  // 创建力导向图。返回控制器 { destroy, focus, select, zoom, resetView }。
  //   svg：目标 <svg> 元素；rels：[{from,to,label,weight}]；opts：{ userName, onSelect }。
  function create(svg, rels, opts) {
    opts = opts || {};
    ensureStyle();
    if (!svg) return noopCtrl();

    // ── 构建节点与边 ──
    const nameSet = new Set();
    (rels || []).forEach((r) => { if (r && r.from) nameSet.add(r.from); if (r && r.to) nameSet.add(r.to); });
    const W = 400, H = 380, cx = W / 2, cy = H / 2;
    const names = Array.from(nameSet);
    if (!names.length) {
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = '<text x="200" y="190" text-anchor="middle" fill="#9b8579" font-size="13">暂无关系数据</text>';
      return noopCtrl();
    }
    // 初始位置：圆环散布，避免重叠导致排斥力爆炸
    const nodes = names.map((id, i) => {
      const a = (i / names.length) * Math.PI * 2;
      return { id, x: cx + Math.cos(a) * 70, y: cy + Math.sin(a) * 70, vx: 0, vy: 0, deg: 0 };
    });
    const nodeMap = {}; nodes.forEach((n) => { nodeMap[n.id] = n; });
    const edges = (rels || [])
      .filter((r) => r && nodeMap[r.from] && nodeMap[r.to] && r.from !== r.to)
      .map((r) => ({ a: nodeMap[r.from], b: nodeMap[r.to], label: r.label || '', weight: Number.isFinite(r.weight) ? r.weight : 2 }));
    edges.forEach((e) => { e.a.deg++; e.b.deg++; });

    // 中心：优先 user 名，否则度数最高
    let center = nodeMap[opts.userName || ''];
    if (!center) { center = nodes[0]; nodes.forEach((n) => { if (n.deg > center.deg) center = n; }); }

    // ── SVG 结构：viewport(g) 内分边层与节点层 ──
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.add('wm-graph');
    svg.innerHTML = '<g class="wm-viewport"><g class="wm-edges"></g><g class="wm-nodes"></g></g>';
    const edgesG = svg.querySelector('.wm-edges');
    const nodesG = svg.querySelector('.wm-nodes');

    edges.forEach((e) => {
      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('class', 'wm-edge');
      line.setAttribute('stroke-width', Math.min(e.weight, 6));
      line.setAttribute('stroke-opacity', (e.a === center || e.b === center) ? 0.8 : 0.4);
      edgesG.appendChild(line);
      e.el = line;
    });
    nodes.forEach((n) => {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'wm-node-g');
      g.setAttribute('data-name', n.id);
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', 'wm-node');
      c.setAttribute('r', n === center ? 9 : 6);
      c.setAttribute('fill', n === center ? 'var(--wm-rose,#b56a6a)' : 'var(--wm-jade,#6b8e7f)');
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('class', 'wm-node-label');
      t.setAttribute('font-size', n === center ? 11 : 10);
      t.textContent = n.id.length > 6 ? n.id.slice(0, 6) + '…' : n.id;
      g.appendChild(c); g.appendChild(t);
      nodesG.appendChild(g);
      n.g = g; n.c = c; n.t = t;
    });

    // ── 力导向模拟 ──
    const K_REP = 2600, K_SPRING = 0.045, REST = 92, K_CENTER = 0.018, DAMPING = 0.84;
    let dragging = null;       // 被拖动的节点
    let panning = null;        // 视图平移状态
    let downPos = null;        // pointer 起始（用于区分点击与拖动）
    let selected = null;
    let rafId = null, running = true, stableFrames = 0;

    function step() {
      // 节点两两排斥
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = dx * dx + dy * dy + 0.1; }
          const d = Math.sqrt(d2);
          const f = K_REP / d2;
          const fx = (f * dx) / d, fy = (f * dy) / d;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // 边弹簧
      edges.forEach((e) => {
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = K_SPRING * (d - REST);
        const fx = (f * dx) / d, fy = (f * dy) / d;
        e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
      });
      // 中心引力 + 阻尼 + 位置更新
      let totalV = 0;
      nodes.forEach((n) => {
        if (n === dragging) { n.vx = 0; n.vy = 0; return; }
        n.vx += (cx - n.x) * K_CENTER;
        n.vy += (cy - n.y) * K_CENTER;
        n.vx *= DAMPING; n.vy *= DAMPING;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(24, Math.min(W - 24, n.x));
        n.y = Math.max(24, Math.min(H - 24, n.y));
        totalV += Math.abs(n.vx) + Math.abs(n.vy);
      });
      render();
      if (totalV < 0.4) { stableFrames++; if (stableFrames > 40) { running = false; rafId = null; return; } }
      else stableFrames = 0;
      rafId = requestAnimationFrame(step);
    }

    function render() {
      edges.forEach((e) => {
        e.el.setAttribute('x1', e.a.x.toFixed(1)); e.el.setAttribute('y1', e.a.y.toFixed(1));
        e.el.setAttribute('x2', e.b.x.toFixed(1)); e.el.setAttribute('y2', e.b.y.toFixed(1));
      });
      nodes.forEach((n) => {
        n.c.setAttribute('cx', n.x.toFixed(1)); n.c.setAttribute('cy', n.y.toFixed(1));
        n.t.setAttribute('x', (n.x + (n === center ? 11 : 8)).toFixed(1));
        n.t.setAttribute('y', (n.y + 4).toFixed(1));
      });
    }
    function wake() { if (!running) { running = true; stableFrames = 0; if (!rafId) rafId = requestAnimationFrame(step); } }

    // ── 视图（viewBox）缩放/平移 ──
    let view = { x: 0, y: 0, w: W, h: H };
    function applyView() { svg.setAttribute('viewBox', `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`); }

    // 屏幕 → SVG 世界坐标（考虑 viewBox）
    function screenToWorld(clientX, clientY) {
      const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: clientX, y: clientY };
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }

    // ── 交互：pointer 统一鼠标/触摸 ──
    svg.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const ng = ev.target.closest('.wm-node-g');
      const world = screenToWorld(ev.clientX, ev.clientY);
      downPos = { x: ev.clientX, y: ev.clientY, moved: false };
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
      if (ng) {
        dragging = nodeMap[ng.getAttribute('data-name')];
        ng.classList.add('dragging');
        dragging.x = world.x; dragging.y = world.y;
        wake();
      } else {
        panning = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
        svg.parentElement.classList.add('panning');
      }
    });

    svg.addEventListener('pointermove', (ev) => {
      if (downPos && (Math.abs(ev.clientX - downPos.x) > 3 || Math.abs(ev.clientY - downPos.y) > 3)) downPos.moved = true;
      if (dragging) {
        const w = screenToWorld(ev.clientX, ev.clientY);
        dragging.x = w.x; dragging.y = w.y; dragging.vx = 0; dragging.vy = 0;
        wake();
      } else if (panning) {
        const rect = svg.getBoundingClientRect();
        const s = view.w / rect.width;
        view.x = panning.vx - (ev.clientX - panning.sx) * s;
        view.y = panning.vy - (ev.clientY - panning.sy) * s;
        applyView();
      }
    });

    function endPointer(ev) {
      if (dragging) {
        const g = nodesG.querySelector('.wm-node-g.dragging');
        if (g) g.classList.remove('dragging');
        dragging = null;
        // 拖动结束释放一下能量，让周边节点重新平衡
        nodes.forEach((n) => { n.vx += (Math.random() - 0.5) * 0.5; n.vy += (Math.random() - 0.5) * 0.5; });
        wake();
      }
      if (panning) { panning = null; svg.parentElement.classList.remove('panning'); }
      // 点击（未拖动）→ 选中节点
      if (downPos && !downPos.moved) {
        const ng = ev && ev.target && ev.target.closest && ev.target.closest('.wm-node-g');
        if (ng) select(ng.getAttribute('data-name'));
      }
      downPos = null;
      if (ev) { try { svg.releasePointerCapture(ev.pointerId); } catch (e) {} }
    }
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', (ev) => { dragging = null; panning = null; downPos = null; svg.parentElement.classList.remove('panning'); });

    // 滚轮缩放（以鼠标为中心）
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? 1.14 : 0.88;
      zoomAt(ev.clientX, ev.clientY, delta);
    }, { passive: false });

    function zoomAt(clientX, clientY, factor) {
      const w = screenToWorld(clientX, clientY);
      const newW = Math.max(90, Math.min(1600, view.w * factor));
      const newH = newW * (H / W);
      // 以鼠标世界坐标为锚点缩放
      view.x = w.x - (w.x - view.x) * (newW / view.w);
      view.y = w.y - (w.y - view.y) * (newH / view.h);
      view.w = newW; view.h = newH;
      applyView();
    }

    // ── 选中：高亮该节点 + 关联边/节点，dim 其他 ──
    function select(name) {
      selected = name;
      nodes.forEach((n) => {
        const related = name && (n.id === name || edges.some((e) => (e.a.id === name && e.b.id === n.id) || (e.b.id === name && e.a.id === n.id)));
        n.c.classList.toggle('hi', n.id === name);
        n.c.classList.toggle('dim', !!name && !related);
        n.t.classList.toggle('hi', n.id === name);
        n.t.classList.toggle('dim', !!name && !related);
      });
      edges.forEach((e) => {
        const related = name && (e.a.id === name || e.b.id === name);
        e.el.classList.toggle('hi', related);
        e.el.classList.toggle('dim', !!name && !related);
      });
      if (opts.onSelect) opts.onSelect(name);
    }

    function focus(name) {
      if (!nodeMap[name]) return;
      select(name);
      view.x = nodeMap[name].x - view.w / 2;
      view.y = nodeMap[name].y - view.h / 2;
      applyView();
    }
    function zoom(factor) { zoomAt(svg.getBoundingClientRect().left + svg.clientWidth / 2, svg.getBoundingClientRect().top + svg.clientHeight / 2, factor); }
    function resetView() { view = { x: 0, y: 0, w: W, h: H }; applyView(); }

    function destroy() { if (rafId) cancelAnimationFrame(rafId); rafId = null; running = false; }

    rafId = requestAnimationFrame(step);
    return { destroy, focus, select, zoom, resetView };
  }

  function noopCtrl() { return { destroy() {}, focus() {}, select() {}, zoom() {}, resetView() {} }; }

  WM.RelGraph = { create };
})();
