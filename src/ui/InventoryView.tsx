import { useDeferredValue, useMemo, useState } from "react";

import { EmptyPanel, MiniStat, ProtocolBadge, SectionTitle, TagTokens } from "@ui/chrome";
import {
  apiRequest,
  formatTime,
  getProtocolOptions,
  getSourceOptions,
  matchesTagFilter,
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
  const [editingProxyId, setEditingProxyId] = useState<string | null>(null);
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
      await props.onRefreshDashboard();
      props.onStatusChange("Inventory updated.");
    } catch (error) {
      props.onError(error);
    }
  }

  async function handleSave(proxyId: string) {
    props.onStatusChange("Saving proxy metadata...");

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
      await props.onRefreshDashboard();
      props.onStatusChange("Proxy metadata saved.");
    } catch (error) {
      props.onError(error);
    }
  }

  return (
    <div className="workspace-stack">
      <section className="workspace-panel panel-muted">
        <SectionTitle
          title="Import into inventory"
          subtitle="Paste a single link, a raw/base64 subscription, Clash YAML, or sing-box JSON."
          actions={
            <div className="mini-stat-grid">
              <MiniStat label="Nodes" value={props.proxies.length} />
              <MiniStat
                label="Protocols"
                tone="accent"
                value={getProtocolOptions(props.proxies).length}
              />
            </div>
          }
        />
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
              rows={6}
              value={importForm.content}
            />
          </label>
          <div className="toolbar-actions">
            <button className="primary-button" type="submit">
              Import inventory links
            </button>
          </div>
        </form>
      </section>

      <section className="workspace-panel">
        <SectionTitle
          title="Proxy inventory"
          subtitle="High-density list for searching, renaming, and sharing nodes."
        />

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
              const isEditing = editingProxyId === proxy.id;

              return (
                <article className="data-row" key={proxy.id}>
                  <div className="data-row-main">
                    <div className="identity-block">
                      <div className="identity-heading">
                        <h3>{proxy.displayName}</h3>
                        <ProtocolBadge value={proxy.protocol} />
                      </div>
                      <p className="supporting compact">
                        Source {proxy.sourceName} · Updated {formatTime(proxy.updatedAt)}
                      </p>
                      <div className="token-row">
                        <TagTokens tags={proxy.tags} fallback="No tags" />
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        className="ghost-button"
                        onClick={() => {
                          setEditingProxyId(proxy.id);
                          setProxyEditor({
                            displayName: proxy.displayName,
                            tags: proxy.tags.join(", "),
                          });
                        }}
                        type="button"
                      >
                        Edit
                      </button>
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
                  {isEditing ? (
                    <div className="inline-editor">
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
                      <div className="toolbar-actions">
                        <button
                          className="primary-button"
                          onClick={() => void handleSave(proxy.id)}
                          type="button"
                        >
                          Save changes
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() => setEditingProxyId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
