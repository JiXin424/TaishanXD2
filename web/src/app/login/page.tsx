"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Card, Typography, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { api, type AuthUser } from "@/lib/api";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; user: AuthUser }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(values),
        }
      );
      if (res.ok) {
        message.success(`欢迎回来，${res.user.displayName}`);
        router.push("/dashboard");
      }
    } catch {
      message.error("登录失败，请检查用户名和密码");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md shadow-xl" bordered={false}>
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-blue-600 mb-2">泰山 XD</div>
          <Typography.Text type="secondary">
            销售赋能中心 V2
          </Typography.Text>
        </div>
        <Form onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              className="bg-blue-600"
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
        <div className="text-center text-xs text-gray-400">
          Demo: admin / admin123
        </div>
      </Card>
    </div>
  );
}
