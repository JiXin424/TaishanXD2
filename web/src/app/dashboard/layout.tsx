"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Select, DatePicker, Dropdown, Tag } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
  TeamOutlined,
  BarChartOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  CommentOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import {
  AppProvider,
  useApp,
  type TimeRange,
  type ChatScope,
} from "@/lib/AppContext";

const channelConfig: Record<string, { label: string; color: string }> = {
  wecom: { label: "企业微信", color: "#07c160" },
  wecom_kefu: { label: "微信客服", color: "#07c160" },
  feishu: { label: "飞书", color: "#3370ff" },
  dingtalk: { label: "钉钉", color: "#0089ff" },
};

const menuItems = [
  { key: "/dashboard/overview", icon: <DashboardOutlined />, label: "系统概览" },
  { key: "/dashboard/insights", icon: <BarChartOutlined />, label: "分析总览" },
  { key: "/dashboard/users", icon: <TeamOutlined />, label: "用户明细" },
  { key: "/dashboard/analytics", icon: <LineChartOutlined />, label: "使用分析" },
];

function DashboardInner({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const {
    companyId,
    companyName,
    channel,
    companies,
    timeRange,
    chatScope,
    isSuperAdmin,
    user,
    stats,
    setCompanyId,
    setTimeRange,
    setChatScope,
    customDateRange,
    setCustomDateRange,
  } = useApp();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
  };

  const ch = channelConfig[channel] || channelConfig.wecom;

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg-page)" }}>
      {/* Sidebar */}
      <aside
        style={{
          position: "fixed",
          inset: "0 auto 0 0",
          zIndex: 30,
          width: collapsed ? 72 : "var(--sidebar-width)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          transition: "width var(--sidebar-transition)",
        }}
      >
        <div className="sidebar-panel">
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 12,
              padding: "8px 12px",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "var(--radius-lg)",
                background: "var(--color-primary-600)",
                color: "var(--color-text-inverse)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              泰
            </div>
            {!collapsed && (
              <div style={{ overflow: "hidden" }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    color: "var(--color-text-primary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {companyName || "泰山 XD"}
                </div>
                <div style={{ marginTop: 2 }}>
                  <Tag color={ch.color} style={{ fontSize: 10, lineHeight: "16px", padding: "0 6px", margin: 0 }}>
                    {ch.label}
                  </Tag>
                </div>
              </div>
            )}
          </div>

          {/* Nav links */}
          <nav
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "12px 4px",
              marginTop: 8,
            }}
          >
            {menuItems.map((item) => {
              const active = pathname === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.key}
                  className={`sidebar-link ${active ? "sidebar-link-active" : ""}`}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  {!collapsed && (
                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Collapse button */}
          <div style={{ flexShrink: 0, padding: "8px 4px", borderTop: "1px solid var(--color-border-subtle)" }}>
            <button
              onClick={() => setCollapsed(!collapsed)}
              style={{
                width: "100%",
                height: 36,
                border: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-lg)",
                background: "var(--color-bg-card)",
                color: "var(--color-text-tertiary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 150ms ease, color 150ms ease",
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div
        style={{
          minHeight: "100vh",
          paddingLeft: collapsed ? 72 : "var(--sidebar-width)",
          transition: "padding-left var(--sidebar-transition)",
        }}
      >
        {/* Topbar */}
        <header
          className="topbar-inner"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            height: "var(--topbar-height)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isSuperAdmin && (
              <Select
                value={companyId || undefined}
                onChange={setCompanyId}
                style={{ width: 200 }}
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="选择公司"
              />
            )}
            <Tag color={ch.color} style={{ margin: 0 }}>{ch.label}</Tag>
            <Select
              value={timeRange}
              onChange={(v: TimeRange) => setTimeRange(v)}
              style={{ width: 120 }}
              options={[
                { value: "yesterday", label: "昨天" },
                { value: "last_week", label: "上周" },
                { value: "last_month", label: "上月" },
                { value: "custom", label: "自定义" },
              ]}
            />
            {timeRange === "custom" && (
              <DatePicker.RangePicker
                size="middle"
                onChange={(_, dateStrings) =>
                  setCustomDateRange(dateStrings as [string, string])
                }
                style={{ width: 260 }}
              />
            )}
            {channel !== "wecom_kefu" && (
              <Select
                value={chatScope}
                onChange={(v: ChatScope) => setChatScope(v)}
                style={{ width: 110 }}
                options={[
                  { value: "all", label: "全部聊天" },
                  { value: "group", label: "群聊" },
                  { value: "private", label: "私聊" },
                ]}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
                <TeamOutlined style={{ color: "var(--color-primary-500)" }} />
                <span>{stats.totalUsers} 人</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
                <MessageOutlined style={{ color: "var(--color-primary-500)" }} />
                <span>{stats.totalMessages} 消息</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
                <CommentOutlined style={{ color: "var(--color-primary-500)" }} />
                <span>{stats.totalChats} 会话</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-full)",
                  transition: "background-color 150ms ease",
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "var(--color-primary-600)",
                    color: "var(--color-text-inverse)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  <UserOutlined />
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {user?.displayName || "用户"}
                </span>
              </div>
            </Dropdown>
          </div>
        </header>

        {/* Content */}
        <main
          style={{
            padding: 24,
            paddingBottom: 112,
            minHeight: "calc(100vh - var(--topbar-height))",
            overflowY: "auto",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <DashboardInner>{children}</DashboardInner>
    </AppProvider>
  );
}
