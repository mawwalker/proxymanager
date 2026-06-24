import { render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText("Edge Prime")).toBeInTheDocument();
    expect(screen.getByText("Friend Feed")).toBeInTheDocument();
    expect(screen.getByText("Travel Pack")).toBeInTheDocument();

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
});
