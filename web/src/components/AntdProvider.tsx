"use client";

import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";

const antTheme = {
  token: {
    colorPrimary: "#1e3a5f",
    colorSuccess: "#10b981",
    colorWarning: "#f59e0b",
    colorError: "#ef4444",
    colorInfo: "#3b82f6",
    borderRadius: 10,
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`,
    fontSize: 14,
    colorBgContainer: "#ffffff",
    colorBgLayout: "#f0f2f7",
    colorBorder: "#e2e6ee",
  },
  components: {
    Button: {
      primaryShadow: "0 4px 14px rgba(30, 58, 95, 0.25)",
      borderRadius: 10,
      controlHeight: 40,
    },
    Card: {
      borderRadiusLG: 14,
      boxShadowTertiary: "0 1px 12px rgba(10, 22, 40, 0.04)",
    },
    Table: {
      borderRadius: 12,
      headerBg: "#f8f9fc",
      rowHoverBg: "#f0f4fa",
    },
    Input: {
      borderRadius: 10,
      controlHeight: 40,
    },
    Select: {
      borderRadius: 10,
    },
    Menu: {
      darkItemBg: "transparent",
      darkItemSelectedBg: "rgba(201, 168, 76, 0.15)",
      darkItemHoverBg: "rgba(255, 255, 255, 0.06)",
      darkItemColor: "rgba(255, 255, 255, 0.55)",
      darkItemSelectedColor: "#e8d48b",
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemHeight: 44,
    },
  },
};

export default function AntdProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigProvider theme={antTheme} locale={zhCN}>
      {children}
    </ConfigProvider>
  );
}
