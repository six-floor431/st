# ContextPro —— 酒馆(SillyTavern)原生扩展

独立自写向量系统 + 总结楼层 + 云端重排 + 关系力图。
**本地反代云端 API，向量本地化，重排走云端，无本地悬浮窗，适配电脑与手机。**

---

## 功能

| 功能 | 说明 |
|---|---|
| **总结楼层** | 把选中/旧楼层发给 LLM 总结，原楼层标记 `excludeFromContext` **不进入上下文**，仅保留摘要注入 |
| **向量本地化** | 向量存本地（sqlite，未装则降级 JSON 文件），不上传云端 |
| **本地反代** | 后端起一个本地代理（默认 127.0.0.1:8787），把云端 embedding/LLM/rerank 请求统一转发，解决鉴权与墙内访问 |
| **云端重排** | 检索结果发云端 rerank API 重排序，结果在侧边栏展示 |
| **关系力图** | 总结后调用 LLM 提取实体关系，用 SVG 自绘节点图（无悬浮窗） |
| **响应式** | 侧边栏抽屉式，PC 占右 360px，手机最多 92vw，全屏高 |

---

## 目录结构

```
context-pro/
├─ plugins/context-pro/        # 服务器端插件 → 放 SillyTavern/plugins/
│  ├─ manifest.json
│  ├─ index.js                 # Express 路由 + 反代 + 向量存储
│  └─ data/                    # 运行时生成：config.json / vectors.db
└─ scripts/context-pro/        # 前端扩展 → 放 data/extensions/context-pro/
   ├─ manifest.json
   ├─ index.js
   └─ style.css
```

---

## 安装

1. 把 `plugins/context-pro/` 复制到 `SillyTavern/plugins/context-pro/`
2. 把 `scripts/context-pro/` 复制到 `SillyTavern/data/extensions/context-pro/`
3. 编辑 `SillyTavern/config.yaml`，确保：
   ```yaml
   enableServerPlugins: true
   ```
4. 重启 SillyTavern。扩展出现在「扩展」设置页。

> 依赖：`sqlite3`（可选，未装自动降级 JSON 存储）、`express`（酒馆已带）。

---

## 配置

运行时配置写在 `plugins/context-pro/data/config.json`，可用 `/api/plugins/context-pro/config` 查看、POST `/config/save` 修改：

```jsonc
{
  "proxy":   { "enabled": true, "listenPort": 8787, "routes": { "/v1": { "target": "https://api.openai.com/v1", "apiKey": "你的密钥" } } },
  "embedding": { "mode": "cloud", "cloudBaseUrl": "http://127.0.0.1:8787/v1", "cloudModel": "text-embedding-3-small" },
  "vector":  { "topK": 8, "distance": "cosine" },
  "llm":     { "baseUrl": "http://127.0.0.1:8787/v1", "model": "gpt-4o-mini" },
  "rerank":  { "enabled": true, "baseUrl": "http://127.0.0.1:8787/v1", "model": "rerank-english-v3.0", "topN": 5 }
}
```

把 `proxy.routes./v1.target` 的 `apiKey` 填上你的云端密钥，其余走本地反代即可。

---

## 使用

- **扩展设置页**：点「总结全部旧楼层」「总结选中范围」「打开侧边栏」。
- **侧边栏「检索」**：输入问题 → 向量召回 + 云端重排，结果列表展示；发送消息前会自动把相关记忆注入 prompt。
- **侧边栏「关系图」**：每次总结后自动更新 SVG 关系节点图。

---

## 与"GitHub 直拉扩展"的区别

本扩展是**酒馆原生扩展**（本地插件 + 后端 server plugin），需要本地 Node.js 运行时，
**不能**用之前讲的 `type: github` / jsDelivr 直拉方式加载——因为向量库、反代、API 路由都跑在本地服务器上。
只有轻量单文件脚本/前端界面才适合 GitHub 直拉。

---

## 已知占位（需你按环境补充）

- `embedding.mode: 'local'` 目前是接口占位，本地推理需在 `index.js` 的 `jsonPost` 处接本地模型。
- 重排 `model` 名按你用的云端服务改（Cohere/Jina/火山等）。
- 关系提取依赖 LLM 返回 JSON，已做容错，但建议用支持 `response_format=json_object` 的模型。
