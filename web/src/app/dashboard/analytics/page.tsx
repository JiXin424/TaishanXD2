"use client";

import { useEffect, useState, useMemo } from "react";
import { Row, Col, Spin, Empty, Result } from "antd";
import { BarChartOutlined, InboxOutlined } from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useApp } from "@/lib/AppContext";
import {
  fetchAnalytics,
  type AnalyticsData,
  type UserCount,
  type UserToken,
  type TimeBucket,
  type HourBucket,
} from "@/lib/api";

const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#c4b5fd",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#10b981",
  "#34d399",
  "#6ee7b7",
  "#f59e0b",
  "#fbbf24",
  "#f97316",
  "#fb923c",
  "#ef4444",
  "#f87171",
  "#ec4899",
  "#f472b6",
  "#14b8a6",
  "#2dd4bf",
];

const SUPPORTED_CHANNELS = ["wecom", "wecom_kefu"];

const emptyData: AnalyticsData = {
  userConversations: [],
  userTokens: [],
  conversationVolume: [],
  timeDistribution: [],
};

export default function AnalyticsPage() {
  const { channel, timeRange, chatScope, customDateRange } = useApp();
  const [data, setData] = useState<AnalyticsData>(emptyData);
  const [loading, setLoading] = useState(false);

  const channelSupported = SUPPORTED_CHANNELS.includes(channel);

  useEffect(() => {
    if (!channelSupported) {
      setData(emptyData);
      return;
    }
    setLoading(true);
    fetchAnalytics({
      channel,
      timeRange,
      chatScope,
      startDate: timeRange === "custom" ? customDateRange?.[0] : undefined,
      endDate: timeRange === "custom" ? customDateRange?.[1] : undefined,
    })
      .then(setData)
      .catch(() => setData(emptyData))
      .finally(() => setLoading(false));
  }, [channel, timeRange, chatScope, customDateRange, channelSupported]);

  if (!channelSupported) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <Result icon={<InboxOutlined />} title="该渠道暂不支持使用分析" />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <ChartCard title="用户会话数排行" delay="0ms">
            <UserConversationChart data={data.userConversations} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title="用户 Token 消耗排行" delay="80ms">
            <UserTokenChart data={data.userTokens} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title="对话量趋势" delay="160ms">
            <VolumeChart data={data.conversationVolume} />
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title="时段分布" delay="240ms">
            <TimeDistChart data={data.timeDistribution} />
          </ChartCard>
        </Col>
      </Row>
    </div>
  );
}

function ChartCard({
  title,
  children,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  delay: string;
}) {
  return (
    <div
      className="unified-card p-6 animate-slide-up"
      style={{ animationDelay: delay }}
    >
      <span className="text-sm font-semibold text-[var(--color-text-primary)] block mb-5">
        {title}
      </span>
      {children}
    </div>
  );
}

function UserConversationChart({ data }: { data: UserCount[] | null }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Empty description="暂无数据" />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={data.length * 48 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="userName" tick={{ fontSize: 12 }} width={80} />
        <Tooltip
          formatter={(value) => [`${value} 条`, "会话数"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function UserTokenChart({ data }: { data: UserToken[] | null }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Empty description="暂无数据" />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={data.length * 48 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="userName" tick={{ fontSize: 12 }} width={80} />
        <Tooltip
          formatter={(value) => [`${value} tokens`, "Token 消耗"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="tokens" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function VolumeChart({ data }: { data: TimeBucket[] | null }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Empty description="暂无数据" />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          angle={data.length > 15 ? -45 : 0}
          textAnchor={data.length > 15 ? "end" : "middle"}
          height={data.length > 15 ? 70 : 40}
        />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value) => [`${value} 条`, "对话量"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TimeDistChart({ data }: { data: HourBucket[] | null }) {
  const filled = useMemo(() => {
    const safe = data || [];
    const map = new Map(safe.map((d) => [d.hour, d.count]));
    const result: { hour: number; count: number; label: string }[] = [];
    for (let h = 0; h < 24; h++) {
      result.push({ hour: h, count: map.get(h) || 0, label: `${h}:00` });
    }
    return result;
  }, [data || []]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={filled} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value) => [`${value} 条`, "消息数"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}
