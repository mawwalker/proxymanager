import { useDeferredValue, useMemo, useState } from "react";

import { EmptyPanel, MiniStat, SectionTitle, StatusBadge } from "@ui/chrome";
import {
  apiRequest,
  countHealthySources,
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
    <div className="workspace-stack">
      <section className="workspace-panel panel-muted">
        <SectionTitle
          title="Connect remote subscriptions"
          subtitle="Register third-party feeds once, then refresh them on demand or by cron."
          actions={
            <div className="mini-stat-grid">
              <MiniStat label="Feeds" value={props.sources.length} />
              <MiniStat
                label="Healthy"
                tone="accent"
                value={countHealthySources(props.sources)}
              />
            </div>
          }
        />
        <form className="stack-form" onSubmit={handleCreate}>
          <div className="field-grid field-grid-two">
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
          </div>
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
          <div className="toolbar-actions">
            <button className="primary-button" type="submit">
              Save remote source
            </button>
          </div>
        </form>
      </section>

      <section className="workspace-panel">
        <SectionTitle
          title="Source health"
          subtitle="Compact status list with errors and last sync timestamps."
        />
        <div className="toolbar-row">
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
            description="Add a subscription URL above to start syncing external feeds."
          />
        ) : (
          <div className="data-list">
            {filteredSources.map((source) => (
              <article className="data-row" key={source.id}>
                <div className="data-row-main">
                  <div className="identity-block">
                    <div className="identity-heading">
                      <h3>{source.name}</h3>
                      <StatusBadge value={source.lastSyncStatus} />
                    </div>
                    <p className="supporting compact">{source.url}</p>
                    <p className="supporting compact">
                      Last sync {formatTime(source.lastSyncAt)} · Refresh every{" "}
                      {source.refreshIntervalMinutes} minutes
                    </p>
                    {source.lastError ? (
                      <p className="error-note">{source.lastError}</p>
                    ) : null}
                  </div>
                  <div className="row-actions">
                    <button
                      className="primary-button"
                      onClick={() => void handleSync(source.id)}
                      type="button"
                    >
                      Refresh now
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
