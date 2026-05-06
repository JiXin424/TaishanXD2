"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout, Menu, Button, Dropdown, Typography } from "antd";
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
