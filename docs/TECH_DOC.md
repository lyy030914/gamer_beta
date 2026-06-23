# Gamer Beta - 互动游戏平台技术文档

## 快速启动

### Docker Compose（推荐）

```bash
# 1. 配置 API Key
cp server/.env.example server/.env
# 编辑 server/.env，填入 OPENAI_API_KEY

# 2. 一键启动
docker compose up -d

# 3. 访问 http://localhost
```

### 本地开发

```bash
# 1. 配置环境
cp server/.env.example server/.env
# 编辑 server/.env，填入 OPENAI_API_KEY

# 2. 安装依赖
cd server && npm install
cd ../client && npm install

# 3. 启动
# 终端 1 - 后端
cd server && npm run dev        # → http://localhost:3000

# 终端 2 - 前端
cd client && npm run dev        # → http://localhost:5173
```

---

## 一、项目概述

**Gamer Beta** 是一个基于 Web 的互动游戏创作与分享平台，参考 Astrocade.com 设计理念。用户通过文字描述游戏创意，由后端 **Multi-Agent 架构**调用 DeepSeek API 自动生成完整的 HTML5 互动游戏，并发布到平台上供其他用户游玩。

---

## 二、技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 3 + Vite | 组合式 API + SFC，路由级懒加载 |
| 状态管理 | Pinia | storeToRefs 保持响应式 |
| 路由 | Vue Router 4 | SPA History 模式 |
| HTTP 客户端 | Axios | 请求/响应拦截器，JWT 注入，120s 超时 |
| 后端框架 | Express.js | Node.js Web 框架 |
| 数据库 | better-sqlite3 | 嵌入式 SQLite，WAL 模式 |
| 认证 | JWT + bcryptjs | Token 认证（7 天）+ 密码哈希（10 rounds） |
| 文件上传 | multer | 多类型文件处理，10~50MB 限制 |
| AI 生成 | DeepSeek API | OpenAI 兼容接口，Multi-Agent 编排 |
| 容器化 | Docker Compose | Server + Nginx，一键部署 |

---

## 三、项目结构

```
gamer_beta/
├── docker-compose.yml                 # Docker 编排
├── .gitignore
├── .dockerignore
├── server/                            # 后端服务
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   ├── src/
│   │   ├── app.js                     # Express 入口
│   │   ├── routes/
│   │   │   ├── auth.js                # POST /register, /login, GET /me
│   │   │   ├── games.js               # GET/POST /games, POST /generate, DELETE /:id
│   │   │   ├── upload.js              # POST /upload/cover, /game, /file
│   │   │   └── assets.js              # GET /assets, POST /assets/upload, DELETE /:id
│   │   ├── controllers/
│   │   │   ├── authController.js      # 注册、登录、获取用户
│   │   │   ├── gameController.js      # 游戏 CRUD、列表、详情、AI 生成
│   │   │   └── assetController.js     # 素材管理
│   │   ├── middleware/
│   │   │   └── auth.js                # JWT 认证中间件
│   │   ├── models/
│   │   │   └── db.js                  # SQLite 表结构定义
│   │   └── services/
│   │       ├── openaiClient.js        # OpenAI 兼容客户端
│   │       ├── gameDesigner.js        # Agent 1: 游戏设计
│   │       ├── codeGenerator.js       # Agent 2: 代码生成
│   │       └── orchestrator.js        # 多 Agent 编排器
│   └── uploads/
│       ├── games/                     # 游戏 HTML 文件
│       └── covers/                    # 封面 & 素材图片
├── client/                            # 前端应用
│   ├── Dockerfile
│   ├── nginx.conf                     # Nginx 反向代理配置
│   ├── package.json
│   ├── vite.config.js                 # Vite + API 代理
│   └── src/
│       ├── main.js                    # 应用入口
│       ├── App.vue                    # 根组件（导航栏）
│       ├── router/index.js            # 路由配置
│       ├── api/index.js               # Axios 实例
│       ├── stores/
│       │   ├── auth.js                # 用户认证状态
│       │   └── games.js               # 游戏状态 + CRUD
│       ├── views/
│       │   ├── Home.vue               # 主页 - 游戏画廊
│       │   ├── Login.vue              # 登录
│       │   ├── Register.vue           # 注册
│       │   ├── GameDetail.vue         # 游戏详情
│       │   ├── GamePlay.vue           # 游戏游玩（srcdoc）
│       │   ├── Create.vue             # AI 创建（聊天 + 预览）
│       │   └── Assets.vue             # 素材库
│       └── styles/global.css          # 暗色主题
├── docs/
│   ├── TECH_DOC.md                    # 技术文档（本文档）
│   └── COMPLETION_STATUS.md           # 完成度说明
└── 示例游戏文件/
    ├── snake-quest.html
    ├── brick-smasher.html
    └── memory-match.html
```

---

## 四、数据库设计

### users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| email | TEXT UNIQUE | 邮箱 |
| password_hash | TEXT | bcrypt 哈希密码 |
| nickname | TEXT | 用户昵称 |
| avatar | TEXT | 头像 URL |
| created_at | DATETIME | 注册时间 |

### games 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| title | TEXT | 游戏标题 |
| description | TEXT | 游戏简介 |
| cover_url | TEXT | 封面图片 URL |
| game_url | TEXT | 游戏文件 URL |
| tags | TEXT | 标签（逗号分隔） |
| author_id | INTEGER FK | 作者 ID → users.id |
| play_count | INTEGER | 游玩次数 |
| status | TEXT | published / draft |
| created_at | DATETIME | 发布时间 |
| updated_at | DATETIME | 更新时间 |

### game_meta 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| game_id | INTEGER FK UNIQUE | 关联 games.id |
| meta_json | TEXT | JSON：genre, mechanics, controls, features 等 |

### assets 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | INTEGER FK | 上传者 → users.id |
| filename | TEXT | 原始文件名 |
| url | TEXT | 访问 URL |
| mimetype | TEXT | MIME 类型 |
| size | INTEGER | 文件大小（字节） |
| created_at | DATETIME | 上传时间 |

### favorites 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | INTEGER FK | 用户 → users.id |
| game_id | INTEGER FK | 游戏 → games.id |
| created_at | DATETIME | 收藏时间 |
| UNIQUE(user_id, game_id) | | 同一游戏不重复收藏 |

---

## 五、API 接口文档

### 5.1 通用

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 平台 API 信息（访问前端请用 :5173） |
| GET | /api/health | 健康检查 |

### 5.2 认证

| 方法 | 路径 | 认证 | 请求体 | 说明 |
|------|------|------|--------|------|
| POST | /api/auth/register | 否 | `{email, password, nickname?}` | 注册，返回 Token |
| POST | /api/auth/login | 否 | `{email, password}` | 登录，返回 Token |
| GET | /api/auth/me | Bearer | - | 获取当前用户信息 |

### 5.3 游戏

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | /api/games | 可选 | 列表（支持 `?page=&pageSize=&tag=&search=`） |
| GET | /api/games/:id | 否 | 详情（含 meta，播放量 +1） |
| GET | /api/games/tags | 否 | 获取所有标签（用于筛选） |
| GET | /api/games/stats | 否 | 平台统计（游戏数/总播放/用户数/Top5） |
| POST | /api/games | Bearer | 手动创建 |
| POST | /api/games/generate | Bearer | **AI 生成**（Multi-Agent） |
| DELETE | /api/games/:id | Bearer | 删除（仅作者） |

### 5.4 文件上传

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/upload/cover | Bearer | 上传封面图 |
| POST | /api/upload/game | Bearer | 上传游戏文件 |
| POST | /api/upload/file | Bearer | 通用文件上传 |

| GET | /api/games/tags | 否 | 获取所有标签列表（用于筛选） |

### 5.5 素材库

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | /api/assets | Bearer | 素材列表（分页） |
| POST | /api/assets/upload | Bearer | 上传素材（multipart, field: `file`） |
| DELETE | /api/assets/:id | Bearer | 删除素材 |

### 5.6 收藏夹

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | /api/favorites | Bearer | 收藏列表 |
| POST | /api/favorites/:gameId | Bearer | 切换收藏（add/remove toggle） |
| GET | /api/favorites/check/:gameId | Bearer | 查询是否已收藏 |

### 5.7 GitHub 联通

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | /api/auth/github | 否 | 重定向到 GitHub OAuth 授权页 |
| GET | /api/auth/github/callback | 否 | OAuth 回调，创建/绑定账号，重定向前端 |
| POST | /api/games/:id/push-github | Bearer | 推送游戏 HTML 到 GitHub 仓库（需 GitHub 登录） |

### 5.7 POST /api/games/generate

**请求：**
```json
{ "prompt": "Create a snake game with power-ups" }
```

**响应：**
```json
{
  "game": {
    "id": 1,
    "title": "Snake Boost",
    "description": "Classic snake with power-ups...",
    "genre": "action",
    "tags": ["snake", "power-ups", "arcade"],
    "gameUrl": "/uploads/games/xxx.html",
    "controls": "Arrow Keys / WASD",
    "features": ["Score tracking", "Power-ups"]
  },
  "steps": [
    { "agent": "Game Designer", "status": "done", "message": "... (arcade)" },
    { "agent": "Code Generator", "status": "done", "message": "28481 chars" },
    { "agent": "File Storage", "status": "done", "message": "xxx.html" },
    { "agent": "Database", "status": "done", "message": "Game #1 saved" }
  ]
}
```

---

## 六、Multi-Agent 架构

```
用户输入 Prompt
     │
     ▼
Orchestrator（总协调器）
     │
     ├──► Agent 1: Game Designer
     │    输入：用户 Prompt
     │    输出：JSON { title, genre, mechanics, controls, features... }
     │
     ├──► Agent 2: Code Generator
     │    输入：游戏设计 JSON
     │    输出：完整可运行的单文件 HTML5 游戏代码
     │
     ├──► Agent 3: File Storage
     │    UUID 命名保存到 uploads/games/
     │
     └──► Agent 4: Database
          写入 games + game_meta 表，返回 gameId
```

### LLM 配置

| 配置项 | 环境变量 | 默认值 |
|--------|----------|--------|
| API Key | OPENAI_API_KEY | （必填） |
| Base URL | OPENAI_BASE_URL | https://api.deepseek.com/v1 |
| 模型 | OPENAI_MODEL | deepseek-chat |

支持任何 OpenAI 兼容接口，修改环境变量即可切换。

---

## 七、前端路由

| 路径 | 组件 | 说明 | 登录 |
|------|------|------|------|
| / | Home.vue | 游戏画廊（分页、删除） | 否 |
| /login | Login.vue | 登录 | 否 |
| /register | Register.vue | 注册 | 否 |
| /game/:id | GameDetail.vue | 详情（meta、删除） | 否 |
| /play/:id | GamePlay.vue | 游玩（srcdoc iframe） | 否 |
| /create | Create.vue | AI 创建（聊天框 + 预览） | 是 |
| /assets | Assets.vue | 素材库（上传/管理） | 是 |

### 主要功能

- **主页**：封面、标题、作者、标签、播放量、时间、分页、删除按钮（仅作者可见）
- **游玩**：`srcdoc` 内联渲染游戏 HTML，无跨域限制
- **创建**：6 个快捷提示词、多轮对话、右侧实时预览、Agent 步骤展示、自动填充标题/标签、支持图片上传
- **素材库**：拖拽上传、画廊网格、大图预览、复制 URL、删除
- **安全**：JWT 认证、bcrypt 密码哈希、文件类型校验、删除验证作者身份

### GitHub 联通

| 功能 | 说明 |
|------|------|
| GitHub OAuth 登录 | `/api/auth/github` → GitHub 授权 → 自动创建/绑定账号 |
| 推送游戏到 GitHub | `/api/games/:id/push-github` → 自动创建仓库 → 提交 HTML → 返回 GitHub Pages URL |
| Token 存储 | `github_token` 字段，用于后续 API 操作 |

**配置：**
```env
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=9b67f...
FRONTEND_URL=http://localhost:5173
```

在 [GitHub OAuth Apps](https://github.com/settings/developers) 创建应用，Callback URL 设为 `http://localhost:3000/api/auth/github/callback`。登录后游戏详情页出现 "Push to GitHub" 按钮，一键部署到 GitHub Pages。

- **主页**：封面、标题、作者、标签、播放量、时间、分页、删除按钮（仅作者可见）
- **游玩**：`srcdoc` 内联渲染游戏 HTML，无跨域限制
- **创建**：6 个快捷提示词、多轮对话、右侧实时预览、Agent 步骤展示、自动填充标题/标签
- **素材库**：拖拽上传、画廊网格、大图预览、复制 URL、删除
- **安全**：JWT 认证、bcrypt 密码哈希、文件类型校验、删除验证作者身份

---

## 八、环境变量

参见 `server/.env.example`

| 变量 | 必填 | 说明 |
|------|------|------|
| PORT | 否 | 后端端口，默认 3000 |
| JWT_SECRET | 是 | JWT 签名密钥 |
| DB_PATH | 否 | 数据库路径，默认 ./data/gamer_beta.db |
| UPLOAD_DIR | 否 | 上传目录，默认 ./uploads |
| OPENAI_API_KEY | 是 | LLM API Key |
| OPENAI_BASE_URL | 否 | API 地址，默认 https://api.deepseek.com/v1 |
| OPENAI_MODEL | 否 | 模型名，默认 deepseek-chat |

---

## 九、Docker 部署

```
docker compose up -d

架构：
 ┌──────────────┐      ┌──────────────┐
 │  Nginx (:80) │ ───► │  Node (:3000)│
 │  Vue 前端     │      │  Express API │
 │  + 反向代理   │      │  + SQLite    │
 └──────────────┘      └──────────────┘
         │                      │
         └─── Volume ───────────┘
            data/ + uploads/
```

---

## 十、后续扩展

1. 接入 Vision 模型（GPT-4o/Claude）实现图片→游戏风格生成
2. 生成任务历史 + Agent 执行日志页面
3. 失败重试 + 版本管理 + Remix 派生
4. 社交功能：评论、点赞、关注
5. 游戏引擎模板（Phaser.js / Three.js）
6. 云存储对接（S3 / OSS / MinIO）
7. Redis 缓存 + CDN 加速
8. 管理后台 + 内容审核流
