"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Space,
  Spin,
  Button,
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
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { api, type KefuCustomer } from "@/lib/api";

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

// ── Main Page ─────────────────────────────────────────────────────

export default function UsersPage() {
  const { companyId, channel, timeRange, customDateRange } = useApp();
  const router = useRouter();
  const isKefuMode = channel === "wecom_kefu";

  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [customers, setCustomers] = useState<KefuCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Fetch data based on mode
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    if (isKefuMode) {
      const qs = new URLSearchParams();
      qs.set("time_range", timeRange);
      if (timeRange === "custom" && customDateRange) {
        qs.set("start_date", customDateRange[0]);
        qs.set("end_date", customDateRange[1]);
      }
      api<KefuCustomer[]>(`/api/wecom/kefu-customers?${qs.toString()}`)
        .then(setCustomers)
        .catch(() => setCustomers([]))
        .finally(() => setLoading(false));
    } else {
      api<OrgUser[]>(`/api/org/users?company_id=${companyId}`)
        .then(setUsers)
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    }
  }, [companyId, isKefuMode, timeRange, customDateRange]);

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
          onClick={() => router.push(`/dashboard/users/${record.externalUserId}?mode=kefu`)}
        >
          查看详情
        </Button>
      ),
    },
  ];

  // ── Org user columns ───────────────────────────────────────────

  const orgColumns: ColumnsType<OrgUser> = [
    {
      title: "用户",
      key: "name",
      width: 140,
      render: (_: unknown, record: OrgUser) => {
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
    </div>
  );
}
