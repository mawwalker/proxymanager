import { ensureD1Schema } from "@worker/d1-schema";
import {
  renderNodeShareUri,
  type ExportProfile,
  type ImportedNode,
  type ImportKind,
} from "@shared/proxy-codec";

export interface StoredProxy extends ImportedNode {
  createdAt: string;
  shareToken: string;
  updatedAt: string;
}

export interface StoredSource {
  createdAt: string;
  id: string;
  kind: ImportKind;
  lastError: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: "idle" | "success" | "failed";
  name: string;
  refreshIntervalMinutes: number;
  updatedAt: string;
  url: string;
}

export interface StoredSubscriptionItem {
  id: string;
  position: number;
  proxyId: string;
}

export interface StoredSubscription {
  createdAt: string;
  defaultFormat: ExportProfile;
  description: string;
  id: string;
  name: string;
  shareToken: string;
  updatedAt: string;
}

export interface DashboardState {
  proxies: StoredProxy[];
  sources: StoredSource[];
  subscriptions: Array<
    StoredSubscription & {
      itemCount: number;
    }
  >;
}

export interface ProxyStore {
  addNodesToSubscription(
    subscriptionId: string,
    proxyIds: string[],
  ): Promise<StoredSubscriptionItem[]>;
  createSource(input: {
    kind: ImportKind;
    name: string;
    refreshIntervalMinutes?: number;
    url: string;
  }): Promise<StoredSource>;
  createSubscription(input: {
    defaultFormat?: ExportProfile;
    description?: string;
    name: string;
    nodeIds: string[];
  }): Promise<StoredSubscription>;
  getDashboard(): Promise<DashboardState>;
  getProxy(id: string): Promise<StoredProxy | null>;
  getSource(id: string): Promise<StoredSource | null>;
  getSubscription(id: string): Promise<StoredSubscription | null>;
  getSubscriptionByShareToken(
    shareToken: string,
  ): Promise<StoredSubscription | null>;
  getSubscriptionItems(
    subscriptionId: string,
  ): Promise<StoredSubscriptionItem[]>;
  getSubscriptionNodes(subscriptionId: string): Promise<StoredProxy[]>;
  importNodes(nodes: ImportedNode[]): Promise<StoredProxy[]>;
  removeSubscriptionItem(
    subscriptionId: string,
    itemId: string,
  ): Promise<void>;
  replaceSourceNodes(
    sourceId: string,
    nodes: ImportedNode[],
  ): Promise<StoredProxy[]>;
  rotateSubscriptionShareToken(
    subscriptionId: string,
  ): Promise<StoredSubscription | null>;
  updateProxyMetadata(
    proxyId: string,
    input: {
      displayName?: string;
      enabled?: boolean;
      tags?: string[];
    },
  ): Promise<StoredProxy | null>;
  updateSourceSyncState(
    sourceId: string,
    input: {
      lastError: string | null;
      lastSyncAt: string | null;
      lastSyncStatus: StoredSource["lastSyncStatus"];
    },
  ): Promise<StoredSource | null>;
  updateSubscription(
    subscriptionId: string,
    input: {
      defaultFormat?: ExportProfile;
      description?: string;
      name?: string;
    },
  ): Promise<StoredSubscription | null>;
}

export function createMemoryStore(now = () => new Date()): ProxyStore {
  const proxies = new Map<string, StoredProxy>();
  const proxyByFingerprint = new Map<string, string>();
  const sourceNodeIds = new Map<string, string[]>();
  const sources = new Map<string, StoredSource>();
  const subscriptionItems = new Map<string, StoredSubscriptionItem[]>();
  const subscriptions = new Map<string, StoredSubscription>();

  return {
    async addNodesToSubscription(subscriptionId, proxyIds) {
      const existing = subscriptionItems.get(subscriptionId) ?? [];
      const nextPosition = existing.length;
      const additions = proxyIds.map((proxyId, index) => ({
        id: createId("item"),
        position: nextPosition + index,
        proxyId,
      }));

      subscriptionItems.set(subscriptionId, [...existing, ...additions]);
      touchSubscription(subscriptions, subscriptionId, now);
      return additions;
    },

    async createSource(input) {
      const timestamp = now().toISOString();
      const source: StoredSource = {
        createdAt: timestamp,
        id: createId("source"),
        kind: input.kind,
        lastError: null,
        lastSyncAt: null,
        lastSyncStatus: "idle",
        name: input.name,
        refreshIntervalMinutes: input.refreshIntervalMinutes ?? 15,
        updatedAt: timestamp,
        url: input.url,
      };

      sources.set(source.id, source);
      return source;
    },

    async createSubscription(input) {
      const timestamp = now().toISOString();
      const subscription: StoredSubscription = {
        createdAt: timestamp,
        defaultFormat: input.defaultFormat ?? "raw",
        description: input.description ?? "",
        id: createId("subscription"),
        name: input.name,
        shareToken: createToken(),
        updatedAt: timestamp,
      };

      subscriptions.set(subscription.id, subscription);
      await this.addNodesToSubscription(subscription.id, input.nodeIds);
      return subscription;
    },

    async getDashboard() {
      return {
        proxies: Array.from(proxies.values())
          .sort(compareUpdatedAt)
          .map(toStoredProxyForOutput),
        sources: Array.from(sources.values()).sort(compareUpdatedAt),
        subscriptions: Array.from(subscriptions.values())
          .sort(compareUpdatedAt)
          .map((subscription) => ({
            ...subscription,
            itemCount: (subscriptionItems.get(subscription.id) ?? []).length,
          })),
      };
    },

    async getProxy(id) {
      const proxy = proxies.get(id);
      return proxy ? toStoredProxyForOutput(proxy) : null;
    },

    async getSource(id) {
      return sources.get(id) ?? null;
    },

    async getSubscription(id) {
      return subscriptions.get(id) ?? null;
    },

    async getSubscriptionByShareToken(shareToken) {
      return (
        Array.from(subscriptions.values()).find(
          (subscription) => subscription.shareToken === shareToken,
        ) ?? null
      );
    },

    async getSubscriptionItems(subscriptionId) {
      return subscriptionItems.get(subscriptionId) ?? [];
    },

    async getSubscriptionNodes(subscriptionId) {
      const items = subscriptionItems.get(subscriptionId) ?? [];
      return items
        .sort((left, right) => left.position - right.position)
        .map((item) => proxies.get(item.proxyId))
        .filter((item): item is StoredProxy => item !== undefined)
        .map(toStoredProxyForOutput);
    },

    async importNodes(nodes) {
      return nodes.map((node) => {
        const timestamp = now().toISOString();
        const existingId = proxyByFingerprint.get(node.fingerprint);
        if (existingId) {
          const current = proxies.get(existingId);
          if (!current) {
            throw new Error(`Missing proxy ${existingId}`);
          }

          const updated: StoredProxy = {
            ...current,
            normalized: node.normalized,
            parseStatus: node.parseStatus,
            protocol: node.protocol,
            rawPayload: node.rawPayload,
            shareUri: node.shareUri,
            sourceName: node.sourceName,
            updatedAt: timestamp,
          };
          proxies.set(existingId, updated);
          return toStoredProxyForOutput(updated);
        }

        const created: StoredProxy = {
          ...node,
          createdAt: timestamp,
          shareToken: createToken(),
          updatedAt: timestamp,
        };
        proxies.set(created.id, created);
        proxyByFingerprint.set(created.fingerprint, created.id);
        return toStoredProxyForOutput(created);
      });
    },

    async removeSubscriptionItem(subscriptionId, itemId) {
      const items = subscriptionItems.get(subscriptionId) ?? [];
      subscriptionItems.set(
        subscriptionId,
        items
          .filter((item) => item.id !== itemId)
          .map((item, index) => ({ ...item, position: index })),
      );
      touchSubscription(subscriptions, subscriptionId, now);
    },

    async replaceSourceNodes(sourceId, nodes) {
      const imported = await this.importNodes(nodes);
      sourceNodeIds.set(
        sourceId,
        imported.map((item) => item.id),
      );
      return imported;
    },

    async rotateSubscriptionShareToken(subscriptionId) {
      const subscription = subscriptions.get(subscriptionId);
      if (!subscription) {
        return null;
      }

      const updated = {
        ...subscription,
        shareToken: createToken(),
        updatedAt: now().toISOString(),
      };
      subscriptions.set(subscriptionId, updated);
      return updated;
    },

    async updateProxyMetadata(proxyId, input) {
      const proxy = proxies.get(proxyId);
      if (!proxy) {
        return null;
      }

      const updated: StoredProxy = {
        ...proxy,
        displayName: input.displayName ?? proxy.displayName,
        enabled: input.enabled ?? proxy.enabled,
        tags: input.tags ?? proxy.tags,
        updatedAt: now().toISOString(),
      };
      proxies.set(proxyId, updated);
      return toStoredProxyForOutput(updated);
    },

    async updateSourceSyncState(sourceId, input) {
      const source = sources.get(sourceId);
      if (!source) {
        return null;
      }

      const updated = {
        ...source,
        ...input,
        updatedAt: now().toISOString(),
      };
      sources.set(sourceId, updated);
      return updated;
    },

    async updateSubscription(subscriptionId, input) {
      const subscription = subscriptions.get(subscriptionId);
      if (!subscription) {
        return null;
      }

      const updated = {
        ...subscription,
        defaultFormat: input.defaultFormat ?? subscription.defaultFormat,
        description: input.description ?? subscription.description,
        name: input.name ?? subscription.name,
        updatedAt: now().toISOString(),
      };
      subscriptions.set(subscriptionId, updated);
      return updated;
    },
  };
}

export function createD1Store(
  db: D1Database,
  now = () => new Date(),
): ProxyStore {
  const store: ProxyStore = {
    async addNodesToSubscription(subscriptionId, proxyIds) {
      const items = await this.getSubscriptionItems(subscriptionId);
      const basePosition = items.length;
      const created: StoredSubscriptionItem[] = [];

      for (const [index, proxyId] of proxyIds.entries()) {
        const item: StoredSubscriptionItem = {
          id: createId("item"),
          position: basePosition + index,
          proxyId,
        };

        await db
          .prepare(
            "insert into subscription_items (id, subscription_id, proxy_id, position, created_at) values (?, ?, ?, ?, ?)",
          )
          .bind(
            item.id,
            subscriptionId,
            proxyId,
            item.position,
            now().toISOString(),
          )
          .run();
        created.push(item);
      }

      await db
        .prepare(
          "update subscriptions set updated_at = ? where id = ?",
        )
        .bind(now().toISOString(), subscriptionId)
        .run();
      return created;
    },

    async createSource(input) {
      const timestamp = now().toISOString();
      const source: StoredSource = {
        createdAt: timestamp,
        id: createId("source"),
        kind: input.kind,
        lastError: null,
        lastSyncAt: null,
        lastSyncStatus: "idle",
        name: input.name,
        refreshIntervalMinutes: input.refreshIntervalMinutes ?? 15,
        updatedAt: timestamp,
        url: input.url,
      };

      await db
        .prepare(
          "insert into sources (id, name, url, kind, refresh_interval_minutes, last_sync_status, last_error, last_sync_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          source.id,
          source.name,
          source.url,
          source.kind,
          source.refreshIntervalMinutes,
          source.lastSyncStatus,
          source.lastError,
          source.lastSyncAt,
          source.createdAt,
          source.updatedAt,
        )
        .run();

      return source;
    },

    async createSubscription(input) {
      const timestamp = now().toISOString();
      const subscription: StoredSubscription = {
        createdAt: timestamp,
        defaultFormat: input.defaultFormat ?? "raw",
        description: input.description ?? "",
        id: createId("subscription"),
        name: input.name,
        shareToken: createToken(),
        updatedAt: timestamp,
      };

      await db
        .prepare(
          "insert into subscriptions (id, name, description, share_token, default_format, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          subscription.id,
          subscription.name,
          subscription.description,
          subscription.shareToken,
          subscription.defaultFormat,
          subscription.createdAt,
          subscription.updatedAt,
        )
        .run();
      await this.addNodesToSubscription(subscription.id, input.nodeIds);
      return subscription;
    },

    async getDashboard() {
      const proxies = await db
        .prepare("select * from proxy_nodes order by updated_at desc")
        .all<ProxyRow>();
      const sources = await db
        .prepare("select * from sources order by updated_at desc")
        .all<SourceRow>();
      const subscriptions = await db
        .prepare(
          "select s.*, count(si.id) as item_count from subscriptions s left join subscription_items si on si.subscription_id = s.id group by s.id order by s.updated_at desc",
        )
        .all<SubscriptionListRow>();

      return {
        proxies: (proxies.results ?? []).map(rowToProxy),
        sources: (sources.results ?? []).map(rowToSource),
        subscriptions: (subscriptions.results ?? []).map((row) => ({
          ...rowToSubscription(row),
          itemCount: Number(row.item_count ?? 0),
        })),
      };
    },

    async getProxy(id) {
      const row = await db
        .prepare("select * from proxy_nodes where id = ?")
        .bind(id)
        .first<ProxyRow>();
      return row ? rowToProxy(row) : null;
    },

    async getSource(id) {
      const row = await db
        .prepare("select * from sources where id = ?")
        .bind(id)
        .first<SourceRow>();
      return row ? rowToSource(row) : null;
    },

    async getSubscription(id) {
      const row = await db
        .prepare("select * from subscriptions where id = ?")
        .bind(id)
        .first<SubscriptionRow>();
      return row ? rowToSubscription(row) : null;
    },

    async getSubscriptionByShareToken(shareToken) {
      const row = await db
        .prepare("select * from subscriptions where share_token = ?")
        .bind(shareToken)
        .first<SubscriptionRow>();
      return row ? rowToSubscription(row) : null;
    },

    async getSubscriptionItems(subscriptionId) {
      const rows = await db
        .prepare(
          "select id, proxy_id, position from subscription_items where subscription_id = ? order by position asc",
        )
        .bind(subscriptionId)
        .all<SubscriptionItemRow>();
      return (rows.results ?? []).map((row) => ({
        id: row.id,
        position: Number(row.position),
        proxyId: row.proxy_id,
      }));
    },

    async getSubscriptionNodes(subscriptionId) {
      const rows = await db
        .prepare(
          "select pn.* from subscription_items si join proxy_nodes pn on pn.id = si.proxy_id where si.subscription_id = ? order by si.position asc",
        )
        .bind(subscriptionId)
        .all<ProxyRow>();
      return (rows.results ?? []).map(rowToProxy);
    },

    async importNodes(nodes) {
      const imported: StoredProxy[] = [];

      for (const node of nodes) {
        const existing = await db
          .prepare("select * from proxy_nodes where fingerprint = ?")
          .bind(node.fingerprint)
          .first<ProxyRow>();

        if (existing) {
          await db
            .prepare(
              "update proxy_nodes set protocol = ?, source_name = ?, raw_payload = ?, share_uri = ?, parse_status = ?, normalized_json = ?, updated_at = ? where id = ?",
            )
            .bind(
              node.protocol,
              node.sourceName,
              node.rawPayload,
              node.shareUri,
              node.parseStatus,
              JSON.stringify(node.normalized),
              now().toISOString(),
              existing.id,
            )
            .run();
          const refreshed = await this.getProxy(existing.id);
          if (refreshed) imported.push(refreshed);
          continue;
        }

        const timestamp = now().toISOString();
        await db
          .prepare(
            "insert into proxy_nodes (id, fingerprint, protocol, source_name, display_name, raw_payload, share_uri, parse_status, tags_json, enabled, normalized_json, share_token, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            node.id,
            node.fingerprint,
            node.protocol,
            node.sourceName,
            node.displayName,
            node.rawPayload,
            node.shareUri,
            node.parseStatus,
            JSON.stringify(node.tags),
            node.enabled ? 1 : 0,
            JSON.stringify(node.normalized),
            createToken(),
            timestamp,
            timestamp,
          )
          .run();
        const created = await this.getProxy(node.id);
        if (created) imported.push(created);
      }

      return imported;
    },

    async removeSubscriptionItem(subscriptionId, itemId) {
      await db
        .prepare("delete from subscription_items where id = ? and subscription_id = ?")
        .bind(itemId, subscriptionId)
        .run();

      const items = await this.getSubscriptionItems(subscriptionId);
      for (const [index, item] of items.entries()) {
        await db
          .prepare("update subscription_items set position = ? where id = ?")
          .bind(index, item.id)
          .run();
      }
      await db
        .prepare("update subscriptions set updated_at = ? where id = ?")
        .bind(now().toISOString(), subscriptionId)
        .run();
    },

    async replaceSourceNodes(sourceId, nodes) {
      const imported = await this.importNodes(nodes);
      await db
        .prepare("delete from source_nodes where source_id = ?")
        .bind(sourceId)
        .run();
      for (const proxy of imported) {
        await db
          .prepare(
            "insert into source_nodes (source_id, proxy_id) values (?, ?)",
          )
          .bind(sourceId, proxy.id)
          .run();
      }
      return imported;
    },

    async rotateSubscriptionShareToken(subscriptionId) {
      const nextToken = createToken();
      await db
        .prepare(
          "update subscriptions set share_token = ?, updated_at = ? where id = ?",
        )
        .bind(nextToken, now().toISOString(), subscriptionId)
        .run();
      return this.getSubscription(subscriptionId);
    },

    async updateProxyMetadata(proxyId, input) {
      const current = await this.getProxy(proxyId);
      if (!current) {
        return null;
      }

      await db
        .prepare(
          "update proxy_nodes set display_name = ?, tags_json = ?, enabled = ?, updated_at = ? where id = ?",
        )
        .bind(
          input.displayName ?? current.displayName,
          JSON.stringify(input.tags ?? current.tags),
          (input.enabled ?? current.enabled) ? 1 : 0,
          now().toISOString(),
          proxyId,
        )
        .run();
      return this.getProxy(proxyId);
    },

    async updateSourceSyncState(sourceId, input) {
      await db
        .prepare(
          "update sources set last_sync_status = ?, last_error = ?, last_sync_at = ?, updated_at = ? where id = ?",
        )
        .bind(
          input.lastSyncStatus,
          input.lastError,
          input.lastSyncAt,
          now().toISOString(),
          sourceId,
        )
        .run();
      return this.getSource(sourceId);
    },

    async updateSubscription(subscriptionId, input) {
      const current = await this.getSubscription(subscriptionId);
      if (!current) {
        return null;
      }

      await db
        .prepare(
          "update subscriptions set name = ?, description = ?, default_format = ?, updated_at = ? where id = ?",
        )
        .bind(
          input.name ?? current.name,
          input.description ?? current.description,
          input.defaultFormat ?? current.defaultFormat,
          now().toISOString(),
          subscriptionId,
        )
        .run();
      return this.getSubscription(subscriptionId);
    },
  };

  return new Proxy(store, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }

      return async (...args: unknown[]) => {
        await ensureD1Schema(db);
        return Reflect.apply(value, target, args);
      };
    },
  });
}

function compareUpdatedAt(
  left: { updatedAt: string },
  right: { updatedAt: string },
): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function touchSubscription(
  subscriptions: Map<string, StoredSubscription>,
  subscriptionId: string,
  now: () => Date,
): void {
  const subscription = subscriptions.get(subscriptionId);
  if (!subscription) {
    return;
  }

  subscriptions.set(subscriptionId, {
    ...subscription,
    updatedAt: now().toISOString(),
  });
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function createToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join(
    "",
  );
}

interface ProxyRow {
  created_at: string;
  display_name: string;
  enabled: number;
  fingerprint: string;
  id: string;
  normalized_json: string;
  parse_status: ImportedNode["parseStatus"];
  protocol: ImportedNode["protocol"];
  raw_payload: string;
  share_token: string;
  share_uri: string | null;
  source_name: string;
  tags_json: string;
  updated_at: string;
}

interface SourceRow {
  created_at: string;
  id: string;
  kind: ImportKind;
  last_error: string | null;
  last_sync_at: string | null;
  last_sync_status: StoredSource["lastSyncStatus"];
  name: string;
  refresh_interval_minutes: number;
  updated_at: string;
  url: string;
}

interface SubscriptionItemRow {
  id: string;
  position: number;
  proxy_id: string;
}

interface SubscriptionListRow extends SubscriptionRow {
  item_count: number;
}

interface SubscriptionRow {
  created_at: string;
  default_format: ExportProfile;
  description: string;
  id: string;
  name: string;
  share_token: string;
  updated_at: string;
}

function rowToProxy(row: ProxyRow): StoredProxy {
  return toStoredProxyForOutput({
    createdAt: row.created_at,
    displayName: row.display_name,
    enabled: Boolean(row.enabled),
    fingerprint: row.fingerprint,
    id: row.id,
    normalized: JSON.parse(row.normalized_json) as ImportedNode["normalized"],
    parseStatus: row.parse_status,
    protocol: row.protocol,
    rawPayload: row.raw_payload,
    shareToken: row.share_token,
    shareUri: row.share_uri,
    sourceName: row.source_name,
    tags: JSON.parse(row.tags_json) as string[],
    updatedAt: row.updated_at,
  });
}

function toStoredProxyForOutput(proxy: StoredProxy): StoredProxy {
  return {
    ...proxy,
    shareUri: renderNodeShareUri(proxy) ?? proxy.shareUri,
  };
}

function rowToSource(row: SourceRow): StoredSource {
  return {
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    lastError: row.last_error,
    lastSyncAt: row.last_sync_at,
    lastSyncStatus: row.last_sync_status,
    name: row.name,
    refreshIntervalMinutes: Number(row.refresh_interval_minutes),
    updatedAt: row.updated_at,
    url: row.url,
  };
}

function rowToSubscription(row: SubscriptionRow): StoredSubscription {
  return {
    createdAt: row.created_at,
    defaultFormat: row.default_format,
    description: row.description,
    id: row.id,
    name: row.name,
    shareToken: row.share_token,
    updatedAt: row.updated_at,
  };
}
