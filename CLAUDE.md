# TaishanXD V2 — 销售赋能中心

## 项目简介

全栈数据分析看板，核心功能：展示和分析 Dify 工作流使用数据、钉钉集成、Langfuse 评分、LLM 智能分析报告生成、多租户 RBAC 数据权限隔离。

当前状态：基础认证 + Dashboard 框架 + 多公司固定渠道已搭建完成。每个公司绑定一个渠道（泰山兄弟=企微，九峰=飞书，福多多=钉钉）。企业微信客服聊天记录已打通，MongoDB user 通过 channelBindings 同时存储内部员工 ID 和客服 external_userid。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 (App Router) + React 19 + Ant Design 6 + Tailwind CSS 4 + TypeScript 5 |
| 后端 | Go 1.26 + Gin + PostgreSQL 16 (lib/pq) + Redis 7 (go-redis/v9) |
| 数据库 | MongoDB 7 (mongo-driver/v2) — 用户、组织架构、权限数据 |
| AI 服务 | Python FastAPI + DashScope Qwen — 六段式使用分析报告（Map-Reduce 架构） |
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
│   │   ├── handler/wecom.go         # 企业微信 API（公司列表、用户列表、统计数据）
│   │   ├── handler/mongo_companies.go    # MongoDB 公司 CRUD
│   │   ├── handler/mongo_organizations.go # MongoDB 组织架构 CRUD + 树
│   │   ├── handler/mongo_users.go        # MongoDB 用户 CRUD + 管辖范围查询
│   │   ├── handler/mongo_positions.go    # MongoDB 职位 CRUD
│   │   ├── handler/analytics.go          # 使用分析 API（聚合查询：会话数/Token/对话量/时段分布）
│   │   ├── middleware/
│   │   │   ├── auth.go              # 认证中间件（Cookie + Bearer Token → Redis Session）
│   │   │   └── cors.go              # CORS 跨域配置
│   │   ├── repository/
│   │   │   ├── db.go                # PostgreSQL 连接池初始化 + 健康检查
│   │   │   ├── mongo.go             # MongoDB 连接池初始化 + 集合访问
│   │   │   └── redis.go             # Redis 客户端初始化 + Session CRUD
│   │   ├── config/config.go         # 环境变量配置加载（DB/Redis/端口/密钥）
│   │   └── model/models.go          # 数据模型（User, LoginRequest, HealthResponse, SystemInfo, Company, WecomUser, WecomStats）
│   │   └── model/mongo.go           # MongoDB 文档模型（CompanyDoc, OrgDoc, UserDoc, PositionDoc）
│   ├── docs/                        # Swagger 自动生成文档
│   └── Dockerfile
│
├── web/                             # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx                   # 根布局（全局 metadata）
│   │   │   ├── page.tsx                     # 首页（重定向到 /login）
│   │   │   ├── login/page.tsx               # 登录页（暂无校验，直接跳转）
│   │   │   └── dashboard/
│   │   │       ├── layout.tsx               # Dashboard 共享布局（侧边栏 + Header）
│   │   │       ├── page.tsx                 # 重定向到 /dashboard/overview
│   │   │       ├── overview/page.tsx        # 系统概览（健康检查、系统信息）
│   │   │       ├── users/page.tsx           # 用户明细（表格 + 搜索 + 聊天记录 Drawer）
│   │   │       └── analytics/page.tsx       # 使用分析（统计卡片 + 图表占位）
│   │   ├── lib/api.ts               # HTTP 客户端封装 + TypeScript 类型定义
│   │   ├── lib/AppContext.tsx        # 全局状态 Context（当前公司 ID + 渠道选择）
│   │   └── lib/mockData.ts          # 钉钉/飞书 mock 数据（用户列表 + 统计数据）
│   ├── public/                      # 静态资源
│   └── Dockerfile
│
├── docker/
│   └── postgres/
│       └── init/001_schema.sql      # 数据库 Schema（wecom/dingtalk/feishu 渠道表 + sales 表）
│       └── init/002_companies.sql   # companies 表 + 种子数据（九峰、福多多）
│       └── init/003_wecom_company.sql  # wecom 表加 company_id 字段 + 索引
│       └── init/004_wecom_mock_data.sql  # 企业微信 mock 用户/消息/会话数据
│       └── init/005_llm_analysis_log.sql # LLM 分析报告持久化表
│
├── llm-analysis-service/               # Python FastAPI 大模型分析服务
│   ├── main.py                         # FastAPI 入口（路由、CORS）
│   ├── engine.py                       # LLM 分析引擎（Map-Reduce + DashScope）
│   ├── models.py                       # Pydantic 数据模型（六段式报告）
│   ├── requirements.txt                # Python 依赖
│   ├── Dockerfile                      # Python 容器构建
│   └── .env                            # DashScope + PostgreSQL 配置
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
| MongoDB | 27017 |
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
| GET | `/api/companies` | 否 | 返回公司列表 + 各公司可用渠道 |
| GET | `/api/wecom/users` | 否 | 查询 wecom_users，按 `company_id` 参数过滤 |
| GET | `/api/wecom/stats` | 否 | 汇总统计（用户数、消息数、会话数），按 `company_id` 过滤 |
| GET | `/api/wecom/messages` | 否 | 查询用户聊天记录，参数：`platform_user_id`（必填）、`company_id`（可选）、`start_time`/`end_time`（毫秒时间戳）、`scope`（all/group/private）、`limit` |
| GET | `/api/wecom/kefu-messages` | 否 | 查询客服聊天记录，参数：`external_userid`（必填）、`start_time`/`end_time`（RFC3339）、`limit` |
| GET | `/api/wecom/kefu-customers` | 否 | 客服客户列表（含消息统计） |
| GET | `/swagger/*any` | 否 | Swagger API 文档 |
| GET    | `/api/org/companies`                       | 否 | MongoDB 公司列表 |
| POST   | `/api/org/companies`                       | 否 | 创建公司 |
| GET    | `/api/org/companies/:id`                   | 否 | 获取单个公司 |
| PUT    | `/api/org/companies/:id`                   | 否 | 更新公司 |
| DELETE | `/api/org/companies/:id`                   | 否 | 删除公司 |
| GET    | `/api/org/organizations`                   | 否 | 组织节点列表（?company_id=） |
| POST   | `/api/org/organizations`                   | 否 | 创建组织节点 |
| GET    | `/api/org/organizations/:id`               | 否 | 获取单个组织节点 |
| GET    | `/api/org/organizations/tree/:companyId`   | 否 | 获取组织架构树 |
| PUT    | `/api/org/organizations/:id`               | 否 | 更新组织节点 |
| DELETE | `/api/org/organizations/:id`               | 否 | 删除组织节点 |
| GET    | `/api/org/users`                           | 否 | MongoDB 用户列表（?company_id=） |
| POST   | `/api/org/users`                           | 否 | 创建用户 |
| GET    | `/api/org/users/:id`                       | 否 | 获取单个用户 |
| GET    | `/api/org/users/managed/:id`               | 否 | 获取该用户管辖的所有人员 |
| GET    | `/api/org/users/can-access`                | 否 | 判断能否访问（?manager_id=&target_id=） |
| PUT    | `/api/org/users/:id`                       | 否 | 更新用户 |
| DELETE | `/api/org/users/:id`                       | 否 | 删除用户（同时删除 positions） |
| GET    | `/api/org/positions`                       | 否 | 职位列表（?user_id=&company_id=&org_node_id=） |
| POST   | `/api/org/positions`                       | 否 | 创建职位 |
| GET    | `/api/org/positions/:id`                   | 否 | 获取单个职位 |
| PUT    | `/api/org/positions/:id`                   | 否 | 更新职位 |
| DELETE | `/api/org/positions/:id`                   | 否 | 删除职位 |
| GET    | `/api/analytics/usage`                     | 否 | 使用分析聚合数据（按渠道/时间/聊天类型筛选，返回 4 组图表数据） |
| POST   | `/api/analysis/analyze`                    | 否 | 触发 LLM 分析（Go 代理→查消息→转发 Python 服务→返回六段式报告） |
| GET    | `/api/analysis/history`                    | 否 | 查询分析历史记录（参数：app_id, company_id, limit） |

### 认证流程

1. `POST /api/auth/login` → 校验用户名密码（bcrypt）→ 生成随机 Token → Session 写入 Redis（12h TTL）→ 设置 HttpOnly Cookie
2. 认证中间件从 Cookie 或 `Authorization: Bearer` 头读取 Token → Redis 查询 Session → 注入 `session_data` 到 Context

### 数据库设计

**多公司隔离**：`companies` 表存储公司信息（九峰、福多多），各渠道表通过 `company_id` 字段实现数据隔离。

**渠道表结构**（结构一致，前缀区分渠道）：
- `wecom_users` / `wecom_messages` / `wecom_chats` / `wecom_events` — 企业微信
- `dingtalk_users` / `dingtalk_messages` / `dingtalk_chats` / `dingtalk_events` — 钉钉（暂空）
- `feishu_users` / `feishu_messages` / `feishu_chats` / `feishu_events` — 飞书（暂空）
- `sales_*` — 销售相关表

**当前状态**：仅 wecom 表有 `company_id` 字段和真实数据，dingtalk/feishu 表暂未启用。

**MongoDB 集合**（用户与组织架构，物化路径模式）：
- `companies` — 公司信息（name, code, channel, status），channel 字段固定该公司使用的渠道（wecom/feishu/dingtalk）
- `organizations` — 组织节点树（companyId, parentId, path, level, order），path 字段存储从根到自身的物化路径
- `users` — 平台用户（companyId, name, channelBindings[]），channelBindings 存储多渠道身份：
  - `{platform: "wecom", platformUserId: "GuoTongJia"}` — 企微内部员工 ID
  - `{platform: "wecom_kefu", platformUserId: "wmpQbHEA..."}` — 企微客服外部用户 ID（用于查聊天记录）
- `positions` — 用户职位（userId, orgNodeId, orgNodePath, title, isLeader），orgNodePath 冗余存储以加速管辖范围查询，支持多重身份

MongoDB 用户与 PostgreSQL 渠道用户关系：`users.channelBindings` 中的 `platform + platformUserId` 对应 PostgreSQL 的 `wecom_users.user_id` 等字段。

### 前端架构

- **路由**：Next.js App Router，`/login` 登录页 + `/dashboard` 嵌套布局（共享侧边栏），子路由：`overview`（系统概览）、`users`（用户明细）、`analytics`（使用分析）
- **UI 库**：Ant Design 6 + Tailwind CSS 4，商务风设计（navy/gold 配色、流动渐变背景、玻璃态卡片）
- **API 调用**：`src/lib/api.ts` 封装了统一的 `fetch` 客户端，401 自动跳转登录
- **全局状态**：`AppContext`（`src/lib/AppContext.tsx`）管理当前公司 ID、公司名、渠道选择，Header 中通过 Select 切换，子页面通过 `useApp()` hook 获取
- **Mock 策略**：企业微信 → 真实 API；钉钉/飞书 → `mockData.ts` 前端 mock

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
