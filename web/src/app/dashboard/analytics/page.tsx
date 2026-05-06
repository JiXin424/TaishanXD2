"use client";

import { Card, Row, Col, Statistic, Typography, Space, Tag, Select } from "antd";
import {
  BarChartOutlined,
  ArrowUpOutlined,
  UserOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
} from "@ant-design/icons";

const statsCards = [
  {
    title: "总调用次数",
    value: 12847,
    suffix: "次",
    icon: <ThunderboltOutlined />,
    trend: 12.5,
    color: "#1890ff",
  },
  {
    title: "活跃用户数",
    value: 326,
    suffix: "人",
    icon: <UserOutlined />,
    trend: 8.3,
    color: "#52c41a",
  },
  {
    title: "平均响应时间",
    value: 2.4,
    suffix: "秒",
    icon: <ClockCircleOutlined />,
    trend: -5.1,
    color: "#faad14",
  },
  {
    title: "分析报告数",
    value: 89,
    suffix: "份",
    icon: <FileTextOutlined />,
    trend: 23.1,
    color: "#722ed1",
  },
];

export default function AnalyticsPage() {
  return (
    <>
      <Card
        title={
          <Space>
            <BarChartOutlined />
            <span>使用分析</span>
          </Space>
        }
        extra={
          <Select
            defaultValue="7d"
            style={{ width: 120 }}
            options={[
              { value: "24h", label: "最近 24 小时" },
              { value: "7d", label: "最近 7 天" },
              { value: "30d", label: "最近 30 天" },
              { value: "90d", label: "最近 90 天" },
            ]}
          />
        }
      >
        <Row gutter={[16, 16]} className="mb-6">
          {statsCards.map((card) => (
            <Col span={6} key={card.title}>
              <Card size="small" className="text-center">
                <Statistic
                  title={card.title}
                  value={card.value}
                  suffix={card.suffix}
                  prefix={card.icon}
                  valueStyle={{ color: card.color }}
                />
                <div className="mt-2">
                  <Tag color={card.trend > 0 ? "green" : "red"}>
                    {card.trend > 0 ? (
                      <ArrowUpOutlined />
                    ) : (
                      <ArrowUpOutlined style={{ transform: "rotate(180deg)" }} />
                    )}
                    {" "}较上周 {Math.abs(card.trend)}%
                  </Tag>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card title="调用趋势" size="small">
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
                <Space direction="vertical" align="center">
                  <BarChartOutlined style={{ fontSize: 48, color: "#d9d9d9" }} />
                  <Typography.Text type="secondary">
                    图表区域（待接入 Recharts）
                  </Typography.Text>
                </Space>
              </div>
            </Card>
          </Col>
          <Col span={12}>
            <Card title="用户活跃度分布" size="small">
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
                <Space direction="vertical" align="center">
                  <BarChartOutlined style={{ fontSize: 48, color: "#d9d9d9" }} />
                  <Typography.Text type="secondary">
                    图表区域（待接入 Recharts）
                  </Typography.Text>
                </Space>
              </div>
            </Card>
          </Col>
        </Row>
      </Card>
    </>
  );
}
