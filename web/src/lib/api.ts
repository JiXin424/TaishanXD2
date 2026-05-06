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
  id: number;
  username: string;
  realName: string;
  companyId: number;
  companyName: string;
  dataScope: number;
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
