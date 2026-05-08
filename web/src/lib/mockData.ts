import type { WecomUser, WecomStats } from "./api";

export const dingtalkMockUsers: WecomUser[] = [
  { id: 101, userId: "dt001", name: "周杰", mobile: "15000001001", jobTitle: "销售经理", departmentPath: "钉钉/销售部", companyId: "" },
  { id: 102, userId: "dt002", name: "吴雪", mobile: "15000001002", jobTitle: "销售", departmentPath: "钉钉/销售部", companyId: "" },
  { id: 103, userId: "dt003", name: "王磊", mobile: "15000001003", jobTitle: "市场专员", departmentPath: "钉钉/市场部", companyId: "" },
  { id: 104, userId: "dt004", name: "陈静", mobile: "15000001004", jobTitle: "客服", departmentPath: "钉钉/客服部", companyId: "" },
];

export const feishuMockUsers: WecomUser[] = [
  { id: 201, userId: "fs001", name: "刘洋", mobile: "16000001001", jobTitle: "产品经理", departmentPath: "飞书/产品部", companyId: "" },
  { id: 202, userId: "fs002", name: "赵欣", mobile: "16000001002", jobTitle: "设计师", departmentPath: "飞书/设计部", companyId: "" },
  { id: 203, userId: "fs003", name: "孙浩", mobile: "16000001003", jobTitle: "开发工程师", departmentPath: "飞书/技术部", companyId: "" },
];

export const dingtalkMockStats: WecomStats = {
  totalUsers: 4,
  totalMessages: 156,
  totalChats: 3,
};

export const feishuMockStats: WecomStats = {
  totalUsers: 3,
  totalMessages: 89,
  totalChats: 2,
};

export const channelLabels: Record<string, string> = {
  wecom: "企业微信",
  dingtalk: "钉钉",
  feishu: "飞书",
};

export const channelColors: Record<string, string> = {
  wecom: "#07c160",
  dingtalk: "#0082ef",
  feishu: "#3370ff",
};
