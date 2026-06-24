import type {
  DashboardState,
  ExportFormat,
  ProxySummary,
  ShareTarget,
  SourceSummary,
  SubscriptionSummary,
} from "@ui/types";

export async function apiRequest<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function buildSubscriptionShareUrl(
  token: string,
  format: ExportFormat,
): string {
  return `${window.location.origin}/share/sub/${token}?format=${encodeURIComponent(format)}`;
}

export async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(value);
}

export function formatTime(value: string | null): string {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function proxySearchText(proxy: ProxySummary): string {
  return [
    proxy.displayName,
    proxy.protocol,
    proxy.sourceName,
    ...proxy.tags,
  ]
    .join(" ")
    .toLowerCase();
}

export function sourceSearchText(source: SourceSummary): string {
  return [source.name, source.url, source.kind, source.lastSyncStatus]
    .join(" ")
    .toLowerCase();
}

export function packSearchText(pack: SubscriptionSummary): string {
  return [pack.name, pack.description, pack.defaultFormat].join(" ").toLowerCase();
}

export function matchesTagFilter(
  tags: string[],
  filter: string,
): boolean {
  return filter === "all" || tags.includes(filter);
}

export function getProtocolOptions(
  proxies: ProxySummary[],
): string[] {
  return Array.from(new Set(proxies.map((proxy) => proxy.protocol))).sort();
}

export function getTagOptions(proxies: ProxySummary[]): string[] {
  return Array.from(
    new Set(proxies.flatMap((proxy) => proxy.tags).filter(Boolean)),
  ).sort();
}

export function getSourceOptions(proxies: ProxySummary[]): string[] {
  return Array.from(new Set(proxies.map((proxy) => proxy.sourceName))).sort();
}

export function countHealthySources(sources: SourceSummary[]): number {
  return sources.filter((source) => source.lastSyncStatus === "success").length;
}

export function countUniqueProtocols(proxies: ProxySummary[]): number {
  return new Set(proxies.map((proxy) => proxy.protocol)).size;
}

export function openShareTarget(
  value: string | null,
  label: string,
): ShareTarget | null {
  if (!value) {
    return null;
  }

  return { label, value };
}

export function findDefaultPackId(
  dashboard: DashboardState,
  currentId: string | null,
): string | null {
  if (
    currentId &&
    dashboard.subscriptions.some((subscription) => subscription.id === currentId)
  ) {
    return currentId;
  }

  return dashboard.subscriptions[0]?.id ?? null;
}
