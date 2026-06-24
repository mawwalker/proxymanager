import { deleteCookie } from "hono/cookie";
import { Hono } from "hono";
import { z } from "zod";

import {
  exportSubscriptionProfile,
  importProxyCollection,
} from "@shared/proxy-codec";
import type { AuthSecrets } from "@worker/auth";
import {
  requireAuth,
  setSessionCookie,
  verifyCredentials,
} from "@worker/auth";
import type { ProxyStore } from "@worker/store";

interface CreateAppOptions {
  fetchRemoteContent: (url: string) => Promise<string>;
  secrets: AuthSecrets;
  store: ProxyStore;
}

const loginSchema = z.object({
  password: z.string().min(1),
  username: z.string().min(1),
});

const importSchema = z.object({
  content: z.string().min(1),
  kind: z.enum(["clash", "raw", "sing-box"]).default("raw"),
});

const proxyUpdateSchema = z.object({
  displayName: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const sourceSchema = z.object({
  kind: z.enum(["clash", "raw", "sing-box"]),
  name: z.string().min(1),
  refreshIntervalMinutes: z.number().int().positive().max(1440).optional(),
  url: z.url(),
});

const subscriptionCreateSchema = z.object({
  defaultFormat: z.enum(["clash-meta", "raw", "sing-box"]).optional(),
  description: z.string().optional(),
  name: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).min(1),
});

const subscriptionItemsSchema = z.object({
  nodeIds: z.array(z.string().min(1)).min(1),
});

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();

  app.post("/api/session", async (context) => {
    const body = loginSchema.parse(await context.req.json());
    const ok = await verifyCredentials(options.secrets, body);
    if (!ok) {
      return context.json({ error: "Invalid credentials" }, 401);
    }

    await setSessionCookie(context, options.secrets);
    return context.json({ ok: true });
  });

  app.delete("/api/session", async (context) => {
    deleteCookie(context, "pm_session", { path: "/" });
    return context.json({ ok: true });
  });

  app.use("/api/*", requireAuth(options.secrets));

  app.get("/api/dashboard", async (context) => {
    return context.json(await options.store.getDashboard());
  });

  app.post("/api/proxies/import", async (context) => {
    const body = importSchema.parse(await context.req.json());
    const imported = await importProxyCollection({
      content: body.content,
      kind: body.kind,
      sourceName: "manual-import",
    });
    const stored = await options.store.importNodes(imported.nodes);
    return context.json({ nodes: stored });
  });

  app.patch("/api/proxies/:id", async (context) => {
    const body = proxyUpdateSchema.parse(await context.req.json());
    const proxy = await options.store.updateProxyMetadata(
      context.req.param("id"),
      body,
    );
    if (!proxy) {
      return context.json({ error: "Proxy not found" }, 404);
    }

    return context.json({ proxy });
  });

  app.post("/api/sources", async (context) => {
    const body = sourceSchema.parse(await context.req.json());
    const source = await options.store.createSource(body);
    return context.json({ source });
  });

  app.post("/api/sources/:id/sync", async (context) => {
    const source = await options.store.getSource(context.req.param("id"));
    if (!source) {
      return context.json({ error: "Source not found" }, 404);
    }

    try {
      const remoteContent = await options.fetchRemoteContent(source.url);
      const imported = await importProxyCollection({
        content: remoteContent,
        kind: source.kind,
        sourceName: source.name,
      });
      const nodes = await options.store.replaceSourceNodes(source.id, imported.nodes);
      const updatedSource = await options.store.updateSourceSyncState(source.id, {
        lastError: null,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: "success",
      });
      return context.json({
        importedCount: nodes.length,
        nodes,
        source: updatedSource,
      });
    } catch (error) {
      const updatedSource = await options.store.updateSourceSyncState(source.id, {
        lastError: error instanceof Error ? error.message : "Unknown sync error",
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: "failed",
      });
      return context.json(
        {
          error: "Failed to sync source",
          source: updatedSource,
        },
        500,
      );
    }
  });

  app.post("/api/subscriptions", async (context) => {
    const body = subscriptionCreateSchema.parse(await context.req.json());
    const subscription = await options.store.createSubscription(body);
    return context.json({ subscription });
  });

  app.get("/api/subscriptions/:id", async (context) => {
    const subscription = await options.store.getSubscription(context.req.param("id"));
    if (!subscription) {
      return context.json({ error: "Subscription not found" }, 404);
    }

    return context.json(await buildSubscriptionDetail(options.store, subscription.id));
  });

  app.post("/api/subscriptions/:id/items", async (context) => {
    const subscription = await options.store.getSubscription(context.req.param("id"));
    if (!subscription) {
      return context.json({ error: "Subscription not found" }, 404);
    }

    const body = subscriptionItemsSchema.parse(await context.req.json());
    const items = await options.store.addNodesToSubscription(subscription.id, body.nodeIds);
    return context.json({ items });
  });

  app.post("/api/subscriptions/:id/import", async (context) => {
    const subscription = await options.store.getSubscription(context.req.param("id"));
    if (!subscription) {
      return context.json({ error: "Subscription not found" }, 404);
    }

    const body = importSchema.parse(await context.req.json());
    const imported = await importProxyCollection({
      content: body.content,
      kind: body.kind,
      sourceName: subscription.name,
    });
    const stored = await options.store.importNodes(imported.nodes);
    const items = await options.store.addNodesToSubscription(
      subscription.id,
      stored.map((item) => item.id),
    );
    return context.json({ items, nodes: stored });
  });

  app.delete("/api/subscriptions/:id/items/:itemId", async (context) => {
    const subscription = await options.store.getSubscription(context.req.param("id"));
    if (!subscription) {
      return context.json({ error: "Subscription not found" }, 404);
    }

    await options.store.removeSubscriptionItem(
      subscription.id,
      context.req.param("itemId"),
    );
    return context.json({ ok: true });
  });

  app.post("/api/subscriptions/:id/share-token/rotate", async (context) => {
    const subscription = await options.store.rotateSubscriptionShareToken(
      context.req.param("id"),
    );
    if (!subscription) {
      return context.json({ error: "Subscription not found" }, 404);
    }

    return context.json({ subscription });
  });

  app.get("/api/subscriptions/:id/export", async (context) => {
    const subscription = await options.store.getSubscription(context.req.param("id"));
    if (!subscription) {
      return context.json({ error: "Subscription not found" }, 404);
    }

    const nodes = await options.store.getSubscriptionNodes(subscription.id);
    const format = parseExportFormat(
      context.req.query("format"),
      subscription.defaultFormat,
    );
    const exported = exportSubscriptionProfile(format, nodes);
    return context.json(exported);
  });

  app.get("/share/sub/:token", async (context) => {
    const subscription = await options.store.getSubscriptionByShareToken(
      context.req.param("token"),
    );
    if (!subscription) {
      return context.text("Subscription not found", 404);
    }

    const nodes = await options.store.getSubscriptionNodes(subscription.id);
    const format = parseExportFormat(
      context.req.query("format"),
      subscription.defaultFormat,
    );
    const exported = exportSubscriptionProfile(format, nodes);
    return context.body(exported.content, 200, {
      "content-type": exported.mediaType,
      "x-proxymanager-skipped": String(exported.skipped.length),
    });
  });

  app.get("/", (context) =>
    context.text("ProxyManager Worker is running. Build the UI assets with Vite."),
  );

  return app;
}

function parseExportFormat(value: string | undefined, fallback: string) {
  const format = value ?? fallback;
  return z.enum(["clash-meta", "raw", "sing-box"]).parse(format);
}

async function buildSubscriptionDetail(store: ProxyStore, subscriptionId: string) {
  const subscription = await store.getSubscription(subscriptionId);
  const items = await store.getSubscriptionItems(subscriptionId);
  const nodes = await store.getSubscriptionNodes(subscriptionId);
  const proxyById = new Map(nodes.map((node) => [node.id, node]));

  return {
    items: items.map((item) => ({
      id: item.id,
      position: item.position,
      proxy: proxyById.get(item.proxyId),
      proxyId: item.proxyId,
    })),
    nodes,
    subscription,
  };
}
