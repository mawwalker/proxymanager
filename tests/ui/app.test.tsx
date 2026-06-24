import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@ui/App";

const dashboardFixture = {
  proxies: [
    {
      displayName: "Edge Prime",
      enabled: true,
      id: "node_1",
      protocol: "vless",
      shareToken: "unused-1",
      shareUri:
        "vless://11111111-1111-1111-1111-111111111111@edge.example.com:443?encryption=none#Edge%20Prime",
      sourceName: "manual-import",
      tags: ["hk", "stream"],
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
    {
      displayName: "Edge Prime",
      enabled: true,
      id: "node_2",
      protocol: "trojan",
      shareToken: "unused-2",
      shareUri: "trojan://pass@us.example.com:443#Edge%20Prime_us",
      sourceName: "friend-feed",
      tags: ["us"],
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
      description: "City split",
      id: "subscription_1",
      itemCount: 2,
      name: "Travel Pack",
      shareToken: "travel-pack-token",
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
  ],
};

const subscriptionDetailFixture = {
  items: [
    {
      id: "item_1",
      position: 0,
      proxyId: "node_1",
      proxy: dashboardFixture.proxies[0],
    },
    {
      id: "item_2",
      position: 1,
      proxyId: "node_2",
      proxy: dashboardFixture.proxies[1],
    },
  ],
  nodes: dashboardFixture.proxies,
  subscription: dashboardFixture.subscriptions[0],
};

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the lighter workspace shell with a top overview strip after authentication", async () => {
    const fetchMock = mockAppFetch();

    render(<App />);
    await signIn();

    expect(await screen.findByRole("heading", { name: /proxy manager/i })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /workspace overview/i }),
    ).toBeInTheDocument();

    const navigation = screen.getByRole("navigation", { name: /primary navigation/i });
    expect(within(navigation).getByRole("button", { name: /^inventory$/i })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: /^sources$/i })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: /^packs$/i })).toBeInTheDocument();
    expect(within(navigation).queryByText(/healthy feeds/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it("opens inventory import from a drawer and edits proxy metadata in the detail pane", async () => {
    mockAppFetch();

    render(<App />);
    await signIn();

    await userEvent.click(
      await screen.findByRole("button", { name: /import links/i }),
    );
    expect(
      await screen.findByRole("dialog", { name: /import inventory links/i }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /edge prime manual-import/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /proxy details/i }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Edge Prime")).toBeInTheDocument();
    expect(screen.getByDisplayValue("hk, stream")).toBeInTheDocument();
  });

  it("opens add source from a drawer and shows source details in a side pane", async () => {
    mockAppFetch();

    render(<App />);
    await signIn();

    await userEvent.click(screen.getByRole("button", { name: /^sources$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /new source/i }));

    expect(
      await screen.findByRole("dialog", { name: /add remote source/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /friend feed/i }));

    const detailHeading = await screen.findByRole("heading", { name: /source details/i });
    expect(detailHeading).toBeInTheDocument();
    expect(
      within(detailHeading.closest("aside")!).getByText("https://friend.example/sub.txt"),
    ).toBeInTheDocument();
  });

  it("keeps packs list-first and moves create and import flows into drawers", async () => {
    mockAppFetch();

    render(<App />);
    await signIn();

    await userEvent.click(screen.getByRole("button", { name: /^packs$/i }));

    expect(await screen.findByRole("heading", { name: /travel pack/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/pack name/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Edge Prime").length).toBeGreaterThan(0);
    expect(screen.getAllByText("us").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /new pack/i }));
    const createDialog = await screen.findByRole("dialog", { name: /create pack/i });
    expect(createDialog).toBeInTheDocument();
    await userEvent.click(within(createDialog).getByRole("button", { name: /close/i }));

    await userEvent.click(screen.getByRole("button", { name: /import links/i }));
    expect(
      await screen.findByRole("dialog", { name: /import links into pack/i }),
    ).toBeInTheDocument();
  });
});

function mockAppFetch() {
  let authenticated = false;

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method?.toUpperCase() ?? "GET";

    if (url === "/api/dashboard" && method === "GET") {
      if (!authenticated) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        });
      }

      return jsonResponse(dashboardFixture);
    }

    if (url === "/api/session" && method === "POST") {
      authenticated = true;
      return jsonResponse({ ok: true });
    }

    if (url === "/api/subscriptions/subscription_1" && method === "GET") {
      return jsonResponse(subscriptionDetailFixture);
    }

    throw new Error(`Unhandled fetch request: ${method} ${url}`);
  });
}

async function signIn() {
  expect(
    await screen.findByRole("heading", { name: /admin access/i }),
  ).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText(/username/i), "admin");
  await userEvent.type(screen.getByLabelText(/password/i), "admin-pass");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}
