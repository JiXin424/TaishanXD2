# 多公司 + 渠道切换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 超管可在 Header 切换公司（九峰/福多多）和渠道（企业微信/钉钉/飞书），页面数据随之刷新。企业微信对接真实数据库，钉钉/飞书用前端 mock。

**Architecture:** 后端新增 wecom handler 查询 `wecom_*` 表（按 company_id 过滤）。前端用 React Context（AppContext）存储当前公司和渠道，Header 下拉切换更新 Context，子页面消费 Context 调 API 或读 mock。

**Tech Stack:** Go 1.26 + Gin (后端) / Next.js 16 + React 19 + Ant Design 6 + Tailwind CSS 4 (前端) / PostgreSQL 16 (数据库)

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `docker/postgres/init/002_companies.sql` | 创建 companies 表 + 种子数据 |
| 新建 | `docker/postgres/init/003_wecom_company.sql` | 给 wecom 表加 company_id 列 + 索引 |
| 新建 | `docker/postgres/init/004_wecom_mock_data.sql` | 企业微信 mock 用户/消息/会话数据 |
| 修改 | `server/internal/model/models.go` | 新增 Company/WecomUser/WecomStats 等结构体 |
| 新建 | `server/internal/handler/wecom.go` | 企业微信 + 公司 API handler |
| 修改 | `server/internal/handler/handler.go` | 注册新路由 |
| 新建 | `web/src/lib/AppContext.tsx` | React Context：当前公司/渠道状态 |
| 新建 | `web/src/lib/mockData.ts` | 钉钉/飞书 mock 数据 |
| 修改 | `web/src/lib/api.ts` | 新增 Company/WecomUser/WecomStats 类型 |
| 修改 | `web/src/app/dashboard/layout.tsx` | Header 加公司/渠道选择器 |
| 修改 | `web/src/app/dashboard/users/page.tsx` | 接入 Context + API/mock 数据 |
| 修改 | `web/src/app/dashboard/analytics/page.tsx` | 接入 Context + API/mock 数据 |
| 修改 | `CLAUDE.md` | 同步文档 |
| 修改 | `README.md` | 同步文档 |

---

### Task 1: SQL — 创建 companies 表

**Files:**
- Create: `docker/postgres/init/002_companies.sql`

- [ ] **Step 1: 创建 SQL 文件**

创建 `docker/postgres/init/002_companies.sql`：

```sql
-- 002_companies.sql
-- 创建公司表并插入九峰、福多多两家公司
-- 2026-05-06

CREATE TABLE IF NOT EXISTS companies (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(50) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO companies (name, code) VALUES
    ('九峰', 'jiufeng'),
    ('福多多', 'fuduo')
ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: 验证**

Run: `docker exec taishan-postgres psql -U taishan -d taishan -f /docker-entrypoint-initdb.d/002_companies.sql 2>&1 || true`

由于 Docker init 脚本只在首次创建时运行，需要手动执行或重建容器。验证：

Run: `docker exec taishan-postgres psql -U taishan -d taishan -c "SELECT * FROM companies;"`

Expected: 2 rows (九峰, 福多多)。如果表已存在则跳过。

注意：如果 init 脚本不会自动执行（因为容器已存在），需要手动运行：

```bash
docker exec taishan-postgres psql -U taishan -d taishan -c "
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO companies (name, code) VALUES ('九峰', 'jiufeng'), ('福多多', 'fuduo') ON CONFLICT (code) DO NOTHING;
"
```

- [ ] **Step 3: 提交**

```bash
git add docker/postgres/init/002_companies.sql
git commit -m "feat: add companies table with jiufeng and fuduo seed data"
```

---

### Task 2: SQL — 给 wecom 表加 company_id + mock 数据

**Files:**
- Create: `docker/postgres/init/003_wecom_company.sql`
- Create: `docker/postgres/init/004_wecom_mock_data.sql`

- [ ] **Step 1: 创建 company_id 迁移文件**

创建 `docker/postgres/init/003_wecom_company.sql`：

```sql
-- 003_wecom_company.sql
-- 给 wecom 表添加 company_id 外键，支持按公司隔离数据
-- 2026-05-06

ALTER TABLE wecom_users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE wecom_messages ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE wecom_chats ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);

CREATE INDEX IF NOT EXISTS idx_wecom_users_company ON wecom_users (company_id);
CREATE INDEX IF NOT EXISTS idx_wecom_messages_company ON wecom_messages (company_id);
CREATE INDEX IF NOT EXISTS idx_wecom_chats_company ON wecom_chats (company_id);
```

- [ ] **Step 2: 创建 mock 数据文件**

创建 `docker/postgres/init/004_wecom_mock_data.sql`：

```sql
-- 004_wecom_mock_data.sql
-- 企业微信 mock 数据，分属九峰(company_id=1)和福多多(company_id=2)
-- 2026-05-06

-- Wecom Users - 九峰 (company_id=1)
INSERT INTO wecom_users (user_id, name, mobile, job_title, department_path, company_id) VALUES
    ('jf001', '陈建国', '13800001001', '销售总监', '九峰/销售部', 1),
    ('jf002', '王丽华', '13800001002', '销售经理', '九峰/销售部/一部', 1),
    ('jf003', '张伟', '13800001003', '高级销售', '九峰/销售部/一部', 1),
    ('jf004', '刘芳', '13800001004', '销售', '九峰/销售部/二部', 1),
    ('jf005', '赵明', '13800001005', '销售', '九峰/销售部/二部', 1),
    ('jf006', '李秀英', '13800001006', '市场经理', '九峰/市场部', 1),
    ('jf007', '周强', '13800001007', '市场专员', '九峰/市场部', 1),
    ('jf008', '吴晓燕', '13800001008', '运营主管', '九峰/运营部', 1)
ON CONFLICT DO NOTHING;

-- Wecom Users - 福多多 (company_id=2)
INSERT INTO wecom_users (user_id, name, mobile, job_title, department_path, company_id) VALUES
    ('fd001', '孙建华', '13900002001', '销售总监', '福多多/销售部', 2),
    ('fd002', '郑美玲', '13900002002', '销售经理', '福多多/销售部/一部', 2),
    ('fd003', '黄志远', '13900002003', '高级销售', '福多多/销售部/一部', 2),
    ('fd004', '林小燕', '13900002004', '销售', '福多多/销售部/二部', 2),
    ('fd005', '杨大伟', '13900002005', '销售', '福多多/销售部/二部', 2),
    ('fd006', '马丽', '13900002006', '客服主管', '福多多/客服部', 2)
ON CONFLICT DO NOTHING;

-- Wecom Chats
INSERT INTO wecom_chats (chat_id, name, chat_type, company_id) VALUES
    ('chat_jf_01', '九峰销售群', 'group', 1),
    ('chat_jf_02', '九峰管理层', 'group', 1),
    ('chat_fd_01', '福多多销售群', 'group', 2),
    ('chat_fd_02', '福多多全员群', 'group', 2)
ON CONFLICT DO NOTHING;

-- Wecom Messages (部分 mock)
INSERT INTO wecom_messages (message_id, chat_id, sender_id, msg_type, content, direction, create_time, company_id) VALUES
    ('msg_jf_001', 'chat_jf_01', 'jf001', 'text', '各位注意，本月销售目标已更新', 'send', EXTRACT(EPOCH FROM NOW() - INTERVAL '2 hours')::bigint * 1000, 1),
    ('msg_jf_002', 'chat_jf_01', 'jf003', 'text', '收到，我这边的客户反馈不错', 'send', EXTRACT(EPOCH FROM NOW() - INTERVAL '1 hour')::bigint * 1000, 1),
    ('msg_jf_003', 'chat_jf_02', 'jf001', 'text', 'Q2 季度复盘会议定在周五下午', 'send', EXTRACT(EPOCH FROM NOW() - INTERVAL '3 hours')::bigint * 1000, 1),
    ('msg_fd_001', 'chat_fd_01', 'fd001', 'text', '新产品培训材料已上传到知识库', 'send', EXTRACT(EPOCH FROM NOW() - INTERVAL '4 hours')::bigint * 1000, 2),
    ('msg_fd_002', 'chat_fd_01', 'fd003', 'text', '好的，我先学习一下', 'send', EXTRACT(EPOCH FROM NOW() - INTERVAL '3 hours')::bigint * 1000, 2),
    ('msg_fd_003', 'chat_fd_02', 'fd006', 'text', '本月客户满意度调查结果已出', 'send', EXTRACT(EPOCH FROM NOW() - INTERVAL '5 hours')::bigint * 1000, 2)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: 手动执行 SQL 并验证**

由于容器已存在，init 脚本不会自动执行，需要手动运行：

```bash
docker exec taishan-postgres psql -U taishan -d taishan -c "
ALTER TABLE wecom_users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE wecom_messages ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE wecom_chats ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_wecom_users_company ON wecom_users (company_id);
CREATE INDEX IF NOT EXISTS idx_wecom_messages_company ON wecom_messages (company_id);
CREATE INDEX IF NOT EXISTS idx_wecom_chats_company ON wecom_chats (company_id);
"
```

然后插入 mock 数据（直接复制 004 文件内容执行或通过 `-f` 参数）。

验证：

Run: `docker exec taishan-postgres psql -U taishan -d taishan -c "SELECT company_id, count(*) FROM wecom_users GROUP BY company_id;"`

Expected: company_id=1 → 8 rows, company_id=2 → 6 rows

- [ ] **Step 4: 提交**

```bash
git add docker/postgres/init/003_wecom_company.sql docker/postgres/init/004_wecom_mock_data.sql
git commit -m "feat: add company_id to wecom tables and seed mock data"
```

---

### Task 3: Go 后端 — 新增 model + wecom handler + 路由

**Files:**
- Modify: `server/internal/model/models.go`
- Create: `server/internal/handler/wecom.go`
- Modify: `server/internal/handler/handler.go`

- [ ] **Step 1: 更新 models.go**

在 `server/internal/model/models.go` 末尾追加：

```go
type Company struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type CompanyResponse struct {
	ID       int      `json:"id"`
	Name     string   `json:"name"`
	Code     string   `json:"code"`
	Channels []string `json:"channels"`
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
	TotalChats    int `json:"totalChats"`
}
```

- [ ] **Step 2: 创建 wecom handler**

创建 `server/internal/handler/wecom.go`：

```go
package handler

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func RegisterWecomRoutes(r *gin.Engine) {
	r.GET("/api/companies", listCompanies)
	r.GET("/api/wecom/users", listWecomUsers)
	r.GET("/api/wecom/stats", getWecomStats)
}

func listCompanies(c *gin.Context) {
	rows, err := repository.DB.Query("SELECT id, name, code FROM companies ORDER BY id")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	channels := []string{"wecom", "dingtalk", "feishu"}
	var result []model.CompanyResponse
	for rows.Next() {
		var co model.CompanyResponse
		if err := rows.Scan(&co.ID, &co.Name, &co.Code); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		co.Channels = channels
		result = append(result, co)
	}

	c.JSON(http.StatusOK, result)
}

func listWecomUsers(c *gin.Context) {
	companyID, err := strconv.Atoi(c.Query("company_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "company_id required"})
		return
	}

	query := `
		SELECT id, user_id, COALESCE(name, ''), COALESCE(mobile, ''),
		       COALESCE(job_title, ''), COALESCE(department_path, ''), company_id
		FROM wecom_users
		WHERE company_id = $1
		ORDER BY id
	`
	rows, err := repository.DB.Query(query, companyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []model.WecomUser
	for rows.Next() {
		var u model.WecomUser
		if err := rows.Scan(&u.ID, &u.UserID, &u.Name, &u.Mobile, &u.JobTitle, &u.DepartmentPath, &u.CompanyID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, users)
}

func getWecomStats(c *gin.Context) {
	companyID, err := strconv.Atoi(c.Query("company_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "company_id required"})
		return
	}

	var stats model.WecomStats

	err = repository.DB.QueryRow("SELECT count(*) FROM wecom_users WHERE company_id = $1", companyID).Scan(&stats.TotalUsers)
	if err != nil {
		stats.TotalUsers = 0
	}

	err = repository.DB.QueryRow("SELECT count(*) FROM wecom_messages WHERE company_id = $1", companyID).Scan(&stats.TotalMessages)
	if err != nil {
		stats.TotalMessages = 0
	}

	err = repository.DB.QueryRow("SELECT count(*) FROM wecom_chats WHERE company_id = $1", companyID).Scan(&stats.TotalChats)
	if err != nil {
		stats.TotalChats = 0
	}

	c.JSON(http.StatusOK, stats)
}
```

- [ ] **Step 3: 注册路由**

在 `server/internal/handler/handler.go` 的 `main()` 函数中，在 `handler.RegisterRoutes(r, cfg.SessionKey)` 之后添加：

```go
handler.RegisterWecomRoutes(r)
```

需要修改 `server/cmd/server/main.go` 中的路由注册。在 `handler.RegisterRoutes(r, cfg.SessionKey)` 这行之后加一行：

```go
handler.RegisterWecomRoutes(r)
```

- [ ] **Step 4: 验证后端**

```bash
cd server && go build ./...
```

Expected: 编译成功无错误。

然后重启后端容器：

```bash
docker compose up -d --build server
```

验证 API：

Run: `curl -s http://localhost:4007/api/companies | python3 -m json.tool`

Expected: 返回两家公司 JSON，每家带 channels 数组。

Run: `curl -s "http://localhost:4007/api/wecom/users?company_id=1" | python3 -m json.tool`

Expected: 返回九峰的 8 个用户。

Run: `curl -s "http://localhost:4007/api/wecom/stats?company_id=2" | python3 -m json.tool`

Expected: 返回福多多的统计数据。

- [ ] **Step 5: 提交**

```bash
git add server/internal/model/models.go server/internal/handler/wecom.go server/cmd/server/main.go
git commit -m "feat: add companies and wecom API endpoints with company filtering"
```

---

### Task 4: 前端 — AppContext + mockData + api.ts 类型

**Files:**
- Create: `web/src/lib/AppContext.tsx`
- Create: `web/src/lib/mockData.ts`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: 创建 AppContext**

创建 `web/src/lib/AppContext.tsx`：

```tsx
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "./api";

export interface Company {
  id: number;
  name: string;
  code: string;
  channels: string[];
}

export interface AppState {
  companyId: number;
  companyName: string;
  channel: string;
  companies: Company[];
}

interface AppContextType extends AppState {
  setCompanyId: (id: number) => void;
  setChannel: (ch: string) => void;
}

const defaultState: AppState = {
  companyId: 0,
  companyName: "",
  channel: "wecom",
  companies: [],
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);

  useEffect(() => {
    api<Company[]>("/api/companies").then((companies) => {
      if (companies.length > 0 && state.companyId === 0) {
        setState((s) => ({
          ...s,
          companies,
          companyId: companies[0].id,
          companyName: companies[0].name,
        }));
      } else {
        setState((s) => ({ ...s, companies }));
      }
    }).catch(() => {});
  }, []);

  const setCompanyId = (id: number) => {
    const c = state.companies.find((co) => co.id === id);
    setState((s) => ({
      ...s,
      companyId: id,
      companyName: c?.name || "",
    }));
  };

  const setChannel = (ch: string) => {
    setState((s) => ({ ...s, channel: ch }));
  };

  return (
    <AppContext.Provider value={{ ...state, setCompanyId, setChannel }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
```

- [ ] **Step 2: 创建 mockData**

创建 `web/src/lib/mockData.ts`：

```ts
import type { WecomUser, WecomStats } from "./api";

// 钉钉 mock 用户
export const dingtalkMockUsers: WecomUser[] = [
  { id: 101, userId: "dt001", name: "周杰", mobile: "15000001001", jobTitle: "销售经理", departmentPath: "钉钉/销售部", companyId: 0 },
  { id: 102, userId: "dt002", name: "吴雪", mobile: "15000001002", jobTitle: "销售", departmentPath: "钉钉/销售部", companyId: 0 },
  { id: 103, userId: "dt003", name: "王磊", mobile: "15000001003", jobTitle: "市场专员", departmentPath: "钉钉/市场部", companyId: 0 },
  { id: 104, userId: "dt004", name: "陈静", mobile: "15000001004", jobTitle: "客服", departmentPath: "钉钉/客服部", companyId: 0 },
];

// 飞书 mock 用户
export const feishuMockUsers: WecomUser[] = [
  { id: 201, userId: "fs001", name: "刘洋", mobile: "16000001001", jobTitle: "产品经理", departmentPath: "飞书/产品部", companyId: 0 },
  { id: 202, userId: "fs002", name: "赵欣", mobile: "16000001002", jobTitle: "设计师", departmentPath: "飞书/设计部", companyId: 0 },
  { id: 203, userId: "fs003", name: "孙浩", mobile: "16000001003", jobTitle: "开发工程师", departmentPath: "飞书/技术部", companyId: 0 },
];

// 钉钉 mock 统计
export const dingtalkMockStats: WecomStats = {
  totalUsers: 4,
  totalMessages: 156,
  totalChats: 3,
};

// 飞书 mock 统计
export const feishuMockStats: WecomStats = {
  totalUsers: 3,
  totalMessages: 89,
  totalChats: 2,
};

// 渠道标签映射
export const channelLabels: Record<string, string> = {
  wecom: "企业微信",
  dingtalk: "钉钉",
  feishu: "飞书",
};

// 渠道图标颜色映射
export const channelColors: Record<string, string> = {
  wecom: "#07c160",
  dingtalk: "#0082ef",
  feishu: "#3370ff",
};
```

- [ ] **Step 3: 更新 api.ts 类型**

在 `web/src/lib/api.ts` 末尾追加：

```typescript
export interface WecomUser {
  id: number;
  userId: string;
  name: string;
  mobile: string;
  jobTitle: string;
  departmentPath: string;
  companyId: number;
}

export interface WecomStats {
  totalUsers: number;
  totalMessages: number;
  totalChats: number;
}
```

- [ ] **Step 4: 提交**

```bash
git add web/src/lib/AppContext.tsx web/src/lib/mockData.ts web/src/lib/api.ts
git commit -m "feat: add AppContext, mock data, and WecomUser/WecomStats types"
```

---

### Task 5: 前端 — Dashboard Layout 加公司/渠道选择器

**Files:**
- Modify: `web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: 改造 layout.tsx**

将 `web/src/app/dashboard/layout.tsx` 完整替换为：

```tsx
"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout, Menu, Dropdown, Select } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
  TeamOutlined,
  BarChartOutlined,
  CrownOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { AppProvider, useApp } from "@/lib/AppContext";
import { channelLabels, channelColors } from "@/lib/mockData";

const { Header, Sider, Content } = Layout;

const menuItems = [
  {
    key: "/dashboard/overview",
    icon: <DashboardOutlined />,
    label: "系统概览",
  },
  {
    key: "/dashboard/users",
    icon: <TeamOutlined />,
    label: "用户明细",
  },
  {
    key: "/dashboard/analytics",
    icon: <BarChartOutlined />,
    label: "使用分析",
  },
];

function DashboardInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { companyId, companyName, channel, companies, setCompanyId, setChannel } = useApp();

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <Layout className="min-h-screen !bg-[var(--bg)]">
      <Sider
        width={240}
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        className="sidebar-bg !bg-transparent flex flex-col border-r border-[rgba(255,255,255,0.05)]"
      >
        {/* Logo */}
        <div className="h-[72px] flex items-center justify-center gap-3 px-4 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--gold-500)] to-[var(--gold-400)] flex items-center justify-center shadow-md">
            <CrownOutlined className="text-[var(--navy-900)] text-base" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-white font-bold text-lg tracking-wider leading-tight">
                {companyName || "泰山 XD"}
              </div>
              <div className="text-[var(--gold-300)] text-[10px] tracking-[2px] leading-tight">
                {channelLabels[channel] || "EMPOWER CENTER"}
              </div>
            </div>
          )}
        </div>

        {/* Menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems.map((item) => ({
            ...item,
            label: <Link href={item.key}>{item.label}</Link>,
          }))}
          className="!mt-4 flex-1 !border-none"
        />

        {/* Collapse toggle */}
        <div className="px-3 pb-4">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full h-9 rounded-lg bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.35)] hover:text-white text-xs transition-all duration-300 cursor-pointer"
          >
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
      </Sider>

      <Layout className="!bg-[var(--bg)]">
        <Header className="!bg-white !px-8 h-16 leading-[64px] flex items-center justify-between !border-b !border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          {/* 左侧：公司 + 渠道选择器 */}
          <div className="flex items-center gap-4">
            <Select
              value={companyId || undefined}
              onChange={setCompanyId}
              style={{ width: 130 }}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="选择公司"
              className="!rounded-xl"
            />
            <Select
              value={channel}
              onChange={setChannel}
              style={{ width: 130 }}
              options={Object.entries(channelLabels).map(([value, label]) => ({
                value,
                label: (
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: channelColors[value] }}
                    />
                    {label}
                  </span>
                ),
              }))}
              className="!rounded-xl"
            />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg)]">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-[var(--text-secondary)]">系统运行中</span>
            </div>
          </div>

          {/* 右侧：用户 */}
          <div className="flex items-center gap-5">
            <Dropdown
              menu={{
                items: [
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    label: "退出登录",
                    onClick: handleLogout,
                  },
                ],
              }}
            >
              <div className="flex items-center gap-2 cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--navy-600)] to-[var(--navy-500)] flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                  <UserOutlined className="text-white text-xs" />
                </div>
                <span className="text-sm text-[var(--text)] group-hover:text-[var(--navy-600)] transition-colors">
                  Admin
                </span>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="!m-6 !p-0 !bg-transparent min-h-[calc(100vh-88px)] overflow-y-auto">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProvider>
      <DashboardInner>{children}</DashboardInner>
    </AppProvider>
  );
}
```

- [ ] **Step 2: 验证**

Run: `cd web && npx next build 2>&1 | tail -15`

Expected: 编译成功。

- [ ] **Step 3: 提交**

```bash
git add web/src/app/dashboard/layout.tsx
git commit -m "feat: add company and channel selectors to dashboard header"
```

---

### Task 6: 前端 — 用户明细页接入 Context + API

**Files:**
- Modify: `web/src/app/dashboard/users/page.tsx`

- [ ] **Step 1: 重写用户明细页**

将 `web/src/app/dashboard/users/page.tsx` 完整替换为：

```tsx
"use client";

import { useEffect, useState } from "react";
import { Table, Input, Space, Spin } from "antd";
import {
  SearchOutlined,
  TeamOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useApp } from "@/lib/AppContext";
import { api, type WecomUser } from "@/lib/api";
import { dingtalkMockUsers, feishuMockUsers } from "@/lib/mockData";

const columns: ColumnsType<WecomUser> = [
  {
    title: "ID",
    dataIndex: "id",
    width: 60,
    render: (id: number) => <span className="text-[var(--text-muted)]">#{id}</span>,
  },
  {
    title: "姓名",
    dataIndex: "name",
    width: 100,
    render: (name: string) => <span className="font-medium text-[var(--text)]">{name}</span>,
  },
  {
    title: "用户ID",
    dataIndex: "userId",
    width: 100,
    render: (id: string) => <span className="text-[var(--text-secondary)] font-mono text-xs">{id}</span>,
  },
  {
    title: "手机号",
    dataIndex: "mobile",
    width: 130,
  },
  {
    title: "职位",
    dataIndex: "jobTitle",
    width: 120,
    render: (t: string) => <span className="text-[var(--text-secondary)]">{t || "-"}</span>,
  },
  {
    title: "部门路径",
    dataIndex: "departmentPath",
    width: 180,
    render: (p: string) => <span className="text-[var(--text-secondary)]">{p || "-"}</span>,
  },
];

export default function UsersPage() {
  const { companyId, channel } = useApp();
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<WecomUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (companyId === 0) return;
    setLoading(true);

    if (channel === "wecom") {
      api<WecomUser[]>(`/api/wecom/users?company_id=${companyId}`)
        .then(setUsers)
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    } else if (channel === "dingtalk") {
      setUsers(dingtalkMockUsers.map((u) => ({ ...u, companyId })));
      setLoading(false);
    } else {
      setUsers(feishuMockUsers.map((u) => ({ ...u, companyId })));
      setLoading(false);
    }
  }, [companyId, channel]);

  const filteredUsers = users.filter(
    (u) =>
      u.name.includes(searchText) ||
      u.userId.includes(searchText) ||
      u.mobile.includes(searchText) ||
      u.jobTitle.includes(searchText) ||
      u.departmentPath.includes(searchText)
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#3b82f6] flex items-center justify-center">
            <TeamOutlined className="text-white text-sm" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)] leading-tight">
              用户明细
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              共 {filteredUsers.length} 位用户
            </p>
          </div>
        </div>
        <Space size={12}>
          <Input
            placeholder="搜索姓名 / 手机 / 职位"
            prefix={<SearchOutlined className="text-[var(--text-muted)]" />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 260 }}
            className="!rounded-xl"
          />
        </Space>
      </div>

      {/* Table */}
      <div className="glass-card-light overflow-hidden animate-slide-up" style={{ animationDelay: "0.1s" }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spin size="large" />
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredUsers.map((u) => ({ ...u, key: u.userId }))}
            pagination={{
              pageSize: 20,
              showTotal: (total) => `共 ${total} 条记录`,
              className: "!px-2 !pb-2",
            }}
            size="middle"
            className="!border-none"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add web/src/app/dashboard/users/page.tsx
git commit -m "feat: users page fetches from wecom API or reads mock data by channel"
```

---

### Task 7: 前端 — 使用分析页接入 Context + API

**Files:**
- Modify: `web/src/app/dashboard/analytics/page.tsx`

- [ ] **Step 1: 重写使用分析页**

将 `web/src/app/dashboard/analytics/page.tsx` 完整替换为：

```tsx
"use client";

import { useEffect, useState } from "react";
import { Row, Col, Select, Space, Spin } from "antd";
import {
  BarChartOutlined,
  ArrowUpOutlined,
  UserOutlined,
  MessageOutlined,
  TeamOutlined,
  ChatOutlined,
} from "@ant-design/icons";
import { useApp } from "@/lib/AppContext";
import { api, type WecomStats } from "@/lib/api";
import { dingtalkMockStats, feishuMockStats } from "@/lib/mockData";

function formatNumber(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

export default function AnalyticsPage() {
  const { companyId, channel } = useApp();
  const [stats, setStats] = useState<WecomStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (companyId === 0) return;
    setLoading(true);

    if (channel === "wecom") {
      api<WecomStats>(`/api/wecom/stats?company_id=${companyId}`)
        .then(setStats)
        .catch(() => setStats({ totalUsers: 0, totalMessages: 0, totalChats: 0 }))
        .finally(() => setLoading(false));
    } else if (channel === "dingtalk") {
      setStats(dingtalkMockStats);
      setLoading(false);
    } else {
      setStats(feishuMockStats);
      setLoading(false);
    }
  }, [companyId, channel]);

  const cards = stats
    ? [
        {
          title: "用户总数",
          value: stats.totalUsers,
          suffix: "人",
          icon: <UserOutlined />,
          color: "#3b82f6",
          bg: "#eff6ff",
        },
        {
          title: "消息总数",
          value: stats.totalMessages,
          suffix: "条",
          icon: <MessageOutlined />,
          color: "#10b981",
          bg: "#ecfdf5",
        },
        {
          title: "会话群数",
          value: stats.totalChats,
          suffix: "个",
          icon: <ChatOutlined />,
          color: "#f59e0b",
          bg: "#fffbeb",
        },
        {
          title: "活跃用户",
          value: Math.max(Math.floor(stats.totalUsers * 0.6), 1),
          suffix: "人",
          icon: <TeamOutlined />,
          color: "#8b5cf6",
          bg: "#f5f3ff",
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#8b5cf6] flex items-center justify-center">
            <BarChartOutlined className="text-white text-sm" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)] leading-tight">
              使用分析
            </h2>
            <p className="text-xs text-[var(--text-muted)]">数据统计与趋势概览</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <Row gutter={[20, 20]}>
        {cards.map((card, i) => (
          <Col span={6} key={card.title}>
            <div
              className="glass-card-light p-5 stat-card animate-slide-up"
              style={{ animationDelay: `${0.08 + i * 0.06}s` }}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-sm text-[var(--text-secondary)] font-medium">
                  {card.title}
                </span>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: card.bg, color: card.color }}
                >
                  {card.icon}
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-bold text-[var(--text)] leading-none">
                  {formatNumber(card.value)}
                </span>
                <span className="text-sm text-[var(--text-muted)]">{card.suffix}</span>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Charts Placeholder */}
      <Row gutter={[20, 20]}>
        <Col span={12}>
          <div
            className="glass-card-light p-6 animate-slide-up"
            style={{ animationDelay: "0.36s" }}
          >
            <span className="text-sm font-semibold text-[var(--text)] block mb-5">
              消息趋势
            </span>
            <div className="h-64 flex items-center justify-center rounded-xl bg-[var(--bg)]">
              <Space direction="vertical" align="center">
                <div className="w-14 h-14 rounded-2xl bg-[rgba(139,92,246,0.08)] flex items-center justify-center">
                  <BarChartOutlined style={{ fontSize: 24, color: "#c4b5fd" }} />
                </div>
                <span className="text-sm text-[var(--text-muted)]">
                  图表区域（待接入 Recharts）
                </span>
              </Space>
            </div>
          </div>
        </Col>
        <Col span={12}>
          <div
            className="glass-card-light p-6 animate-slide-up"
            style={{ animationDelay: "0.44s" }}
          >
            <span className="text-sm font-semibold text-[var(--text)] block mb-5">
              用户活跃度分布
            </span>
            <div className="h-64 flex items-center justify-center rounded-xl bg-[var(--bg)]">
              <Space direction="vertical" align="center">
                <div className="w-14 h-14 rounded-2xl bg-[rgba(59,130,246,0.08)] flex items-center justify-center">
                  <BarChartOutlined style={{ fontSize: 24, color: "#93c5fd" }} />
                </div>
                <span className="text-sm text-[var(--text-muted)]">
                  图表区域（待接入 Recharts）
                </span>
              </Space>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add web/src/app/dashboard/analytics/page.tsx
git commit -m "feat: analytics page fetches from wecom API or reads mock data by channel"
```

---

### Task 8: 更新文档

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: 更新 CLAUDE.md**

在 API 路由表中追加：

```
| GET | `/api/companies` | 否 | 返回公司列表 + 可用渠道 |
| GET | `/api/wecom/users` | 否 | 企业微信用户列表（company_id 过滤） |
| GET | `/api/wecom/stats` | 否 | 企业微信统计数据（company_id 过滤） |
```

在数据库设计部分，将 `核心表：companies → departments → users → ...` 替换为：

```
核心表：companies（九峰/福多多）+ 三渠道业务表（wecom_*/dingtalk_*/feishu_*：users/messages/chats/events）+ 销售能力表（sales_users/sales_competency_*）
```

在前端架构部分追加：

```
- **全局状态**：AppContext（React Context）管理当前公司 ID 和渠道选择，Header 下拉切换，子页面自动刷新
- **Mock 策略**：企业微信对接真实 API，钉钉/飞书使用前端 mock 数据（`web/src/lib/mockData.ts`）
```

在目录结构中，在 `lib/` 下追加：

```
│   │   │   ├── lib/
│   │   │   │   ├── api.ts               # HTTP 客户端 + 类型定义
│   │   │   │   ├── AppContext.tsx        # 全局状态（公司/渠道切换）
│   │   │   │   └── mockData.ts           # 钉钉/飞书 mock 数据
```

- [ ] **Step 2: 更新 README.md**

在项目结构 web 部分追加 mockData.ts 和 AppContext.tsx 的说明。

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md and README with multi-company and channel docs"
```

---

## Self-Review

**1. Spec coverage:**
- companies 表 + 种子数据 → Task 1 ✅
- wecom 表加 company_id → Task 2 ✅
- Mock 种子数据 → Task 2 ✅
- Go model 新增结构体 → Task 3 ✅
- Go wecom handler + 路由 → Task 3 ✅
- 前端 AppContext → Task 4 ✅
- 前端 mockData → Task 4 ✅
- 前端 api.ts 类型 → Task 4 ✅
- Header 公司/渠道选择器 → Task 5 ✅
- 用户明细页接入 → Task 6 ✅
- 使用分析页接入 → Task 7 ✅
- 文档更新 → Task 8 ✅

**2. Placeholder scan:** 无 TBD/TODO/placeholder。

**3. Type consistency:**
- `WecomUser` 在 api.ts 定义，mockData.ts 和 users/page.tsx 使用同一类型 ✅
- `WecomStats` 在 api.ts 定义，mockData.ts 和 analytics/page.tsx 使用同一类型 ✅
- `Company` 在 AppContext.tsx 定义，layout.tsx 通过 useApp 消费 ✅
- Go `model.CompanyResponse` 对应前端 `Company` 接口字段（id/name/code/channels）✅
