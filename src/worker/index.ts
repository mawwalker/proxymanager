import { createApp } from "@worker/app";
import { requireSessionSecret } from "@worker/auth";
import { createD1Store } from "@worker/store";

export interface CloudflareEnv {
  ADMIN_PASSWORD_HASH: string;
  ADMIN_USERNAME: string;
  CACHE: KVNamespace;
  DB: D1Database;
  SESSION_SECRET: string;
}

function createRuntimeApp(env: CloudflareEnv) {
  return createApp({
    fetchRemoteContent: async (url) => {
      const response = await fetch(url, {
        headers: {
          "user-agent": "ProxyManager/1.0",
        },
      });
      if (!response.ok) {
        throw new Error(`Upstream request failed with ${response.status}`);
      }
      return response.text();
    },
    secrets: {
      passwordHash: env.ADMIN_PASSWORD_HASH,
      sessionSecret: env.SESSION_SECRET,
      username: env.ADMIN_USERNAME,
    },
    store: createD1Store(env.DB),
  });
}

export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    const app = createRuntimeApp(env);
    return app.fetch(request, env, executionContext);
  },

  async scheduled(
    _controller: ScheduledController,
    env: CloudflareEnv,
    _executionContext: ExecutionContext,
  ): Promise<void> {
    const app = createRuntimeApp(env);
    const store = createD1Store(env.DB);
    const dashboard = await store.getDashboard();
    for (const source of dashboard.sources) {
      const due =
        !source.lastSyncAt ||
        Date.now() - Date.parse(source.lastSyncAt) >=
          source.refreshIntervalMinutes * 60 * 1000;
      if (!due) {
        continue;
      }

      await app.request(`http://cron.local/api/sources/${source.id}/sync`, {
        headers: {
          cookie: await createSystemSession(env),
        },
        method: "POST",
      });
    }
  },
};

async function createSystemSession(env: CloudflareEnv): Promise<string> {
  const payload = {
    exp: Date.now() + 5 * 60 * 1000,
    username: env.ADMIN_USERNAME,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const sessionSecret = requireSessionSecret(env.SESSION_SECRET);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  const signature = encodeBase64Url(signatureBuffer);
  return `pm_session=${encoded}.${signature}`;
}

function encodeBase64Url(value: string | ArrayBuffer): string {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let text = "";
  bytes.forEach((byte) => {
    text += String.fromCharCode(byte);
  });
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
