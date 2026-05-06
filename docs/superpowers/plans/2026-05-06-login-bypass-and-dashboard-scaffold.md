# 登录跳过校验 + Dashboard 侧边栏切换页面

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登录页跳过后端校验直接跳转，Dashboard 改为带侧边栏的布局，支持"用户明细"和"使用分析"两个页面切换。

**Architecture:** 登录页点击后直接 `router.push` 跳转，不走 API。Dashboard 使用 Next.js App Router 嵌套布局：`/dashboard` 作为 layout 壳（含侧边栏），`/dashboard/users` 和 `/dashboard/analytics` 作为两个子页面。当前 `/dashboard/page.tsx` 的系统概览内容移到 `/dashboard/overview`。

**Tech Stack:** Next.js 16 App Router + React 19 + Ant Design 6 + Tailwind CSS 4 + TypeScript 5

---

## File Structure

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| 修改 | `web/src/app/login/page.tsx` | 去掉 API 调用，点击登录直接跳转 `/dashboard` |
| 创建 | `web/src/app/dashboard/layout.tsx` | Dashboard 共享布局：侧边栏 + Header + Content 区 |
| 移动 | `web/src/app/dashboard/page.tsx` → `web/src/app/dashboard/overview/page.tsx` | 系统概览内容迁移到子路由 |
| 创建 | `web/src/app/dashboard/users/page.tsx` | 用户明细页面 |
| 创建 | `web/src/app/dashboard/analytics/page.tsx` | 使用分析页面 |
| 修改 | `CLAUDE.md` | 同步更新前端架构说明、API 路由、目录结构 |
| 修改 | `README.md` | 同步更新项目结构 |

---

### Task 1: 登录页跳过校验直接跳转

**Files:**
- Modify: `web/src/app/login/page.tsx`

- [ ] **Step 1: 修改登录页，去掉 API 调用，直接跳转**

将 `web/src/app/login/page.tsx` 替换为以下内容：

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Card, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = () => {
    setLoading(true);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md shadow-xl" bordered={false}>
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-blue-600 mb-2">泰山 XD</div>
          <Typography.Text type="secondary">
            销售赋能中心 V2
          </Typography.Text>
        </div>
        <Form
          onFinish={onFinish}
          size="large"
          autoComplete="off"
          initialValues={{ username: "admin" }}
        >
          <Form.Item name="username">
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password">
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              className="bg-blue-600"
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 验证登录跳转**

Run: `cd web && npm run dev`

打开 http://localhost:3000/login → 点击登录按钮 → 应跳转到 /dashboard 页面。

- [ ] **Step 3: 提交**

```bash
git add web/src/app/login/page.tsx
git commit -m "feat: skip login validation, redirect directly to dashboard"
```

---

### Task 2: 创建 Dashboard 共享布局（侧边栏）

**Files:**
- Create: `web/src/app/dashboard/layout.tsx`

这个 layout 是所有 `/dashboard/*` 子页面的共享壳，包含左侧导航栏 + 顶部 Header + 右侧内容区。

- [ ] **Step 1: 创建 dashboard layout**

创建 `web/src/app/dashboard/layout.tsx`：

```tsx
"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout, Menu, Button, Dropdown, Typography, Avatar } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
  TeamOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import Link from "next/link";

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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <Layout className="min-h-screen">
      <Sider
        width={220}
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className="flex flex-col"
      >
        <div className="h-16 flex items-center justify-center text-white text-xl font-bold">
          {collapsed ? "TS" : "泰山 XD"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems.map((item) => ({
            ...item,
            label: <Link href={item.key}>{item.label}</Link>,
          }))}
        />
      </Sider>

      <Layout>
        <Header className="bg-white shadow-sm px-6 flex items-center justify-between">
          <Typography.Title level={4} className="!mb-0">
            销售赋能中心
          </Typography.Title>
          <div className="flex items-center gap-4">
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
              <Button type="text" icon={<UserOutlined />}>
                Admin
              </Button>
            </Dropdown>
          </div>
        </Header>
        <Content className="m-6 p-6 bg-white rounded-lg shadow-sm min-h-[calc(100vh-112px)]">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 2: 验证布局**

Run: `cd web && npm run dev`

打开 http://localhost:3000/dashboard → 应看到侧边栏 + 顶部 Header + 白色内容区。此时内容区显示的是原 page.tsx 内容。

- [ ] **Step 3: 提交**

```bash
git add web/src/app/dashboard/layout.tsx
git commit -m "feat: add dashboard shared layout with sidebar navigation"
```

---

### Task 3: 迁移系统概览到子路由

**Files:**
- Create: `web/src/app/dashboard/overview/page.tsx`（从现有 page.tsx 复制，去掉 Layout/Sider/Header 部分）
- Modify: `web/src/app/dashboard/page.tsx`（改为重定向到 overview）

当前的 `dashboard/page.tsx` 包含完整的 Layout + Sider + Header + Content。需要拆分：布局由 layout.tsx 接管，概览内容移到 overview 子路由。

- [ ] **Step 1: 创建 overview 子路由**

创建 `web/src/app/dashboard/overview/page.tsx`，只保留内容区域（去掉 Layout/Sider/Header 嵌套）：

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Typography,
  Tag,
  Spin,
  Row,
  Col,
  Statistic,
  Button,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { api, type HealthStatus, type SystemInfo } from "@/lib/api";

export default function OverviewPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = async () => {
    try {
      const h = await api<HealthStatus>("/api/health");
      setHealth(h);
    } catch {
      setHealth({ postgres: "error", redis: "error" });
    }
  };

  const loadSystem = async () => {
    try {
      const s = await api<SystemInfo>("/api/system/info");
      setSysInfo(s);
    } catch {
      /* ignore */
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadHealth(), loadSystem()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  const pgOk = health?.postgres === "ok";
  const redisOk = health?.redis === "ok";

  return (
    <>
      <Row gutter={[16, 16]} className="mb-6">
        <Col span={8}>
          <Card>
            <Statistic
              title="PostgreSQL"
              value={pgOk ? "已连接" : "异常"}
              prefix={pgOk ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              valueStyle={{ color: pgOk ? "#52c41a" : "#ff4d4f" }}
            />
            <Tag color={pgOk ? "green" : "red"} className="mt-2">
              {pgOk ? "Healthy" : "Disconnected"}
            </Tag>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Redis"
              value={redisOk ? "已连接" : "异常"}
              prefix={redisOk ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              valueStyle={{ color: redisOk ? "#52c41a" : "#ff4d4f" }}
            />
            <Tag color={redisOk ? "green" : "red"} className="mt-2">
              {redisOk ? "Healthy" : "Disconnected"}
            </Tag>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="服务状态"
              value={pgOk && redisOk ? "全部正常" : "部分异常"}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: pgOk && redisOk ? "#52c41a" : "#faad14" }}
            />
            <Tag color="blue" className="mt-2">
              V2.0.0-demo
            </Tag>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mb-6">
        <Col span={16}>
          <Card
            title="系统信息"
            extra={<Button icon={<ReloadOutlined />} onClick={loadAll}>刷新</Button>}
          >
            <Row gutter={[24, 16]}>
              <Col span={8}>
                <Typography.Text type="secondary">版本</Typography.Text>
                <div>{sysInfo?.version || "-"}</div>
              </Col>
              <Col span={8}>
                <Typography.Text type="secondary">Go 版本</Typography.Text>
                <div>{sysInfo?.goVersion || "-"}</div>
              </Col>
              <Col span={8}>
                <Typography.Text type="secondary">环境</Typography.Text>
                <div>{sysInfo?.environment || "-"}</div>
              </Col>
              <Col span={8}>
                <Typography.Text type="secondary">启动时间</Typography.Text>
                <div>{sysInfo?.startedAt?.replace("T", " ").slice(0, 19) || "-"}</div>
              </Col>
              <Col span={8}>
                <Typography.Text type="secondary">数据库</Typography.Text>
                <div>PostgreSQL 16 + Redis 7</div>
              </Col>
              <Col span={8}>
                <Typography.Text type="secondary">网关</Typography.Text>
                <div>Traefik v3.3</div>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="快速开始">
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small" className="text-center">
                  <Typography.Text strong>用户管理</Typography.Text>
                  <div className="text-gray-400 text-sm mt-1">待开发</div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" className="text-center">
                  <Typography.Text strong>AI 智能分析</Typography.Text>
                  <div className="text-gray-400 text-sm mt-1">待开发</div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" className="text-center">
                  <Typography.Text strong>钉钉集成</Typography.Text>
                  <div className="text-gray-400 text-sm mt-1">待开发</div>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </>
  );
}
```

- [ ] **Step 2: 修改 dashboard 根页面为重定向**

将 `web/src/app/dashboard/page.tsx` 替换为：

```tsx
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/dashboard/overview");
}
```

- [ ] **Step 3: 验证路由迁移**

Run: `cd web && npm run dev`

- 访问 http://localhost:3000/dashboard → 自动重定向到 /dashboard/overview
- 侧边栏应正确高亮"系统概览"
- 健康检查卡片和系统信息应正常显示

- [ ] **Step 4: 提交**

```bash
git add web/src/app/dashboard/page.tsx web/src/app/dashboard/overview/page.tsx
git commit -m "refactor: extract overview into sub-route, dashboard root redirects to overview"
```

---

### Task 4: 创建用户明细页面

**Files:**
- Create: `web/src/app/dashboard/users/page.tsx`

用户明细页面的初始版本：一个带搜索和表格的页面框架，数据先用 mock 占位，后续对接 API。

- [ ] **Step 1: 创建用户明细页面**

创建 `web/src/app/dashboard/users/page.tsx`：

```tsx
"use client";

import { useState } from "react";
import { Table, Card, Input, Tag, Space, Button } from "antd";
import { SearchOutlined, ReloadOutlined, TeamOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

interface UserRecord {
  key: string;
  id: number;
  username: string;
  realName: string;
  companyName: string;
  deptName: string;
  dataScope: number;
  isActive: boolean;
}

const mockUsers: UserRecord[] = [
  { key: "1", id: 1, username: "admin", realName: "管理员", companyName: "泰山销售赋能中心", deptName: "总经办", dataScope: 1, isActive: true },
  { key: "2", id: 2, username: "zhangsan", realName: "张三", companyName: "泰山销售赋能中心", deptName: "销售一部", dataScope: 2, isActive: true },
  { key: "3", id: 3, username: "lisi", realName: "李四", companyName: "泰山销售赋能中心", deptName: "销售二部", dataScope: 3, isActive: true },
  { key: "4", id: 4, username: "wangwu", realName: "王五", companyName: "泰山销售赋能中心", deptName: "销售一部", dataScope: 4, isActive: false },
];

const dataScopeMap: Record<number, { label: string; color: string }> = {
  1: { label: "公司级", color: "red" },
  2: { label: "部门级", color: "orange" },
  3: { label: "个人级", color: "blue" },
  4: { label: "默认", color: "default" },
};

const columns: ColumnsType<UserRecord> = [
  { title: "ID", dataIndex: "id", width: 60 },
  { title: "用户名", dataIndex: "username", width: 120 },
  { title: "姓名", dataIndex: "realName", width: 100 },
  { title: "公司", dataIndex: "companyName", width: 180 },
  { title: "部门", dataIndex: "deptName", width: 120 },
  {
    title: "数据权限",
    dataIndex: "dataScope",
    width: 100,
    render: (scope: number) => {
      const info = dataScopeMap[scope] || dataScopeMap[4];
      return <Tag color={info.color}>{info.label}</Tag>;
    },
  },
  {
    title: "状态",
    dataIndex: "isActive",
    width: 80,
    render: (active: boolean) => (
      <Tag color={active ? "green" : "default"}>{active ? "启用" : "禁用"}</Tag>
    ),
  },
];

export default function UsersPage() {
  const [searchText, setSearchText] = useState("");

  const filteredUsers = mockUsers.filter(
    (u) =>
      u.username.includes(searchText) ||
      u.realName.includes(searchText) ||
      u.companyName.includes(searchText) ||
      u.deptName.includes(searchText)
  );

  return (
    <>
      <Card
        title={
          <Space>
            <TeamOutlined />
            <span>用户明细</span>
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="搜索用户名/姓名/部门"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
            <Button icon={<ReloadOutlined />}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredUsers}
          pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
          size="middle"
        />
      </Card>
    </>
  );
}
```

- [ ] **Step 2: 验证用户明细页**

Run: `cd web && npm run dev`

- 访问 http://localhost:3000/dashboard → 点击侧边栏"用户明细"
- 应看到搜索框 + 表格，包含 4 条 mock 数据
- 输入搜索词应实时过滤表格

- [ ] **Step 3: 提交**

```bash
git add web/src/app/dashboard/users/page.tsx
git commit -m "feat: add users detail page with mock data and search"
```

---

### Task 5: 创建使用分析页面

**Files:**
- Create: `web/src/app/dashboard/analytics/page.tsx`

使用分析页面的初始版本：展示关键统计指标卡片 + 占位图表区域，数据先用 mock。

- [ ] **Step 1: 创建使用分析页面**

创建 `web/src/app/dashboard/analytics/page.tsx`：

```tsx
"use client";

import { Card, Row, Col, Statistic, Typography, Space, Tag, Select } from "antd";
import {
  BarChartOutlined,
  ArrowUpOutlined,
  UserOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
} from "@ant-design/icons";

const statsCards = [
  {
    title: "总调用次数",
    value: 12847,
    suffix: "次",
    icon: <ThunderboltOutlined />,
    trend: 12.5,
    color: "#1890ff",
  },
  {
    title: "活跃用户数",
    value: 326,
    suffix: "人",
    icon: <UserOutlined />,
    trend: 8.3,
    color: "#52c41a",
  },
  {
    title: "平均响应时间",
    value: 2.4,
    suffix: "秒",
    icon: <ClockCircleOutlined />,
    trend: -5.1,
    color: "#faad14",
  },
  {
    title: "分析报告数",
    value: 89,
    suffix: "份",
    icon: <FileTextOutlined />,
    trend: 23.1,
    color: "#722ed1",
  },
];

export default function AnalyticsPage() {
  return (
    <>
      <Card
        title={
          <Space>
            <BarChartOutlined />
            <span>使用分析</span>
          </Space>
        }
        extra={
          <Select
            defaultValue="7d"
            style={{ width: 120 }}
            options={[
              { value: "24h", label: "最近 24 小时" },
              { value: "7d", label: "最近 7 天" },
              { value: "30d", label: "最近 30 天" },
              { value: "90d", label: "最近 90 天" },
            ]}
          />
        }
      >
        <Row gutter={[16, 16]} className="mb-6">
          {statsCards.map((card) => (
            <Col span={6} key={card.title}>
              <Card size="small" className="text-center">
                <Statistic
                  title={card.title}
                  value={card.value}
                  suffix={card.suffix}
                  prefix={card.icon}
                  valueStyle={{ color: card.color }}
                />
                <div className="mt-2">
                  <Tag color={card.trend > 0 ? "green" : "red"}>
                    {card.trend > 0 ? (
                      <ArrowUpOutlined />
                    ) : (
                      <ArrowUpOutlined style={{ transform: "rotate(180deg)" }} />
                    )}
                    {" "}较上周 {Math.abs(card.trend)}%
                  </Tag>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card title="调用趋势" size="small">
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
                <Space direction="vertical" align="center">
                  <BarChartOutlined style={{ fontSize: 48, color: "#d9d9d9" }} />
                  <Typography.Text type="secondary">
                    图表区域（待接入 Recharts）
                  </Typography.Text>
                </Space>
              </div>
            </Card>
          </Col>
          <Col span={12}>
            <Card title="用户活跃度分布" size="small">
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
                <Space direction="vertical" align="center">
                  <BarChartOutlined style={{ fontSize: 48, color: "#d9d9d9" }} />
                  <Typography.Text type="secondary">
                    图表区域（待接入 Recharts）
                  </Typography.Text>
                </Space>
              </div>
            </Card>
          </Col>
        </Row>
      </Card>
    </>
  );
}
```

- [ ] **Step 2: 验证使用分析页**

Run: `cd web && npm run dev`

- 访问 http://localhost:3000/dashboard → 点击侧边栏"使用分析"
- 应看到 4 个统计卡片（总调用次数、活跃用户数、平均响应时间、分析报告数）
- 下方应有两个图表占位区域
- 时间范围选择器应可切换

- [ ] **Step 3: 提交**

```bash
git add web/src/app/dashboard/analytics/page.tsx
git commit -m "feat: add analytics page with stats cards and chart placeholders"
```

---

### Task 6: 更新文档（CLAUDE.md + README.md）

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: 更新 CLAUDE.md**

需要更新以下部分：

1. 目录结构中的 dashboard 部分，体现新的嵌套路由结构
2. 前端架构说明，反映新的 layout + 子路由模式
3. API 路由表新增（如有）

在目录结构中，将：
```
│   │   ├── app/
│   │   │   ├── layout.tsx           # 根布局（全局 metadata）
│   │   │   ├── page.tsx             # 首页（重定向到 /login）
│   │   │   ├── login/page.tsx       # 登录页
│   │   │   └── dashboard/page.tsx   # 主面板（系统概览、健康状态、用户信息）
```

替换为：
```
│   │   ├── app/
│   │   │   ├── layout.tsx                   # 根布局（全局 metadata）
│   │   │   ├── page.tsx                     # 首页（重定向到 /login）
│   │   │   ├── login/page.tsx               # 登录页（暂无校验，直接跳转）
│   │   │   └── dashboard/
│   │   │       ├── layout.tsx               # Dashboard 共享布局（侧边栏 + Header）
│   │   │       ├── page.tsx                 # 重定向到 /dashboard/overview
│   │   │       ├── overview/page.tsx        # 系统概览（健康检查、系统信息）
│   │   │       ├── users/page.tsx           # 用户明细（表格 + 搜索）
│   │   │       └── analytics/page.tsx       # 使用分析（统计卡片 + 图表占位）
```

在前端架构部分，将：
```
- **路由**：Next.js App Router，`/login` 和 `/dashboard` 两个页面
```

替换为：
```
- **路由**：Next.js App Router，`/login` 登录页 + `/dashboard` 嵌套布局（共享侧边栏），子路由：`overview`（系统概览）、`users`（用户明细）、`analytics`（使用分析）
```

- [ ] **Step 2: 更新 README.md 项目结构**

在项目结构中，将：
```
web/                    # Next.js 前端
  src/app/              # App Router 页面（login, dashboard）
  src/lib/api.ts        # API 客户端 + 类型定义
```

替换为：
```
web/                    # Next.js 前端
  src/app/login/        # 登录页
  src/app/dashboard/    # Dashboard 嵌套布局
    layout.tsx          # 共享侧边栏 + Header
    overview/           # 系统概览
    users/              # 用户明细
    analytics/          # 使用分析
  src/lib/api.ts        # API 客户端 + 类型定义
```

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md and README to reflect new dashboard structure"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- 登录跳过校验直接跳转 → Task 1 ✅
- 新页面带侧边栏 → Task 2 ✅
- 侧边栏点击切换 → Task 2 (layout) + Task 3/4/5 (各子页面) ✅
- 用户明细页面 → Task 4 ✅
- 使用分析页面 → Task 5 ✅
- 文档同步更新 → Task 6 ✅

**2. Placeholder scan:** 无 TBD/TODO/placeholder，所有代码完整。

**3. Type consistency:** `UserRecord` 接口在 Task 4 定义并使用，`dataScopeMap` 的 key 与 `UserRecord.dataScope` 类型匹配（number）。`statsCards` 各字段一致。
