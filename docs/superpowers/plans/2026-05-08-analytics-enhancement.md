# Analytics Filtered Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 analytics bar charts driven by global header filters (channel, time range, chat scope), querying wecom_kefu_messages for private chat analytics and wecom_messages for group/all.

**Architecture:** New backend endpoint `GET /api/analytics/usage` accepts filter params, computes 4 aggregated datasets via SQL, returns structured JSON. Frontend reads AppContext filter state, fetches data, renders recharts BarChart components.

**Tech Stack:** Go (Gin + lib/pq), Next.js, recharts, Ant Design, Tailwind CSS

---

## Filter → Table Mapping

| Channel | Chat Scope | Table | User Column | Time Column |
|---------|-----------|-------|-------------|-------------|
| wecom | private | wecom_kefu_messages | external_userid | created_at (TIMESTAMP) |
| wecom | group | wecom_messages | sender_id | create_time (BIGINT ms epoch) |
| wecom | all | wecom_messages | sender_id | create_time (BIGINT ms epoch) |
| dingtalk | any | (mock data) | — | — |
| feishu | any | (mock data) | — | — |

## 4 Charts

1. **各用户会话数** — Bar chart: X = user ID, Y = message count per user
2. **各用户总 Token 消耗** — Bar chart: X = user ID, Y = estimated tokens (content char count / 2 as proxy)
3. **总对话量** — Bar chart: X = time bucket (hourly for yesterday, daily for week/month), Y = message count
4. **使用时段分布** — Bar chart: X = hour 0–23 (Beijing), Y = message count aggregated across the selected period

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/internal/model/models.go` | Modify | Add analytics response types |
| `server/internal/handler/analytics.go` | Create | Analytics endpoint with 4 filtered SQL queries |
| `server/internal/handler/handler.go` | Modify | Register analytics route |
| `web/package.json` | Modify | Add recharts dependency |
| `web/src/lib/api.ts` | Modify | Add analytics types and fetch function |
| `web/src/app/dashboard/analytics/page.tsx` | Rewrite | 4 bar charts wired to global filters |

---

### Task 1: Backend — Add Analytics Data Models

**Files:**
- Modify: `server/internal/model/models.go` (append after line 84)

- [ ] **Step 1: Add analytics types to models.go**

Append the following after the `KefuMessage` struct (after line 84):

```go
// --- Analytics ---

type UserCount struct {
	UserID string `json:"userId"`
	Count  int    `json:"count"`
}

type UserToken struct {
	UserID string `json:"userId"`
	Tokens int    `json:"tokens"`
}

type TimeBucket struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type HourBucket struct {
	Hour  int `json:"hour"`
	Count int `json:"count"`
}

type AnalyticsResponse struct {
	UserConversations []UserCount  `json:"userConversations"`
	UserTokens        []UserToken  `json:"userTokens"`
	ConversationVolume []TimeBucket `json:"conversationVolume"`
	TimeDistribution  []HourBucket `json:"timeDistribution"`
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/jixin/CODE/TaishanXD2/server && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/internal/model/models.go
git commit -m "feat: add analytics data models for usage charts"
```

---

### Task 2: Backend — Create Analytics Handler

**Files:**
- Create: `server/internal/handler/analytics.go`

- [ ] **Step 1: Create the analytics handler file**

Create `server/internal/handler/analytics.go` with the following content:

```go
package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

// getAnalytics godoc
// @Summary      使用分析数据
// @Description  根据筛选条件（渠道、时间范围、聊天类型）返回 4 组聚合数据：各用户会话数、各用户 Token 消耗、总对话量趋势、使用时段分布
// @Tags         分析
// @Produce      json
// @Param        channel      query     string  true   "渠道：wecom"  default(wecom)
// @Param        time_range   query     string  true   "时间范围：yesterday / last_week / last_month / custom"
// @Param        chat_scope   query     string  true   "聊天类型：all / group / private"
// @Param        start_date   query     string  false  "自定义起始日期（YYYY-MM-DD）"
// @Param        end_date     query     string  false  "自定义截止日期（YYYY-MM-DD）"
// @Success      200  {object}  model.AnalyticsResponse
// @Failure      400  {object}  map[string]string
// @Router       /api/analytics/usage [get]
func getAnalytics(c *gin.Context) {
	channel := c.DefaultQuery("channel", "wecom")
	timeRange := c.DefaultQuery("time_range", "yesterday")
	chatScope := c.DefaultQuery("chat_scope", "all")

	if channel != "wecom" {
		c.JSON(http.StatusOK, emptyAnalytics())
		return
	}

	start, end, err := resolveTimeRange(timeRange, c.Query("start_date"), c.Query("end_date"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var resp model.AnalyticsResponse

	if chatScope == "private" {
		resp = queryKefuAnalytics(start, end)
	} else {
		scopeFilter := ""
		if chatScope == "group" {
			scopeFilter = " AND receive_id_type = 'chatid'"
		}
		resp = queryMessageAnalytics(start, end, scopeFilter)
	}

	c.JSON(http.StatusOK, resp)
}

func emptyAnalytics() model.AnalyticsResponse {
	return model.AnalyticsResponse{
		UserConversations:  []model.UserCount{},
		UserTokens:         []model.UserToken{},
		ConversationVolume: []model.TimeBucket{},
		TimeDistribution:   []model.HourBucket{},
	}
}

func resolveTimeRange(timeRange, startStr, endStr string) (start, end time.Time, err error) {
	loc, _ := time.LoadLocation("Asia/Shanghai")
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	switch timeRange {
	case "yesterday":
		start = today.AddDate(0, 0, -1)
		end = today
	case "last_week":
		start = today.AddDate(0, 0, -7)
		end = today
	case "last_month":
		start = today.AddDate(0, -1, 0)
		end = today
	case "custom":
		if startStr == "" || endStr == "" {
			return time.Time{}, time.Time{}, fmt.Errorf("custom range requires start_date and end_date")
		}
		start, err = time.ParseInLocation("2006-01-02", startStr, loc)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid start_date format")
		}
		end, err = time.ParseInLocation("2006-01-02", endStr, loc)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid end_date format")
		}
		end = end.AddDate(0, 0, 1)
	default:
		return time.Time{}, time.Time{}, fmt.Errorf("invalid time_range: %s", timeRange)
	}
	return
}

func queryKefuAnalytics(start, end time.Time) model.AnalyticsResponse {
	resp := emptyAnalytics()

	// 1. User conversations (top 20)
	rows, err := repository.DB.Query(`
		SELECT external_userid, COUNT(*)::int AS count
		FROM wecom_kefu_messages
		WHERE created_at >= $1 AND created_at < $2
		GROUP BY external_userid
		ORDER BY count DESC
		LIMIT 20
	`, start, end)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var uc model.UserCount
			rows.Scan(&uc.UserID, &uc.Count)
			resp.UserConversations = append(resp.UserConversations, uc)
		}
	}

	// 2. User tokens (content length as proxy, top 20)
	rows, err = repository.DB.Query(`
		SELECT external_userid, COALESCE(SUM(LENGTH(content::text)), 0)::int / 2 AS tokens
		FROM wecom_kefu_messages
		WHERE created_at >= $1 AND created_at < $2
		GROUP BY external_userid
		ORDER BY tokens DESC
		LIMIT 20
	`, start, end)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ut model.UserToken
			rows.Scan(&ut.UserID, &ut.Tokens)
			resp.UserTokens = append(resp.UserTokens, ut)
		}
	}

	// 3. Conversation volume
	rows, err = repository.DB.Query(`
		SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS label,
		       COUNT(*)::int AS count
		FROM wecom_kefu_messages
		WHERE created_at >= $1 AND created_at < $2
		GROUP BY label
		ORDER BY label
	`, start, end)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tb model.TimeBucket
			rows.Scan(&tb.Label, &tb.Count)
			resp.ConversationVolume = append(resp.ConversationVolume, tb)
		}
	}

	// 4. Time distribution (by hour, Beijing)
	rows, err = repository.DB.Query(`
		SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Shanghai')::int AS hour,
		       COUNT(*)::int AS count
		FROM wecom_kefu_messages
		WHERE created_at >= $1 AND created_at < $2
		GROUP BY hour
		ORDER BY hour
	`, start, end)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var hb model.HourBucket
			rows.Scan(&hb.Hour, &hb.Count)
			resp.TimeDistribution = append(resp.TimeDistribution, hb)
		}
	}

	return resp
}

func queryMessageAnalytics(start, end time.Time, scopeFilter string) model.AnalyticsResponse {
	resp := emptyAnalytics()
	startMs := start.UnixMilli()
	endMs := end.UnixMilli()

	// 1. User conversations (top 20)
	rows, err := repository.DB.Query(fmt.Sprintf(`
		SELECT sender_id, COUNT(*)::int AS count
		FROM wecom_messages
		WHERE create_time >= $1 AND create_time < $2 %s
		GROUP BY sender_id
		ORDER BY count DESC
		LIMIT 20
	`, scopeFilter), startMs, endMs)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var uc model.UserCount
			rows.Scan(&uc.UserID, &uc.Count)
			resp.UserConversations = append(resp.UserConversations, uc)
		}
	}

	// 2. User tokens (content length as proxy, top 20)
	rows, err = repository.DB.Query(fmt.Sprintf(`
		SELECT sender_id, COALESCE(SUM(LENGTH(content)), 0)::int / 2 AS tokens
		FROM wecom_messages
		WHERE create_time >= $1 AND create_time < $2 %s
		GROUP BY sender_id
		ORDER BY tokens DESC
		LIMIT 20
	`, scopeFilter), startMs, endMs)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ut model.UserToken
			rows.Scan(&ut.UserID, &ut.Tokens)
			resp.UserTokens = append(resp.UserTokens, ut)
		}
	}

	// 3. Conversation volume
	rows, err = repository.DB.Query(fmt.Sprintf(`
		SELECT to_char(to_timestamp(create_time / 1000.0) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS label,
		       COUNT(*)::int AS count
		FROM wecom_messages
		WHERE create_time >= $1 AND create_time < $2 %s
		GROUP BY label
		ORDER BY label
	`, scopeFilter), startMs, endMs)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tb model.TimeBucket
			rows.Scan(&tb.Label, &tb.Count)
			resp.ConversationVolume = append(resp.ConversationVolume, tb)
		}
	}

	// 4. Time distribution (by hour, Beijing)
	rows, err = repository.DB.Query(fmt.Sprintf(`
		SELECT EXTRACT(HOUR FROM to_timestamp(create_time / 1000.0) AT TIME ZONE 'Asia/Shanghai')::int AS hour,
		       COUNT(*)::int AS count
		FROM wecom_messages
		WHERE create_time >= $1 AND create_time < $2 %s
		GROUP BY hour
		ORDER BY hour
	`, scopeFilter), startMs, endMs)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var hb model.HourBucket
			rows.Scan(&hb.Hour, &hb.Count)
			resp.TimeDistribution = append(resp.TimeDistribution, hb)
		}
	}

	return resp
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/jixin/CODE/TaishanXD2/server && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/internal/handler/analytics.go
git commit -m "feat: add analytics handler with filtered SQL queries"
```

---

### Task 3: Backend — Register Analytics Route

**Files:**
- Modify: `server/internal/handler/handler.go` (inside `RegisterRoutes` function, around line 26)

- [ ] **Step 1: Add analytics route to RegisterRoutes**

In `server/internal/handler/handler.go`, add this line inside the `RegisterRoutes` function, after line 28 (`r.POST("/api/auth/logout", logout)`):

```go
		r.GET("/api/analytics/usage", getAnalytics)
```

The function should look like:

```go
func RegisterRoutes(r *gin.Engine, sessionKey string) {
	r.GET("/api/health", healthCheck)
	r.GET("/api/system/info", systemInfo)
	r.POST("/api/auth/login", login(sessionKey))
	r.POST("/api/auth/logout", logout)
	r.GET("/api/analytics/usage", getAnalytics)

	auth := r.Group("/api")
	auth.Use(middleware.AuthRequired())
	{
		auth.GET("/auth/session", currentSession)
	}
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/jixin/CODE/TaishanXD2/server && go build ./...`
Expected: no errors

- [ ] **Step 3: Manual test — start server and curl**

Run: `cd /Users/jixin/CODE/TaishanXD2/server && go run cmd/server/main.go` (in background)

Then test:
```bash
curl -s "http://localhost:4007/api/analytics/usage?channel=wecom&time_range=yesterday&chat_scope=private" | python3 -m json.tool
```

Expected: JSON with `userConversations`, `userTokens`, `conversationVolume`, `timeDistribution` arrays (may be empty if no data in the time range).

Test with "last_week":
```bash
curl -s "http://localhost:4007/api/analytics/usage?channel=wecom&time_range=last_week&chat_scope=all" | python3 -m json.tool
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/handler.go
git commit -m "feat: register analytics usage route"
```

---

### Task 4: Frontend — Install recharts

**Files:**
- Modify: `web/package.json` (via npm)

- [ ] **Step 1: Install recharts**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && npm install recharts`

- [ ] **Step 2: Verify installation**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && grep recharts package.json`
Expected: `"recharts": "^2.x.x"` in dependencies

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat: add recharts dependency"
```

---

### Task 5: Frontend — Add Analytics Types and API Function

**Files:**
- Modify: `web/src/lib/api.ts` (append after line 79)

- [ ] **Step 1: Add analytics types and fetch function**

Append after the `KefuMessage` interface (after line 79) in `web/src/lib/api.ts`:

```typescript
// --- Analytics ---

export interface UserCount {
  userId: string;
  count: number;
}

export interface UserToken {
  userId: string;
  tokens: number;
}

export interface TimeBucket {
  label: string;
  count: number;
}

export interface HourBucket {
  hour: number;
  count: number;
}

export interface AnalyticsData {
  userConversations: UserCount[];
  userTokens: UserToken[];
  conversationVolume: TimeBucket[];
  timeDistribution: HourBucket[];
}

export interface AnalyticsParams {
  channel: string;
  timeRange: string;
  chatScope: string;
  startDate?: string;
  endDate?: string;
}

export async function fetchAnalytics(params: AnalyticsParams): Promise<AnalyticsData> {
  const qs = new URLSearchParams({
    channel: params.channel,
    time_range: params.timeRange,
    chat_scope: params.chatScope,
  });
  if (params.startDate) qs.set("start_date", params.startDate);
  if (params.endDate) qs.set("end_date", params.endDate);

  return api<AnalyticsData>(`/api/analytics/usage?${qs.toString()}`);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no type errors related to analytics types (other existing errors may exist, that's OK)

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat: add analytics types and fetchAnalytics function"
```

---

### Task 6: Frontend — Implement Analytics Page with 4 Charts

**Files:**
- Rewrite: `web/src/app/dashboard/analytics/page.tsx`

This is the main frontend task. Replace the entire file with a new implementation that:
1. Reads filter state from AppContext (channel, timeRange, chatScope, customDateRange)
2. Fetches analytics data when filters change
3. Renders 4 recharts BarChart components in a 2x2 grid
4. Falls back to mock empty data for dingtalk/feishu

- [ ] **Step 1: Rewrite analytics page**

Replace the entire content of `web/src/app/dashboard/analytics/page.tsx` with:

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { Row, Col, Spin, Empty } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useApp } from "@/lib/AppContext";
import {
  fetchAnalytics,
  type AnalyticsData,
  type UserCount,
  type UserToken,
  type TimeBucket,
  type HourBucket,
} from "@/lib/api";

const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#c4b5fd",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#10b981",
  "#34d399",
  "#6ee7b7",
  "#f59e0b",
  "#fbbf24",
  "#f97316",
  "#fb923c",
  "#ef4444",
  "#f87171",
  "#ec4899",
  "#f472b6",
  "#14b8a6",
  "#2dd4bf",
];

function ChartCard({
  title,
  children,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  delay: string;
}) {
  return (
    <div
      className="unified-card p-6 animate-slide-up"
      style={{ animationDelay: delay }}
    >
      <span className="text-sm font-semibold text-[var(--color-text-primary)] block mb-5">
        {title}
      </span>
      {children}
    </div>
  );
}

function UserConversationChart({ data }: { data: UserCount[] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Empty description="暂无数据" />
      </div>
    );
  }
  const displayData = data.map((d) => ({
    ...d,
    label: d.userId.length > 10 ? d.userId.slice(0, 10) + "…" : d.userId,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={displayData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`${value} 条`, "会话数"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {displayData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function UserTokenChart({ data }: { data: UserToken[] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Empty description="暂无数据" />
      </div>
    );
  }
  const displayData = data.map((d) => ({
    ...d,
    label: d.userId.length > 10 ? d.userId.slice(0, 10) + "…" : d.userId,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={displayData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`${value} tokens`, "Token 消耗"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="tokens" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {displayData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function VolumeChart({ data }: { data: TimeBucket[] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Empty description="暂无数据" />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          angle={data.length > 15 ? -45 : 0}
          textAnchor={data.length > 15 ? "end" : "middle"}
          height={data.length > 15 ? 70 : 40}
        />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`${value} 条`, "对话量"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TimeDistChart({ data }: { data: HourBucket[] }) {
  const filled = useMemo(() => {
    const map = new Map(data.map((d) => [d.hour, d.count]));
    const result: { hour: number; count: number; label: string }[] = [];
    for (let h = 0; h < 24; h++) {
      result.push({ hour: h, count: map.get(h) || 0, label: `${h}:00` });
    }
    return result;
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={filled} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`${value} 条`, "消息数"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const emptyData: AnalyticsData = {
  userConversations: [],
  userTokens: [],
  conversationVolume: [],
  timeDistribution: [],
};

export default function AnalyticsPage() {
  const { channel, timeRange, chatScope, customDateRange } = useApp();
  const [data, setData] = useState<AnalyticsData>(emptyData);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (channel !== "wecom") {
      setData(emptyData);
      return;
    }

    setLoading(true);
    fetchAnalytics({
      channel,
      timeRange,
      chatScope,
      startDate: timeRange === "custom" && customDateRange ? customDateRange[0] : undefined,
      endDate: timeRange === "custom" && customDateRange ? customDateRange[1] : undefined,
    })
      .then(setData)
      .catch(() => setData(emptyData))
      .finally(() => setLoading(false));
  }, [channel, timeRange, chatScope, customDateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#8b5cf6] flex items-center justify-center">
            <BarChartOutlined className="text-white text-sm" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-tight">
              使用分析
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">数据统计与趋势概览</p>
          </div>
        </div>
      </div>

      <Row gutter={[20, 20]}>
        <Col span={12}>
          <ChartCard title="各用户会话数" delay="0.08s">
            <UserConversationChart data={data.userConversations} />
          </ChartCard>
        </Col>
        <Col span={12}>
          <ChartCard title="各用户总 Token 消耗" delay="0.14s">
            <UserTokenChart data={data.userTokens} />
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        <Col span={12}>
          <ChartCard title="总对话量" delay="0.22s">
            <VolumeChart data={data.conversationVolume} />
          </ChartCard>
        </Col>
        <Col span={12}>
          <ChartCard title="使用时段分布（北京时间）" delay="0.28s">
            <TimeDistChart data={data.timeDistribution} />
          </ChartCard>
        </Col>
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: no type errors in analytics page

- [ ] **Step 3: Start dev server and visually verify**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && npm run dev`

Open http://localhost:3000/dashboard/analytics in browser. Verify:
- 4 chart cards render in 2x2 grid
- Charts show "暂无数据" when no data (or show bars if database has data in the selected time range)
- Changing the header filters (time range, chat scope) triggers re-fetch
- Charts update when data loads

- [ ] **Step 4: Commit**

```bash
git add web/src/app/dashboard/analytics/page.tsx
git commit -m "feat: implement 4 analytics bar charts with filter-driven data"
```

---

### Task 7: Update Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add new API route to the API table**

In `CLAUDE.md`, add this row to the API 路由 table (after the existing analytics-related routes):

```markdown
| GET | `/api/analytics/usage` | 否 | 使用分析聚合数据（按渠道/时间/聊天类型筛选，返回 4 组图表数据） |
```

- [ ] **Step 2: Update the 目录结构 section**

Add `server/internal/handler/analytics.go` to the directory structure under the handler section, after the existing handler files. Add this line:

```
│   │   ├── handler/analytics.go          # 使用分析 API（聚合查询：会话数/Token/对话量/时段分布）
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with analytics API route and handler"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 4 charts specified (user conversations, user tokens, conversation volume, time distribution) are implemented in Task 2 (backend) and Task 6 (frontend)
- [x] **Filter integration:** channel + timeRange + chatScope filters are wired from AppContext → API params → SQL WHERE clauses
- [x] **Placeholder scan:** No TBD/TODO/placeholders — every step has complete code
- [x] **Type consistency:** Backend `AnalyticsResponse` fields match frontend `AnalyticsData` interface names (camelCase via json tags)
- [x] **Table mapping:** private → wecom_kefu_messages, group/all → wecom_messages, dingtalk/feishu → empty response
- [x] **Time handling:** Backend uses Asia/Shanghai timezone for all time calculations; kefu_messages uses TIMESTAMP, wecom_messages uses millisecond epoch
