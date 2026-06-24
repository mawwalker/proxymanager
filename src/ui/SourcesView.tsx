import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Drawer, EmptyPanel, SectionTitle, StatusBadge } from "@ui/chrome";
import {
  apiRequest,
  formatTime,
  sourceSearchText,
} from "@ui/lib";
import type { SourceSummary } from "@ui/types";

interface SourcesViewProps {
  onError: (error: unknown) => void;
  onRefreshDashboard: () => Promise<void>;
  onStatusChange: (message: string) => void;
  sources: SourceSummary[];
}

export function SourcesView(props: SourcesViewProps) {
  const [query, setQuery] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [form, setForm] = useState({
    kind: "raw" as "clash" | "raw" | "sing-box",
    name: "",
    url: "",
  });
  const deferredQuery = useDeferredValue(query);

  const filteredSources = useMemo(
    () =>
      props.sources.filter((source) => {
        if (deferredQuery.trim().length === 0) {
          return true;
        }

        return sourceSearchText(source).includes(deferredQuery.trim().toLowerCase());
      }),
    [deferredQuery, props.sources],
  );

  const selectedSource = useMemo(
    () =>
      filteredSources.find((source) => source.id === selectedSourceId) ??
      props.sources.find((source) => source.id === selectedSourceId) ??
      filteredSources[0] ??
      null,
    [filteredSources, props.sources, selectedSourceId],
  );

  useEffect(() => {
    if (!selectedSource) {
      setSelectedSourceId(null);
      return;
    }

    setSelectedSourceId(selectedSource.id);
  }, [selectedSource?.id]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onStatusChange("Creating remote source...");

    try {
      await apiRequest("/api/sources", {
        body: JSON.stringify(form),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      setForm({ kind: "raw", name: "", url: "" });
      setShowCreateDrawer(false);
      await props.onRefreshDashboard();
      props.onStatusChange("Source added.");
    } catch (error) {
      props.onError(error);
    }
  }

  async function handleSync(sourceId: string) {
    props.onStatusChange("Refreshing remote source...");

    try {
      await apiRequest(`/api/sources/${sourceId}/sync`, {
        method: "POST",
      });
      await props.onRefreshDashboard();
      props.onStatusChange("Source refreshed.");
    } catch (error) {
      props.onError(error);
    }
  }

  return (
    <section aria-label="Sources Workspace" className="page-section" role="region">
      <SectionTitle
        title="Sources"
        subtitle="Keep upstream feeds readable, searchable, and refreshable from one list."
        actions={
          <button
            className="primary-button"
            onClick={() => setShowCreateDrawer(true)}
            type="button"
          >
            New Source
          </button>
        }
      />

      <div className="workspace-split">
        <div className="panel">
          <div className="toolbar-row toolbar-row-single">
            <label className="toolbar-field toolbar-field-wide">
              <span className="field-label">Search</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search feeds by name or URL"
                value={query}
              />
            </label>
          </div>

          {filteredSources.length === 0 ? (
            <EmptyPanel
              title="No remote sources yet"
              description="Add a subscription URL from the drawer to start syncing external feeds."
            />
          ) : (
            <div className="data-list">
              {filteredSources.map((source) => {
                const isActive = selectedSource?.id === source.id;

                return (
                  <div
                    className={isActive ? "list-row list-row-active" : "list-row"}
                    key={source.id}
                  >
                    <button
                      className="list-row-button"
                      onClick={() => setSelectedSourceId(source.id)}
                      type="button"
                    >
                      <div className="row-heading">
                        <strong>{source.name}</strong>
                        <StatusBadge value={source.lastSyncStatus} />
                      </div>
                      <p className="supporting compact">
                        {source.url}
                      </p>
                      <p className="supporting compact">
                        Last sync {formatTime(source.lastSyncAt)} · Every{" "}
                        {source.refreshIntervalMinutes} min
                      </p>
                    </button>
                    <div className="row-actions">
                      <button
                        className="ghost-button"
                        onClick={() => void handleSync(source.id)}
                        type="button"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="panel detail-pane">
          {selectedSource ? (
            <>
              <SectionTitle
                title="Source Details"
                subtitle="Inspect the feed URL, sync health, cadence, and last known error."
                actions={
                  <button
                    className="ghost-button"
                    onClick={() => void handleSync(selectedSource.id)}
                    type="button"
                  >
                    Refresh
                  </button>
                }
              />

              <div className="detail-meta">
                <div>
                  <span className="detail-label">Status</span>
                  <div className="token-row">
                    <StatusBadge value={selectedSource.lastSyncStatus} />
                  </div>
                </div>
                <div>
                  <span className="detail-label">Format</span>
                  <p className="detail-copy">{selectedSource.kind}</p>
                </div>
                <div>
                  <span className="detail-label">Refresh</span>
                  <p className="detail-copy">
                    Every {selectedSource.refreshIntervalMinutes} minutes
                  </p>
                </div>
              </div>

              <div className="detail-block">
                <span className="detail-label">Subscription URL</span>
                <p className="detail-copy detail-copy-break">{selectedSource.url}</p>
              </div>
              <div className="detail-block">
                <span className="detail-label">Last Sync</span>
                <p className="detail-copy">{formatTime(selectedSource.lastSyncAt)}</p>
              </div>
              {selectedSource.lastError ? (
                <div className="detail-block detail-block-alert">
                  <span className="detail-label">Last Error</span>
                  <p className="detail-copy">{selectedSource.lastError}</p>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyPanel
              title="No source selected"
              description="Choose a source to inspect its URL, sync cadence, and error state."
            />
          )}
        </aside>
      </div>

      {showCreateDrawer ? (
        <Drawer
          description="Register a third-party subscription once, then refresh it on demand or by cron."
          onClose={() => setShowCreateDrawer(false)}
          title="Add Remote Source"
        >
          <form className="stack-form" onSubmit={handleCreate}>
            <label>
              <span>Name</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Friend Feed"
                value={form.name}
              />
            </label>
            <label>
              <span>Expected format</span>
              <select
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    kind: event.target.value as "clash" | "raw" | "sing-box",
                  }))
                }
                value={form.kind}
              >
                <option value="raw">Raw URI / base64</option>
                <option value="clash">Clash YAML</option>
                <option value="sing-box">sing-box JSON</option>
              </select>
            </label>
            <label>
              <span>Subscription URL</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
                placeholder="https://example.com/subscription"
                value={form.url}
              />
            </label>
            <button className="primary-button" type="submit">
              Save Source
            </button>
          </form>
        </Drawer>
      ) : null}
    </section>
  );
}
