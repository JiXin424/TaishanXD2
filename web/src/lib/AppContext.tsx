"use client";

import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { api } from "./api";
import type { AuthUser } from "./api";

export interface Company {
  id: string;
  name: string;
  code: string;
  channel: string;
}

export type TimeRange = "yesterday" | "last_week" | "last_month" | "custom";
export type ChatScope = "all" | "group" | "private";

export interface StatsData {
  totalUsers: number;
  totalMessages: number;
  totalChats: number;
}

export interface AppState {
  user: AuthUser | null;
  companyId: string;
  companyName: string;
  companies: Company[];
  timeRange: TimeRange;
  customDateRange: [string, string] | null;
  chatScope: ChatScope;
  stats: StatsData;
  statsVersion: number;
}

interface AppContextType extends AppState {
  channel: string;
  setCompanyId: (id: string) => void;
  setTimeRange: (range: TimeRange) => void;
  setCustomDateRange: (range: [string, string] | null) => void;
  setChatScope: (scope: ChatScope) => void;
  isSuperAdmin: boolean;
  refreshStats: () => void;
}

const defaultState: AppState = {
  user: null,
  companyId: "",
  companyName: "",
  companies: [],
  timeRange: "yesterday",
  customDateRange: null,
  chatScope: "all",
  stats: { totalUsers: 0, totalMessages: 0, totalChats: 0 },
  statsVersion: 0,
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);

  const channel = useMemo(() => {
    const c = state.companies.find((co) => co.id === state.companyId);
    return c?.channel || "wecom";
  }, [state.companies, state.companyId]);

  useEffect(() => {
    api<{ ok: boolean; user: AuthUser }>("/api/auth/session")
      .then((res) => {
        const user = res.user;
        const isSuperAdmin = user.role === "super_admin";

        setState((s) => ({ ...s, user }));

        if (!isSuperAdmin) {
          setState((s) => ({
            ...s,
            user,
            companyId: user.companyId,
            companyName: user.companyName,
            companies: [{ id: user.companyId, name: user.companyName, code: "", channel: "wecom" }],
          }));
        } else {
          api<Company[]>("/api/companies").then((companies) => {
            setState((s) => {
              if (companies.length > 0 && s.companyId === "") {
                const defaultCo = companies.find((c) => c.channel === "wecom_kefu") || companies[0];
                return { ...s, companies, companyId: defaultCo.id, companyName: defaultCo.name };
              }
              return { ...s, companies };
            });
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // Fetch stats whenever any filter changes
  useEffect(() => {
    const currentChannel = (() => {
      const c = state.companies.find((co) => co.id === state.companyId);
      return c?.channel || "wecom";
    })();

    const params = new URLSearchParams();
    if (state.companyId) params.set("company_id", state.companyId);
    params.set("channel", currentChannel);
    if (state.timeRange) params.set("time_range", state.timeRange);
    if (currentChannel !== "wecom_kefu" && state.chatScope !== "all") params.set("scope", state.chatScope);
    if (state.timeRange === "custom" && state.customDateRange) {
      params.set("start_date", state.customDateRange[0]);
      params.set("end_date", state.customDateRange[1]);
    }

    const url = `/api/wecom/stats?${params.toString()}`;

    api<StatsData>(url)
      .then((stats) => setState((s) => ({ ...s, stats })))
      .catch(() => {});
  }, [state.companyId, state.timeRange, state.chatScope, state.customDateRange, state.statsVersion]);

  const setCompanyId = useCallback((id: string) => {
    const companies = [...defaultState.companies]; // placeholder; state update uses callback
    setState((s) => {
      const c = s.companies.find((co) => co.id === id);
      return { ...s, companyId: id, companyName: c?.name || "" };
    });
  }, []);

  const setTimeRange = useCallback((range: TimeRange) => {
    setState((s) => ({ ...s, timeRange: range, customDateRange: range === "custom" ? s.customDateRange : null }));
  }, []);

  const setCustomDateRange = useCallback((range: [string, string] | null) => {
    setState((s) => ({ ...s, customDateRange: range }));
  }, []);

  const setChatScope = useCallback((scope: ChatScope) => {
    setState((s) => ({ ...s, chatScope: scope }));
  }, []);

  const refreshStats = useCallback(() => {
    setState((s) => ({ ...s, statsVersion: s.statsVersion + 1 }));
  }, []);

  const isSuperAdmin = state.user?.role === "super_admin";

  return (
    <AppContext.Provider value={{ ...state, channel, setCompanyId, setTimeRange, setCustomDateRange, setChatScope, isSuperAdmin, refreshStats }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
