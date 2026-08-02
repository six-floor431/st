# 温度记忆 WarmMemo（让角色有记忆、有温度的酒馆扩展）

融合三套参考的设计：
- **memoir**：`setExtensionPrompt` 注入 + 分段总结（我们改成**有温度的记忆**：保留情绪/语气/互动细节/关系温度）。
- **yuzuki-Memory**：模块化架构、向量 IndexedDB 本地化、楼层隐藏、云端 rerank、`auto_update` 自动更新。
- **ST-SevenDaysCal**：关系可视化（我们用 SVG 关系力图）。

## 功能
1. **总结楼层**：一键把当前对话提炼成有温度的记忆，原楼层可标记隐藏、**不进上下文**。
2. **向量本地化**：embedding 存浏览器 IndexedDB，不上传；可调本地反代或云端。
3. **重排序**：召回后调云端 rerank 精排，结果在侧边栏展示，**无本地悬浮窗**。
4. **关系力图**：总结后抽取实体关系，SVG 自绘节点图。
5. **本地反代**：embedding/rerank 的 baseUrl 指向 `127.0.0.1` 解决墙内访问。
6. **GitHub 自动更新**：`manifest.json` 带 `auto_update:true`，酒馆按 `homepage` 自动拉新版本。

## 重要：本仓库根目录就是扩展根
酒馆「Install Extension from URL」会 `git clone` 本仓库，并去**仓库根目录**找 `manifest.json`。
因此本仓库结构必须是（manifest.json 直接在根）：
```
context-pro/                ← 仓库根
├─ manifest.json            ← 必须在根！
├─ index.js
├─ styles.css
├─ config/
│  ├─ storage.js / settings.js / embedding-client.js / rerank-client.js
│  ├─ vector-store.js / floor-hider.js / summary.js / injection.js / relations.js
├─ ui/sidebar.js
├─ setup-git.bat / update.bat
└─ README.md
```
**之前 500 失败的原因**：旧版 `manifest.json` 放在 `scripts/warm-memo/` 子目录，根目录没有 → 酒馆 clone 后找不到 manifest → 500。现已修复（上移到根）。

## 安装（URL 安装 / 手动都行）
**方式 A：URL 安装**
1. 把本仓库 push 到 GitHub（`setup-git.bat` 首次 / `update.bat` 之后）。
2. 酒馆 → 拓展 → 安装扩展 → 填入 GitHub 仓库 URL（如 `https://github.com/six-floor431/st`）→ 安装。
3. 重启酒馆（或扩展页重载），右下角出现 💡 即成功。

**方式 B：手动**
把本仓库内容复制到 `SillyTavern/data/extensions/warm-memo/`（保持 manifest.json 在 `warm-memo/` 根）。

## 自动更新
manifest 带 `auto_update:true` + `homepage` 指向本仓库 → 酒馆自动拉新版本，你只需在酒馆里调设置。

## 你需要填的设置（侧边栏「设置」页）
- **Embedding**：启用后选 provider。本地反代填 `http://127.0.0.1:11434/v1`+`nomic-embed-text`；云端填 SiliconFlow 等 key。
- **Rerank**：填 SiliconFlow `https://api.siliconflow.cn/v1/rerank` + key + `BAAI/bge-reranker-v2-m3`。
- **总结 LLM**：独立 API 走 embedding 的 apiKey（或改 `config/summary.js` 接专门模型）；也可用酒馆已配 API。

## 说明
- 纯前端，无需 `enableServerPlugins`，无需 Node 后端。
- 向量数据存浏览器本地 IndexedDB，换浏览器/清缓存会丢，重要记忆建议导出备份。
