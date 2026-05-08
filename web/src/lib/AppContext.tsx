"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "./api";
import type { AuthUser } from "./api";

export interface Company {
  id: string;
  name: string;
  code: string;
  channels: string[];
}

export type TimeRange = "yesterday" | "last_week" | "last_month" | "custom";
export type ChatScope = "all" | "group" | "private";

export interface AppState {
  user: AuthUser | null;
  companyId: string;
  companyName: string;
  channel: string;
  companies: Company[];
  timeRange: TimeRange;
  customDateRange: [string, string] | null;
  chatScope: ChatScope;
}

interface AppContextType extends AppState {
  setCompanyId: (id: string) => void;
  setChannel: (ch: string) => void;
  setTimeRange: (range: TimeRange) => void;
  setCustomDateRange: (range: [string, string] | null) => void;
  setChatScope: (scope: ChatScope) => void;
  isSuperAdmin: boolean;
}

const defaultState: AppState = {
  user: null,
  companyId: "",
  companyName: "",
  channel: "wecom",
  companies: [],
  timeRange: "yesterday",
  customDateRange: null,
  chatScope: "all",
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);

  useEffect(() => {
    // Load current user session
    api<{ ok: boolean; user: AuthUser }>("/api/auth/session")
      .then((res) => {
        const user = res.user;
        const isSuperAdmin = user.role === "super_admin";

        setState((s) => ({ ...s, user }));

        if (!isSuperAdmin) {
          // Normal user: fixed to their company
          setState((s) => ({
            ...s,
            user,
            companyId: user.companyId,
            companyName: user.companyName,
            companies: [{ id: user.companyId, name: user.companyName, code: "", channels: [] }],
          }));
        } else {
          // Super admin: load all companies
          api<Company[]>("/api/companies").then((companies) => {
            setState((s) => {
              if (companies.length > 0 && s.companyId === "") {
                return { ...s, companies, companyId: companies[0].id, companyName: companies[0].name };
              }
              return { ...s, companies };
            });
          }).catch(() => {});
        }
      })
      .catch(() => {
        // Not logged in — will be redirected by api.ts 401 handler
      });
  }, []);

  const setCompanyId = (id: string) => {
    const c = state.companies.find((co) => co.id === id);
    setState((s) => ({
      ...s,
      companyId: id,
      companyName: c?.name || "",
    }));
  };

  const setChannel = (ch: string) => {
    setState((s) => ({ ...s, channel: ch }));
  };

  const setTimeRange = (range: TimeRange) => {
    setState((s) => ({ ...s, timeRange: range, customDateRange: range === "custom" ? s.customDateRange : null }));
  };

  const setCustomDateRange = (range: [string, string] | null) => {
    setState((s) => ({ ...s, customDateRange: range }));
  };

  const setChatScope = (scope: ChatScope) => {
    setState((s) => ({ ...s, chatScope: scope }));
  };

  const isSuperAdmin = state.user?.role === "super_admin";

  return (
    <AppContext.Provider value={{ ...state, setCompanyId, setChannel, setTimeRange, setCustomDateRange, setChatScope, isSuperAdmin }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
