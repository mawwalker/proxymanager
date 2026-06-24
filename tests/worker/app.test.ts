import { describe, expect, it } from "vitest";

import { createApp } from "@worker/app";
import { createMemoryStore } from "@worker/store";

describe("ProxyManager worker app", () => {
  it("authenticates, imports proxies, edits metadata, and exports subscriptions", async () => {
    const store = createMemoryStore();
    const app = createApp({
      fetchRemoteContent: async () => {
        throw new Error("not used");
      },
      secrets: {
        passwordHash: await digest("admin-pass"),
        sessionSecret: "test-secret",
        username: "admin",
      },
      store,
    });

    const loginResponse = await app.request(
      "http://worker.test/api/session",
      {
        body: JSON.stringify({
          password: "admin-pass",
          username: "admin",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );

    expect(loginResponse.status).toBe(200);
    const sessionCookie = loginResponse.headers.get("set-cookie");
    expect(sessionCookie).toContain("pm_session=");

    const importResponse = await app.request(
      "http://worker.test/api/proxies/import",
      {
        body: JSON.stringify({
          content:
            "vless://33333333-3333-3333-3333-333333333333@edge.example.com:443?encryption=none&security=tls&sni=edge.example.com#Edge",
          kind: "raw",
        }),
        headers: {
          cookie: sessionCookie ?? "",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );

    expect(importResponse.status).toBe(200);
    const importedBody = (await importResponse.json()) as {
      nodes: Array<{ id: string; displayName: string }>;
    };
    expect(importedBody.nodes[0]?.displayName).toBe("Edge");

    const patchResponse = await app.request(
      `http://worker.test/api/proxies/${importedBody.nodes[0]?.id}`,
      {
        body: JSON.stringify({
          displayName: "Edge Prime",
          tags: ["hk", "stream"],
        }),
        headers: {
          cookie: sessionCookie ?? "",
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    );

    expect(patchResponse.status).toBe(200);
    const patched = (await patchResponse.json()) as {
      proxy: { displayName: string; tags: string[] };
    };
    expect(patched.proxy.displayName).toBe("Edge Prime");
    expect(patched.proxy.tags).toEqual(["hk", "stream"]);

    const subscriptionResponse = await app.request(
      "http://worker.test/api/subscriptions",
      {
        body: JSON.stringify({
          name: "Travel Pack",
          nodeIds: [importedBody.nodes[0]?.id],
        }),
        headers: {
          cookie: sessionCookie ?? "",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );

    expect(subscriptionResponse.status).toBe(200);
    const subscriptionBody = (await subscriptionResponse.json()) as {
      subscription: { shareToken: string };
    };

    const publicExport = await app.request(
      `http://worker.test/share/sub/${subscriptionBody.subscription.shareToken}?format=clash-meta`,
    );

    expect(publicExport.status).toBe(200);
    const yaml = await publicExport.text();
    expect(yaml).toContain("ProxyManager");
    expect(yaml).toContain("Edge Prime");
  });

  it("creates a remote source and syncs imported nodes", async () => {
    const store = createMemoryStore();
    const app = createApp({
      fetchRemoteContent: async (url) => {
        expect(url).toBe("https://friend.example/sub.txt");
        return Buffer.from(
          "trojan://secret@friend.example.com:443?security=tls#Friend",
          "utf8",
        ).toString("base64");
      },
      secrets: {
        passwordHash: await digest("admin-pass"),
        sessionSecret: "test-secret",
        username: "admin",
      },
      store,
    });

    const loginResponse = await app.request("http://worker.test/api/session", {
      body: JSON.stringify({
        password: "admin-pass",
        username: "admin",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const sessionCookie = loginResponse.headers.get("set-cookie") ?? "";

    const sourceResponse = await app.request("http://worker.test/api/sources", {
      body: JSON.stringify({
        kind: "raw",
        name: "Friend Feed",
        url: "https://friend.example/sub.txt",
      }),
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(sourceResponse.status).toBe(200);
    const sourceBody = (await sourceResponse.json()) as {
      source: { id: string };
    };

    const syncResponse = await app.request(
      `http://worker.test/api/sources/${sourceBody.source.id}/sync`,
      {
        headers: {
          cookie: sessionCookie,
        },
        method: "POST",
      },
    );

    expect(syncResponse.status).toBe(200);
    const syncBody = (await syncResponse.json()) as {
      importedCount: number;
      source: { lastSyncStatus: string };
    };
    expect(syncBody.importedCount).toBe(1);
    expect(syncBody.source.lastSyncStatus).toBe("success");

    const dashboardResponse = await app.request("http://worker.test/api/dashboard", {
      headers: {
        cookie: sessionCookie,
      },
    });
    const dashboard = (await dashboardResponse.json()) as {
      proxies: Array<{ displayName: string }>;
      sources: Array<{ name: string }>;
    };

    expect(dashboard.sources).toEqual([
      expect.objectContaining({ name: "Friend Feed" }),
    ]);
    expect(dashboard.proxies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: "Friend" }),
      ]),
    );
  });

  it("manages subscription items after creation", async () => {
    const store = createMemoryStore();
    const app = createApp({
      fetchRemoteContent: async () => {
        throw new Error("not used");
      },
      secrets: {
        passwordHash: await digest("admin-pass"),
        sessionSecret: "test-secret",
        username: "admin",
      },
      store,
    });

    const loginResponse = await app.request("http://worker.test/api/session", {
      body: JSON.stringify({
        password: "admin-pass",
        username: "admin",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const sessionCookie = loginResponse.headers.get("set-cookie") ?? "";

    const importResponse = await app.request(
      "http://worker.test/api/proxies/import",
      {
        body: JSON.stringify({
          content: [
            "trojan://secret@one.example.com:443?security=tls#One",
            "vless://44444444-4444-4444-4444-444444444444@two.example.com:443?encryption=none&security=tls#Two",
          ].join("\n"),
          kind: "raw",
        }),
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    const imported = (await importResponse.json()) as {
      nodes: Array<{ id: string }>;
    };

    const createResponse = await app.request(
      "http://worker.test/api/subscriptions",
      {
        body: JSON.stringify({
          name: "Editable",
          nodeIds: [imported.nodes[0]?.id],
        }),
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    const created = (await createResponse.json()) as {
      subscription: { id: string; shareToken: string };
    };

    const addResponse = await app.request(
      `http://worker.test/api/subscriptions/${created.subscription.id}/items`,
      {
        body: JSON.stringify({
          nodeIds: [imported.nodes[1]?.id],
        }),
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(addResponse.status).toBe(200);

    const importIntoSubscriptionResponse = await app.request(
      `http://worker.test/api/subscriptions/${created.subscription.id}/import`,
      {
        body: JSON.stringify({
          content:
            "socks://user:pass@127.0.0.1:1080#Injected",
          kind: "raw",
        }),
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(importIntoSubscriptionResponse.status).toBe(200);

    const detailResponse = await app.request(
      `http://worker.test/api/subscriptions/${created.subscription.id}`,
      {
        headers: {
          cookie: sessionCookie,
        },
      },
    );
    const detail = (await detailResponse.json()) as {
      items: Array<{ id: string; proxy: { displayName: string } }>;
    };

    expect(detail.items).toHaveLength(3);
    expect(detail.items[2]?.proxy.displayName).toBe("Injected");

    const deleteResponse = await app.request(
      `http://worker.test/api/subscriptions/${created.subscription.id}/items/${detail.items[0]?.id}`,
      {
        headers: {
          cookie: sessionCookie,
        },
        method: "DELETE",
      },
    );
    expect(deleteResponse.status).toBe(200);

    const rotateResponse = await app.request(
      `http://worker.test/api/subscriptions/${created.subscription.id}/share-token/rotate`,
      {
        headers: {
          cookie: sessionCookie,
        },
        method: "POST",
      },
    );
    const rotated = (await rotateResponse.json()) as {
      subscription: { shareToken: string };
    };

    expect(rotated.subscription.shareToken).not.toBe(created.subscription.shareToken);
  });
});

async function digest(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(buffer))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}
