# Gamer Beta 技术文档

## 1. 项目概述

Gamer Beta 是一个基于 Web 的互动小游戏创作与分享平台。用户可以在 Create 页面输入文字创意，并上传图片、视频或文件作为辅助素材，由后端 Multi-Agent 流水线生成单文件 HTML5 Canvas 小游戏，保存到本地 uploads 目录并发布到平台。

当前版本重点增强了 Create 模块：

- 支持文字创意 + 多附件上传。
- 图片素材会作为游戏内可见资产传入代码生成提示。
- DeepSeek 等纯文本 OpenAI 兼容接口会自动降级为文本上下文，不再发送不兼容的 image_url 消息。
- 生成后的 HTML 游戏会经过完整性和 JavaScript 语法校验。
- 如果模型输出截断或无法启动，会尝试修复；修复失败时使用稳定 fallback 模板，保证 Start 可点击、游戏可运行。

## 2. 技术栈

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 前端 | Vue 3 + Vite | 单页应用，Create/Home/Assets/Game 页面 |
| 状态管理 | Pinia | 登录态和游戏列表状态 |
| 路由 | Vue Router 4 | SPA 路由 |
| HTTP | Axios | JWT 注入、API 代理、长超时生成请求 |
| 后端 | Express.js | REST API 服务 |
| 数据库 | better-sqlite3 | SQLite 本地数据库 |
| 文件上传 | multer | cover/game/file 多类型上传 |
| AI 接入 | OpenAI Node SDK | 默认模型配置为 gpt-5.5，兼容自定义 baseURL |
| 游戏运行 | HTML5 Canvas | 生成单文件 HTML 游戏 |

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

## 4. 环境变量

后端从 `server/.env` 读取配置。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| PORT | 否 | 3000 | 后端端口 |
| JWT_SECRET | 是 | - | JWT 签名密钥 |
| DB_PATH | 否 | ./data/gamer_beta.db | SQLite 数据库路径 |
| UPLOAD_DIR | 否 | ./uploads | 上传文件目录 |
| OPENAI_API_KEY | 是 | - | LLM API Key |
| OPENAI_BASE_URL | 否 | https://api.openai.com/v1 | OpenAI 或兼容接口地址 |
| OPENAI_MODEL | 否 | gpt-5.5 | 生成模型 |

说明：

- 如果 `OPENAI_BASE_URL` 是官方 OpenAI endpoint，后端会使用图片输入能力。
- 如果 `OPENAI_BASE_URL` 是 DeepSeek 等文本兼容 endpoint，后端会自动禁用 `image_url` 消息，改为把附件信息注入文本提示。

## 5. 项目结构

```text
gamer_beta/
  client/
    src/
      api/index.js
      router/index.js
      stores/
      views/
        Create.vue
        Home.vue
        GameDetail.vue
        GamePlay.vue
        Assets.vue
  server/
    src/
      app.js
      routes/
        games.js
        upload.js
        assets.js
        auth.js
        favorites.js
      controllers/
        gameController.js
        assetController.js
        authController.js
      services/
        openaiClient.js
        gameDesigner.js
        codeGenerator.js
        orchestrator.js
      models/db.js
    uploads/
      games/
      covers/
  docs/
    TECH_DOC.md
    COMPLETION_STATUS.md
```

## 6. Create 多模态生成流程

### 6.1 前端交互

`client/src/views/Create.vue` 提供聊天式创建界面：

1. 用户输入游戏创意。
2. 用户可上传图片、视频或文件。
3. 前端调用 `POST /api/upload/file` 上传附件。
4. 上传成功后得到 `url, filename, originalName, mimetype, size, kind`。
5. 生成时调用 `POST /api/games/generate`，请求体包含 `prompt` 和 `attachments`。

请求示例：

```json
{
  "prompt": "Create a spaceship dodging game using these assets",
  "attachments": [
    {
      "url": "/uploads/covers/hero_spaceship.png",
      "filename": "hero_spaceship.png",
      "originalName": "hero_spaceship.png",
      "mimetype": "image/png",
      "size": 13076,
      "kind": "image"
    }
  ]
}
```

### 6.2 后端流水线

`POST /api/games/generate` 调用 `orchestrateGameGeneration(prompt, userId, attachments, imageUrls)`：

1. `Game Designer Agent`
   - 生成游戏设计 JSON。
   - 对文本文件截取内容作为上下文。
   - 对图片、视频、二进制文件注入素材说明。
   - 如果模型 endpoint 支持图片输入，则图片会作为多模态内容发送。

2. `Code Generator Agent`
   - 根据设计 JSON 生成单文件 HTML5 Canvas 游戏。
   - 将图片附件 URL 明确传入提示。
   - 要求生成代码使用 `new Image()` 预加载图片，并在 Canvas 中作为背景、玩家、敌人、道具等显示。

3. `Validation / Repair`
   - 检查 HTML 是否包含 canvas、start 控件、完整 `</script>` 和 `</html>`。
   - 抽取 `<script>` 内容并使用 `vm.Script` 做 JavaScript 语法检查。
   - 失败时调用模型修复一次。
   - 修复仍失败时使用本地 fallback 游戏模板。

4. `File Storage`
   - 生成 UUID 文件名。
   - 写入 `server/uploads/games/*.html`。

5. `Database`
   - 写入 `games`。
   - 写入 `game_meta`，包含 genre、mechanics、controls、features、attachments、referenceImages 等信息。

## 7. 关键服务说明

### openaiClient.js

- 封装 OpenAI SDK。
- 默认模型：`gpt-5.5`。
- 支持 `OPENAI_BASE_URL` 覆盖。
- `SUPPORTS_IMAGE_INPUT` 用于判断是否发送 `image_url` 多模态消息。
- 提供：
  - `chat`
  - `chatWithImages`
  - `chatWithAttachments`
  - `loadImageAsBase64`
  - `loadTextFile`

### gameDesigner.js

- 负责把用户 prompt 和附件转成结构化游戏设计。
- 输出字段包括 title、genre、description、tags、mechanics、controls、winCondition、loseCondition、visualStyle、features、assetUsage。
- 文本类附件会被读取并截断注入提示。
- 图片在不支持视觉输入的 endpoint 下，会作为文件名和类型提示使用。

### codeGenerator.js

- 负责生成完整 HTML5 Canvas 游戏。
- 强制要求：
  - 单文件 HTML。
  - Start/Restart 可点击。
  - ASCII UI 文本，避免编码乱码破坏 JavaScript 字符串。
  - 上传图片 URL 必须直接被游戏引用。
- 生成后执行校验和修复。
- 内置 fallback 模板，保证最坏情况下仍能产出可启动游戏。

### orchestrator.js

- 统一编排设计、代码生成、存储、数据库写入。
- 兼容旧字段 `imageUrls` 和新字段 `attachments`。
- 使用第一张图片作为 coverUrl。

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
| POST | /api/games/generate | AI 生成游戏 |
| DELETE | /api/games/:id | 删除游戏 |

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

主要表：

- `users`：用户账户。
- `games`：游戏基本信息。
- `game_meta`：生成设计和附件元数据。
- `assets`：素材库文件。
- `favorites`：收藏关系。

本次多模态生成不会新增表结构，附件信息写入 `game_meta.meta_json`。

## 10. 已知限制

- DeepSeek 当前配置为文本模型时，不能真正理解图片像素，只能使用图片文件名、类型和 URL；但生成游戏会实际引用并显示上传图片。
- 视频暂未抽帧或转写，只作为 filename/type 参考。
- 生成结果仍依赖模型质量；fallback 模板保证可运行，但玩法会比模型完整生成更通用。
- 本地 uploads 目录用于开发环境，生产环境建议迁移到对象存储。

## 11. 验证方式

已执行：

```bash
cd client
npm run build

cd ../server
node -e "require('./src/services/openaiClient'); require('./src/services/gameDesigner'); require('./src/services/orchestrator'); require('./src/controllers/gameController'); console.log('server modules ok')"
```

运行验证：

- 后端健康检查返回 `ok`。
- Create 页面可上传附件。
- 生成结果在 Preview 中加载。
- fallback 生成文件通过 JavaScript 语法校验，Start 可点击。
