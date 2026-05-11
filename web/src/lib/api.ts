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

export interface WecomMessage {
  id: number;
  messageId: string;
  chatId: string;
  msgType: string;
  content: string;
  senderId: string;
  senderIdType: string;
  receiveId: string;
  receiveIdType: string;
  direction: string;
  createTime: number;
  chatName: string;
}

export interface KefuMessage {
  id: number;
  messageId: string;
  externalUserId: string;
  openKfId: string;
  msgType: string;
  content: string;
  direction: "received" | "sent";
  createdAt: string;
}

export interface KefuCustomer {
  externalUserId: string;
  nickname: string;
  avatar: string;
  gender: string;
  totalSent: number;
  totalReceived: number;
  lastActiveAt: string;
}

// --- Analytics ---

export interface UserCount {
  userId: string;
  userName: string;
  count: number;
}

export interface UserToken {
  userId: string;
  userName: string;
  tokens: number;
}

export interface TimeBucket {
  label: string;
  count: number;
}

export interface HourBucket {
  hour: number;
  count: number;
}

export interface AnalyticsData {
  userConversations: UserCount[];
  userTokens: UserToken[];
  conversationVolume: TimeBucket[];
  timeDistribution: HourBucket[];
}

export interface AnalyticsParams {
  channel: string;
  timeRange: string;
  chatScope: string;
  startDate?: string;
  endDate?: string;
}

export async function fetchAnalytics(params: AnalyticsParams): Promise<AnalyticsData> {
  const qs = new URLSearchParams({
    channel: params.channel,
    time_range: params.timeRange,
    chat_scope: params.chatScope,
  });
  if (params.startDate) qs.set("start_date", params.startDate);
  if (params.endDate) qs.set("end_date", params.endDate);

  return api<AnalyticsData>(`/api/analytics/usage?${qs.toString()}`);
}

// --- LLM Analysis ---

export interface AnalysisProxyRequest {
  company_id: string;
  channel: string;
  app_id: string;
  app_name?: string;
  time_range: string;
}

export interface HeaderMeta {
  total_conversations: number;
  active_members: number;
  covered_days: string;
  core_scenario: string;
}

export interface UsageRankingItem {
  user_name: string;
  user_id: string;
  count: number;
  note: string;
}

export interface CategoryItem {
  icon: string;
  name: string;
  count: string;
  description: string;
  who: string;
}

export interface CommonPatternItem {
  badge: string;
  badge_type: string;
  title: string;
  detail: string;
  who: string;
}

export interface SpotlightBlock {
  title: string;
  text: string;
}

export interface TagItem {
  label: string;
  color: string;
}

export interface PersonBreakdownItem {
  user_name: string;
  user_id: string;
  count: number;
  tags: TagItem[];
  description: string;
  repeat_analysis: { text: string };
}

export interface InsightItem {
  icon: string;
  title: string;
  text: string;
}

export interface SummaryTableRow {
  user_name: string;
  user_id: string;
  count: number;
  effectiveness: string;
  focus_areas: string;
  repetition: string;
  maturity: string;
}

export interface AnalysisReport {
  header: HeaderMeta;
  usage_ranking: UsageRankingItem[];
  categories: CategoryItem[];
  common_patterns: CommonPatternItem[];
  spotlight: SpotlightBlock | null;
  person_breakdown: PersonBreakdownItem[];
  key_insights: InsightItem[];
  summary_table: SummaryTableRow[];
}

export interface AnalysisResponse {
  success: boolean;
  data: AnalysisReport | null;
  error: string | null;
  analysis_id: number | null;
}

export interface AnalysisHistoryItem {
  id: number;
  app_id: string;
  analysis_target: string;
  data_count: number;
  summary: string;
  success: boolean;
  created_at: string;
}

export function fetchAnalysis(req: AnalysisProxyRequest): Promise<AnalysisResponse> {
  return api<AnalysisResponse>("/api/analysis/analyze", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function fetchAnalysisHistory(appId: string, companyId: string, limit = 20): Promise<AnalysisHistoryItem[]> {
  return api<AnalysisHistoryItem[]>(
    `/api/analysis/history?app_id=${appId}&company_id=${companyId}&limit=${limit}`
  );
}

// --- User Detail ---

export interface UserStats {
  conversationCount: number;
  tokenUsage: number;
}

export interface UserSession {
  sessionId: string;
  firstMessage: string;
  messageCount: number;
  startTime: string;
  lastTime: string;
}

export interface UserStatsParams {
  user_id: string;
  mode: string;
  time_range: string;
  start_date?: string;
  end_date?: string;
}

export async function fetchUserStats(params: UserStatsParams): Promise<UserStats> {
  const qs = new URLSearchParams({
    user_id: params.user_id,
    mode: params.mode,
    time_range: params.time_range,
  });
  if (params.start_date) qs.set("start_date", params.start_date);
  if (params.end_date) qs.set("end_date", params.end_date);

  return api<UserStats>(`/api/analytics/user-stats?${qs.toString()}`);
}

export async function fetchUserSessions(params: UserStatsParams): Promise<UserSession[]> {
  const qs = new URLSearchParams({
    user_id: params.user_id,
    mode: params.mode,
    time_range: params.time_range,
  });
  if (params.start_date) qs.set("start_date", params.start_date);
  if (params.end_date) qs.set("end_date", params.end_date);

  return api<UserSession[]>(`/api/analytics/user-sessions?${qs.toString()}`);
}
