"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        alert(data.error || "登录失败");
        setLoading(false);
      }
    } catch {
      alert("网络错误");
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      {/* Aurora decorations */}
      <div className="login-aurora login-aurora-left" />
      <div className="login-aurora login-aurora-right" />

      <div className="login-panel">
        {/* Left: Brand copy */}
        <div className="px-3 py-6">
          <p
            style={{
              color: "var(--color-info)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            SALES EMPOWERMENT
          </p>
          <h1
            style={{
              fontFamily: "var(--font-family-display)",
              fontSize: "clamp(3rem, 7vw, 5.4rem)",
              fontWeight: 800,
              letterSpacing: "-0.06em",
              lineHeight: 0.92,
              color: "var(--color-text-primary)",
              margin: "18px 0 0",
            }}
          >
            泰山 XD
          </h1>
          <p
            style={{
              maxWidth: 480,
              marginTop: 20,
              color: "var(--color-text-secondary)",
              fontSize: 18,
              lineHeight: 1.8,
            }}
          >
            销售赋能中心 V2 — 数据驱动的智能分析平台，助力团队洞察业务趋势，提升决策效率。
          </p>
          <div
            style={{
              marginTop: 28,
              display: "inline-flex",
              flexDirection: "column",
              gap: 8,
              borderRadius: 24,
              background: "rgba(255, 255, 255, 0.68)",
              padding: "16px 20px",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span
              style={{
                color: "var(--color-text-disabled)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
              }}
            >
              CURRENT VERSION
            </span>
            <span
              style={{
                color: "var(--color-text-primary)",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              V2.0.0 — 全新架构
            </span>
          </div>
        </div>

        {/* Right: Login card */}
        <div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div
            style={{
              borderRadius: 24,
              background: "rgba(255, 255, 255, 0.88)",
              boxShadow: "var(--shadow-lg)",
              padding: 40,
            }}
          >
            <div style={{ marginBottom: 28 }}>
              <h2
                style={{
                  fontFamily: "var(--font-family-display)",
                  fontSize: 24,
                  fontWeight: 800,
                  color: "var(--color-text-primary)",
                  margin: "0 0 8px",
                }}
              >
                欢迎回来
              </h2>
              <p
                style={{
                  color: "var(--color-text-tertiary)",
                  fontSize: 14,
                  margin: 0,
                }}
              >
                登录以访问您的仪表板
              </p>
            </div>

            <Form
              onFinish={onFinish}
              size="large"
              autoComplete="off"
              initialValues={{ username: "admin", password: "admin123" }}
              layout="vertical"
            >
              <Form.Item name="username">
                <Input
                  prefix={
                    <UserOutlined style={{ color: "var(--color-text-tertiary)" }} />
                  }
                  placeholder="用户名"
                  style={{
                    height: 48,
                    borderRadius: 12,
                    borderColor: "var(--color-border-default)",
                  }}
                />
              </Form.Item>
              <Form.Item name="password">
                <Input.Password
                  prefix={
                    <LockOutlined style={{ color: "var(--color-text-tertiary)" }} />
                  }
                  placeholder="密码"
                  style={{
                    height: 48,
                    borderRadius: 12,
                    borderColor: "var(--color-border-default)",
                  }}
                />
              </Form.Item>
              <Form.Item style={{ marginTop: 24 }}>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary"
                  style={{
                    width: "100%",
                    height: 48,
                    fontSize: 15,
                  }}
                >
                  {loading ? "登录中..." : "登 录"}
                </button>
              </Form.Item>
            </Form>

            <p
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "var(--color-text-disabled)",
                marginTop: 16,
              }}
            >
              TaishanXD &copy; 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
