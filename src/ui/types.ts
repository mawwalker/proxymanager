export type ExportFormat = "clash-meta" | "raw" | "sing-box";
export type Screen = "inventory" | "packs" | "sources";
export type PackTab = "content" | "settings" | "share";

export interface ProxySummary {
  displayName: string;
  enabled: boolean;
  id: string;
  parseStatus?: string;
  protocol: string;
  shareToken?: string;
  shareUri: string | null;
  sourceName: string;
  tags: string[];
  updatedAt: string;
}

export interface SourceSummary {
  id: string;
  kind: string;
  lastError: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  name: string;
  refreshIntervalMinutes: number;
  updatedAt: string;
  url: string;
}

export interface SubscriptionSummary {
  defaultFormat: ExportFormat;
  description: string;
  id: string;
  itemCount: number;
  name: string;
  shareToken: string;
  updatedAt: string;
}

export interface DashboardState {
  proxies: ProxySummary[];
  sources: SourceSummary[];
  subscriptions: SubscriptionSummary[];
}

export interface SubscriptionDetail {
  items: Array<{
    id: string;
    position: number;
    proxy: ProxySummary;
    proxyId: string;
  }>;
  nodes: ProxySummary[];
  subscription: SubscriptionSummary;
}

export interface ExportPreview {
  content: string;
  skipped: Array<{ id: string; name: string; reason: string }>;
}

export interface ShareTarget {
  label: string;
  value: string;
}

export const initialDashboard: DashboardState = {
  proxies: [],
  sources: [],
  subscriptions: [],
};
