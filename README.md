# 温度记忆 WarmMemo（让角色有记忆、有温度 · 真实现版）

融合 memoir + yuzuki-Memory + ST-SevenDaysCal + 万楼不会忘记的核心思想，已修正为**真实现**与**酒馆原生风格**。

## 核心思想（来自「万楼不会忘记」）
记忆**不塞进上下文**，而是存进每个对话的元数据 `chat_metadata`（换对话不丢、不占 token），只在需要时才经 `CHAT_COMPLETION_PROMPT_READY` 注入。这样万楼层都不会忘、也不会撑爆上下文。

## 功能
1. **有温度记忆**：真实 LLM 总结近期/指定楼层，保留情绪、约定、关系温度。存 `chat_metadata`。
2. **自定义自动总结楼层**（你要求的）：
   - 模式：仅新增楼层 / 最近 N 条 / 自定义楼层区间（如 10~50）。
   - 可在「自动总结」页保存，发消息后自动触发。
3. **动态关系图**：SVG 力导向图，节点=实体、线粗=关系强度，可拖拽，随对话实时更新权重。
4. **剧情线**：从记忆归纳多条剧情线（进行中/已完成/已放弃），时间线可视化。
5. **物品追踪**：背包/持有物表，可增删改（获得/失去/所属）。
6. **世界设定（你要求的）**：
   - 客观读取**角色卡 + 用户卡 + 世界书 + 现有总结**，
   - 用 LLM 推断当前世界观设定，写进记忆并**注入上下文**，
   - 可自定义更新指令，可同步写入世界书（所有对话共享）。
7. **真实注入**：记忆+世界观确实进入每次请求的 system（用户在场验证）。
8. **向量检索**（可选）：embedding 存 IndexedDB + 余弦检索 + 可选云端 rerank。
9. **输入框旁按钮 + 水墨可爱风 + 手机适配**（底部抽屉）。

## 安装
仓库根即扩展根（manifest.json 在根）。酒馆 → 拓展 → 安装扩展 → 填 `https://github.com/six-floor431/st`。
重启后输入框旁出现「🌿 记忆」按钮。

## 使用
1. 点输入框旁「🌿 记忆」→ 设置：填总结 API（独立直连 /chat/completions）或留空回退酒馆共享 API；可选填 embedding/rerank（本地反代填 127.0.0.1）。
2. 「自动总结」页设置楼层模式 → 发消息自动记忆；或点「立即总结」。
3. 「关系图」「剧情线」「物品」「世界设定」各页查看/编辑。
4. 世界观可在「世界设定」页用 LLM 推断，或手动写。

## 真实现说明
- LLM：`config/llm-client.js` 直连 `/v1/chat/completions`，`summary.js`/`relations.js`/`plot.js`/`worldbook.js` 复用。
- 存储：`config/memory-store.js` 读写 `chat_metadata`（WM.MemoryStore）。
- 注入：`config/injection.js` 绑定 `CHAT_COMPLETION_PROMPT_READY`，写回 `event.detail.chat` 的 system。
- 关系图：`config/relations.js` 力导向布局 + `ui/launcher.js` 渲染。
- 世界观：`config/worldbook.js` 读角色卡/用户卡/世界书 + 推断 + 写世界书。
