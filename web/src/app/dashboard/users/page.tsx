"use client";

import { useEffect, useState } from "react";
import { Table, Input, Space, Spin } from "antd";
import {
  SearchOutlined,
  TeamOutlined,
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
    render: (id: number) => <span className="text-[var(--color-text-tertiary)]">#{id}</span>,
  },
  {
    title: "姓名",
    dataIndex: "name",
    width: 100,
    render: (name: string) => <span className="font-medium text-[var(--color-text-primary)]">{name}</span>,
  },
  {
    title: "用户ID",
    dataIndex: "userId",
    width: 100,
    render: (id: string) => <span className="text-[var(--color-text-secondary)] font-mono text-xs">{id}</span>,
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
    render: (t: string) => <span className="text-[var(--color-text-secondary)]">{t || "-"}</span>,
  },
  {
    title: "部门路径",
    dataIndex: "departmentPath",
    width: 180,
    render: (p: string) => <span className="text-[var(--color-text-secondary)]">{p || "-"}</span>,
  },
];

export default function UsersPage() {
  const { companyId, channel } = useApp();
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<WecomUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
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
      <div className="flex items-center justify-between animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#3b82f6] flex items-center justify-center">
            <TeamOutlined className="text-white text-sm" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-tight">
              用户明细
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              共 {filteredUsers.length} 位用户
            </p>
          </div>
        </div>
        <Space size={12}>
          <Input
            placeholder="搜索姓名 / 手机 / 职位"
            prefix={<SearchOutlined className="text-[var(--color-text-tertiary)]" />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 260 }}
            className="!rounded-xl"
          />
        </Space>
      </div>

      <div className="unified-card overflow-hidden animate-slide-up" style={{ animationDelay: "0.1s" }}>
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
