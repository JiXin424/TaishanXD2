# TaishanXD V2

销售赋能中心 — 全栈数据分析看板。

## 功能概览

- Dify 工作流使用数据展示与分析
- 钉钉/飞书/企业微信多渠道集成
- Langfuse 问题分类评分
- LLM 智能分析报告（六段式）
- 多公司数据隔离（九峰、福多多）
- 超管视角公司/渠道切换

## 技术栈

**前端**：Next.js 16 (App Router) · React 19 · Ant Design 6 · Tailwind CSS 4 · TypeScript 5

**后端**：Go 1.26 · Gin · PostgreSQL 16 · Redis 7

**AI 微服务**：Python FastAPI + DashScope Qwen（规划中）

**基础设施**：Docker Compose · Traefik v3.3

## 快速开始

```bash
# 克隆项目
git clone <repo-url> && cd TaishanXD2

# 配置环境变量
cp .env.example .env.local

# 启动所有服务
docker compose up -d

# 访问
# 前端：http://localhost:3000
# API：http://localhost:4007/api/health
# Swagger：http://localhost:4007/swagger/index.html
```

## 项目结构

```
server/                 # Go 后端（Gin + PostgreSQL + Redis）
  cmd/server/           # 主服务入口
  cmd/bootstrap/        # 引导服务
  internal/handler/     # HTTP 处理器（含 wecom 渠道 API）
  internal/middleware/   # 认证、CORS 中间件
  internal/repository/  # 数据访问层
  internal/config/      # 配置加载
  internal/model/       # 数据模型（Company, WecomUser, WecomStats 等）
web/                    # Next.js 前端
  src/app/login/        # 登录页
  src/app/dashboard/    # Dashboard 嵌套布局
    layout.tsx          # 共享侧边栏 + Header（公司/渠道选择器）
    overview/           # 系统概览
    users/              # 用户明细
    analytics/          # 使用分析
  src/lib/api.ts        # API 客户端 + 类型定义
  src/lib/AppContext.tsx # 全局状态（公司 ID + 渠道选择）
  src/lib/mockData.ts   # 钉钉/飞书 mock 数据
docker/postgres/init/   # 数据库 Schema 和种子数据
  001_schema.sql        # 渠道表（wecom/dingtalk/feishu）+ sales 表
  002_companies.sql     # companies 表 + 种子数据
  003_wecom_company.sql # wecom 表加 company_id
  004_wecom_mock_data.sql # 企业微信 mock 数据
traefik/                # 反向代理配置
```

## 默认账号

首次启动后通过 `docker/postgres/init/` 下的 SQL 文件自动创建数据库 Schema 和种子数据（companies 表、wecom mock 数据）。通过 `cmd/bootstrap/main.go` 引导创建管理员账户。

## 开发

详细开发指南、API 路由、认证流程、数据库设计请参见 [CLAUDE.md](./CLAUDE.md)。

## License

Private
