import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@ui/App";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the login screen and loads the dashboard after authentication", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            proxies: [
              {
                displayName: "Edge Prime",
                enabled: true,
                id: "node_1",
                protocol: "vless",
                shareToken: "unused",
                shareUri:
                  "vless://11111111-1111-1111-1111-111111111111@edge.example.com:443?encryption=none#Edge%20Prime",
                sourceName: "manual-import",
                tags: ["hk"],
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
            ],
            sources: [
              {
                id: "source_1",
                kind: "raw",
                lastError: null,
                lastSyncAt: "2026-06-24T00:00:00.000Z",
                lastSyncStatus: "success",
                name: "Friend Feed",
                refreshIntervalMinutes: 15,
                updatedAt: "2026-06-24T00:00:00.000Z",
                url: "https://friend.example/sub.txt",
              },
            ],
            subscriptions: [
              {
                defaultFormat: "clash-meta",
                description: "",
                id: "subscription_1",
                itemCount: 1,
                name: "Travel Pack",
                shareToken: "travel-pack-token",
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
            ],
          }),
        ),
      );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /admin access/i }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/username/i), "admin");
    await userEvent.type(screen.getByLabelText(/password/i), "admin-pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByRole("heading", { name: /proxy command center/i }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: /workspace sections/i });
    expect(within(nav).getByRole("button", { name: /^inventory$/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /^sources$/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /^packs$/i })).toBeInTheDocument();
    expect(screen.getByText("Edge Prime")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it("shows the backend error when dashboard loading fails after login", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response("D1 binding DB is not configured in Cloudflare Worker settings.", {
          status: 500,
        }),
      );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /admin access/i }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/username/i), "admin");
    await userEvent.type(screen.getByLabelText(/password/i), "admin-pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(
        "D1 binding DB is not configured in Cloudflare Worker settings.",
      ),
    ).toBeInTheDocument();
  });

  it("manages pack content inside the packs workspace and shows tags for duplicate names", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            proxies: [
              {
                displayName: "Edge",
                enabled: true,
                id: "node_1",
                protocol: "vless",
                shareToken: "unused-1",
                shareUri: "vless://one#Edge_hk",
                sourceName: "manual-import",
                tags: ["hk"],
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
              {
                displayName: "Edge",
                enabled: true,
                id: "node_2",
                protocol: "trojan",
                shareToken: "unused-2",
                shareUri: "trojan://two#Edge_us",
                sourceName: "friend-feed",
                tags: ["us"],
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
            ],
            sources: [],
            subscriptions: [
              {
                defaultFormat: "clash-meta",
                description: "City split",
                id: "subscription_1",
                itemCount: 1,
                name: "Travel Pack",
                shareToken: "travel-pack-token",
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "item_1",
                position: 0,
                proxyId: "node_1",
                proxy: {
                  displayName: "Edge",
                  enabled: true,
                  id: "node_1",
                  protocol: "vless",
                  shareToken: "unused-1",
                  shareUri: "vless://one#Edge_hk",
                  sourceName: "manual-import",
                  tags: ["hk"],
                  updatedAt: "2026-06-24T00:00:00.000Z",
                },
              },
            ],
            nodes: [
              {
                displayName: "Edge",
                enabled: true,
                id: "node_1",
                protocol: "vless",
                shareToken: "unused-1",
                shareUri: "vless://one#Edge_hk",
                sourceName: "manual-import",
                tags: ["hk"],
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
            ],
            subscription: {
              defaultFormat: "clash-meta",
              description: "City split",
              id: "subscription_1",
              itemCount: 1,
              name: "Travel Pack",
              shareToken: "travel-pack-token",
              updatedAt: "2026-06-24T00:00:00.000Z",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "item_1",
                position: 0,
                proxyId: "node_1",
                proxy: {
                  displayName: "Edge",
                  enabled: true,
                  id: "node_1",
                  protocol: "vless",
                  shareToken: "unused-1",
                  shareUri: "vless://one#Edge_hk",
                  sourceName: "manual-import",
                  tags: ["hk"],
                  updatedAt: "2026-06-24T00:00:00.000Z",
                },
              },
              {
                id: "item_2",
                position: 1,
                proxyId: "node_2",
                proxy: {
                  displayName: "Edge",
                  enabled: true,
                  id: "node_2",
                  protocol: "trojan",
                  shareToken: "unused-2",
                  shareUri: "trojan://two#Edge_us",
                  sourceName: "friend-feed",
                  tags: ["us"],
                  updatedAt: "2026-06-24T00:00:00.000Z",
                },
              },
            ],
            nodes: [
              {
                displayName: "Edge",
                enabled: true,
                id: "node_1",
                protocol: "vless",
                shareToken: "unused-1",
                shareUri: "vless://one#Edge_hk",
                sourceName: "manual-import",
                tags: ["hk"],
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
              {
                displayName: "Edge",
                enabled: true,
                id: "node_2",
                protocol: "trojan",
                shareToken: "unused-2",
                shareUri: "trojan://two#Edge_us",
                sourceName: "friend-feed",
                tags: ["us"],
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
            ],
            subscription: {
              defaultFormat: "clash-meta",
              description: "City split",
              id: "subscription_1",
              itemCount: 2,
              name: "Travel Pack",
              shareToken: "travel-pack-token",
              updatedAt: "2026-06-24T00:00:00.000Z",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            proxies: [
              {
                displayName: "Edge",
                enabled: true,
                id: "node_1",
                protocol: "vless",
                shareToken: "unused-1",
                shareUri: "vless://one#Edge_hk",
                sourceName: "manual-import",
                tags: ["hk"],
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
              {
                displayName: "Edge",
                enabled: true,
                id: "node_2",
                protocol: "trojan",
                shareToken: "unused-2",
                shareUri: "trojan://two#Edge_us",
                sourceName: "friend-feed",
                tags: ["us"],
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
            ],
            sources: [],
            subscriptions: [
              {
                defaultFormat: "clash-meta",
                description: "City split",
                id: "subscription_1",
                itemCount: 2,
                name: "Travel Pack",
                shareToken: "travel-pack-token",
                updatedAt: "2026-06-24T00:00:00.000Z",
              },
            ],
          }),
        ),
      );

    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "admin");
    await userEvent.type(screen.getByLabelText(/password/i), "admin-pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await userEvent.click(
      await screen.findByRole("button", { name: /packs/i }),
    );

    expect(await screen.findByRole("tab", { name: /content/i })).toBeInTheDocument();
    expect(screen.getAllByText("hk").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /add proxies/i }));

    expect(await screen.findByText(/friend-feed/i)).toBeInTheDocument();
    expect(screen.getAllByText("us").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByLabelText(/pick edge us/i));
    await userEvent.click(screen.getByRole("button", { name: /add 1 proxy/i }));

    expect((await screen.findAllByText("Edge")).length).toBeGreaterThan(1);
    expect(screen.getAllByText("us").length).toBeGreaterThan(0);
  });
});
