# Gamer Beta 技术文档

## 1. 项目概述

Gamer Beta 是一个基于 Web 的互动小游戏创作与分享平台。用户可以在 Create 页面输入文字创意，并上传图片、视频或文件作为辅助素材，由后端 LangGraph Multi-Agent 流水线生成单文件 HTML5 Canvas 小游戏，保存到本地 uploads 目录并发布到平台。

核心特性：

- **LangGraph 状态机编排**：基于 `@langchain/langgraph` 的 DAG 流水线，支持节点级重试与条件分支。
- **全链路可观测追踪**：每次生成自动创建追踪记录，记录每个节点的耗时、token 消耗、错误分类。
- **智能容错**：代码校验失败自动修复，修复失败使用 fallback 模板；安全校验触发指数退避重试（1s → 2s → 4s）。
- **多模态附件支持**：图片、视频、文本文件可作为创意素材注入生成流程。

## 2. 技术栈

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 前端 | Vue 3 + Vite | 单页应用，Create/Home/Assets/Game 页面 |
| 状态管理 | Pinia | 登录态和游戏列表状态 |
| 路由 | Vue Router 4 | SPA 路由 |
| HTTP | Axios | JWT 注入、API 代理、5 分钟超时 |
| 后端 | Express.js | REST API 服务 |
| 数据库 | better-sqlite3 | SQLite 本地数据库（WAL 模式） |
| 文件上传 | multer | cover/game/file 多类型上传 |
| AI 编排 | @langchain/langgraph v1.4.7 | StateGraph 状态机 DAG 编排 |
| AI 接入 | OpenAI Node SDK | 兼容 DeepSeek / GPT 等 OpenAI 格式接口 |
| 默认模型 | deepseek-v4-pro | DeepSeek V4 Pro 旗舰模型（已禁用思考模式） |
| 游戏运行 | HTML5 Canvas | 生成单文件 HTML 游戏 |
| UUID | Node crypto.randomUUID() | 替代 uuid npm 包 |

## 3. 本地启动

```bash
cd server
npm install
npm run dev

cd ../client
npm install
npm run dev -- --host 0.0.0.0
```

默认访问地址：

- 前端：http://localhost:5173
- 后端：http://localhost:3000
- 健康检查：http://localhost:3000/api/health

### 兼容性说明

- **Node.js 18.x**：`app.js` 启动时注入 `globalThis.crypto = require('crypto')` polyfill，确保 `uuid` 及 langgraph 内部依赖的 Web Crypto API 可用。
- **DeepSeek V4 Pro**：默认开启思考模式，本项目通过 `thinking: { type: 'disabled' }` 禁用，确保 `content` 字段直接返回生成结果。

## 4. 环境变量

后端从 `server/.env` 读取配置。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| PORT | 否 | 3000 | 后端端口 |
| JWT_SECRET | 是 | - | JWT 签名密钥 |
| DB_PATH | 否 | ./data/gamer_beta.db | SQLite 数据库路径 |
| UPLOAD_DIR | 否 | ./uploads | 上传文件目录 |
| OPENAI_API_KEY | 是 | - | LLM API Key |
| OPENAI_BASE_URL | 否 | https://api.deepseek.com/v1 | DeepSeek 或 OpenAI 兼容接口 |
| OPENAI_MODEL | 否 | deepseek-v4-pro | 生成模型 |

说明：

- `OPENAI_BASE_URL` 含 `openai.com` 时启用多模态图片输入。
- DeepSeek 等纯文本 endpoint 会自动降级为文本上下文模式。

## 5. 项目结构

```text
gamer_beta/
  client/
    src/
      api/index.js
      router/index.js
      stores/
      views/
        Create.vue          # 游戏创建页（聊天 + 预览 + 发布）
        Home.vue            # 游戏画廊
        GameDetail.vue      # 游戏详情
        GamePlay.vue        # 全屏游戏播放器
        Assets.vue          # 素材库
  server/
    src/
      app.js                # 入口（含 crypto polyfill）
      routes/
        games.js            # 游戏 + trace 路由
        upload.js
        assets.js
        auth.js
        favorites.js
      controllers/
        gameController.js   # 游戏 CRUD + trace API
        assetController.js
        authController.js
      services/
        openaiClient.js     # OpenAI SDK 封装（禁用思考模式）
        gameDesigner.js     # Game Designer Agent
        codeGenerator.js    # Code Generator Agent
        gameGenGraph.js     # LangGraph 编排管线（核心）
        traceService.js     # 追踪记录 CRUD + 统计
        orchestrator.js     # 旧版顺序编排（已弃用）
        security.js         # 代码安全校验 + 消毒
      models/
        db.js               # SQLite 初始化 + 迁移
    uploads/
      games/
      covers/
  docs/
    TECH_DOC.md
    COMPLETION_STATUS.md
```

## 6. LangGraph 生成流程

### 6.1 管线架构

```
POST /api/games/generate
        │
        ▼
  createTrace(traceId) ─── DB: INSERT generation_traces
        │
        ▼
  ┌─────────────────────────────────────────┐
  │        LangGraph StateGraph DAG          │
  │                                          │
  │  gameDesigner ─────► codeGenerator ────► │
  │       │                    │             │
  │       │              codeValidator       │
  │       │               (3 次指数退避)      │
  │       │                    │             │
  │       └──► fileStorage ─► dbStorage ──► END
  │                                          │
  │  每个节点:                                │
  │  · 记录 startedAt / endedAt / durationMs  │
  │  · 记录 tokensUsed                       │
  │  · appendNodeExecution(traceId, ...)      │
  │  · 失败自动分类错误类型                    │
  └─────────────────────────────────────────┘
        │
        ▼
  updateTraceState(traceId) ─── DB: UPDATE
        │
        ▼
  返回 { traceId, game, steps, status, error }
```

### 6.2 节点说明

| 节点 | 服务 | 功能 |
| --- | --- | --- |
| gameDesigner | gameDesigner.js | 解析用户 prompt + 附件，输出结构化游戏设计 JSON |
| codeGenerator | codeGenerator.js | 根据设计 JSON 生成单文件 HTML5 Canvas 游戏 |
| codeValidator | security.js | 安全检查（外部脚本/iframe/cookie/javascript: 协议）；不通过则消毒后重试 |
| fileStorage | gameGenGraph.js | UUID 命名 + 写入 uploads/games/ |
| dbStorage | gameGenGraph.js | 写入 games 表 + game_meta 表，更新 trace 最终状态 |

### 6.3 重试策略

- **codeGenerator 内部**：HTML 校验失败 → LLM 修复一次 → 仍失败 → fallback 模板
- **codeValidator**：安全校验失败 → 消毒代码 → 指数退避重试（1s / 2s / 4s）→ 3 次仍失败 → 标记 failed

## 7. 追踪系统（Generation Trace）

### 7.1 数据模型

表名：`generation_traces`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | UUID 追踪标识 |
| user_id | INTEGER | 用户 ID |
| user_prompt | TEXT | 用户原始 prompt |
| image_urls | TEXT | 附件 URL JSON |
| status | TEXT | started → designing → generating → validating → saving → completed/failed |
| error | TEXT | 错误详情 |
| error_category | TEXT | llm_error / validation_error / security_error / system_error |
| error_node | TEXT | 失败发生的节点名 |
| game_id | INTEGER | 成功生成的游戏 ID |
| game_design | TEXT | 设计 JSON |
| node_executions | TEXT JSON | 每节点执行详情数组 |
| total_duration_ms | INTEGER | 总耗时（毫秒） |
| total_tokens | INTEGER | 总 token 消耗 |
| retry_count | INTEGER | 重试次数 |
| started_at | TEXT | 开始时间 |
| completed_at | TEXT | 完成时间 |

### 7.2 节点执行记录结构

```json
{
  "node": "gameDesigner",
  "startedAt": "2026-06-28T00:00:00.000Z",
  "endedAt": "2026-06-28T00:00:06.582Z",
  "durationMs": 6582,
  "tokensUsed": 0,
  "status": "done",
  "error": null,
  "errorCategory": null,
  "summary": "Classic Snake: Pixel Feast (arcade)"
}
```

### 7.3 错误自动分类

| 分类 | 触发条件 |
| --- | --- |
| llm_error | API 调用失败、rate limit、超时、连接错误 |
| validation_error | JSON 解析失败、语法错误、格式错误 |
| security_error | 外部脚本、iframe、cookie、javascript: 协议 |
| system_error | 文件写入失败、数据库错误、其他未知错误 |

## 8. API 文档

### 通用

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/health | 健康检查 |

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login | 登录 |
| GET | /api/auth/me | 当前用户 |

### 游戏

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/games | 游戏列表 |
| GET | /api/games/:id | 游戏详情 |
| GET | /api/games/tags | 标签列表 |
| GET | /api/games/stats | 平台统计 |
| POST | /api/games | 手动创建游戏 |
| POST | /api/games/generate | AI 生成游戏（返回 traceId） |
| DELETE | /api/games/:id | 删除游戏 |

### 追踪

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/games/traces | 分页列出当前用户追踪记录 |
| GET | /api/games/traces/failed | 分页列出失败记录 |
| GET | /api/games/traces/stats | 全局统计（失败率/错误分布/节点故障分布） |
| GET | /api/games/traces/:traceId | 获取单条追踪详情（含节点时间线） |

### 上传

| 方法 | 路径 | 字段 | 说明 |
| --- | --- | --- | --- |
| POST | /api/upload/cover | cover | 上传封面图 |
| POST | /api/upload/game | game | 上传游戏文件 |
| POST | /api/upload/file | file | 通用附件上传 |

`/api/upload/file` 返回：

```json
{
  "url": "/uploads/covers/xxx.png",
  "filename": "xxx.png",
  "originalName": "hero.png",
  "mimetype": "image/png",
  "size": 12345,
  "kind": "image"
}
```

### 素材

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/assets | 素材列表 |
| POST | /api/assets/upload | 上传素材 |
| DELETE | /api/assets/:id | 删除素材 |

### 收藏

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/favorites | 收藏列表 |
| POST | /api/favorites/:gameId | 切换收藏 |
| GET | /api/favorites/check/:gameId | 检查是否已收藏 |

## 9. 数据库表

- `users`：用户账户
- `games`：游戏基本信息
- `game_meta`：生成设计和附件元数据
- `generation_traces`：每次生成的全链路追踪记录（v1.2 新增）
- `assets`：素材库文件
- `favorites`：收藏关系

## 10. 关键服务说明

### openaiClient.js

- 封装 OpenAI SDK，所有调用均设置 `thinking: { type: 'disabled' }` 禁用 DeepSeek 思考模式。
- 返回值结构：`{ content, usage }`，usage 包含 promptTokens / completionTokens / totalTokens。
- 提供：`chat`、`chatWithImages`、`chatWithAttachments`、`loadImageAsBase64`、`loadTextFile`。

### gameDesigner.js

- 解析用户 prompt 和附件，输出结构化游戏设计 JSON。
- 输出字段：title、genre、description、tags、mechanics、controls、winCondition、loseCondition、visualStyle、features、assetUsage。

### codeGenerator.js

- 生成单文件 HTML5 Canvas 游戏。
- 内置校验：canvas 元素、Start 控件、`</script>` / `</html>` 完整性、JavaScript 语法（vm.Script）。
- 校验失败：LLM 修复一次 → 仍失败 → fallback 模板。

### traceService.js

- `createTrace()` - 创建追踪记录
- `updateTraceState()` - 批量更新状态字段
- `appendNodeExecution()` - 追加节点执行记录
- `categorizeError()` - 自动错误分类
- `getTraceStats()` - 全局统计（总量/失败率/错误分布）
- `listTraces()` / `getFailedTraces()` - 分页查询

### security.js

- `validateGeneratedCode()` - 检测外部脚本/iframe/cookie/javascript: 协议
- `sanitizeHtmlCode()` - 移除/中和危险模式

### gameGenGraph.js

- 基于 `@langchain/langgraph` StateGraph 的 5 节点 DAG 管线。
- State 通道：userId、userPrompt、imageUrls、gameDesign、gameCode、validation、gameId、gameUrl、coverUrl、steps、status、error、retryCount、version、totalTokens、nodeExecutions、traceId、startTime。
- 条件边：codeGenerator → failed → END；codeValidator → retrying → codeGenerator / failed → END / validated → fileStorage。

## 11. 变更日志

### v1.2 - LangGraph 可观测性 + DeepSeek V4 Pro（2026-06-28）

- **新增** LangGraph StateGraph 编排管线（gameGenGraph.js），替代旧版顺序 orchestrator
- **新增** generation_traces 表 + traceService.js 全链路追踪服务
- **新增** 4 个 trace API 端点（列表/失败列表/统计/详情）
- **新增** 错误自动分类（llm/validation/security/system）
- **新增** 指数退避重试（1s → 2s → 4s）
- **升级** 默认模型 deepseek-chat → deepseek-v4-pro
- **修复** V4 Pro 思考模式导致 content 为空（`thinking: { type: 'disabled' }`）
- **修复** Node 18 crypto 全局缺失（app.js polyfill + 替换 uuid 包）
- **优化** 客户端超时 120s → 300s
- **优化** openaiClient 返回值改为 `{ content, usage }` 携带 token 统计
- **优化** 前端错误展示增加 traceId 链接和失败步骤详情

### v1.1 - Create Multimodal（2026-06-24）

- 多模态附件上传支持
- Game Designer / Code Generator Agent
- 代码校验 + 修复 + fallback 模板

## 12. 已知限制

- DeepSeek 纯文本模式下无法分析图片像素，图片仅作为文件名/类型参考和游戏素材 URL。
- 视频暂未抽帧或转写。
- 本地 uploads 目录用于开发环境，生产环境建议迁移到对象存储。
- V4 Pro 生成速度较慢（单次代码生成 ~30-60s），建议频繁使用时考虑 v4-flash。
