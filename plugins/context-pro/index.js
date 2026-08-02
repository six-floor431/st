/**
 * ContextPro 服务器端插件
 * ---------------------------------------------------------------
 * 功能：
 *  - 独立自写向量系统（本地 sqlite 存储，向量本地化）
 *  - 本地反代云端 API（embedding / LLM / rerank 统一入口，解决鉴权与墙内访问）
 *  - 总结楼层（调用 LLM 生成摘要）
 *  - 重排序（云端 rerank API）
 *  - 关系力图数据提取（供前端绘图）
 *
 * 放置位置：SillyTavern/plugins/context-pro/
 * 需开启 config.yaml -> enableServerPlugins: true
 */
const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { WebFetch: _ } = {} // 占位，实际用 node fetch

// ---- 配置 ----
const PLUGIN_DIR = __dirname
const DATA_DIR = path.join(PLUGIN_DIR, 'data')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
fs.mkdirSync(DATA_DIR, { recursive: true })

const DEFAULT_CONFIG = {
  // 本地反代：把云端服务 base_url 指向本地代理端口
  proxy: {
    enabled: true,
    listenHost: '127.0.0.1',
    listenPort: 8787,
    routes: {
      // 对外暴露 /v1/embeddings 等，转发到真实云端
      '/v1': {
        target: 'https://api.openai.com/v1',
        apiKey: '',
        headers: {},
      },
    },
  },
  embedding: {
    mode: 'cloud', // 'cloud' | 'local'
    // 云端（经本地反代）
    cloudBaseUrl: 'http://127.0.0.1:8787/v1',
    cloudApiKey: 'proxy',
    cloudModel: 'text-embedding-3-small',
    // 本地（可选，未来接本地推理；当前走占位）
    localModel: '',
  },
  vector: {
    // 向量本地化：存本地 sqlite
    dbPath: path.join(DATA_DIR, 'vectors.db'),
    topK: 8,
    distance: 'cosine',
  },
  llm: {
    // 总结用 LLM，同样可走本地反代
    baseUrl: 'http://127.0.0.1:8787/v1',
    apiKey: 'proxy',
    model: 'gpt-4o-mini',
    summaryPrompt:
      '请把以下对话楼层精简为结构化摘要，保留事实、决策、情感与未完成任务。用中文。',
    relationPrompt:
      '请从对话中提取人物/实体关系，输出 JSON 数组：[{from,to,relation,weight}]，weight 1-10。',
  },
  rerank: {
    // 重排走云端（经本地反代）
    enabled: true,
    baseUrl: 'http://127.0.0.1:8787/v1',
    apiKey: 'proxy',
    model: 'rerank-english-v3.0', // 例：Cohere/Jina
    topN: 5,
  },
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
    }
  } catch (e) {
    console.error('[ContextPro] 配置读取失败，使用默认', e.message)
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8')
}

let CONFIG = loadConfig()

// ---- 简易 HTTP 请求封装（兼容带反代的 baseUrl）----
async function jsonPost(fullUrl, body, apiKey) {
  const url = new URL(fullUrl)
  const lib = url.protocol === 'https:' ? https : http
  const payload = JSON.stringify(body)
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error('非 JSON 响应: ' + data.slice(0, 200)))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// ---- 本地反代服务器 ----
let proxyServer = null
function startProxy() {
  if (!CONFIG.proxy.enabled || proxyServer) return
  const app = express()
  app.use(express.json({ limit: '50mb' }))
  app.all('/*', async (req, res) => {
    const routeKey = '/' + (req.params[0].split('/')[1] || '')
    const matched = Object.keys(CONFIG.proxy.routes).find((k) =>
      req.params[0].startsWith(k.replace(/^\//, ''))
    )
    const route = CONFIG.proxy.routes[matched] || CONFIG.proxy.routes['/v1']
    const targetBase = route.target
    const targetUrl = targetBase + '/' + req.params[0].replace(new RegExp('^' + (matched || '/v1').replace(/^\//, '')), '')
    try {
      const upstream = await jsonPost(
        targetUrl,
        req.body,
        route.apiKey || CONFIG.proxy.routes['/v1'].apiKey
      )
      res.json(upstream)
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })
  proxyServer = app.listen(CONFIG.proxy.listenPort, CONFIG.proxy.listenHost, () => {
    console.log(`[ContextPro] 本地反代已启动 ${CONFIG.proxy.listenHost}:${CONFIG.proxy.listenPort}`)
  })
}

// ---- 向量本地化存储（用原生 sqlite3 若可用，否则降级到 JSON 文件）----
let db = null
let useSqlite = false
try {
  const sqlite3 = require('sqlite3')
  useSqlite = true
  db = new sqlite3.Database(CONFIG.vector.dbPath)
  db.run(`CREATE TABLE IF NOT EXISTS vectors (
    id TEXT PRIMARY KEY,
    chatId TEXT,
    text TEXT,
    embedding TEXT,
    meta TEXT
  )`)
} catch (e) {
  console.log('[ContextPro] 未安装 sqlite3，使用 JSON 文件存储降级方案')
  const jsonPath = path.join(DATA_DIR, 'vectors.json')
  if (!fs.existsSync(jsonPath)) fs.writeFileSync(jsonPath, '[]', 'utf8')
  db = {
    _all: () => JSON.parse(fs.readFileSync(jsonPath, 'utf8')),
    _write: (rows) => fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2)),
    async run() {},
    async all() {
      return this._all()
    },
    async insert(row) {
      const rows = this._all()
      rows.push(row)
      this._write(rows)
    },
  }
}

function cosineSim(a, b) {
  let dot = 0,
    na = 0,
    nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// ---- 路由 ----
router.get('/config', (req, res) => res.json(CONFIG))

router.post('/config/save', express.json(), (req, res) => {
  CONFIG = { ...CONFIG, ...req.body }
  saveConfig(CONFIG)
  res.json({ ok: true })
})

// 向量化（embedding）
router.post('/embed', express.json(), async (req, res) => {
  try {
    const { texts } = req.body
    const url = `${CONFIG.embedding.cloudBaseUrl}/embeddings`
    const out = []
    for (const t of texts) {
      const r = await jsonPost(
        url,
        { input: t, model: CONFIG.embedding.cloudModel },
        CONFIG.embedding.cloudApiKey
      )
      out.push(r.data[0].embedding)
    }
    res.json({ embeddings: out })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 加入向量库
router.post('/vector/add', express.json(), async (req, res) => {
  const { chatId, items } = req.body // items: [{id,text,meta}]
  const url = `${CONFIG.embedding.cloudBaseUrl}/embeddings`
  for (const it of items) {
    const r = await jsonPost(
      url,
      { input: it.text, model: CONFIG.embedding.cloudModel },
      CONFIG.embedding.cloudApiKey
    )
    const emb = r.data[0].embedding
    if (useSqlite) {
      db.run(
        'INSERT OR REPLACE INTO vectors (id,chatId,text,embedding,meta) VALUES (?,?,?,?,?)',
        [it.id, chatId, it.text, JSON.stringify(emb), JSON.stringify(it.meta || {})]
      )
    } else {
      await db.insert({ id: it.id, chatId, text: it.text, embedding: JSON.stringify(emb), meta: JSON.stringify(it.meta || {}) })
    }
  }
  res.json({ ok: true, count: items.length })
})

// 相似检索
router.post('/vector/search', express.json(), async (req, res) => {
  const { chatId, query, topK } = req.body
  const k = topK || CONFIG.vector.topK
  const r = await jsonPost(
    `${CONFIG.embedding.cloudBaseUrl}/embeddings`,
    { input: query, model: CONFIG.embedding.cloudModel },
    CONFIG.embedding.cloudApiKey
  )
  const qemb = r.data[0].embedding
  let rows
  if (useSqlite) {
    rows = await new Promise((resolve) => {
      db.all('SELECT * FROM vectors WHERE chatId = ?', [chatId], (e, rs) => resolve(rs || []))
    })
  } else {
    rows = (await db.all()).filter((x) => x.chatId === chatId)
  }
  const scored = rows
    .map((x) => ({ ...x, embedding: JSON.parse(x.embedding) }))
    .map((x) => ({ ...x, score: cosineSim(qemb, x.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
  res.json({ results: scored })
})

// 总结楼层
router.post('/summary', express.json(), async (req, res) => {
  const { text } = req.body
  const r = await jsonPost(
    `${CONFIG.llm.baseUrl}/chat/completions`,
    {
      model: CONFIG.llm.model,
      messages: [
        { role: 'system', content: CONFIG.llm.summaryPrompt },
        { role: 'user', content: text },
      ],
    },
    CONFIG.llm.apiKey
  )
  res.json({ summary: r.choices[0].message.content })
})

// 关系提取
router.post('/relations', express.json(), async (req, res) => {
  const { text } = req.body
  const r = await jsonPost(
    `${CONFIG.llm.baseUrl}/chat/completions`,
    {
      model: CONFIG.llm.model,
      messages: [
        { role: 'system', content: CONFIG.llm.relationPrompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    },
    CONFIG.llm.apiKey
  )
  let rel = []
  try {
    const parsed = JSON.parse(r.choices[0].message.content)
    rel = parsed.relations || parsed || []
  } catch (e) {}
  res.json({ relations: rel })
})

// 重排序（云端）
router.post('/rerank', express.json(), async (req, res) => {
  const { query, documents, topN } = req.body
  if (!CONFIG.rerank.enabled) return res.json({ results: documents.map((d, i) => ({ index: i, score: 1 })) })
  const r = await jsonPost(
    `${CONFIG.rerank.baseUrl}/rerank`,
    {
      model: CONFIG.rerank.model,
      query,
      documents,
      top_n: topN || CONFIG.rerank.topN,
    },
    CONFIG.rerank.apiKey
  )
  res.json({ results: r.results })
})

// 本地反代透传（备用裸路由）
router.all('/proxy/*', async (req, res) => {
  const target = CONFIG.proxy.routes['/v1'].target + '/' + req.params[0]
  try {
    const r = await jsonPost(target, req.body, CONFIG.proxy.routes['/v1'].apiKey)
    res.json(r)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

module.exports = {
  router,
  init: () => {
    startProxy()
  },
}

if (require.main === module) {
  startProxy()
}
