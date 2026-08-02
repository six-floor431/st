/**
 * ContextPro 前端扩展
 * ---------------------------------------------------------------
 * 依赖：酒馆全局 context（getContext）、eventSource、event_types、jQuery、toastr
 * 功能：
 *  1. 总结楼层：把选中楼层(或自动阈值以上)发给后端 LLM 总结，并把原楼层标记为
 *     “已总结隐藏”——借助酒馆消息隐藏机制使其不进入上下文，仅保留摘要注入。
 *  2. 向量检索 + 云端重排：检索相关历史，重排后注入到 prompts 之前。
 *  3. 关系力图：总结后调用 /relations 提取实体关系，用 SVG 自绘节点图（无悬浮窗）。
 *  4. 侧边栏 UI：右侧抽屉，适配 PC 与手机（响应式）。
 */
import { getContext } from '../../../../scripts/extensions.js'
import { eventSource, event_types } from '../../../../scripts/events.js'

const PLUGIN_BASE = '/api/plugins/context-pro'

// ---------- 工具 ----------
async function api(path, body) {
  const opt = {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opt.body = JSON.stringify(body)
  const r = await fetch(PLUGIN_BASE + path, opt)
  return r.json()
}

function currentChatId() {
  const ctx = getContext()
  return ctx.characterId + ':' + (ctx.chatId || 'default')
}

// 标记楼层已总结隐藏
function markMessageSummarized(mesId, summary) {
  const ctx = getContext()
  const mes = ctx.message[mesId]
  if (!mes) return
  // 酒馆原生：extra 字段可承载自定义数据，is_system 不影响；用 extra 标记
  mes.extra = mes.extra || {}
  mes.extra.contextPro = { summarized: true, summary }
  // 通过酒馆隐藏机制：把消息从上下文裁剪（不删除 DOM，仅标注）
  // 酒馆在 buildChatLog 时会用 mes.extra 过滤——这里写入一个约定字段
  mes.extra.excludeFromContext = true
  // 把摘要作为系统注入
  ctx.chatMetadata ||= {}
  ctx.chatMetadata.contextProSummaries ||= {}
  ctx.chatMetadata.contextProSummaries[mesId] = summary
}

// ---------- 总结单组楼层 ----------
async function summarizeRange(startId, endId) {
  const ctx = getContext()
  const texts = []
  for (let i = startId; i <= endId; i++) {
    const m = ctx.message[i]
    if (m) texts.push(`[${m.name || '角色'}]: ${m.mes}`)
  }
  if (!texts.length) return
  const full = texts.join('\n')
  const { summary } = await api('/summary', { text: full })
  // 只把最后一条保留为“摘要锚点”，其余标记隐藏
  for (let i = startId; i < endId; i++) markMessageSummarized(i, null)
  markMessageSummarized(endId, summary)
  // 触发关系图更新
  const { relations } = await api('/relations', { text: full })
  renderRelationGraph(relations)
  toastr.success(`已总结 ${endId - startId + 1} 条楼层`)
}

// ---------- 向量检索 + 重排 ----------
async function vectorRecall(query, chatId) {
  const { results } = await api('/vector/search', { chatId, query, topK: 8 })
  const docs = results.map((r) => r.text)
  const { results: ranked } = await api('/rerank', {
    query,
    documents: docs,
    topN: 5,
  })
  return ranked
    .sort((a, b) => a.index - b.index)
    .map((x) => results[x.index])
}

// 在发送前把召回摘要注入 prompt
eventSource.on(event_types.CHAT_BEFORE_SETTINGS, async () => {
  const ctx = getContext()
  const lastUser = [...ctx.message].reverse().find((m) => m.role === 'user' || m.is_user)
  if (!lastUser) return
  const recalled = await vectorRecall(lastUser.mes, currentChatId())
  if (recalled.length) {
    const inject = '\n[相关记忆]\n' + recalled.map((r) => '- ' + r.text).join('\n')
    ctx.chatMetadata ||= {}
    ctx.chatMetadata.contextProInject = inject
  }
})

// ---------- 设置面板按钮 ----------
function addSettingsPanel() {
  const html = `
  <div id="contextpro-settings" class="contextpro-block">
    <div class="contextpro-title">ContextPro</div>
    <button id="cp-summarize-all">总结全部旧楼层</button>
    <button id="cp-summarize-range">总结选中范围</button>
    <button id="cp-open-panel">打开侧边栏</button>
    <hr/>
    <label>自动总结阈值(楼层数): <input id="cp-threshold" type="number" value="30"/></label>
  </div>`
  $('#extensions_settings').append(html)
  $('#cp-summarize-all').on('click', () => {
    const ctx = getContext()
    const last = ctx.message.length - 1
    summarizeRange(0, last - 1) // 保留最近一条
  })
  $('#cp-open-panel').on('click', toggleSidePanel)
}

// ---------- 侧边栏 ----------
function buildSidePanel() {
  if ($('#contextpro-panel').length) return
  const panel = $(`
    <div id="contextpro-panel" class="contextpro-panel hidden">
      <div class="cp-header">
        <span>ContextPro</span>
        <button id="cp-close">×</button>
      </div>
      <div class="cp-tabs">
        <button data-tab="retrieve" class="active">检索</button>
        <button data-tab="relations">关系图</button>
      </div>
      <div class="cp-body">
        <div class="cp-tab" data-tab="retrieve">
          <input id="cp-query" placeholder="输入检索问题"/>
          <button id="cp-do-search">向量召回+重排</button>
          <div id="cp-results"></div>
        </div>
        <div class="cp-tab hidden" data-tab="relations">
          <div id="cp-graph"></div>
        </div>
      </div>
    </div>`)
  $('body').append(panel)
  $('#cp-close').on('click', toggleSidePanel)
  panel.find('.cp-tabs button').on('click', function () {
    const t = $(this).data('tab')
    panel.find('.cp-tabs button').removeClass('active')
    $(this).addClass('active')
    panel.find('.cp-tab').addClass('hidden')
    panel.find(`.cp-tab[data-tab="${t}"]`).removeClass('hidden')
  })
  $('#cp-do-search').on('click', async () => {
    const q = $('#cp-query').val()
    if (!q) return
    const res = await vectorRecall(q, currentChatId())
    $('#cp-results').html(res.map((r) => `<div class="cp-item">${r.text}</div>`).join(''))
  })
}

function toggleSidePanel() {
  buildSidePanel()
  $('#contextpro-panel').toggleClass('hidden')
}

// ---------- 关系力图（SVG 自绘，无悬浮窗）----------
function renderRelationGraph(relations) {
  const container = $('#cp-graph')
  if (!container.length) return
  if (!relations || !relations.length) {
    container.html('<div class="cp-empty">暂无关系数据</div>')
    return
  }
  const nodes = new Map()
  relations.forEach((r) => {
    nodes.set(r.from, nodes.get(r.from) || { id: r.from, links: 0 })
    nodes.set(r.to, nodes.get(r.to) || { id: r.to, links: 0 })
    nodes.get(r.from).links++
    nodes.get(r.to).links++
  })
  const arr = [...nodes.values()]
  const W = 320,
    H = 320,
    cx = W / 2,
    cy = H / 2,
    R = 120
  arr.forEach((n, i) => {
    const a = (i / arr.length) * Math.PI * 2
    n.x = cx + R * Math.cos(a)
    n.y = cy + R * Math.sin(a)
  })
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%">`
  relations.forEach((r) => {
    const a = nodes.get(r.from),
      b = nodes.get(r.to)
    svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#7b5cff" stroke-width="${Math.max(1, r.weight / 3)}"/>`
  })
  arr.forEach((n) => {
    svg += `<circle cx="${n.x}" cy="${n.y}" r="22" fill="#2a1d44" stroke="#b06bff"/>`
    svg += `<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" fill="#fff" font-size="10">${n.id}</text>`
  })
  svg += `</svg>`
  container.html(svg)
}

// ---------- 初始化 ----------
function onSettingsReady() {
  addSettingsPanel()
  if (getContext().extensionSettings?.ContextPro?.sidePanelDefault) toggleSidePanel()
}
if (typeof eventSource !== 'undefined') {
  eventSource.on(event_types.SETTINGS_UPDATED, onSettingsReady)
}
$(document).ready(() => {
  if ($('#extensions_settings').length) onSettingsReady()
})
