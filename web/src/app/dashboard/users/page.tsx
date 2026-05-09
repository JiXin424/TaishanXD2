"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Space,
  Spin,
  Button,
  Drawer,
  Empty,
  Tag,
  Checkbox,
} from "antd";
import {
  SearchOutlined,
  TeamOutlined,
  MessageOutlined,
  ManOutlined,
  WomanOutlined,
  DownloadOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useApp } from "@/lib/AppContext";
import { api, type KefuMessage, type KefuCustomer } from "@/lib/api";

// ── Shared types ──────────────────────────────────────────────────

interface OrgUser {
  id: string;
  name: string;
  username: string;
  role: string;
  phone: string;
  email: string;
  avatar: string;
  status: string;
  channelBindings: { platform: string; platformUserId: string; platformUserName: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────

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

// ── ChatDrawer (works for both OrgUser and kefu customer) ─────────

interface ChatTarget {
  externalUserId: string;
  name: string;
  avatar?: string;
}

function ChatDrawer({
  target,
  open,
  onClose,
}: {
  target: ChatTarget | null;
  open: boolean;
  onClose: () => void;
}) {
  const { timeRange, customDateRange } = useApp();
  const [messages, setMessages] = useState<KefuMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");

  const filteredMessages = msgSearch
    ? messages.filter((m) => parseKefuContent(m.content).includes(msgSearch))
    : messages;

  useEffect(() => {
    if (!open || !target) return;
    setMsgSearch("");
    setLoading(true);

    const params = new URLSearchParams({
      external_userid: target.externalUserId,
    });

    if (timeRange === "custom" && customDateRange) {
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
      .finally(() => setLoading(false));
  }, [open, target, timeRange, customDateRange]);

  const displayName = target?.name || "客户";

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <MessageOutlined />
          <span>{displayName} 的对话</span>
        </div>
      }
      placement="right"
      size="large"
      open={open}
      onClose={onClose}
      styles={{
        body: { padding: "0 16px 16px", display: "flex", flexDirection: "column", height: "100%" },
      }}
    >
      {!target ? (
        <Empty description="未选择用户" />
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {msgSearch ? `${filteredMessages.length} / ` : ""}{messages.length} 条消息
            </span>
          </div>

          <Input
            placeholder="搜索聊天内容"
            prefix={<SearchOutlined className="text-[var(--color-text-tertiary)]" />}
            value={msgSearch}
            onChange={(e) => setMsgSearch(e.target.value)}
            allowClear
            className="!rounded-lg mb-4"
          />

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spin />
            </div>
          ) : filteredMessages.length === 0 ? (
            <Empty description={msgSearch ? "未找到匹配的消息" : "暂无聊天记录"} />
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3">
              {filteredMessages.map((msg) => {
                const isUser = msg.direction === "received";
                const text = parseKefuContent(msg.content);

                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                    {isUser && (
                      target.avatar ? (
                        <img src={target.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mr-2 object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#6b7280] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mr-2">
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
        </>
      )}
    </Drawer>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function UsersPage() {
  const { companyId, channel, timeRange, customDateRange } = useApp();
  const isKefuMode = channel === "wecom_kefu";

  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [customers, setCustomers] = useState<KefuCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Fetch data based on mode
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    if (isKefuMode) {
      api<KefuCustomer[]>("/api/wecom/kefu-customers")
        .then(setCustomers)
        .catch(() => setCustomers([]))
        .finally(() => setLoading(false));
    } else {
      api<OrgUser[]>(`/api/org/users?company_id=${companyId}`)
        .then(setUsers)
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    }
  }, [companyId, isKefuMode]);

  const openChat = useCallback((target: ChatTarget) => {
    setChatTarget(target);
    setDrawerOpen(true);
  }, []);

  // ── Kefu customer columns ──────────────────────────────────────

  const maxMessages = Math.max(...customers.map((c) => c.totalSent + c.totalReceived), 1);

  const kefuColumns: ColumnsType<KefuCustomer> = [
    {
      title: exportMode ? (
        <Checkbox
          checked={selectedIds.size === customers.length && customers.length > 0}
          indeterminate={selectedIds.size > 0 && selectedIds.size < customers.length}
          onChange={(e) => {
            setSelectedIds(e.target.checked ? new Set(customers.map((c) => c.externalUserId)) : new Set());
          }}
        />
      ) : "用户",
      key: "nickname",
      width: exportMode ? 240 : 200,
      render: (_: unknown, record: KefuCustomer, index?: number) => {
        const isSelected = selectedIds.has(record.externalUserId);
        const rowIdx = index ?? 0;
        return (
          <div className="flex items-center gap-2">
            {exportMode && (
              <span
                className="export-checkbox-cell"
                style={{ animationDelay: `${rowIdx * 50}ms` }}
              >
                <Checkbox
                  checked={isSelected}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    e.target.checked ? next.add(record.externalUserId) : next.delete(record.externalUserId);
                    setSelectedIds(next);
                  }}
                />
              </span>
            )}
            <div className="export-avatar-wrap">
              {record.avatar ? (
                <img src={record.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#6b7280] flex items-center justify-center text-white text-xs font-bold">
                  {(record.nickname || "?")[0]}
                </div>
              )}
              {isSelected && exportMode && <div className="export-selected-ring" />}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-[var(--color-text-primary)] text-sm">
                {record.nickname || "未知"}
              </span>
              {record.gender === "1" && <ManOutlined style={{ color: "#3b82f6", fontSize: 12 }} />}
              {record.gender === "2" && <WomanOutlined style={{ color: "#ec4899", fontSize: 12 }} />}
            </div>
          </div>
        );
      },
    },
    {
      title: "消息数",
      key: "messages",
      width: 200,
      render: (_: unknown, record: KefuCustomer) => {
        const total = record.totalSent + record.totalReceived;
        const pct = (total / maxMessages) * 100;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-4 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3b82f6] rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, minWidth: total > 0 ? 8 : 0 }}
              />
            </div>
            <span className="text-xs text-[var(--color-text-secondary)] w-8 text-right">{total}</span>
          </div>
        );
      },
    },
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
  ];

  // ── Org user columns ───────────────────────────────────────────

  function getKefuBinding(user: OrgUser) {
    return user.channelBindings?.find((b) => b.platform === "wecom_kefu") || null;
  }

  const orgColumns: ColumnsType<OrgUser> = [
    {
      title: "用户",
      key: "name",
      width: 140,
      render: (_: unknown, record: OrgUser) => {
        const hasKefu = !!getKefuBinding(record);
        return (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#6b7280] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(record.name || "?")[0]}
            </div>
            <div>
              <div className="font-medium text-[var(--color-text-primary)] text-sm">
                {record.name}
              </div>
              <div className="text-[10px] text-[var(--color-text-tertiary)]">
                @{record.username}
              </div>
            </div>
            {hasKefu && (
              <Tag color="green" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", margin: 0 }}>
                已绑定
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "角色",
      dataIndex: "role",
      width: 100,
      render: (role: string) => (
        <Tag color={role === "super_admin" ? "red" : "default"} style={{ fontSize: 11 }}>
          {role === "super_admin" ? "超管" : role}
        </Tag>
      ),
    },
    {
      title: "手机",
      dataIndex: "phone",
      width: 130,
      render: (p: string) => (
        <span className="text-[var(--color-text-secondary)] text-xs">{p || "-"}</span>
      ),
    },
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
  ];

  // ── Filtered data ──────────────────────────────────────────────

  const kefuFiltered = customers
    .filter((c) => (c.nickname || "").includes(searchText))
    .sort((a, b) => (b.totalSent + b.totalReceived) - (a.totalSent + a.totalReceived));

  const orgFiltered = users.filter(
    (u) => u.name.includes(searchText) || u.username.includes(searchText) || u.phone.includes(searchText)
  );

  const totalCount = isKefuMode ? kefuFiltered.length : orgFiltered.length;

  const handleExport = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const now = new Date();
      let start: Date;
      let end: string | undefined;
      if (timeRange === "custom" && customDateRange) {
        start = new Date(customDateRange[0]);
        end = new Date(customDateRange[1]).toISOString();
      } else if (timeRange === "yesterday") {
        start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0,0,0,0);
      } else if (timeRange === "last_week") {
        start = new Date(now); start.setDate(start.getDate() - 7); start.setHours(0,0,0,0);
      } else {
        start = new Date(now); start.setDate(start.getDate() - 30); start.setHours(0,0,0,0);
      }

      const res = await fetch("/api/wecom/kefu-messages/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_userids: Array.from(selectedIds),
          start_time: start.toISOString(),
          ...(end ? { end_time: end } : {}),
        }),
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kefu-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMode(false);
      setSelectedIds(new Set());
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  }, [selectedIds, timeRange, customDateRange]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#3b82f6] flex items-center justify-center">
            <TeamOutlined className="text-white text-sm" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-tight">
              {isKefuMode ? "客服客户" : "用户明细"}
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              共 {totalCount} 位{isKefuMode ? "客户" : "用户"}
            </p>
          </div>
        </div>
        <Space size={12}>
          {isKefuMode && !exportMode && (
            <Button icon={<DownloadOutlined />} onClick={() => setExportMode(true)}>
              导出
            </Button>
          )}
          {exportMode && (
            <span className="export-header-actions inline-flex items-center gap-3">
              <Button loading={exporting} onClick={handleExport} disabled={selectedIds.size === 0}
                style={{ background: "#16a34a", borderColor: "#16a34a", color: "#fff" }}
                className="hover:!bg-[#15803d] hover:!border-[#15803d]"
              >
                确认导出 ({selectedIds.size})
              </Button>
              <Button icon={<CloseOutlined />} onClick={() => { setExportMode(false); setSelectedIds(new Set()); }}
                style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}
                className="hover:!bg-[#dc2626] hover:!border-[#dc2626]"
              >
                取消
              </Button>
            </span>
          )}
          <Input
            placeholder={isKefuMode ? "搜索昵称" : "搜索姓名 / 用户名 / 手机"}
            prefix={<SearchOutlined className="text-[var(--color-text-tertiary)]" />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 200 }}
            className="!rounded-xl"
          />
        </Space>
      </div>

      <div className="unified-card overflow-hidden animate-slide-up" style={{ animationDelay: "0.1s" }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spin size="large" />
          </div>
        ) : isKefuMode ? (
          <Table
            columns={kefuColumns}
            dataSource={kefuFiltered.map((c) => ({ ...c, key: c.externalUserId }))}
            rowClassName={(record) =>
              exportMode && selectedIds.has((record as KefuCustomer).externalUserId)
                ? "export-row-selected"
                : ""
            }
            pagination={{
              pageSize: 20,
              showTotal: (total) => `共 ${total} 条记录`,
              className: "!px-2 !pb-2",
            }}
            size="middle"
            className="!border-none"
          />
        ) : (
          <Table
            columns={orgColumns}
            dataSource={orgFiltered.map((u) => ({ ...u, key: u.id }))}
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

      <ChatDrawer
        target={chatTarget}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
