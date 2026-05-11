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
    const queryParams = new URLSearchParams({ external_userid: kefuExternalId });

    if (selectedSession) {
      queryParams.set("start_time", selectedSession.startTime);
      queryParams.set("end_time", selectedSession.lastTime);
    } else if (timeRange === "custom" && customDateRange) {
      queryParams.set("start_time", new Date(customDateRange[0]).toISOString());
      queryParams.set("end_time", new Date(customDateRange[1]).toISOString());
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
      queryParams.set("start_time", start.toISOString());
    }

    api<KefuMessage[]>(`/api/wecom/kefu-messages?${queryParams}`)
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
                {userInfo && "username" in userInfo && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    @{(userInfo as OrgUserInfo).username}
                  </span>
                )}
                {userInfo && "role" in userInfo && (userInfo as OrgUserInfo).role && (
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
