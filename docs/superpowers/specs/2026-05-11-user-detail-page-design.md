# 用户详情页设计

## 概述

在用户明细列表中，点击用户行跳转到独立的用户详情页，展示该用户的个人资料、统计数据、会话列表和详细聊天记录。

## 路由结构

- 路径：`/dashboard/users/[id]`
- `[id]` 对应：
  - 组织用户模式（`?mode=org`）→ MongoDB 用户 ID
  - 客服客户模式（`?mode=kefu`）→ `external_userid`
- 通过 URL query 参数 `mode` 区分用户类型
- 返回按钮使用 `router.back()` 回到用户列表

## 页面布局：双栏

页面分左右两栏，高度占满可视区域 `calc(100vh - topbar-height)`，各自独立滚动。移动端（< 768px）左栏折叠为顶部水平卡片，右栏全宽。

### 左栏（35% 宽度）

1. **返回按钮** — `← 返回用户明细`，点击调用 `router.back()`
2. **用户资料卡** — 居中展示：
   - 头像：有则显示图片，无则显示姓名首字圆形占位（灰色背景 + 白色文字）
   - 姓名（加粗）
   - 用户名/昵称（灰色小字）
   - 角色/性别标签（复用现有 Tag 组件）
3. **统计卡片** — 两张横向卡片：
   - 会话数（蓝色背景 `#eff6ff`，蓝色数字）
   - Token 消耗（绿色背景 `#f0fdf4`，绿色数字）
   - 数据受全局时间范围约束（`useApp()` 的 `timeRange`/`customDateRange`）
4. **最近会话列表** — 纵向可滚动列表：
   - 每项：首条消息摘要（截断）+ 时间 + 消息条数 badge
   - 当前选中项左侧蓝色边框（`border-left: 3px solid #3b82f6`）
   - 点击切换右侧聊天面板内容

### 右栏（65% 宽度）

1. **顶部标题栏** — "详细会话记录" + 消息总数 + 搜索输入框
2. **消息流** — 聊天气泡样式（复用 ChatDrawer 视觉风格）：
   - 用户消息：左侧，灰色气泡 `bg-[var(--color-bg-elevated)]`
   - AI 回复：右侧，绿色气泡 `bg-[#16a34a]`
   - 每条消息：头像 + 气泡 + 时间戳
3. **搜索高亮** — 输入关键词实时过滤消息，匹配文本用黄色 `<mark>` 高亮

## 数据模型

### 新增后端 API

#### GET /api/analytics/user-stats

单用户统计数据。

参数：
- `user_id`（必填）— MongoDB 用户 ID 或 `external_userid`
- `mode`（必填）— `org` 或 `kefu`
- `company_id`（可选）
- `time_range`（必填）— `yesterday` / `last_week` / `last_month` / `custom`
- `start_date` / `end_date`（自定义范围时必填）

返回：
```json
{
  "conversationCount": 128,
  "tokenUsage": 2450
}
```

实现：复用 `analytics.go` 中 `kefuUserConversations` / `kefuUserTokens` 的查询模式，加 `WHERE external_userid = $1` 过滤。

#### GET /api/analytics/user-sessions

用户会话分组列表。

参数同 `user-stats`。

返回：
```json
[
  {
    "sessionId": "msg-group-1",
    "firstMessage": "如何使用 Dify 工作流？",
    "messageCount": 8,
    "startTime": "2026-05-10T14:32:00Z",
    "lastTime": "2026-05-10T14:45:00Z"
  }
]
```

实现：按时间间隔（30 分钟无消息则分割）对消息分组，每组取首条消息摘要、消息数、起止时间。

### 前端数据流

1. 页面加载 → 从 URL 取 `id` 和 `mode`
2. 并行请求三个接口：
   - 用户基本信息（已有 `/api/org/users/:id` 或 kefu-customers 数据）
   - `user-stats` 获取统计
   - `user-sessions` 获取会话列表
3. 默认选中第一个会话 → 调用 `/api/wecom/kefu-messages` 加载消息
4. 时间范围变化 → 重新请求 stats + sessions
5. 点击左侧会话项 → 用该会话的起止时间请求消息

## 前端文件结构

```
web/src/app/dashboard/users/
├── page.tsx              # 现有用户列表页
└── [id]/
    └── page.tsx          # 新增用户详情页
```

api.ts 中新增类型：
- `UserStats` — `conversationCount`, `tokenUsage`
- `UserSession` — `sessionId`, `firstMessage`, `messageCount`, `startTime`, `lastTime`
- `fetchUserStats()` — 调用 user-stats API
- `fetchUserSessions()` — 调用 user-sessions API

## 动画与交互

### 页面级

- **入场**：页面整体 `fadeIn` + `slideInRight`（300ms ease-out）
- **左栏 stagger**：头像 → 统计卡片 → 会话列表，每级延迟 80ms

### 组件级

- **会话项 hover**：背景色渐变（150ms），左侧蓝色指示条从 0 宽度展开
- **会话切换**：右侧聊天面板 `fadeOut` → `fadeIn`（200ms 交叉过渡）
- **聊天气泡入场**：逐条 `slideInUp` + `fadeIn`（每条延迟 30ms）
- **统计数字**：countUp 动画（0 → 目标值，600ms ease-out）

### 交互细节

- **返回按钮 hover**：背景色变化 + `←` 箭头左移 4px
- **搜索高亮**：匹配文本 `<mark>` 标签 + 黄色背景
- **加载态**：左右两栏 skeleton 骨架屏（脉冲动画），不用 Spin

### 技术实现

全部使用 Tailwind CSS + CSS `@keyframes`，不引入额外动画库。通过 `animation-delay` CSS 变量控制 stagger 时序。

## 用户列表页改动

在现有 `users/page.tsx` 中：
- 移除 `ChatDrawer` 组件（不再需要）
- 表格行添加 `onClick` → `router.push(/dashboard/users/${id}?mode=org|kefu)`
- 操作列的"聊天记录"按钮改为跳转而非打开 Drawer
- 导出功能保持不变

## 后端改动

在 `server/internal/handler/analytics.go` 中新增两个处理函数：
- `getUserStats` — 单用户统计
- `getUserSessions` — 单用户会话分组

在 `server/internal/handler/handler.go` 中注册路由：
- `GET /api/analytics/user-stats`
- `GET /api/analytics/user-sessions`

在 `server/internal/model/models.go` 中新增模型：
- `UserStatsResponse`
- `UserSession`
