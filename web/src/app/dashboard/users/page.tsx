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
