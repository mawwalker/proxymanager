import { startTransition, useEffect, useMemo, useState } from "react";

import { SummaryStrip } from "@ui/chrome";
import { InventoryView } from "@ui/InventoryView";
import { apiRequest, countHealthySources, countUniqueProtocols, findDefaultPackId } from "@ui/lib";
import { PacksView } from "@ui/PacksView";
import { ShareModal } from "@ui/ShareModal";
import { SourcesView } from "@ui/SourcesView";
import { initialDashboard, type DashboardState, type Screen, type ShareTarget } from "@ui/types";

export function App() {
  const [authState, setAuthState] = useState<
    "authenticated" | "loading" | "unauthenticated"
  >("loading");
  const [dashboard, setDashboard] = useState<DashboardState>(initialDashboard);
  const [screen, setScreen] = useState<Screen>("inventory");
  const [statusMessage, setStatusMessage] = useState("Checking session...");
  const [loginForm, setLoginForm] = useState({ password: "", username: "" });
  const [activeSubscriptionId, setActiveSubscriptionId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  useEffect(() => {
    void loadDashboard().catch(reportError);
  }, []);

  const shellMetrics = useMemo(
    () => [
      { label: "Proxies", value: dashboard.proxies.length },
      { label: "Protocols", value: countUniqueProtocols(dashboard.proxies) },
      { label: "Healthy Feeds", value: countHealthySources(dashboard.sources) },
      { label: "Packs", value: dashboard.subscriptions.length },
    ],
    [dashboard.proxies, dashboard.sources, dashboard.subscriptions.length],
  );

  function reportError(error: unknown) {
    console.error(error);
    setStatusMessage(
      error instanceof Error ? error.message : "Unexpected request error.",
    );
  }

  async function loadDashboard() {
    setStatusMessage("Loading workspace...");
    const response = await fetch("/api/dashboard", {
      credentials: "include",
    });

    if (response.status === 401) {
      setAuthState("unauthenticated");
      setStatusMessage("Sign in to manage your proxy inventory.");
      return;
    }

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(payload || `Request failed with ${response.status}`);
    }

    const data = (await response.json()) as DashboardState;
    startTransition(() => {
      setDashboard(data);
      setAuthState("authenticated");
      setStatusMessage("Workspace ready.");
      setActiveSubscriptionId((current) => findDefaultPackId(data, current));
    });
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("Signing in...");

    try {
      await apiRequest("/api/session", {
        body: JSON.stringify(loginForm),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      await loadDashboard();
    } catch (error) {
      reportError(error);
    }
  }

  async function handleLogout() {
    setStatusMessage("Signing out...");

    try {
      await apiRequest("/api/session", {
        method: "DELETE",
      });
      setDashboard(initialDashboard);
      setActiveSubscriptionId(null);
      setAuthState("unauthenticated");
      setStatusMessage("Signed out.");
    } catch (error) {
      reportError(error);
    }
  }

  if (authState === "loading") {
    return <LoadingShell message={statusMessage} />;
  }

  if (authState === "unauthenticated") {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <p className="eyebrow">Proxy Manager</p>
          <h1>Admin Access</h1>
          <p className="supporting">
            Sign in to manage imported proxy links, upstream feeds, and custom packs.
          </p>
          <form className="stack-form" onSubmit={handleLogin}>
            <label>
              <span>Username</span>
              <input
                autoComplete="username"
                name="username"
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                value={loginForm.username}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                autoComplete="current-password"
                name="password"
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                type="password"
                value={loginForm.password}
              />
            </label>
            <button className="primary-button" type="submit">
              Sign In
            </button>
          </form>
          <p className="status-line">{statusMessage}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="workspace-rail">
        <div className="rail-brand">
          <p className="eyebrow">Cloudflare Worker</p>
          <h1>Proxy Manager</h1>
          <p className="supporting compact">
            A cleaner control plane for inventory, remote feeds, and curated exports.
          </p>
        </div>

        <nav aria-label="Primary Navigation" className="rail-nav">
          {([
            ["inventory", "Inventory"],
            ["sources", "Sources"],
            ["packs", "Packs"],
          ] as const).map(([id, label]) => (
            <button
              className={screen === id ? "rail-link rail-link-active" : "rail-link"}
              key={id}
              onClick={() => setScreen(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="rail-footer">
          <p className="status-line">{statusMessage}</p>
          <button className="ghost-button" onClick={() => void handleLogout()} type="button">
            Sign Out
          </button>
        </div>
      </aside>

      <section className="app-main">
        <header className="page-header">
          <div>
            <p className="eyebrow">{screenEyebrow(screen)}</p>
            <h2>{screenTitle(screen)}</h2>
            <p className="supporting">{screenDescription(screen)}</p>
          </div>
        </header>

        <SummaryStrip label="Workspace Overview" items={shellMetrics} />

        {screen === "inventory" ? (
          <InventoryView
            onError={reportError}
            onOpenShare={setShareTarget}
            onRefreshDashboard={loadDashboard}
            onStatusChange={setStatusMessage}
            proxies={dashboard.proxies}
          />
        ) : null}

        {screen === "sources" ? (
          <SourcesView
            onError={reportError}
            onRefreshDashboard={loadDashboard}
            onStatusChange={setStatusMessage}
            sources={dashboard.sources}
          />
        ) : null}

        {screen === "packs" ? (
          <PacksView
            activeSubscriptionId={activeSubscriptionId}
            dashboard={dashboard}
            onError={reportError}
            onOpenShare={setShareTarget}
            onRefreshDashboard={loadDashboard}
            onSelectSubscription={setActiveSubscriptionId}
            onStatusChange={setStatusMessage}
          />
        ) : null}
      </section>

      {shareTarget ? (
        <ShareModal onClose={() => setShareTarget(null)} target={shareTarget} />
      ) : null}
    </main>
  );
}

function LoadingShell({ message }: { message: string }) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Proxy Manager</p>
        <h1>Booting Workspace</h1>
        <p className="supporting">{message}</p>
      </section>
    </main>
  );
}

function screenDescription(screen: Screen): string {
  if (screen === "inventory") {
    return "Search nodes, edit share-facing metadata, and import fresh links from a drawer.";
  }

  if (screen === "sources") {
    return "Monitor upstream subscriptions, inspect sync health, and add new sources without leaving the list.";
  }

  return "Browse packs, adjust content, and manage export flows from one split workspace.";
}

function screenEyebrow(screen: Screen): string {
  if (screen === "inventory") {
    return "Inventory";
  }

  if (screen === "sources") {
    return "Remote Feeds";
  }

  return "Custom Packs";
}

function screenTitle(screen: Screen): string {
  if (screen === "inventory") {
    return "Proxy Inventory";
  }

  if (screen === "sources") {
    return "Source Health";
  }

  return "Pack Workspace";
}
