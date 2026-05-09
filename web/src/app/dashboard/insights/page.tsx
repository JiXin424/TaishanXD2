"use client";

import { useState } from "react";
import { Button, Spin, Result, Table, Tag, Card, Empty, Alert } from "antd";
import {
  ThunderboltOutlined,
  UserOutlined,
  TeamOutlined,
  BulbOutlined,
  BarChartOutlined,
  ProfileOutlined,
} from "@ant-design/icons";
import { useApp } from "@/lib/AppContext";
import {
  fetchAnalysis,
  type AnalysisReport,
  type AnalysisResponse,
} from "@/lib/api";

const TAG_COLORS: Record<string, string> = {
  blue: "blue",
  orange: "orange",
  red: "red",
  purple: "purple",
  green: "green",
};

export default function InsightsPage() {
  const { companyId, channel, timeRange } = useApp();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res: AnalysisResponse = await fetchAnalysis({
        company_id: companyId,
        channel,
        app_id: channel === "wecom_kefu" ? "wecom_kefu" : channel,
        app_name: channel === "wecom_kefu" ? "微信客服" : undefined,
        time_range: timeRange,
      });

      if (res.success && res.data) {
        setReport(res.data);
      } else {
        setError(res.error || "分析失败，请重试");
      }
    } catch {
      setError("网络错误，分析服务不可达");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--color-primary-600)",
              color: "var(--color-text-inverse)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            <BarChartOutlined />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>
              AI 分析总览
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>
              基于大模型的智能使用分析报告
            </p>
          </div>
        </div>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={handleAnalyze}
          loading={loading}
          disabled={!companyId}
          size="large"
        >
          {loading ? "正在分析..." : "生成分析报告"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <Spin size="large" />
          <p style={{ marginTop: 16, color: "var(--color-text-secondary)" }}>
            正在调用大模型分析数据，请耐心等待...
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !report && !error && (
        <div className="unified-card" style={{ textAlign: "center", padding: "80px 24px" }}>
          <Empty description="选择公司和时间范围后，点击「生成分析报告」" />
        </div>
      )}

      {/* Report */}
      {!loading && report && <ReportView report={report} />}
    </div>
  );
}

function ReportView({ report }: { report: AnalysisReport }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Stats */}
      <Card size="small" style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <StatItem label="总对话数" value={report.header.total_conversations} />
          <StatItem label="活跃成员" value={report.header.active_members} />
          <StatItem label="覆盖天数" value={report.header.covered_days} />
          <StatItem label="核心场景" value={report.header.core_scenario} />
        </div>
      </Card>

      {/* 01 - Usage Ranking */}
      {report.usage_ranking.length > 0 && (
        <SectionCard
          title="使用排名"
          icon={<UserOutlined />}
        >
          <Table
            dataSource={report.usage_ranking}
            rowKey="user_id"
            pagination={false}
            size="small"
            columns={[
              { title: "排名", width: 60, render: (_, __, i) => `${i + 1}` },
              { title: "用户", dataIndex: "user_name", key: "name" },
              { title: "提问数", dataIndex: "count", key: "count", width: 80 },
              { title: "备注", dataIndex: "note", key: "note" },
            ]}
          />
        </SectionCard>
      )}

      {/* 02 - Categories */}
      {report.categories.length > 0 && (
        <SectionCard title="问题分类" icon={<ProfileOutlined />}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {report.categories.map((cat, i) => (
              <Card key={i} size="small" style={{ borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{cat.icon}</span>
                  <strong>{cat.name}</strong>
                  <Tag>{cat.count}</Tag>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "pre-line" }}>
                  {cat.description}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  {cat.who}
                </p>
              </Card>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 03 - Common Patterns */}
      {report.common_patterns.length > 0 && (
        <SectionCard title="共性问题" icon={<TeamOutlined />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {report.common_patterns.map((p, i) => (
              <Card key={i} size="small" style={{ borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Tag color={p.badge_type === "warn" ? "warning" : "processing"}>{p.badge}</Tag>
                  <strong>{p.title}</strong>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>{p.detail}</p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>{p.who}</p>
              </Card>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 04 - Spotlight */}
      {report.spotlight && (
        <SectionCard title="核心用户深度解析" icon={<UserOutlined />}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <h4 style={{ margin: "0 0 8px" }}>{report.spotlight.title}</h4>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "pre-line" }}>
              {report.spotlight.text}
            </p>
          </Card>
        </SectionCard>
      )}

      {/* 04b - Person Breakdown */}
      {report.person_breakdown.length > 0 && (
        <SectionCard title="用户使用画像" icon={<UserOutlined />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {report.person_breakdown.map((p, i) => (
              <Card key={i} size="small" style={{ borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <strong>{p.user_name}</strong>
                  <Tag>{p.count} 条</Tag>
                  {p.tags.map((t, j) => (
                    <Tag key={j} color={TAG_COLORS[t.color] || "default"}>
                      {t.label}
                    </Tag>
                  ))}
                </div>
                <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--color-text-secondary)" }}>
                  {p.description}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  重复性分析：{p.repeat_analysis.text}
                </p>
              </Card>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 05 - Key Insights */}
      {report.key_insights.length > 0 && (
        <SectionCard title="重要发现" icon={<BulbOutlined />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {report.key_insights.map((ins, i) => (
              <Card key={i} size="small" style={{ borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{ins.icon}</span>
                  <strong>{ins.title}</strong>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>{ins.text}</p>
              </Card>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 06 - Summary Table */}
      {report.summary_table.length > 0 && (
        <SectionCard title="汇总表" icon={<BarChartOutlined />}>
          <Table
            dataSource={report.summary_table}
            rowKey="user_id"
            pagination={false}
            size="small"
            scroll={{ x: 700 }}
            columns={[
              { title: "用户", dataIndex: "user_name", key: "name", fixed: "left", width: 100 },
              { title: "提问量", dataIndex: "count", key: "count", width: 70 },
              { title: "有效率", dataIndex: "effectiveness", key: "eff", width: 80 },
              { title: "关注领域", dataIndex: "focus_areas", key: "focus" },
              { title: "重复性", dataIndex: "repetition", key: "rep", width: 120 },
              { title: "成熟度", dataIndex: "maturity", key: "mat", width: 100 },
            ]}
          />
        </SectionCard>
      )}
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="unified-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ color: "var(--color-primary-500)", fontSize: 16 }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>{value}</div>
    </div>
  );
}
