"use client";

import { useEffect, useState } from "react";
import { Row, Col, Space, Spin } from "antd";
import {
  BarChartOutlined,
  UserOutlined,
  MessageOutlined,
  TeamOutlined,
  CommentOutlined,
} from "@ant-design/icons";
import { useApp } from "@/lib/AppContext";
import { api, type WecomStats } from "@/lib/api";
import { dingtalkMockStats, feishuMockStats } from "@/lib/mockData";

function formatNumber(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

export default function AnalyticsPage() {
  const { companyId, channel } = useApp();
  const [stats, setStats] = useState<WecomStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);

    if (channel === "wecom") {
      api<WecomStats>(`/api/wecom/stats?company_id=${companyId}`)
        .then(setStats)
        .catch(() => setStats({ totalUsers: 0, totalMessages: 0, totalChats: 0 }))
        .finally(() => setLoading(false));
    } else if (channel === "dingtalk") {
      setStats(dingtalkMockStats);
      setLoading(false);
    } else {
      setStats(feishuMockStats);
      setLoading(false);
    }
  }, [companyId, channel]);

  const cards = stats
    ? [
        {
          title: "用户总数",
          value: stats.totalUsers,
          suffix: "人",
          icon: <UserOutlined />,
          color: "#3b82f6",
          bg: "#eff6ff",
        },
        {
          title: "消息总数",
          value: stats.totalMessages,
          suffix: "条",
          icon: <MessageOutlined />,
          color: "#10b981",
          bg: "#ecfdf5",
        },
        {
          title: "会话群数",
          value: stats.totalChats,
          suffix: "个",
          icon: <CommentOutlined />,
          color: "#f59e0b",
          bg: "#fffbeb",
        },
        {
          title: "活跃用户",
          value: Math.max(Math.floor(stats.totalUsers * 0.6), 1),
          suffix: "人",
          icon: <TeamOutlined />,
          color: "#8b5cf6",
          bg: "#f5f3ff",
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#8b5cf6] flex items-center justify-center">
            <BarChartOutlined className="text-white text-sm" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-tight">
              使用分析
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">数据统计与趋势概览</p>
          </div>
        </div>
      </div>

      <Row gutter={[20, 20]}>
        {cards.map((card, i) => (
          <Col span={6} key={card.title}>
            <div
              className="unified-card p-5 stat-card animate-slide-up"
              style={{ animationDelay: `${0.08 + i * 0.06}s` }}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-sm text-[var(--color-text-secondary)] font-medium">
                  {card.title}
                </span>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: card.bg, color: card.color }}
                >
                  {card.icon}
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-bold text-[var(--color-text-primary)] leading-none">
                  {formatNumber(card.value)}
                </span>
                <span className="text-sm text-[var(--color-text-tertiary)]">{card.suffix}</span>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={[20, 20]}>
        <Col span={12}>
          <div
            className="unified-card p-6 animate-slide-up"
            style={{ animationDelay: "0.36s" }}
          >
            <span className="text-sm font-semibold text-[var(--color-text-primary)] block mb-5">
              消息趋势
            </span>
            <div className="h-64 flex items-center justify-center rounded-xl bg-[var(--color-bg-page)]">
              <Space direction="vertical" align="center">
                <div className="w-14 h-14 rounded-2xl bg-[rgba(139,92,246,0.08)] flex items-center justify-center">
                  <BarChartOutlined style={{ fontSize: 24, color: "#c4b5fd" }} />
                </div>
                <span className="text-sm text-[var(--color-text-tertiary)]">
                  图表区域（待接入 Recharts）
                </span>
              </Space>
            </div>
          </div>
        </Col>
        <Col span={12}>
          <div
            className="unified-card p-6 animate-slide-up"
            style={{ animationDelay: "0.44s" }}
          >
            <span className="text-sm font-semibold text-[var(--color-text-primary)] block mb-5">
              用户活跃度分布
            </span>
            <div className="h-64 flex items-center justify-center rounded-xl bg-[var(--color-bg-page)]">
              <Space direction="vertical" align="center">
                <div className="w-14 h-14 rounded-2xl bg-[rgba(59,130,246,0.08)] flex items-center justify-center">
                  <BarChartOutlined style={{ fontSize: 24, color: "#93c5fd" }} />
                </div>
                <span className="text-sm text-[var(--color-text-tertiary)]">
                  图表区域（待接入 Recharts）
                </span>
              </Space>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
