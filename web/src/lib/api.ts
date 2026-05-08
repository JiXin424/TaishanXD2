export async function api<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  return res.json();
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  companyId: string;
  companyName: string;
  role: string;
  displayName: string;
}

export interface HealthStatus {
  postgres: string;
  redis: string;
}

export interface SystemInfo {
  version: string;
  goVersion: string;
  startedAt: string;
  environment: string;
}

export interface WecomUser {
  id: number;
  userId: string;
  name: string;
  mobile: string;
  jobTitle: string;
  departmentPath: string;
  companyId: string;
}

export interface WecomStats {
  totalUsers: number;
  totalMessages: number;
  totalChats: number;
}
