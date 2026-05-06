# TaishanXD V2 — 销售赋能中心

## 项目简介

全栈数据分析看板，核心功能：展示和分析 Dify 工作流使用数据、钉钉集成、Langfuse 评分、LLM 智能分析报告生成、多租户 RBAC 数据权限隔离。

当前状态：基础认证 + Dashboard 框架已搭建完成，大部分功能待开发。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 (App Router) + React 19 + Ant Design 6 + Tailwind CSS 4 + TypeScript 5 |
| 后端 | Go 1.26 + Gin + PostgreSQL 16 (lib/pq) + Redis 7 (go-redis/v9) |
| AI 服务 | Python FastAPI + DashScope Qwen（计划中，未实现） |
| 网关 | Traefik v3.3 |
| 部署 | Docker Compose 多容器编排 |

## 目录结构与关键代码位置

```
TaishanXD2/
├── server/                          # Go 后端
│   ├── cmd/
│   │   ├── server/main.go           # 主服务入口，初始化 DB/Redis/Gin 路由
│   │   └── bootstrap/main.go        # 引导服务（创建初始管理员等）
│   ├── internal/
│   │   ├── handler/handler.go       # HTTP 路由注册 + 业务处理（登录/登出/健康检查/系统信息）
│   │   ├── middleware/
│   │   │   ├── auth.go              # 认证中间件（Cookie + Bearer Token → Redis Session）
│   │   │   └── cors.go              # CORS 跨域配置
│   │   ├── repository/
│   │   │   ├── db.go                # PostgreSQL 连接池初始化 + 健康检查
│   │   │   └── redis.go             # Redis 客户端初始化 + Session CRUD
│   │   ├── config/config.go         # 环境变量配置加载（DB/Redis/端口/密钥）
│   │   └── model/models.go          # 数据模型（User, LoginRequest, HealthResponse, SystemInfo）
│   ├── docs/                        # Swagger 自动生成文档
│   └── Dockerfile
│
├── web/                             # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx           # 根布局（全局 metadata）
│   │   │   ├── page.tsx             # 首页（重定向到 /login）
│   │   │   ├── login/page.tsx       # 登录页
│   │   │   └── dashboard/page.tsx   # 主面板（系统概览、健康状态、用户信息）
│   │   └── lib/api.ts               # HTTP 客户端封装 + TypeScript 类型定义
│   ├── public/                      # 静态资源
│   └── Dockerfile
│
├── docker/
│   └── postgres/
│       └── init/001_schema.sql      # 数据库 Schema（companies/departments/users/roles/user_roles/company_apps）+ 种子数据
│
├── traefik/                         # Traefik 反向代理配置
├── docker-compose.yml               # 全栈容器编排（postgres + redis + server + web + traefik）
├── .env.example                     # 环境变量模板
├── FULL_FEATURE_SPEC.md             # 完整功能规格文档（目标功能详述）
└── plan.md                          # V2 架构设计文档
```

## 开发指南

### 环境启动

```bash
# 1. 复制环境变量
cp .env.example .env.local

# 2. 启动全栈服务（PostgreSQL + Redis + Go Server + Next.js + Traefik）
docker compose up -d

# 3. 前端单独开发（热更新）
cd web && npm run dev          # http://localhost:3000

# 4. 后端单独开发
cd server && go run cmd/server/main.go  # http://localhost:4007
```

### 端口约定

| 服务 | 端口 |
|------|------|
| Next.js 前端 | 3000 |
| Go API 网关 | 4007 |
| PostgreSQL | 5433 (外部映射) |
| Redis | 6379 |
| Traefik HTTP | 80 |
| Traefik Dashboard | 8081 |

### API 路由

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 否 | PostgreSQL + Redis 健康检查 |
| GET | `/api/system/info` | 否 | 版本、启动时间等系统信息 |
| POST | `/api/auth/login` | 否 | 用户登录，设置 HttpOnly Cookie |
| POST | `/api/auth/logout` | 否 | 退出登录，清除 Session |
| GET | `/api/auth/session` | 是 | 获取当前登录用户信息 |
| GET | `/swagger/*any` | 否 | Swagger API 文档 |

### 认证流程

1. `POST /api/auth/login` → 校验用户名密码（bcrypt）→ 生成随机 Token → Session 写入 Redis（12h TTL）→ 设置 HttpOnly Cookie
2. 认证中间件从 Cookie 或 `Authorization: Bearer` 头读取 Token → Redis 查询 Session → 注入 `session_data` 到 Context

### 数据库设计

核心表：`companies` → `departments` → `users` → `user_roles` → `roles` + `company_apps`

RBAC 权限通过 `roles.data_scope` 字段控制数据隔离级别（1=公司级, 2=部门级, 3=个人级, 4=默认）

### 前端架构

- **路由**：Next.js App Router，`/login` 和 `/dashboard` 两个页面
- **UI 库**：Ant Design 6 + Tailwind CSS 4
- **API 调用**：`src/lib/api.ts` 封装了统一的 `fetch` 客户端，401 自动跳转登录
- **状态管理**：目前使用 React useState，无全局状态库

## 编码规范

- Go 后端遵循标准 Go 项目布局（`cmd/` + `internal/`）
- Go 模块路径：`github.com/taishanxd/v2`
- 前端使用 TypeScript，遵循 Next.js App Router 约定
- API 响应统一 JSON 格式，错误返回 `{ "error": "message" }`

### SQL 文件规范

- 所有涉及数据库变更（建表、加字段、改索引、种子数据等）必须留下独立的 `.sql` 文件，禁止只在代码里写内联 SQL 而不留记录
- SQL 文件统一放在 `docker/postgres/init/` 目录下
- 命名规则：`{序号}_{模块/功能描述}.sql`，序号三位数字递增，用下划线连接单词
  - 示例：`001_schema.sql`、`002_user_avatar.sql`、`003_dingtalk_cache.sql`
- 文件头部注明用途和日期注释
- 每个功能开发完成后，相关 SQL 文件需一并提交

### 文档同步规范

- 每次新增或修改功能后，必须同步更新 `CLAUDE.md` 和 `README.md` 中对应的内容
- 具体包括但不限于：
  - 新增 API 路由 → 更新 CLAUDE.md 的 API 路由表
  - 新增/修改数据库表 → 更新 CLAUDE.md 的数据库设计部分 + 目录结构
  - 新增页面或前端模块 → 更新 CLAUDE.md 的前端架构和目录结构
  - 新增依赖或技术栈变更 → 更新技术栈表格
  - 项目结构变化 → 同步更新 README.md 的项目结构
