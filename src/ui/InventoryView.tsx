import { useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  Drawer,
  EmptyPanel,
  ProtocolBadge,
  SectionTitle,
  TagTokens,
} from "@ui/chrome";
import {
  apiRequest,
  formatTime,
  getProtocolOptions,
  getSourceOptions,
  openShareTarget,
  proxySearchText,
} from "@ui/lib";
import type { ProxySummary, ShareTarget } from "@ui/types";

interface InventoryViewProps {
  onError: (error: unknown) => void;
  onOpenShare: (target: ShareTarget) => void;
  onRefreshDashboard: () => Promise<void>;
  onStatusChange: (message: string) => void;
  proxies: ProxySummary[];
}

export function InventoryView(props: InventoryViewProps) {
  const [query, setQuery] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedProxyId, setSelectedProxyId] = useState<string | null>(null);
  const [showImportDrawer, setShowImportDrawer] = useState(false);
  const [importForm, setImportForm] = useState({
    content: "",
    kind: "raw" as "clash" | "raw" | "sing-box",
  });
  const [proxyEditor, setProxyEditor] = useState({ displayName: "", tags: "" });
  const deferredQuery = useDeferredValue(query);

  const filteredProxies = useMemo(
    () =>
      props.proxies.filter((proxy) => {
        const matchesQuery =
          deferredQuery.trim().length === 0 ||
          proxySearchText(proxy).includes(deferredQuery.trim().toLowerCase());
        const matchesProtocol =
          protocolFilter === "all" || proxy.protocol === protocolFilter;
        const matchesSource =
          sourceFilter === "all" || proxy.sourceName === sourceFilter;

        return matchesQuery && matchesProtocol && matchesSource;
      }),
    [deferredQuery, protocolFilter, props.proxies, sourceFilter],
  );

  const selectedProxy = useMemo(
    () =>
      filteredProxies.find((proxy) => proxy.id === selectedProxyId) ??
      props.proxies.find((proxy) => proxy.id === selectedProxyId) ??
      filteredProxies[0] ??
      null,
    [filteredProxies, props.proxies, selectedProxyId],
  );

  useEffect(() => {
    if (!selectedProxy) {
      setSelectedProxyId(null);
      return;
    }

    setSelectedProxyId(selectedProxy.id);
  }, [selectedProxy?.id]);

  useEffect(() => {
    if (!selectedProxy) {
      return;
    }

    setProxyEditor({
      displayName: selectedProxy.displayName,
      tags: selectedProxy.tags.join(", "),
    });
  }, [selectedProxy?.id]);

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onStatusChange("Importing proxies into inventory...");

    try {
      await apiRequest("/api/proxies/import", {
        body: JSON.stringify(importForm),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      setImportForm({ content: "", kind: "raw" });
      setShowImportDrawer(false);
      await props.onRefreshDashboard();
      props.onStatusChange("Inventory updated.");
    } catch (error) {
      props.onError(error);
    }
  }

  async function handleSave() {
    if (!selectedProxy) {
      return;
    }

    props.onStatusChange("Saving proxy metadata...");

    try {
      await apiRequest(`/api/proxies/${selectedProxy.id}`, {
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
      await props.onRefreshDashboard();
      props.onStatusChange("Proxy metadata saved.");
    } catch (error) {
      props.onError(error);
    }
  }

  return (
    <section aria-label="Inventory Workspace" className="page-section" role="region">
      <SectionTitle
        title="Inventory"
        subtitle="Balanced density for comparing names, tags, sources, and protocols."
        actions={
          <button
            className="primary-button"
            onClick={() => setShowImportDrawer(true)}
            type="button"
          >
            Import Links
          </button>
        }
      />

      <div className="workspace-split">
        <div className="panel">
          <div className="toolbar-row">
            <label className="toolbar-field toolbar-field-wide">
              <span className="field-label">Search</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, tag, source, or protocol"
                value={query}
              />
            </label>
            <label className="toolbar-field">
              <span className="field-label">Protocol</span>
              <select
                onChange={(event) => setProtocolFilter(event.target.value)}
                value={protocolFilter}
              >
                <option value="all">All protocols</option>
                {getProtocolOptions(props.proxies).map((protocol) => (
                  <option key={protocol} value={protocol}>
                    {protocol}
                  </option>
                ))}
              </select>
            </label>
            <label className="toolbar-field">
              <span className="field-label">Source</span>
              <select
                onChange={(event) => setSourceFilter(event.target.value)}
                value={sourceFilter}
              >
                <option value="all">All sources</option>
                {getSourceOptions(props.proxies).map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredProxies.length === 0 ? (
            <EmptyPanel
              title="No proxies match this view"
              description="Adjust the filters or import a new batch of links."
            />
          ) : (
            <div className="data-list">
              {filteredProxies.map((proxy) => {
                const shareTarget = openShareTarget(
                  proxy.shareUri,
                  `${proxy.displayName} URI`,
                );
                const isActive = selectedProxy?.id === proxy.id;

                return (
                  <div
                    className={isActive ? "list-row list-row-active" : "list-row"}
                    key={proxy.id}
                  >
                    <button
                      aria-label={`${proxy.displayName} ${proxy.sourceName}`}
                      className="list-row-button"
                      onClick={() => setSelectedProxyId(proxy.id)}
                      type="button"
                    >
                      <div className="row-heading">
                        <strong>{proxy.displayName}</strong>
                        <ProtocolBadge value={proxy.protocol} />
                      </div>
                      <p className="supporting compact">
                        {proxy.sourceName} · Updated {formatTime(proxy.updatedAt)}
                      </p>
                      <div className="token-row">
                        <TagTokens tags={proxy.tags} fallback="No tags" />
                      </div>
                    </button>
                    <div className="row-actions">
                      <button
                        className="ghost-button"
                        disabled={!shareTarget}
                        onClick={() => {
                          if (shareTarget) {
                            props.onOpenShare(shareTarget);
                          }
                        }}
                        type="button"
                      >
                        Share
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="panel detail-pane">
          {selectedProxy ? (
            <>
              <SectionTitle
                title="Proxy Details"
                subtitle="Edit the exported display name and tag list without touching the core URI."
                actions={
                  <button
                    className="ghost-button"
                    disabled={!selectedProxy.shareUri}
                    onClick={() => {
                      const shareTarget = openShareTarget(
                        selectedProxy.shareUri,
                        `${selectedProxy.displayName} URI`,
                      );
                      if (shareTarget) {
                        props.onOpenShare(shareTarget);
                      }
                    }}
                    type="button"
                  >
                    Share
                  </button>
                }
              />

              <div className="detail-meta">
                <div>
                  <span className="detail-label">Protocol</span>
                  <div className="token-row">
                    <ProtocolBadge value={selectedProxy.protocol} />
                  </div>
                </div>
                <div>
                  <span className="detail-label">Source</span>
                  <p className="detail-copy">{selectedProxy.sourceName}</p>
                </div>
                <div>
                  <span className="detail-label">Updated</span>
                  <p className="detail-copy">{formatTime(selectedProxy.updatedAt)}</p>
                </div>
              </div>

              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSave();
                }}
              >
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
                    placeholder="hk, stream, work"
                    value={proxyEditor.tags}
                  />
                </label>
                <button className="primary-button" type="submit">
                  Save Changes
                </button>
              </form>
            </>
          ) : (
            <EmptyPanel
              title="No proxy selected"
              description="Choose a proxy from the list to inspect tags, source, and share metadata."
            />
          )}
        </aside>
      </div>

      {showImportDrawer ? (
        <Drawer
          description="Paste a single proxy URI, a raw or base64 subscription, Clash YAML, or sing-box JSON."
          onClose={() => setShowImportDrawer(false)}
          title="Import Inventory Links"
        >
          <form className="stack-form" onSubmit={handleImport}>
            <label>
              <span>Input format</span>
              <select
                onChange={(event) =>
                  setImportForm((current) => ({
                    ...current,
                    kind: event.target.value as "clash" | "raw" | "sing-box",
                  }))
                }
                value={importForm.kind}
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
                  setImportForm((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
                placeholder="Paste proxy links or a full subscription payload."
                rows={8}
                value={importForm.content}
              />
            </label>
            <button className="primary-button" type="submit">
              Import Inventory Links
            </button>
          </form>
        </Drawer>
      ) : null}
    </section>
  );
}
