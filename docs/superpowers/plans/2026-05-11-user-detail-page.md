# User Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user detail page accessible from the user list, showing profile, per-user stats, session list, and full chat history in a two-column layout.

**Architecture:** New Next.js dynamic route `/dashboard/users/[id]` fetches user info, stats, and sessions from two new Go API endpoints. Left panel shows profile + stats + session list; right panel shows chat messages. Session clicks filter the right panel.

**Tech Stack:** Go/Gin (backend), Next.js 16 App Router + React 19 + Ant Design 6 + Tailwind CSS 4 (frontend)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `server/internal/model/models.go` | Add `UserStatsResponse`, `UserSession` models |
| Modify | `server/internal/handler/analytics.go` | Add `getUserStats`, `getUserSessions` handlers |
| Modify | `server/internal/handler/handler.go` | Register two new routes |
| Modify | `web/src/lib/api.ts` | Add `UserStats`, `UserSession` types and fetch functions |
| Create | `web/src/app/dashboard/users/[id]/page.tsx` | User detail page (two-column layout) |
| Modify | `web/src/app/globals.css` | Add detail page animations |
| Modify | `web/src/app/dashboard/users/page.tsx` | Replace Drawer with navigation to detail page |
| Modify | `CLAUDE.md` | Update API routes table and directory structure |

---

### Task 1: Add Backend Models

**Files:**
- Modify: `server/internal/model/models.go` (append after `AnalyticsResponse`)

- [ ] **Step 1: Add UserStatsResponse and UserSession structs**

Append to `server/internal/model/models.go` after the `AnalyticsResponse` struct:

```go
type UserStatsResponse struct {
	ConversationCount int `json:"conversationCount"`
	TokenUsage        int `json:"tokenUsage"`
}

type UserSession struct {
	SessionID    string `json:"sessionId"`
	FirstMessage string `json:"firstMessage"`
	MessageCount int    `json:"messageCount"`
	StartTime    string `json:"startTime"`
	LastTime     string `json:"lastTime"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/jixin/CODE/TaishanXD2/server && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/internal/model/models.go
git commit -m "feat: add UserStatsResponse and UserSession models for user detail page"
```

---

### Task 2: Add getUserStats Handler

**Files:**
- Modify: `server/internal/handler/analytics.go` (append at end)

- [ ] **Step 1: Add getUserStats handler**

Append to `server/internal/handler/analytics.go`:

```go
func getUserStats(c *gin.Context) {
	userID := c.Query("user_id")
	mode := c.Query("mode")
	if userID == "" || mode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id and mode are required"})
		return
	}

	start, end, err := resolveTimeRange(
		c.DefaultQuery("time_range", "yesterday"),
		c.Query("start_date"),
		c.Query("end_date"),
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var resp model.UserStatsResponse

	if mode == "kefu" {
		resp = kefuUserStats(userID, start, end)
	} else {
		resp = orgUserStats(userID, start, end)
	}

	c.JSON(http.StatusOK, resp)
}

func kefuUserStats(externalUserID string, start, end time.Time) model.UserStatsResponse {
	var resp model.UserStatsResponse
	repository.DB.QueryRow(`
		SELECT COUNT(*)::int, COALESCE(SUM(LENGTH(content::text)), 0)::int / 2
		FROM wecom_kefu_messages
		WHERE external_userid = $1 AND created_at >= $2 AND created_at < $3
	`, externalUserID, start, end).Scan(&resp.ConversationCount, &resp.TokenUsage)
	return resp
}

func orgUserStats(mongoUserID string, start, end time.Time) model.UserStatsResponse {
	var resp model.UserStatsResponse

	objID, err := bson.ObjectIDFromHex(mongoUserID)
	if err != nil {
		return resp
	}

	var user model.UserDoc
	if err := repository.UsersColl().FindOne(
		context.Background(),
		bson.M{"_id": objID},
	).Decode(&user); err != nil {
		return resp
	}

	var kefuID string
	var wecomID string
	for _, b := range user.ChannelBindings {
		if b.Platform == "wecom_kefu" {
			kefuID = b.PlatformUserID
		}
		if b.Platform == "wecom" {
			wecomID = b.PlatformUserID
		}
	}

	if kefuID != "" {
		return kefuUserStats(kefuID, start, end)
	}

	if wecomID != "" {
		startMs := start.UnixMilli()
		endMs := end.UnixMilli()
		repository.DB.QueryRow(`
			SELECT COUNT(*)::int, COALESCE(SUM(LENGTH(content)), 0)::int / 2
			FROM wecom_messages
			WHERE sender_id = $1 AND create_time >= $2 AND create_time < $3
		`, wecomID, startMs, endMs).Scan(&resp.ConversationCount, &resp.TokenUsage)
	}

	return resp
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/jixin/CODE/TaishanXD2/server && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/internal/handler/analytics.go
git commit -m "feat: add getUserStats handler for per-user statistics"
```

---

### Task 3: Add getUserSessions Handler

**Files:**
- Modify: `server/internal/handler/analytics.go` (append after `orgUserStats`)

- [ ] **Step 1: Add getUserSessions handler**

Append to `server/internal/handler/analytics.go`:

```go
func getUserSessions(c *gin.Context) {
	userID := c.Query("user_id")
	mode := c.Query("mode")
	if userID == "" || mode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id and mode are required"})
		return
	}

	start, end, err := resolveTimeRange(
		c.DefaultQuery("time_range", "yesterday"),
		c.Query("start_date"),
		c.Query("end_date"),
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var sessions []model.UserSession

	if mode == "kefu" {
		sessions = kefuUserSessions(userID, start, end)
	} else {
		sessions = orgUserSessions(userID, start, end)
	}

	if sessions == nil {
		sessions = []model.UserSession{}
	}
	c.JSON(http.StatusOK, sessions)
}

func parseKefuText(raw string) string {
	var obj struct {
		Text struct {
			Content string `json:"content"`
		} `json:"text"`
	}
	if err := json.Unmarshal([]byte(raw), &obj); err == nil && obj.Text.Content != "" {
		return obj.Text.Content
	}
	var obj2 struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal([]byte(raw), &obj2); err == nil && obj2.Text != "" {
		return obj2.Text
	}
	return raw
}

func kefuUserSessions(externalUserID string, start, end time.Time) []model.UserSession {
	rows, err := repository.DB.Query(`
		SELECT id, content::text, created_at
		FROM wecom_kefu_messages
		WHERE external_userid = $1 AND direction = 'received' AND created_at >= $2 AND created_at < $3
		ORDER BY created_at ASC
	`, externalUserID, start, end)
	if err != nil {
		log.Printf("kefuUserSessions query error: %v", err)
		return nil
	}
	defer rows.Close()

	type msgRow struct {
		ID        int
		Content   string
		CreatedAt time.Time
	}
	var msgs []msgRow
	for rows.Next() {
		var m msgRow
		if err := rows.Scan(&m.ID, &m.Content, &m.CreatedAt); err != nil {
			continue
		}
		msgs = append(msgs, m)
	}
	if len(msgs) == 0 {
		return nil
	}

	var sessions []model.UserSession
	groupStart := msgs[0].CreatedAt
	groupLast := msgs[0].CreatedAt
	groupFirstMsg := parseKefuText(msgs[0].Content)
	groupCount := 1

	for i := 1; i < len(msgs); i++ {
		if msgs[i].CreatedAt.Sub(groupLast) > 30*time.Minute {
			sessions = append(sessions, model.UserSession{
				SessionID:    fmt.Sprintf("kefu-%d", msgs[i-1].ID),
				FirstMessage: groupFirstMsg,
				MessageCount: groupCount,
				StartTime:    groupStart.Format(time.RFC3339),
				LastTime:     groupLast.Format(time.RFC3339),
			})
			groupStart = msgs[i].CreatedAt
			groupFirstMsg = parseKefuText(msgs[i].Content)
			groupCount = 1
		} else {
			groupCount++
		}
		groupLast = msgs[i].CreatedAt
	}
	sessions = append(sessions, model.UserSession{
		SessionID:    fmt.Sprintf("kefu-%d", msgs[len(msgs)-1].ID),
		FirstMessage: groupFirstMsg,
		MessageCount: groupCount,
		StartTime:    groupStart.Format(time.RFC3339),
		LastTime:     groupLast.Format(time.RFC3339),
	})

	return sessions
}

func orgUserSessions(mongoUserID string, start, end time.Time) []model.UserSession {
	objID, err := bson.ObjectIDFromHex(mongoUserID)
	if err != nil {
		return nil
	}

	var user model.UserDoc
	if err := repository.UsersColl().FindOne(
		context.Background(),
		bson.M{"_id": objID},
	).Decode(&user); err != nil {
		return nil
	}

	var kefuID string
	for _, b := range user.ChannelBindings {
		if b.Platform == "wecom_kefu" {
			kefuID = b.PlatformUserID
		}
	}

	if kefuID != "" {
		return kefuUserSessions(kefuID, start, end)
	}

	return nil
}
```

Also add `"encoding/json"` to the imports at the top of `analytics.go` if not already present. The current imports are:

```go
import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mmongo-driver/v2/bson"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)
```

Add `"encoding/json"` to this import block.

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/jixin/CODE/TaishanXD2/server && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/internal/handler/analytics.go
git commit -m "feat: add getUserSessions handler with 30-min gap grouping"
```

---

### Task 4: Register New Routes

**Files:**
- Modify: `server/internal/handler/handler.go` (in `RegisterRoutes` function)

- [ ] **Step 1: Add two new route registrations**

In `server/internal/handler/handler.go`, in the `RegisterRoutes` function, add these two lines after the `r.GET("/api/analytics/usage", getAnalytics)` line:

```go
		r.GET("/api/analytics/user-stats", getUserStats)
		r.GET("/api/analytics/user-sessions", getUserSessions)
```

The `RegisterRoutes` function should become:

```go
func RegisterRoutes(r *gin.Engine, sessionKey string) {
	r.GET("/api/health", healthCheck)
	r.GET("/api/system/info", systemInfo)
	r.POST("/api/auth/login", login(sessionKey))
	r.POST("/api/auth/logout", logout)
	r.GET("/api/analytics/usage", getAnalytics)
	r.GET("/api/analytics/user-stats", getUserStats)
	r.GET("/api/analytics/user-sessions", getUserSessions)
	RegisterAnalysisProxyRoutes(r)

	auth := r.Group("/api")
	auth.Use(middleware.AuthRequired())
	{
		auth.GET("/auth/session", currentSession)
	}
}
```

- [ ] **Step 2: Verify compilation and run**

Run: `cd /Users/jixin/CODE/TaishanXD2/server && go build ./...`
Expected: no errors

Then verify the routes exist: `cd /Users/jixin/CODE/TaishanXD2/server && go run cmd/server/main.go &` and `curl http://localhost:4007/api/analytics/user-stats` — should return `{"error":"user_id and mode are required"}`.

- [ ] **Step 3: Commit**

```bash
git add server/internal/handler/handler.go
git commit -m "feat: register user-stats and user-sessions API routes"
```

---

### Task 5: Add Frontend API Types and Fetch Functions

**Files:**
- Modify: `web/src/lib/api.ts` (append at end)

- [ ] **Step 1: Add TypeScript types and fetch functions**

Append to `web/src/lib/api.ts`:

```typescript
// --- User Detail ---

export interface UserStats {
  conversationCount: number;
  tokenUsage: number;
}

export interface UserSession {
  sessionId: string;
  firstMessage: string;
  messageCount: number;
  startTime: string;
  lastTime: string;
}

export interface UserStatsParams {
  user_id: string;
  mode: string;
  time_range: string;
  start_date?: string;
  end_date?: string;
}

export async function fetchUserStats(params: UserStatsParams): Promise<UserStats> {
  const qs = new URLSearchParams({
    user_id: params.user_id,
    mode: params.mode,
    time_range: params.time_range,
  });
  if (params.start_date) qs.set("start_date", params.start_date);
  if (params.end_date) qs.set("end_date", params.end_date);

  return api<UserStats>(`/api/analytics/user-stats?${qs.toString()}`);
}

export async function fetchUserSessions(params: UserStatsParams): Promise<UserSession[]> {
  const qs = new URLSearchParams({
    user_id: params.user_id,
    mode: params.mode,
    time_range: params.time_range,
  });
  if (params.start_date) qs.set("start_date", params.start_date);
  if (params.end_date) qs.set("end_date", params.end_date);

  return api<UserSession[]>(`/api/analytics/user-sessions?${qs.toString()}`);
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat: add UserStats, UserSession types and fetch functions"
```

---

### Task 6: Create User Detail Page — Base Structure and Left Panel

**Files:**
- Create: `web/src/app/dashboard/users/[id]/page.tsx`

- [ ] **Step 1: Create the detail page with full left panel and right panel shell**

Create `web/src/app/dashboard/users/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Input, Empty, Tag } from "antd";
import {
  ArrowLeftOutlined,
  SearchOutlined,
  ManOutlined,
  WomanOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { useApp } from "@/lib/AppContext";
import {
  api,
  fetchUserStats,
  fetchUserSessions,
  type KefuMessage,
  type UserStats,
  type UserSession,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────

interface OrgUserInfo {
  id: string;
  name: string;
  username: string;
  role: string;
  avatar: string;
  phone: string;
  email: string;
  channelBindings: { platform: string; platformUserId: string; platformUserName: string }[];
}

interface KefuCustomerInfo {
  externalUserId: string;
  nickname: string;
  avatar: string;
  gender: string;
}

// ── Helpers ────────────────────────────────────────────────────

function parseKefuContent(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    if (obj.text?.content) return obj.text.content;
    if (obj.voice) return "[语音消息]";
    if (obj.image) return "[图片]";
    if (obj.event) return "[进入会话]";
    if (typeof obj.text === "string") return obj.text;
    return raw;
  } catch {
    return raw;
  }
}

function highlightText(text: string, keyword: string) {
  if (!keyword) return text;
  const parts = text.split(keyword);
  return parts.map((part, i) =>
    i < parts.length - 1 ? (
      <span key={i}>
        {part}
        <mark className="bg-yellow-200 text-[var(--color-text-primary)] rounded px-0.5">
          {keyword}
        </mark>
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatRelativeTime(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "昨天";
  if (diffDay < 7) return `${diffDay}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── CountUp Hook ───────────────────────────────────────────────

function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

// ── Skeleton ───────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--color-neutral-100)] rounded-lg ${className}`} />;
}

// ── Main Page ──────────────────────────────────────────────────

export default function UserDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { timeRange, customDateRange } = useApp();

  const userId = params.id as string;
  const mode = searchParams.get("mode") || "kefu";

  const [userInfo, setUserInfo] = useState<OrgUserInfo | KefuCustomerInfo | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<UserSession | null>(null);
  const [messages, setMessages] = useState<KefuMessage[]>([]);
  const [msgSearch, setMsgSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);

  const conversationCount = useCountUp(stats?.conversationCount || 0);
  const tokenUsage = useCountUp(stats?.tokenUsage || 0);

  const displayName = useMemo(() => {
    if (!userInfo) return "";
    if ("nickname" in userInfo) return userInfo.nickname || "客户";
    return userInfo.name;
  }, [userInfo]);

  const displayAvatar = useMemo(() => {
    if (!userInfo) return "";
    if ("nickname" in userInfo) return userInfo.avatar;
    return (userInfo as OrgUserInfo).avatar || "";
  }, [userInfo]);

  const gender = useMemo(() => {
    if (!userInfo || !("gender" in userInfo)) return "";
    return (userInfo as KefuCustomerInfo).gender;
  }, [userInfo]);

  const kefuExternalId = useMemo(() => {
    if (mode === "kefu") return userId;
    if (!userInfo || !("channelBindings" in userInfo)) return "";
    const binding = (userInfo as OrgUserInfo).channelBindings?.find(
      (b) => b.platform === "wecom_kefu"
    );
    return binding?.platformUserId || "";
  }, [mode, userId, userInfo]);

  // Fetch user info
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    if (mode === "kefu") {
      api<KefuCustomerInfo[]>("/api/wecom/kefu-customers")
        .then((customers) => {
          const found = customers.find((c) => c.externalUserId === userId);
          setUserInfo(found || null);
        })
        .catch(() => setUserInfo(null))
        .finally(() => setLoading(false));
    } else {
      api<OrgUserInfo>(`/api/org/users/${userId}`)
        .then(setUserInfo)
        .catch(() => setUserInfo(null))
        .finally(() => setLoading(false));
    }
  }, [userId, mode]);

  // Fetch stats and sessions
  const fetchStatsAndSessions = useCallback(() => {
    if (!userId) return;

    const statsParams = {
      user_id: userId,
      mode,
      time_range: timeRange,
      ...(timeRange === "custom" && customDateRange
        ? { start_date: customDateRange[0], end_date: customDateRange[1] }
        : {}),
    };

    fetchUserStats(statsParams).then(setStats).catch(() => setStats(null));
    fetchUserSessions(statsParams)
      .then((s) => {
        setSessions(s);
        setSelectedSession(s.length > 0 ? s[0] : null);
      })
      .catch(() => setSessions([]));
  }, [userId, mode, timeRange, customDateRange]);

  useEffect(() => {
    fetchStatsAndSessions();
  }, [fetchStatsAndSessions]);

  // Fetch messages for selected session
  useEffect(() => {
    if (!kefuExternalId) {
      setMessages([]);
      return;
    }

    setMsgLoading(true);
    const params = new URLSearchParams({ external_userid: kefuExternalId });

    if (selectedSession) {
      params.set("start_time", selectedSession.startTime);
      params.set("end_time", selectedSession.lastTime);
    } else if (timeRange === "custom" && customDateRange) {
      params.set("start_time", new Date(customDateRange[0]).toISOString());
      params.set("end_time", new Date(customDateRange[1]).toISOString());
    } else {
      const now = new Date();
      let start: Date;
      if (timeRange === "yesterday") {
        start = new Date(now);
        start.setDate(start.getDate() - 1);
      } else if (timeRange === "last_week") {
        start = new Date(now);
        start.setDate(start.getDate() - 7);
      } else {
        start = new Date(now);
        start.setDate(start.getDate() - 30);
      }
      start.setHours(0, 0, 0, 0);
      params.set("start_time", start.toISOString());
    }

    api<KefuMessage[]>(`/api/wecom/kefu-messages?${params}`)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false));
  }, [kefuExternalId, selectedSession, timeRange, customDateRange]);

  const filteredMessages = useMemo(
    () =>
      msgSearch
        ? messages.filter((m) => parseKefuContent(m.content).includes(msgSearch))
        : messages,
    [messages, msgSearch]
  );

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="animate-detail-enter" style={{ height: "calc(100vh - var(--topbar-height) - 48px)", display: "flex", gap: 16 }}>
      {/* Left Panel */}
      <div
        className="unified-card animate-stagger-1"
        style={{
          width: "35%",
          minWidth: 280,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: 20,
        }}
      >
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="detail-back-btn flex items-center gap-2 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mb-5 transition-colors"
        >
          <ArrowLeftOutlined className="detail-back-arrow transition-transform" />
          <span>返回用户明细</span>
        </button>

        {loading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Skeleton className="w-16 h-16 rounded-full" />
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-16 h-3" />
          </div>
        ) : (
          <>
            {/* Avatar + Name */}
            <div className="text-center mb-5 animate-stagger-1">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt=""
                  className="w-16 h-16 rounded-full mx-auto object-cover mb-3 ring-4 ring-[var(--color-primary-50)]"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[var(--color-primary-600)] text-white flex items-center justify-center mx-auto mb-3 text-2xl font-bold ring-4 ring-[var(--color-primary-50)]">
                  {displayName[0] || "?"}
                </div>
              )}
              <div className="text-lg font-semibold text-[var(--color-text-primary)]">
                {displayName}
              </div>
              <div className="flex items-center justify-center gap-2 mt-1">
                {"username" in (userInfo as object) && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    @{(userInfo as OrgUserInfo).username}
                  </span>
                )}
                {"role" in (userInfo as object) && (userInfo as OrgUserInfo).role && (
                  <Tag
                    color={(userInfo as OrgUserInfo).role === "super_admin" ? "red" : "default"}
                    style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", margin: 0 }}
                  >
                    {(userInfo as OrgUserInfo).role === "super_admin" ? "超管" : (userInfo as OrgUserInfo).role}
                  </Tag>
                )}
                {gender === "1" && <ManOutlined style={{ color: "#3b82f6", fontSize: 12 }} />}
                {gender === "2" && <WomanOutlined style={{ color: "#ec4899", fontSize: 12 }} />}
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-2 mb-5 animate-stagger-2">
              <div className="flex items-center justify-between bg-[#eff6ff] rounded-xl px-4 py-3">
                <span className="text-xs text-[var(--color-text-secondary)]">会话数</span>
                <span className="text-xl font-bold text-[#3b82f6] metric-font">{conversationCount}</span>
              </div>
              <div className="flex items-center justify-between bg-[#f0fdf4] rounded-xl px-4 py-3">
                <span className="text-xs text-[var(--color-text-secondary)]">Token 消耗</span>
                <span className="text-xl font-bold text-[#16a34a] metric-font">{tokenUsage.toLocaleString()}</span>
              </div>
            </div>
          </>
        )}

        {/* Session List */}
        <div className="flex-1 min-h-0 flex flex-col animate-stagger-3">
          <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            最近会话
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {sessions.length === 0 ? (
              <Empty description="暂无会话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              sessions.map((session) => (
                <button
                  key={session.sessionId}
                  onClick={() => setSelectedSession(session)}
                  className={`detail-session-item w-full text-left rounded-lg p-3 transition-all duration-150 ${
                    selectedSession?.sessionId === session.sessionId
                      ? "bg-[var(--color-primary-50)] border-l-[3px] border-l-[#3b82f6]"
                      : "bg-transparent hover:bg-[var(--color-bg-hover)] border-l-[3px] border-l-transparent"
                  }`}
                >
                  <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {session.firstMessage}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      {formatRelativeTime(session.startTime)}
                    </span>
                    <span className="text-[10px] bg-[#eff6ff] text-[#3b82f6] px-1.5 py-0.5 rounded">
                      {session.messageCount}条
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div
        className="unified-card flex-1 flex flex-col overflow-hidden animate-stagger-2"
        style={{ padding: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-default)]">
          <div className="flex items-center gap-2">
            <MessageOutlined className="text-[var(--color-primary-500)]" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              详细会话记录
            </span>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              共 {filteredMessages.length} 条消息
            </span>
          </div>
          <Input
            placeholder="搜索聊天内容"
            prefix={<SearchOutlined className="text-[var(--color-text-tertiary)]" />}
            value={msgSearch}
            onChange={(e) => setMsgSearch(e.target.value)}
            allowClear
            style={{ width: 200 }}
            className="!rounded-lg"
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {msgLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-3/4" />
              ))}
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Empty description={msgSearch ? "未找到匹配的消息" : "暂无聊天记录"} />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMessages.map((msg, i) => {
                const isUser = msg.direction === "received";
                const text = parseKefuContent(msg.content);

                return (
                  <div
                    key={msg.id}
                    className={`detail-msg-bubble flex ${isUser ? "justify-start" : "justify-end"}`}
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    {isUser && (
                      displayAvatar ? (
                        <img src={displayAvatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mr-2 object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary-600)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mr-2">
                          {displayName[0]}
                        </div>
                      )
                    )}
                    <div className="max-w-[75%]">
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border-secondary)] rounded-bl-sm"
                            : "bg-[#16a34a] text-white rounded-br-sm"
                        }`}
                      >
                        {msgSearch ? highlightText(text, msgSearch) : text}
                      </div>
                      <div className={`text-[10px] text-[var(--color-text-tertiary)] mt-1 ${isUser ? "ml-1" : "text-right mr-1"}`}>
                        {isUser ? displayName : "AI助手"} · {msg.createdAt}
                      </div>
                    </div>
                    {!isUser && (
                      <div className="w-8 h-8 rounded-full bg-[#16a34a] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ml-2">
                        AI
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify page compiles**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add web/src/app/dashboard/users/[id]/page.tsx
git commit -m "feat: create user detail page with two-column layout"
```

---

### Task 7: Add CSS Animations

**Files:**
- Modify: `web/src/app/globals.css` (append at end, before `/* ── Metric font`)

- [ ] **Step 1: Add detail page animations**

Append to `web/src/app/globals.css` before the `/* ── Metric font` section:

```css
/* ── User Detail Page ──────────────────────────────────── */

@keyframes detailEnter {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-detail-enter {
  animation: detailEnter 0.3s ease-out forwards;
}

/* Stagger children */
.animate-stagger-1 { animation: slideUp 0.4s ease-out 0ms forwards; opacity: 0; }
.animate-stagger-2 { animation: slideUp 0.4s ease-out 80ms forwards; opacity: 0; }
.animate-stagger-3 { animation: slideUp 0.4s ease-out 160ms forwards; opacity: 0; }

/* Back button hover */
.detail-back-btn:hover .detail-back-arrow {
  transform: translateX(-4px);
}

/* Session item */
.detail-session-item {
  border: none;
  cursor: pointer;
  outline: none;
}

/* Message bubble entrance */
@keyframes msgSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.detail-msg-bubble {
  animation: msgSlideIn 0.3s ease-out forwards;
  opacity: 0;
}

/* Responsive: stack on mobile */
@media (max-width: 768px) {
  .animate-detail-enter {
    flex-direction: column !important;
    height: auto !important;
  }
  .animate-detail-enter > div:first-child {
    width: 100% !important;
    min-width: unset !important;
    max-height: 300px;
  }
}
```

- [ ] **Step 2: Verify no CSS syntax errors**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && npm run build 2>&1 | head -20`
Expected: build succeeds or only shows expected warnings

- [ ] **Step 3: Commit**

```bash
git add web/src/app/globals.css
git commit -m "feat: add user detail page animations and responsive styles"
```

---

### Task 8: Update User List Page — Navigate to Detail

**Files:**
- Modify: `web/src/app/dashboard/users/page.tsx`

- [ ] **Step 1: Add router import**

At the top of `web/src/app/dashboard/users/page.tsx`, add `useRouter` to the import from `"next/navigation"`:

Change:
```tsx
import { useEffect, useState, useCallback } from "react";
```

No change needed for next/navigation — the file doesn't import it yet. Add:

```tsx
import { useRouter } from "next/navigation";
```

after the existing imports.

- [ ] **Step 2: Add router and navigation function**

Inside the `UsersPage` component, after `const { companyId, channel, timeRange, customDateRange } = useApp();`, add:

```tsx
const router = useRouter();
```

- [ ] **Step 3: Replace ChatDrawer with navigation in kefu columns**

In the `kefuColumns` definition, change the "操作" column render function from:

```tsx
{
  title: "操作",
  width: 100,
  fixed: "right",
  render: (_: unknown, record: KefuCustomer) => (
    <Button
      type="link"
      size="small"
      icon={<MessageOutlined />}
      onClick={() => openChat({
        externalUserId: record.externalUserId,
        name: record.nickname || "客户",
        avatar: record.avatar,
      })}
    >
      聊天记录
    </Button>
  ),
},
```

to:

```tsx
{
  title: "操作",
  width: 100,
  fixed: "right",
  render: (_: unknown, record: KefuCustomer) => (
    <Button
      type="link"
      size="small"
      icon={<MessageOutlined />}
      onClick={() => router.push(`/dashboard/users/${record.externalUserId}?mode=kefu`)}
    >
      查看详情
    </Button>
  ),
},
```

- [ ] **Step 4: Replace ChatDrawer with navigation in org columns**

In the `orgColumns` definition, change the "操作" column render function from:

```tsx
{
  title: "操作",
  width: 100,
  fixed: "right",
  render: (_: unknown, record: OrgUser) => {
    const binding = getKefuBinding(record);
    return binding ? (
      <Button
        type="link"
        size="small"
        icon={<MessageOutlined />}
        onClick={() => openChat({
          externalUserId: binding.platformUserId,
          name: record.name || "客户",
        })}
      >
        聊天记录
      </Button>
    ) : (
      <span className="text-xs text-[var(--color-text-tertiary)]">未绑定</span>
    );
  },
},
```

to:

```tsx
{
  title: "操作",
  width: 100,
  fixed: "right",
  render: (_: unknown, record: OrgUser) => (
    <Button
      type="link"
      size="small"
      icon={<MessageOutlined />}
      onClick={() => router.push(`/dashboard/users/${record.id}?mode=org`)}
    >
      查看详情
    </Button>
  ),
},
```

- [ ] **Step 5: Remove ChatDrawer and related state**

Remove the following from the component:
- The `ChatTarget` interface (lines ~77-81)
- The entire `ChatDrawer` function component (lines ~83-224)
- The `chatTarget` and `drawerOpen` state declarations: `const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);` and `const [drawerOpen, setDrawerOpen] = useState(false);`
- The `openChat` callback function
- The `<ChatDrawer>` JSX at the bottom of the return
- The unused `CloseOutlined` icon import

Remove the `Drawer` import from antd imports. Remove unused antd imports: `Drawer`.

The final antd import should be:
```tsx
import {
  Table,
  Input,
  Space,
  Spin,
  Button,
  Empty,
  Tag,
  Checkbox,
} from "antd";
```

Remove `parseKefuContent` and `highlightText` helper functions since they are now only used in the detail page.

- [ ] **Step 6: Verify page compiles**

Run: `cd /Users/jixin/CODE/TaishanXD2/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add web/src/app/dashboard/users/page.tsx
git commit -m "feat: replace ChatDrawer with navigation to user detail page"
```

---

### Task 9: Update Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update API routes table**

Add these two rows to the API routes table in `CLAUDE.md`:

```markdown
| GET    | `/api/analytics/user-stats`              | 否 | 单用户统计数据（会话数、Token消耗）|
| GET    | `/api/analytics/user-sessions`            | 否 | 用户会话分组列表（按30分钟间隔分割）|
```

- [ ] **Step 2: Update directory structure**

In the directory structure section, update the `web/src/app/dashboard/` tree to include the new route:

```
│   │   │   ├── users/
│   │   │   │   ├── page.tsx           # 用户明细（表格 + 搜索）
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx       # 用户详情（双栏布局：统计+会话+聊天记录）
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with user detail page routes and structure"
```

---

### Task 10: Integration Test

**Files:** None — manual verification

- [ ] **Step 1: Start the full stack**

Run: `cd /Users/jixin/CODE/TaishanXD2 && docker compose up -d`

- [ ] **Step 2: Verify backend APIs**

```bash
# Test user-stats
curl "http://localhost:4007/api/analytics/user-stats?user_id=test&mode=kefu&time_range=yesterday"
# Expected: {"conversationCount":0,"tokenUsage":0}

# Test user-sessions
curl "http://localhost:4007/api/analytics/user-sessions?user_id=test&mode=kefu&time_range=yesterday"
# Expected: []
```

- [ ] **Step 3: Verify frontend navigation**

1. Open http://localhost:3000/dashboard/users
2. Switch to 客服客户 mode
3. Click "查看详情" on a customer row
4. Verify: navigates to `/dashboard/users/[id]?mode=kefu`
5. Verify: left panel shows profile + stats + session list
6. Verify: right panel shows chat messages
7. Verify: click a session item → right panel updates
8. Verify: click "返回用户明细" → goes back to user list

- [ ] **Step 4: Verify animations**

1. Reload the detail page — should see fade-in + slide-from-right
2. Stats numbers should count up from 0
3. Message bubbles should stagger in
4. Hover on session items — background transition
5. Hover back button — arrow shifts left

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues found during testing"
```
