# 多公司 + 渠道切换 设计文档

## 背景

平台需要支持多公司（九峰、福多多）数据隔离，以及按渠道（企业微信、钉钉、飞书）查看不同数据源。当前数据库已有 `wecom_*`、`dingtalk_*`、`feishu_*` 三套渠道表，结构一致但数据为空。旧 RBAC 表（companies/users/roles）已被删除。

## 范围

本期只做超管视角：超管可在 Header 切换公司和渠道，看到对应数据。

- 企业微信：对接真实数据库（`wecom_*` 表）
- 钉钉/飞书：前端 mock 占位，后续对接
- 登录暂时跳过校验不变

## 数据库变更

### 1. 新建 companies 表

```sql
-- docker/postgres/init/002_companies.sql
CREATE TABLE IF NOT EXISTS companies (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(50) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO companies (name, code) VALUES
    ('九峰', 'jiufeng'),
    ('福多多', 'fuduo') ON CONFLICT DO NOTHING;
```

### 2. 给 wecom 表加 company_id

```sql
-- docker/postgres/init/003_wecom_company.sql
ALTER TABLE wecom_users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE wecom_messages ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE wecom_chats ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);

CREATE INDEX IF NOT EXISTS idx_wecom_users_company ON wecom_users (company_id);
CREATE INDEX IF NOT EXISTS idx_wecom_messages_company ON wecom_messages (company_id);
```

### 3. Mock 种子数据

插入一些企业微信 mock 用户和消息数据（分属两个公司），方便前端展示。

## 后端 API

### 新增 handler: `server/internal/handler/wecom.go`

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/companies` | 无 | 返回公司列表 + 各公司可用渠道 |
| GET | `/api/wecom/users` | `company_id` (required) | 查询 wecom_users，按 company_id 过滤 |
| GET | `/api/wecom/stats` | `company_id` (required) | 汇总统计：用户数、消息数、活跃数等 |

### 修改 model: `server/internal/model/models.go`

新增结构体：

```go
type Company struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
    Code string `json:"code"`
}

type CompanyChannel struct {
    CompanyID   int      `json:"companyId"`
    CompanyName string   `json:"companyName"`
    Channels    []string `json:"channels"` // ["wecom", "dingtalk", "feishu"]
}

type WecomUser struct {
    ID             int    `json:"id"`
    UserID         string `json:"userId"`
    Name           string `json:"name"`
    Mobile         string `json:"mobile"`
    JobTitle       string `json:"jobTitle"`
    DepartmentPath string `json:"departmentPath"`
    CompanyID      int    `json:"companyId"`
}

type WecomStats struct {
    TotalUsers    int `json:"totalUsers"`
    TotalMessages int `json:"totalMessages"`
    ActiveUsers7d int `json:"activeUsers7d"`
    TotalChats    int `json:"totalChats"`
}
```

### 修改路由: `server/internal/handler/handler.go`

在 `RegisterRoutes` 中注册新的 wecom 路由组。

## 前端架构

### 1. AppContext

新建 `web/src/lib/AppContext.tsx`：

```typescript
interface AppState {
    companyId: number;        // 当前选中公司 ID
    companyName: string;      // 当前选中公司名
    channel: string;          // 当前选中渠道: "wecom" | "dingtalk" | "feishu"
}
```

- Provider 包裹在 dashboard layout 中
- Header 中的 Select 更新 Context
- 子页面通过 `useApp()` hook 获取当前公司和渠道

### 2. Header 改造

Header 右侧新增：

- **公司选择器**：Select，options 从 `/api/companies` 获取
- **渠道选择器**：Select，固定选项：企业微信 / 钉钉 / 飞书

### 3. API 客户端扩展

`web/src/lib/api.ts` 新增类型：

```typescript
interface Company { id: number; name: string; code: string; }
interface WecomUser { id: number; userId: string; name: string; mobile: string; jobTitle: string; departmentPath: string; }
interface WecomStats { totalUsers: number; totalMessages: number; activeUsers7d: number; totalChats: number; }
```

### 4. Mock 数据

`web/src/lib/mockData.ts` 存放钉钉/飞书的 mock 用户和统计数据。当 channel 为 dingtalk 或 feishu 时，前端直接返回 mock 数据而不调 API。

### 5. 页面改造

**用户明细页** (`dashboard/users/page.tsx`)：
- 选企业微信 → 调 `GET /api/wecom/users?company_id=X`
- 选钉钉/飞书 → 读 mock 数据
- 表格列：姓名、手机号、职位、部门路径、所属公司

**使用分析页** (`dashboard/analytics/page.tsx`)：
- 选企业微信 → 调 `GET /api/wecom/stats?company_id=X`
- 选钉钉/飞书 → 读 mock 统计数据
- 统计卡片数据从接口获取

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 新建 | `docker/postgres/init/002_companies.sql` |
| 新建 | `docker/postgres/init/003_wecom_company.sql` |
| 新建 | `docker/postgres/init/004_wecom_mock_data.sql` |
| 新建 | `server/internal/handler/wecom.go` |
| 修改 | `server/internal/handler/handler.go` |
| 修改 | `server/internal/model/models.go` |
| 新建 | `web/src/lib/AppContext.tsx` |
| 新建 | `web/src/lib/mockData.ts` |
| 修改 | `web/src/lib/api.ts` |
| 修改 | `web/src/app/dashboard/layout.tsx` |
| 修改 | `web/src/app/dashboard/users/page.tsx` |
| 修改 | `web/src/app/dashboard/analytics/page.tsx` |
| 修改 | `CLAUDE.md` |
| 修改 | `README.md` |
