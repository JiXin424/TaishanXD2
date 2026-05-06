"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Layout,
  Menu,
  Card,
  Typography,
  Tag,
  Spin,
  Button,
  Avatar,
  Dropdown,
  Row,
  Col,
  Statistic,
} from "antd";
import {
  DashboardOutlined,
  BarChartOutlined,
  RobotOutlined,
  UserOutlined,
  LogoutOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { api, type AuthUser, type HealthStatus, type SystemInfo } from "@/lib/api";

const { Header, Sider, Content } = Layout;

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadSession = async () => {
    try {
      const u = await api<AuthUser>("/api/auth/session");
      setUser(u);
    } catch {
      router.push("/login");
    }
  };

  const loadHealth = async () => {
    try {
      const h = await api<HealthStatus>("/api/health");
      setHealth(h);
    } catch {
      setHealth({ postgres: "error", redis: "error" });
    }
  };

  const loadSystem = async () => {
    try {
      const s = await api<SystemInfo>("/api/system/info");
      setSysInfo(s);
    } catch {
      /* ignore */
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadSession(), loadHealth(), loadSystem()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleLogout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  const pgOk = health?.postgres === "ok";
  const redisOk = health?.redis === "ok";

  return (
    <Layout className="min-h-screen">
      <Sider width={220} theme="dark" className="flex flex-col">
        <div className="h-16 flex items-center justify-center text-white text-xl font-bold">
          泰山 XD V2
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={["dashboard"]}
          items={[
            { key: "dashboard", icon: <DashboardOutlined />, label: "系统概览" },
            { key: "analytics", icon: <BarChartOutlined />, label: "使用分析", disabled: true },
            { key: "ai", icon: <RobotOutlined />, label: "AI 分析", disabled: true },
          ]}
        />
        <div className="mt-auto p-4 text-gray-400 text-xs">
          TaishanXD v2.0.0-demo
        </div>
      </Sider>

      <Layout>
        <Header className="bg-white shadow-sm px-6 flex items-center justify-between">
          <Typography.Title level={4} className="!mb-0">
            系统概览
          </Typography.Title>
          <div className="flex items-center gap-4">
            <Tag color="blue">{user?.companyName}</Tag>
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
                {user?.displayName}
              </Button>
            </Dropdown>
          </div>
        </Header>

        <Content className="m-6">
          {/* Status Cards */}
          <Row gutter={[16, 16]} className="mb-6">
            <Col span={8}>
              <Card>
                <Statistic
                  title="PostgreSQL"
                  value={pgOk ? "已连接" : "异常"}
                  prefix={pgOk ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  valueStyle={{ color: pgOk ? "#52c41a" : "#ff4d4f" }}
                />
                <Tag color={pgOk ? "green" : "red"} className="mt-2">
                  {pgOk ? "Healthy" : "Disconnected"}
                </Tag>
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="Redis"
                  value={redisOk ? "已连接" : "异常"}
                  prefix={redisOk ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  valueStyle={{ color: redisOk ? "#52c41a" : "#ff4d4f" }}
                />
                <Tag color={redisOk ? "green" : "red"} className="mt-2">
                  {redisOk ? "Healthy" : "Disconnected"}
                </Tag>
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="服务状态"
                  value={pgOk && redisOk ? "全部正常" : "部分异常"}
                  prefix={<ThunderboltOutlined />}
                  valueStyle={{ color: pgOk && redisOk ? "#52c41a" : "#faad14" }}
                />
                <Tag color="blue" className="mt-2">
                  V2.0.0-demo
                </Tag>
              </Card>
            </Col>
          </Row>

          {/* System Info */}
          <Row gutter={[16, 16]} className="mb-6">
            <Col span={16}>
              <Card title="系统信息" extra={
                <Button icon={<ReloadOutlined />} onClick={loadAll}>刷新</Button>
              }>
                <Row gutter={[24, 16]}>
                  <Col span={8}>
                    <Typography.Text type="secondary">版本</Typography.Text>
                    <div>{sysInfo?.version || "-"}</div>
                  </Col>
                  <Col span={8}>
                    <Typography.Text type="secondary">Go 版本</Typography.Text>
                    <div>{sysInfo?.goVersion || "-"}</div>
                  </Col>
                  <Col span={8}>
                    <Typography.Text type="secondary">环境</Typography.Text>
                    <div>{sysInfo?.environment || "-"}</div>
                  </Col>
                  <Col span={8}>
                    <Typography.Text type="secondary">启动时间</Typography.Text>
                    <div>{sysInfo?.startedAt?.replace("T", " ").slice(0, 19) || "-"}</div>
                  </Col>
                  <Col span={8}>
                    <Typography.Text type="secondary">数据库</Typography.Text>
                    <div>PostgreSQL 16 + Redis 7</div>
                  </Col>
                  <Col span={8}>
                    <Typography.Text type="secondary">网关</Typography.Text>
                    <div>Traefik v3.3</div>
                  </Col>
                </Row>
              </Card>
            </Col>
            <Col span={8}>
              <Card title="当前用户">
                <div className="flex flex-col items-center gap-3 py-4">
                  <Avatar size={64} icon={<UserOutlined />} />
                  <div className="text-center">
                    <div className="text-lg font-medium">{user?.displayName}</div>
                    <Typography.Text type="secondary">@{user?.username}</Typography.Text>
                  </div>
                  <Tag color="blue">数据权限: 级别 {user?.dataScope}</Tag>
                  <Tag color="green">{user?.companyName}</Tag>
                </div>
              </Card>
            </Col>
          </Row>

          {/* Quick Actions */}
          <Card title="快速开始">
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small" className="text-center">
                  <Typography.Text strong>用户管理</Typography.Text>
                  <div className="text-gray-400 text-sm mt-1">待开发</div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" className="text-center">
                  <Typography.Text strong>AI 智能分析</Typography.Text>
                  <div className="text-gray-400 text-sm mt-1">待开发</div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" className="text-center">
                  <Typography.Text strong>钉钉集成</Typography.Text>
                  <div className="text-gray-400 text-sm mt-1">待开发</div>
                </Card>
              </Col>
            </Row>
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}
