import { startTransition, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type ExportFormat = "clash-meta" | "raw" | "sing-box";
type Screen = "proxies" | "sources" | "subscriptions";

interface ProxySummary {
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

interface SourceSummary {
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

interface SubscriptionSummary {
  defaultFormat: ExportFormat;
  description: string;
  id: string;
  itemCount: number;
  name: string;
  shareToken: string;
  updatedAt: string;
}

interface DashboardState {
  proxies: ProxySummary[];
  sources: SourceSummary[];
  subscriptions: SubscriptionSummary[];
}

interface SubscriptionDetail {
  items: Array<{
    id: string;
    position: number;
    proxy: ProxySummary;
    proxyId: string;
  }>;
  nodes: ProxySummary[];
  subscription: SubscriptionSummary;
}

interface ExportPreview {
  content: string;
  skipped: Array<{ id: string; name: string; reason: string }>;
}

const initialDashboard: DashboardState = {
  proxies: [],
  sources: [],
  subscriptions: [],
};

export function App() {
  const [authState, setAuthState] = useState<"authenticated" | "loading" | "unauthenticated">("loading");
  const [dashboard, setDashboard] = useState<DashboardState>(initialDashboard);
  const [screen, setScreen] = useState<Screen>("proxies");
  const [statusMessage, setStatusMessage] = useState("Checking session…");
  const [loginForm, setLoginForm] = useState({ password: "", username: "" });
  const [proxyImportForm, setProxyImportForm] = useState({ content: "", kind: "raw" as "clash" | "raw" | "sing-box" });
  const [sourceForm, setSourceForm] = useState({ kind: "raw" as "clash" | "raw" | "sing-box", name: "", url: "" });
  const [subscriptionForm, setSubscriptionForm] = useState({
    defaultFormat: "clash-meta" as ExportFormat,
    description: "",
    name: "",
  });
  const [selectedProxyIds, setSelectedProxyIds] = useState<string[]>([]);
  const [editingProxyId, setEditingProxyId] = useState<string | null>(null);
  const [proxyEditor, setProxyEditor] = useState({ displayName: "", tags: "" });
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null);
  const [subscriptionDetail, setSubscriptionDetail] = useState<SubscriptionDetail | null>(null);
  const [subscriptionImportForm, setSubscriptionImportForm] = useState({
    content: "",
    kind: "raw" as "clash" | "raw" | "sing-box",
  });
  const [exportFormat, setExportFormat] = useState<ExportFormat>("clash-meta");
  const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null);
  const [shareModal, setShareModal] = useState<{
    label: string;
    value: string;
  } | null>(null);
  const [shareQr, setShareQr] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard().catch(reportError);
  }, []);

  useEffect(() => {
    if (
      !selectedSubscriptionId ||
      authState !== "authenticated" ||
      screen !== "subscriptions"
    ) {
      return;
    }

    void loadSubscriptionDetail(selectedSubscriptionId).catch(reportError);
  }, [authState, screen, selectedSubscriptionId]);

  useEffect(() => {
    if (
      !subscriptionDetail ||
      authState !== "authenticated" ||
      screen !== "subscriptions"
    ) {
      return;
    }

    void loadExportPreview(
      subscriptionDetail.subscription.id,
      exportFormat,
    ).catch(reportError);
  }, [authState, exportFormat, screen, subscriptionDetail?.subscription.id]);

  useEffect(() => {
    if (!shareModal) {
      setShareQr(null);
      return;
    }

    void QRCode.toDataURL(shareModal.value, {
      margin: 1,
      width: 240,
    }).then(setShareQr);
  }, [shareModal]);

  const selectedSubscription = useMemo(
    () =>
      dashboard.subscriptions.find(
        (subscription) => subscription.id === selectedSubscriptionId,
      ) ?? null,
    [dashboard.subscriptions, selectedSubscriptionId],
  );

  function reportError(error: unknown) {
    console.error(error);
    setStatusMessage(
      error instanceof Error ? error.message : "Unexpected request error.",
    );
  }

  async function loadDashboard() {
    setStatusMessage("Loading dashboard…");
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
      setStatusMessage("Dashboard ready.");
      if (!selectedSubscriptionId && data.subscriptions[0]) {
        setSelectedSubscriptionId(data.subscriptions[0].id);
      }
    });
  }

  async function loadSubscriptionDetail(subscriptionId: string) {
    const detail = (await apiRequest<SubscriptionDetail>(
      `/api/subscriptions/${subscriptionId}`,
    )) as SubscriptionDetail;
    startTransition(() => {
      setSubscriptionDetail(detail);
      setExportFormat(detail.subscription.defaultFormat);
    });
  }

  async function loadExportPreview(subscriptionId: string, format: ExportFormat) {
    const preview = await apiRequest<ExportPreview>(
      `/api/subscriptions/${subscriptionId}/export?format=${encodeURIComponent(format)}`,
    );
    setExportPreview(preview);
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("Signing in…");
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

  async function handleProxyImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("Importing proxies…");
    try {
      await apiRequest("/api/proxies/import", {
        body: JSON.stringify(proxyImportForm),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      setProxyImportForm({ content: "", kind: "raw" });
      await loadDashboard();
    } catch (error) {
      reportError(error);
    }
  }

  async function handleProxySave(proxyId: string) {
    setStatusMessage("Saving proxy metadata…");
    try {
      await apiRequest(`/api/proxies/${proxyId}`, {
        body: JSON.stringify({
          displayName: proxyEditor.displayName,
          tags: proxyEditor.tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      });
      setEditingProxyId(null);
      setProxyEditor({ displayName: "", tags: "" });
      await loadDashboard();
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSourceCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("Creating source feed…");
    try {
      await apiRequest("/api/sources", {
        body: JSON.stringify(sourceForm),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      setSourceForm({ kind: "raw", name: "", url: "" });
      await loadDashboard();
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSourceSync(sourceId: string) {
    setStatusMessage("Refreshing remote source…");
    try {
      await apiRequest(`/api/sources/${sourceId}/sync`, {
        method: "POST",
      });
      await loadDashboard();
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSubscriptionCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedProxyIds.length === 0) {
      setStatusMessage("Pick at least one proxy before creating a subscription.");
      return;
    }

    setStatusMessage("Creating custom subscription…");
    try {
      const response = await apiRequest<{ subscription: SubscriptionSummary }>(
        "/api/subscriptions",
        {
          body: JSON.stringify({
            ...subscriptionForm,
            nodeIds: selectedProxyIds,
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      setSubscriptionForm({
        defaultFormat: "clash-meta",
        description: "",
        name: "",
      });
      setSelectedProxyIds([]);
      await loadDashboard();
      setSelectedSubscriptionId(response.subscription.id);
      setScreen("subscriptions");
    } catch (error) {
      reportError(error);
    }
  }

  async function handleAddExistingNodes() {
    if (!subscriptionDetail || selectedProxyIds.length === 0) {
      return;
    }

    setStatusMessage("Adding existing proxies to subscription…");
    try {
      await apiRequest(
        `/api/subscriptions/${subscriptionDetail.subscription.id}/items`,
        {
          body: JSON.stringify({
            nodeIds: selectedProxyIds,
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      setSelectedProxyIds([]);
      await loadSubscriptionDetail(subscriptionDetail.subscription.id);
      await loadDashboard();
    } catch (error) {
      reportError(error);
    }
  }

  async function handleImportIntoSubscription(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!subscriptionDetail) {
      return;
    }

    setStatusMessage("Importing nodes into the selected subscription…");
    try {
      await apiRequest(
        `/api/subscriptions/${subscriptionDetail.subscription.id}/import`,
        {
          body: JSON.stringify(subscriptionImportForm),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      setSubscriptionImportForm({ content: "", kind: "raw" });
      await loadSubscriptionDetail(subscriptionDetail.subscription.id);
      await loadDashboard();
    } catch (error) {
      reportError(error);
    }
  }

  async function handleDeleteSubscriptionItem(itemId: string) {
    if (!subscriptionDetail) {
      return;
    }

    setStatusMessage("Removing subscription item…");
    try {
      await apiRequest(
        `/api/subscriptions/${subscriptionDetail.subscription.id}/items/${itemId}`,
        {
          method: "DELETE",
        },
      );
      await loadSubscriptionDetail(subscriptionDetail.subscription.id);
      await loadDashboard();
    } catch (error) {
      reportError(error);
    }
  }

  async function handleRotateShareToken() {
    if (!subscriptionDetail) {
      return;
    }

    setStatusMessage("Rotating subscription token…");
    try {
      await apiRequest(
        `/api/subscriptions/${subscriptionDetail.subscription.id}/share-token/rotate`,
        {
          method: "POST",
        },
      );
      await loadSubscriptionDetail(subscriptionDetail.subscription.id);
      await loadDashboard();
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
          <p className="eyebrow">Cloudflare Worker control plane</p>
          <h1>Admin Access</h1>
          <p className="supporting">
            Sign in to manage imported proxy links, remote subscription feeds,
            and custom export packs.
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
      <aside className="sidebar">
        <p className="eyebrow">ProxyManager</p>
        <h1>Proxy Command Center</h1>
        <p className="supporting">
          Import single links, sync third-party subscriptions, and assemble
          custom share packs for Clash.Meta and sing-box.
        </p>
        <nav className="sidebar-nav" aria-label="Workspace sections">
          {[
            ["proxies", "Proxy Inventory"],
            ["sources", "Remote Sources"],
            ["subscriptions", "Custom Packs"],
          ].map(([id, label]) => (
            <button
              className={screen === id ? "nav-chip is-active" : "nav-chip"}
              key={id}
              onClick={() => setScreen(id as Screen)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
        <dl className="stat-grid">
          <div>
            <dt>Nodes</dt>
            <dd>{dashboard.proxies.length}</dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>{dashboard.sources.length}</dd>
          </div>
          <div>
            <dt>Packs</dt>
            <dd>{dashboard.subscriptions.length}</dd>
          </div>
        </dl>
        <div className="sidebar-summary">
          <div>
            <h2>Live feeds</h2>
            <ul>
              {dashboard.sources.slice(0, 3).map((source) => (
                <li key={source.id}>{source.name}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Share packs</h2>
            <ul>
              {dashboard.subscriptions.slice(0, 3).map((subscription) => (
                <li key={subscription.id}>{subscription.name}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="status-line">{statusMessage}</p>
      </aside>

      <section className="content-shell">
        {screen === "proxies" && (
          <>
            <section className="card">
              <h2>Import raw links or pasted subscriptions</h2>
              <form className="stack-form" onSubmit={handleProxyImport}>
                <label>
                  <span>Input format</span>
                  <select
                    onChange={(event) =>
                      setProxyImportForm((current) => ({
                        ...current,
                        kind: event.target.value as "clash" | "raw" | "sing-box",
                      }))
                    }
                    value={proxyImportForm.kind}
                  >
                    <option value="raw">Raw URI / base64 text</option>
                    <option value="clash">Clash YAML</option>
                    <option value="sing-box">sing-box JSON</option>
                  </select>
                </label>
                <label>
                  <span>Payload</span>
                  <textarea
                    onChange={(event) =>
                      setProxyImportForm((current) => ({
                        ...current,
                        content: event.target.value,
                      }))
                    }
                    placeholder="Paste a single proxy URI, a raw/base64 subscription, Clash YAML, or sing-box JSON."
                    rows={6}
                    value={proxyImportForm.content}
                  />
                </label>
                <button className="primary-button" type="submit">
                  Import into inventory
                </button>
              </form>
            </section>

            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>Inventory</h2>
                  <p>Editable labels and tags wrap the original proxy payload without mutating it.</p>
                </div>
              </div>

              <div className="proxy-grid">
                {dashboard.proxies.map((proxy) => {
                  const selected = selectedProxyIds.includes(proxy.id);
                  return (
                    <article className="proxy-card" key={proxy.id}>
                      <div className="proxy-card-top">
                        <label className="checkbox-row">
                          <input
                            checked={selected}
                            onChange={() =>
                              setSelectedProxyIds((current) =>
                                current.includes(proxy.id)
                                  ? current.filter((item) => item !== proxy.id)
                                  : [...current, proxy.id],
                              )
                            }
                            type="checkbox"
                          />
                          <span>Use in next custom pack</span>
                        </label>
                        <span className="protocol-pill">{proxy.protocol}</span>
                      </div>
                      <h3>{proxy.displayName}</h3>
                      <p className="supporting">
                        Source: {proxy.sourceName} · Updated {formatTime(proxy.updatedAt)}
                      </p>
                      <div className="tag-row">
                        {proxy.tags.length > 0 ? (
                          proxy.tags.map((tag) => (
                            <span className="tag" key={tag}>
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="tag is-muted">No tags yet</span>
                        )}
                      </div>
                      <div className="inline-actions">
                        <button
                          onClick={() => {
                            setEditingProxyId(proxy.id);
                            setProxyEditor({
                              displayName: proxy.displayName,
                              tags: proxy.tags.join(", "),
                            });
                          }}
                          type="button"
                        >
                          Edit label
                        </button>
                        <button
                          onClick={() =>
                            openShare({
                              label: `${proxy.displayName} URI`,
                              setShareModal,
                              value: proxy.shareUri,
                            })
                          }
                          type="button"
                        >
                          QR / copy
                        </button>
                      </div>
                      {editingProxyId === proxy.id && (
                        <div className="editor-panel">
                          <label>
                            <span>Name</span>
                            <input
                              onChange={(event) =>
                                setProxyEditor((current) => ({
                                  ...current,
                                  displayName: event.target.value,
                                }))
                              }
                              value={proxyEditor.displayName}
                            />
                          </label>
                          <label>
                            <span>Tags</span>
                            <input
                              onChange={(event) =>
                                setProxyEditor((current) => ({
                                  ...current,
                                  tags: event.target.value,
                                }))
                              }
                              placeholder="hk, movie, daily"
                              value={proxyEditor.tags}
                            />
                          </label>
                          <div className="inline-actions">
                            <button
                              className="primary-button"
                              onClick={() => void handleProxySave(proxy.id)}
                              type="button"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingProxyId(null)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {screen === "sources" && (
          <>
            <section className="card">
              <h2>Register a remote source</h2>
              <form className="stack-form" onSubmit={handleSourceCreate}>
                <label>
                  <span>Name</span>
                  <input
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Friend Feed"
                    value={sourceForm.name}
                  />
                </label>
                <label>
                  <span>Subscription URL</span>
                  <input
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        url: event.target.value,
                      }))
                    }
                    placeholder="https://example.com/subscription"
                    value={sourceForm.url}
                  />
                </label>
                <label>
                  <span>Expected format</span>
                  <select
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        kind: event.target.value as "clash" | "raw" | "sing-box",
                      }))
                    }
                    value={sourceForm.kind}
                  >
                    <option value="raw">Raw URI / base64</option>
                    <option value="clash">Clash YAML</option>
                    <option value="sing-box">sing-box JSON</option>
                  </select>
                </label>
                <button className="primary-button" type="submit">
                  Save remote source
                </button>
              </form>
            </section>

            <section className="source-grid">
              {dashboard.sources.map((source) => (
                <article className="card" key={source.id}>
                  <div className="section-heading">
                    <div>
                      <h2>{source.name}</h2>
                      <p className="supporting">{source.url}</p>
                    </div>
                    <span className={`status-pill status-${source.lastSyncStatus}`}>
                      {source.lastSyncStatus}
                    </span>
                  </div>
                  <p className="supporting">
                    Last sync: {source.lastSyncAt ? formatTime(source.lastSyncAt) : "never"}
                  </p>
                  {source.lastError && <p className="error-note">{source.lastError}</p>}
                  <button
                    className="primary-button"
                    onClick={() => void handleSourceSync(source.id)}
                    type="button"
                  >
                    Refresh now
                  </button>
                </article>
              ))}
            </section>
          </>
        )}

        {screen === "subscriptions" && (
          <div className="subscriptions-layout">
            <section className="card">
              <h2>Create a new custom pack</h2>
              <form className="stack-form" onSubmit={handleSubscriptionCreate}>
                <label>
                  <span>Name</span>
                  <input
                    onChange={(event) =>
                      setSubscriptionForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Travel Pack"
                    value={subscriptionForm.name}
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    onChange={(event) =>
                      setSubscriptionForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                    value={subscriptionForm.description}
                  />
                </label>
                <label>
                  <span>Default export format</span>
                  <select
                    onChange={(event) =>
                      setSubscriptionForm((current) => ({
                        ...current,
                        defaultFormat: event.target.value as ExportFormat,
                      }))
                    }
                    value={subscriptionForm.defaultFormat}
                  >
                    <option value="clash-meta">Clash.Meta</option>
                    <option value="sing-box">sing-box</option>
                    <option value="raw">Raw</option>
                  </select>
                </label>
                <p className="supporting">
                  Selected proxies: {selectedProxyIds.length}
                </p>
                <button className="primary-button" type="submit">
                  Create pack from selected nodes
                </button>
              </form>

              <div className="subscription-list">
                {dashboard.subscriptions.map((subscription) => (
                  <button
                    className={
                      subscription.id === selectedSubscriptionId
                        ? "subscription-row is-active"
                        : "subscription-row"
                    }
                    key={subscription.id}
                    onClick={() => setSelectedSubscriptionId(subscription.id)}
                    type="button"
                  >
                    <span>{subscription.name}</span>
                    <span>{subscription.itemCount} nodes</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              {selectedSubscription && subscriptionDetail ? (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>{selectedSubscription.name}</h2>
                      <p className="supporting">
                        Default export: {selectedSubscription.defaultFormat}
                      </p>
                    </div>
                    <button
                      onClick={() => void handleRotateShareToken()}
                      type="button"
                    >
                      Rotate token
                    </button>
                  </div>

                  <div className="share-stack">
                    {(["raw", "clash-meta", "sing-box"] as ExportFormat[]).map((format) => {
                      const url = buildSubscriptionShareUrl(
                        selectedSubscription.shareToken,
                        format,
                      );
                      return (
                        <div className="share-row" key={format}>
                          <div>
                            <strong>{format}</strong>
                            <p className="share-value">{url}</p>
                          </div>
                          <div className="inline-actions">
                            <button onClick={() => void copyText(url)} type="button">
                              Copy
                            </button>
                            <button
                              onClick={() =>
                                setShareModal({
                                  label: `${selectedSubscription.name} ${format}`,
                                  value: url,
                                })
                              }
                              type="button"
                            >
                              QR
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="section-heading">
                    <div>
                      <h3>Current items</h3>
                      <p className="supporting">Delete entries or add more inventory nodes below.</p>
                    </div>
                  </div>
                  <div className="item-list">
                    {subscriptionDetail.items.map((item) => (
                      <div className="item-row" key={item.id}>
                        <div>
                          <strong>{item.proxy.displayName}</strong>
                          <p className="supporting">{item.proxy.protocol}</p>
                        </div>
                        <button
                          onClick={() => void handleDeleteSubscriptionItem(item.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="section-heading">
                    <div>
                      <h3>Append existing inventory nodes</h3>
                      <p className="supporting">Use the same global selection you build packs from.</p>
                    </div>
                    <button
                      className="primary-button"
                      onClick={() => void handleAddExistingNodes()}
                      type="button"
                    >
                      Add selected nodes
                    </button>
                  </div>

                  <form className="stack-form" onSubmit={handleImportIntoSubscription}>
                    <label>
                      <span>Import more links directly into this pack</span>
                      <textarea
                        onChange={(event) =>
                          setSubscriptionImportForm((current) => ({
                            ...current,
                            content: event.target.value,
                          }))
                        }
                        rows={5}
                        value={subscriptionImportForm.content}
                      />
                    </label>
                    <label>
                      <span>Input format</span>
                      <select
                        onChange={(event) =>
                          setSubscriptionImportForm((current) => ({
                            ...current,
                            kind: event.target.value as "clash" | "raw" | "sing-box",
                          }))
                        }
                        value={subscriptionImportForm.kind}
                      >
                        <option value="raw">Raw URI / base64</option>
                        <option value="clash">Clash YAML</option>
                        <option value="sing-box">sing-box JSON</option>
                      </select>
                    </label>
                    <button className="primary-button" type="submit">
                      Import into this pack
                    </button>
                  </form>

                  <div className="section-heading">
                    <div>
                      <h3>Export preview</h3>
                      <p className="supporting">Unsupported nodes are filtered per profile and listed here.</p>
                    </div>
                    <select
                      onChange={(event) =>
                        setExportFormat(event.target.value as ExportFormat)
                      }
                      value={exportFormat}
                    >
                      <option value="clash-meta">Clash.Meta</option>
                      <option value="sing-box">sing-box</option>
                      <option value="raw">Raw</option>
                    </select>
                  </div>
                  <textarea
                    className="preview-box"
                    readOnly
                    rows={12}
                    value={exportPreview?.content ?? ""}
                  />
                  {exportPreview && exportPreview.skipped.length > 0 && (
                    <div className="warning-list">
                      {exportPreview.skipped.map((item) => (
                        <p key={item.id}>
                          {item.name}: {item.reason}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <h2>Pick a subscription pack</h2>
                  <p className="supporting">
                    Create one from the selected proxy nodes, then manage its
                    content and share tokens here.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {shareModal && (
        <div className="modal-backdrop" role="presentation">
          <div aria-modal="true" className="modal-card" role="dialog">
            <div className="section-heading">
              <div>
                <h2>{shareModal.label}</h2>
                <p className="supporting">Copy or scan the generated payload.</p>
              </div>
              <button onClick={() => setShareModal(null)} type="button">
                Close
              </button>
            </div>
            {shareQr ? <img alt={`${shareModal.label} QR code`} src={shareQr} /> : <p>Generating QR…</p>}
            <textarea className="preview-box" readOnly rows={5} value={shareModal.value} />
            <button
              className="primary-button"
              onClick={() => void copyText(shareModal.value)}
              type="button"
            >
              Copy payload
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function LoadingShell({ message }: { message: string }) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">ProxyManager</p>
        <h1>Booting control plane</h1>
        <p className="supporting">{message}</p>
      </section>
    </main>
  );
}

async function apiRequest<T = unknown>(
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

function buildSubscriptionShareUrl(token: string, format: ExportFormat): string {
  const origin = window.location.origin;
  return `${origin}/share/sub/${token}?format=${encodeURIComponent(format)}`;
}

async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(value);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function openShare(input: {
  label: string;
  setShareModal: React.Dispatch<
    React.SetStateAction<{
      label: string;
      value: string;
    } | null>
  >;
  value: string | null;
}) {
  if (!input.value) {
    return;
  }

  input.setShareModal({
    label: input.label,
    value: input.value,
  });
}
