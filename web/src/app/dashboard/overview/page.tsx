"use client";

import { useEffect, useState } from "react";
import {
  Tag,
  Spin,
  Row,
  Col,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  ApiOutlined,
  SafetyCertificateOutlined,
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
      <div className="flex items-center justify-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  const pgOk = health?.postgres === "ok";
  const redisOk = health?.redis === "ok";

  const statusCards = [
    {
      title: "PostgreSQL",
      ok: pgOk,
      icon: <DatabaseOutlined style={{ fontSize: 28 }} />,
      color: pgOk ? "#10b981" : "#ef4444",
    },
    {
      title: "Redis",
      ok: redisOk,
      icon: <CloudServerOutlined style={{ fontSize: 28 }} />,
      color: redisOk ? "#10b981" : "#ef4444",
    },
    {
      title: "API 网关",
      ok: pgOk && redisOk,
      icon: <ApiOutlined style={{ fontSize: 28 }} />,
      color: pgOk && redisOk ? "#10b981" : "#f59e0b",
    },
    {
      title: "安全状态",
      ok: true,
      icon: <SafetyCertificateOutlined style={{ fontSize: 28 }} />,
      color: "#3b82f6",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <Row gutter={[20, 20]}>
        {statusCards.map((card, i) => (
          <Col span={6} key={card.title}>
            <div
              className="unified-card p-5 stat-card animate-slide-up"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-[var(--color-text-secondary)] text-sm font-medium">
                  {card.title}
                </span>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: `${card.color}12`,
                    color: card.color,
                  }}
                >
                  {card.icon}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {card.ok ? (
                  <CheckCircleOutlined style={{ color: card.color, fontSize: 18 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: card.color, fontSize: 18 }} />
                )}
                <span className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {card.ok ? "运行正常" : "连接异常"}
                </span>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* System Info + Quick Actions */}
      <Row gutter={[20, 20]}>
        <Col span={16}>
          <div
            className="unified-card p-6 animate-slide-up"
            style={{ animationDelay: "0.32s" }}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-base font-semibold text-[var(--color-text-primary)]">
                系统信息
              </span>
              <button
                onClick={loadAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary-600)] hover:bg-[var(--color-bg-page)] transition-all cursor-pointer"
              >
                <ReloadOutlined /> 刷新
              </button>
            </div>
            <Row gutter={[32, 20]}>
              {[
                { label: "版本", value: sysInfo?.version || "-" },
                { label: "Go 版本", value: sysInfo?.goVersion || "-" },
                { label: "环境", value: sysInfo?.environment || "-" },
                {
                  label: "启动时间",
                  value: sysInfo?.startedAt?.replace("T", " ").slice(0, 19) || "-",
                },
                { label: "数据库", value: "PostgreSQL 16 + Redis 7" },
                { label: "网关", value: "Traefik v3.3" },
              ].map((item) => (
                <Col span={8} key={item.label}>
                  <div className="text-xs text-[var(--color-text-tertiary)] mb-1">{item.label}</div>
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">{item.value}</div>
                </Col>
              ))}
            </Row>
          </div>
        </Col>
        <Col span={8}>
          <div
            className="unified-card p-6 h-full animate-slide-up"
            style={{ animationDelay: "0.4s" }}
          >
            <span className="text-base font-semibold text-[var(--color-text-primary)] block mb-5">
              快速开始
            </span>
            <div className="space-y-3">
              {[
                { label: "用户管理", desc: "管理用户与权限", color: "#3b82f6" },
                { label: "AI 智能分析", desc: "生成分析报告", color: "#8b5cf6" },
                { label: "钉钉集成", desc: "同步组织信息", color: "#f59e0b" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-bg-page)] transition-all cursor-pointer group"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: item.color }}
                  >
                    {item.label[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-primary-600)] transition-colors">
                      {item.label}
                    </div>
                    <div className="text-xs text-[var(--color-text-tertiary)]">{item.desc}</div>
                  </div>
                  <Tag
                    color="default"
                    className="!text-[10px] !px-1.5 !py-0 !mr-0 !border-[var(--color-border-default)]"
                  >
                    待开发
                  </Tag>
                </div>
              ))}
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
