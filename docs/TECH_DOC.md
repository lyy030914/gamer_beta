# Gamer Beta - 互动游戏平台技术文档

## 一、项目概述

**Gamer Beta** 是一个基于 Web 的互动游戏创作与分享平台，参考 Astrocade.com 设计理念。用户通过多模态输入（文字描述）描述游戏创意，由后端 **Multi-Agent 架构**调用 DeepSeek API 自动生成完整的 HTML5 互动游戏，并发布到平台上供其他用户游玩。

## 二、技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 3 + Vite | 组合式 API + SFC |
| 状态管理 | Pinia | storeToRefs 保持响应式 |
| 路由 | Vue Router 4 | SPA 路由，路由级懒加载 |
| HTTP 客户端 | Axios | 请求/响应拦截器，JWT 注入，120s 超时 |
| 后端框架 | Express.js | Node.js Web 框架 |
| 数据库 | better-sqlite3 | 嵌入式 SQLite，WAL 模式 |
| 认证 | JWT + bcryptjs | Token 认证（7天）+ 密码哈希（10 rounds） |
| 文件上传 | multer | 多类型文件处理，50MB 限制 |
| AI 生成 | DeepSeek API | OpenAI 兼容接口，Multi-Agent 编排 |

## 三、项目结构

```
F:\gamer_beta\
├── server/                          # 后端服务
│   ├── src/
│   │   ├── app.js                   # Express 入口，启动服务器
│   │   ├── routes/                  # 路由层
│   │   │   ├── auth.js              # POST /register, /login, GET /me
│   │   │   ├── games.js             # GET/POST /games, POST /generate, GET/DELETE /:id
│   │   │   └── upload.js            # POST /upload/cover, /game, /file
│   │   ├── controllers/             # 控制器层
│   │   │   ├── authController.js    # 注册、登录、获取用户信息
│   │   │   └── gameController.js    # 游戏 CRUD、列表、详情、AI 生成
│   │   ├── middleware/
│   │   │   └── auth.js              # JWT 认证中间件（必选 + 可选）
│   │   ├── models/
│   │   │   └── db.js                # SQLite 初始化 & 表结构定义
│   │   └── services/                # Multi-Agent 服务层
│   │       ├── openaiClient.js      # OpenAI 兼容客户端（DeepSeek）
│   │       ├── gameDesigner.js      # Agent 1: 游戏设计师
│   │       ├── codeGenerator.js     # Agent 2: 代码生成器
│   │       └── orchestrator.js      # Agent 编排器（协调上述 Agent）
│   ├── uploads/                     # 本地上传文件存储
│   │   ├── games/                   # 游戏文件（.html）
│   │   └── covers/                  # 封面图片
│   ├── data/                        # SQLite 数据库文件
│   ├── .env                         # 环境变量（不提交到 Git）
│   ├── .env.example                 # 环境变量示例（提交到 Git）
│   └── package.json
├── client/                          # 前端应用
│   ├── src/
│   │   ├── main.js                  # 应用入口
│   │   ├── App.vue                  # 根组件（导航栏 + 路由出口）
│   │   ├── router/index.js          # 路由配置
│   │   ├── stores/                  # Pinia 状态管理
│   │   │   ├── auth.js              # 用户认证状态 + 登录/注册/登出
│   │   │   └── games.js             # 游戏列表状态 + CRUD
│   │   ├── api/index.js             # Axios 实例（拦截器 + JWT 注入）
│   │   ├── views/                   # 页面视图
│   │   │   ├── Home.vue             # 主页 - 游戏画廊（含删除功能）
│   │   │   ├── Login.vue            # 登录页
│   │   │   ├── Register.vue         # 注册页
│   │   │   ├── GameDetail.vue       # 游戏详情页（含删除功能）
│   │   │   ├── GamePlay.vue         # 游戏游玩页（iframe 沙箱加载）
│   │   │   └── Create.vue           # 创建页（多模态聊天 + 实时预览 + 快捷提示词）
│   │   └── styles/global.css        # 全局暗色主题样式
│   ├── vite.config.js               # Vite 配置 + API 代理
│   └── package.json
└── docs/
    └── TECH_DOC.md                  # 本技术文档
```

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
| play_count | INTEGER | 游玩次数（每次查看详情 +1） |
| status | TEXT | 状态（published / draft） |
| created_at | DATETIME | 发布时间 |
| updated_at | DATETIME | 更新时间 |

### game_meta 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| game_id | INTEGER FK UNIQUE | 关联 games.id |
| meta_json | TEXT | JSON 格式的游戏元信息（genre, mechanics, controls, features 等） |

## 五、API 接口文档

### 5.1 根路径

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 平台名称、版本、可用端点列表 |
| GET | /api/health | 健康检查 |

### 5.2 认证接口

| 方法 | 路径 | 认证 | 请求体 | 说明 |
|------|------|------|--------|------|
| POST | /api/auth/register | 否 | `{email, password, nickname?}` | 邮箱注册，返回 Token + 用户信息 |
| POST | /api/auth/login | 否 | `{email, password}` | 邮箱登录，返回 Token + 用户信息 |
| GET | /api/auth/me | Bearer | - | 获取当前登录用户信息 |

### 5.3 游戏接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | /api/games | 可选 | 游戏列表（支持 `?page=&pageSize=&tag=`） |
| GET | /api/games/:id | 否 | 游戏详情（含 meta 信息，播放量 +1） |
| POST | /api/games | Bearer | 手动创建游戏 |
| POST | /api/games/generate | Bearer | **AI 生成游戏**（Multi-Agent 流程） |
| DELETE | /api/games/:id | Bearer | 删除游戏（仅作者可删） |

### 5.4 POST /api/games/generate 请求/响应

**请求：**
```json
{ "prompt": "Create a snake game with power-ups" }
```

**响应：**
```json
{
  "game": {
    "id": 4,
    "title": "Snake Boost",
    "description": "Classic snake with power-ups...",
    "genre": "arcade",
    "tags": ["snake", "power-ups", "arcade"],
    "gameUrl": "/uploads/games/xxx.html",
    "controls": "Arrow Keys / WASD",
    "features": ["Score tracking", "Power-ups", "Speed boost"]
  },
  "steps": [
    { "agent": "Game Designer", "status": "done", "message": "Game designed (arcade)" },
    { "agent": "Code Generator", "status": "done", "message": "Game code generated (28481 chars)" },
    { "agent": "File Storage", "status": "done", "message": "Saved as xxx.html" },
    { "agent": "Database", "status": "done", "message": "Game #4 saved to database" }
  ]
}
```

## 六、Multi-Agent 架构

### 6.1 Agent 流水线

```
用户输入 Prompt
     │
     ▼
┌─────────────────────┐
│  Orchestrator Agent │  总协调器
└──────┬──────────────┘
       │
       ├──► Agent 1: Game Designer
       │    输入：用户 Prompt
       │    输出：JSON 游戏设计稿（title, genre, mechanics, controls, features...）
       │
       ├──► Agent 2: Code Generator
       │    输入：游戏设计稿 JSON
       │    输出：完整可运行的单文件 HTML5 游戏代码
       │
       ├──► Agent 3: File Storage
       │    将生成的 HTML 保存到 uploads/games/
       │
       └──► Agent 4: Database
            将游戏信息和 meta 存入 SQLite
```

### 6.2 LLM 配置

| 配置项 | 环境变量 | 默认值 |
|--------|----------|--------|
| API Key | OPENAI_API_KEY | - |
| Base URL | OPENAI_BASE_URL | https://api.deepseek.com/v1 |
| 模型 | OPENAI_MODEL | deepseek-chat |

支持任何 OpenAI 兼容接口（DeepSeek, OpenAI, Azure, 各类代理等），只需修改环境变量。

## 七、前端路由与组件

| 路径 | 组件 | 说明 | 登录要求 |
|------|------|------|----------|
| / | Home.vue | 主页 - 游戏画廊（分页、删除） | 否 |
| /login | Login.vue | 登录页 | 否 |
| /register | Register.vue | 注册页 | 否 |
| /game/:id | GameDetail.vue | 游戏详情（含 meta、删除） | 否 |
| /play/:id | GamePlay.vue | 游玩页（iframe 沙箱） | 否 |
| /create | Create.vue | 创建页（AI 对话生成） | 是 |

### 7.1 创建页面功能

- 6 个快捷提示词（Snake / Shooter / Memory / Platformer / Brick Breaker / Aim Trainer）
- 多轮对话聊天框
- 右侧实时游戏预览（iframe）
- 生成后自动填充标题、描述、标签
- Agent 执行步骤实时展示
- 一键发布

### 7.2 删除功能

- **主页**：游戏卡片右上角显示 🗑 按钮（仅作者可见），点击弹出确认对话框
- **详情页**：Play Now 旁边显示红色 "Delete Game" 按钮（仅作者可见），点击弹出确认对话框
- 删除后自动刷新列表，主页即时移除卡片

## 八、运行方式

### 8.1 环境准备
```bash
# 复制环境变量文件
cp server/.env.example server/.env

# 编辑 server/.env，填入你的 API Key
# OPENAI_API_KEY=sk-your-key-here
```

### 8.2 安装依赖
```bash
cd server && npm install
cd ../client && npm install
```

### 8.3 启动
```bash
# 终端 1 - 后端
cd server && npm run dev
# → http://localhost:3000

# 终端 2 - 前端
cd client && npm run dev
# → http://localhost:5173
```

## 九、环境变量说明

参见 `server/.env.example`

| 变量 | 必填 | 说明 |
|------|------|------|
| PORT | 否 | 后端端口，默认 3000 |
| JWT_SECRET | 是 | JWT 签名密钥，生产环境请更换 |
| DB_PATH | 否 | SQLite 数据库路径，默认 ./data/gamer_beta.db |
| UPLOAD_DIR | 否 | 文件上传目录，默认 ./uploads |
| OPENAI_API_KEY | 是 | LLM API 密钥（DeepSeek / OpenAI 等） |
| OPENAI_BASE_URL | 否 | API 地址，默认 https://api.deepseek.com/v1 |
| OPENAI_MODEL | 否 | 模型名称，默认 deepseek-chat |

## 十、安全措施

- 密码使用 bcrypt (salt rounds=10) 哈希存储
- JWT Token 认证，请求头 `Authorization: Bearer <token>` 方式传递
- 文件上传类型 + 大小限制（50MB）
- iframe 游戏使用 sandbox 属性限制权限
- CORS 配置
- SQLite WAL 模式 + 外键约束
- 删除游戏验证作者身份
- .env 不提交到 Git（仅 .env.example 作为模板）

## 十一、后续扩展方向

1. **对象存储对接**：将本地 `uploads/` 替换为 AWS S3 / 阿里云 OSS / MinIO
2. **社交媒体功能**：评论、点赞、收藏、关注
3. **游戏引擎集成**：Phaser.js、Three.js 等
4. **性能优化**：Redis 缓存热点数据、CDN 加速游戏文件
5. **Docker 部署**：容器化 + Nginx 反向代理
6. **更多 LLM 支持**：Claude、Gemini、Qwen 等
