"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Typography,
  Tag,
  Spin,
  Row,
  Col,
  Statistic,
  Button,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { api, type HealthStatus, type SystemInfo } from "@/lib/api";

export default function OverviewPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

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
    await Promise.all([loadHealth(), loadSystem()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  const pgOk = health?.postgres === "ok";
  const redisOk = health?.redis === "ok";

  return (
    <>
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

      <Row gutter={[16, 16]} className="mb-6">
        <Col span={16}>
          <Card
            title="系统信息"
            extra={<Button icon={<ReloadOutlined />} onClick={loadAll}>刷新</Button>}
          >
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
        </Col>
      </Row>
    </>
  );
}
