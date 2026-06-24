import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  EmptyPanel,
  MiniStat,
  ProtocolBadge,
  SectionTitle,
  TagTokens,
} from "@ui/chrome";
import {
  apiRequest,
  buildSubscriptionShareUrl,
  copyText,
  formatTime,
  getProtocolOptions,
  getTagOptions,
  matchesTagFilter,
  openShareTarget,
  packSearchText,
  proxySearchText,
} from "@ui/lib";
import type {
  DashboardState,
  ExportFormat,
  ExportPreview,
  PackTab,
  ProxySummary,
  ShareTarget,
  SubscriptionDetail,
} from "@ui/types";

interface PacksViewProps {
  activeSubscriptionId: string | null;
  dashboard: DashboardState;
  onError: (error: unknown) => void;
  onOpenShare: (target: ShareTarget) => void;
  onRefreshDashboard: () => Promise<void>;
  onSelectSubscription: (subscriptionId: string | null) => void;
  onStatusChange: (message: string) => void;
}

type PickerMode = "append" | "create";

export function PacksView(props: PacksViewProps) {
  const [activeTab, setActiveTab] = useState<PackTab>("content");
  const [subscriptionDetail, setSubscriptionDetail] = useState<SubscriptionDetail | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("clash-meta");
  const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null);
  const [packListQuery, setPackListQuery] = useState("");
  const [contentQuery, setContentQuery] = useState("");
  const [contentProtocolFilter, setContentProtocolFilter] = useState("all");
  const [contentTagFilter, setContentTagFilter] = useState("all");
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importForm, setImportForm] = useState({
    content: "",
    kind: "raw" as "clash" | "raw" | "sing-box",
  });
  const [newPackForm, setNewPackForm] = useState({
    defaultFormat: "clash-meta" as ExportFormat,
    description: "",
    name: "",
  });
  const [newPackNodeIds, setNewPackNodeIds] = useState<string[]>([]);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerProtocolFilter, setPickerProtocolFilter] = useState("all");
  const [pickerTagFilter, setPickerTagFilter] = useState("all");
  const deferredPackListQuery = useDeferredValue(packListQuery);
  const deferredContentQuery = useDeferredValue(contentQuery);
  const deferredPickerQuery = useDeferredValue(pickerQuery);

  const selectedSubscription = useMemo(
    () =>
      props.dashboard.subscriptions.find(
        (subscription) => subscription.id === props.activeSubscriptionId,
      ) ?? null,
    [props.activeSubscriptionId, props.dashboard.subscriptions],
  );

  useEffect(() => {
    if (!props.activeSubscriptionId) {
      setSubscriptionDetail(null);
      setExportPreview(null);
      return;
    }

    void loadSubscriptionDetail(props.activeSubscriptionId).catch(props.onError);
  }, [props.activeSubscriptionId]);

  useEffect(() => {
    if (!subscriptionDetail) {
      return;
    }

    setExportFormat(subscriptionDetail.subscription.defaultFormat);
  }, [subscriptionDetail?.subscription.defaultFormat]);

  useEffect(() => {
    if (
      activeTab !== "share" ||
      !subscriptionDetail
    ) {
      return;
    }

    void loadExportPreview(subscriptionDetail.subscription.id, exportFormat).catch(
      props.onError,
    );
  }, [activeTab, exportFormat, subscriptionDetail?.subscription.id]);

  const filteredPacks = useMemo(
    () =>
      props.dashboard.subscriptions.filter((subscription) => {
        if (deferredPackListQuery.trim().length === 0) {
          return true;
        }

        return packSearchText(subscription).includes(
          deferredPackListQuery.trim().toLowerCase(),
        );
      }),
    [deferredPackListQuery, props.dashboard.subscriptions],
  );

  const currentPackNodeIds = useMemo(
    () => new Set(subscriptionDetail?.nodes.map((node) => node.id) ?? []),
    [subscriptionDetail?.nodes],
  );

  const filteredPackNodes = useMemo(() => {
    const nodes = subscriptionDetail?.nodes ?? [];
    return nodes.filter((node) => {
      const matchesQuery =
        deferredContentQuery.trim().length === 0 ||
        proxySearchText(node).includes(deferredContentQuery.trim().toLowerCase());
      const matchesProtocol =
        contentProtocolFilter === "all" || node.protocol === contentProtocolFilter;
      const matchesTag = matchesTagFilter(node.tags, contentTagFilter);
      return matchesQuery && matchesProtocol && matchesTag;
    });
  }, [
    contentProtocolFilter,
    contentTagFilter,
    deferredContentQuery,
    subscriptionDetail?.nodes,
  ]);

  const pickerNodes = useMemo(() => {
    return props.dashboard.proxies.filter((proxy) => {
      const matchesQuery =
        deferredPickerQuery.trim().length === 0 ||
        proxySearchText(proxy).includes(deferredPickerQuery.trim().toLowerCase());
      const matchesProtocol =
        pickerProtocolFilter === "all" || proxy.protocol === pickerProtocolFilter;
      const matchesTag = matchesTagFilter(proxy.tags, pickerTagFilter);
      return matchesQuery && matchesProtocol && matchesTag;
    });
  }, [
    deferredPickerQuery,
    pickerProtocolFilter,
    pickerTagFilter,
    props.dashboard.proxies,
  ]);

  async function loadSubscriptionDetail(subscriptionId: string) {
    const detail = await apiRequest<SubscriptionDetail>(
      `/api/subscriptions/${subscriptionId}`,
    );

    startTransition(() => {
      setSubscriptionDetail(detail);
    });
  }

  async function loadExportPreview(subscriptionId: string, format: ExportFormat) {
    const preview = await apiRequest<ExportPreview>(
      `/api/subscriptions/${subscriptionId}/export?format=${encodeURIComponent(format)}`,
    );
    setExportPreview(preview);
  }

  function openPicker(mode: PickerMode) {
    setPickerMode(mode);
    setPickerSelection(mode === "create" ? newPackNodeIds : []);
    setPickerQuery("");
    setPickerProtocolFilter("all");
    setPickerTagFilter("all");
  }

  function closePicker() {
    setPickerMode(null);
    setPickerSelection([]);
  }

  async function handleCreatePack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPackNodeIds.length === 0) {
      props.onStatusChange("Pick at least one proxy inside Packs before creating a pack.");
      return;
    }

    props.onStatusChange("Creating pack...");

    try {
      const response = await apiRequest<{ subscription: { id: string } }>(
        "/api/subscriptions",
        {
          body: JSON.stringify({
            ...newPackForm,
            nodeIds: newPackNodeIds,
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      setNewPackForm({
        defaultFormat: "clash-meta",
        description: "",
        name: "",
      });
      setNewPackNodeIds([]);
      setActiveTab("content");
      await props.onRefreshDashboard();
      props.onSelectSubscription(response.subscription.id);
      props.onStatusChange("Pack created.");
    } catch (error) {
      props.onError(error);
    }
  }

  async function handleConfirmPicker() {
    if (!pickerMode) {
      return;
    }

    if (pickerMode === "create") {
      setNewPackNodeIds(pickerSelection);
      closePicker();
      return;
    }

    if (!subscriptionDetail) {
      return;
    }

    const nodeIds = pickerSelection.filter((id) => !currentPackNodeIds.has(id));
    if (nodeIds.length === 0) {
      closePicker();
      return;
    }

    props.onStatusChange("Adding proxies to pack...");

    try {
      await apiRequest(`/api/subscriptions/${subscriptionDetail.subscription.id}/items`, {
        body: JSON.stringify({ nodeIds }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      closePicker();
      await loadSubscriptionDetail(subscriptionDetail.subscription.id);
      await props.onRefreshDashboard();
      props.onStatusChange("Pack content updated.");
    } catch (error) {
      props.onError(error);
    }
  }

  async function handleImportIntoPack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscriptionDetail) {
      return;
    }

    props.onStatusChange("Importing links into the current pack...");

    try {
      await apiRequest(`/api/subscriptions/${subscriptionDetail.subscription.id}/import`, {
        body: JSON.stringify(importForm),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      setImportForm({ content: "", kind: "raw" });
      setShowImportPanel(false);
      await loadSubscriptionDetail(subscriptionDetail.subscription.id);
      await props.onRefreshDashboard();
      props.onStatusChange("Links imported into the pack.");
    } catch (error) {
      props.onError(error);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!subscriptionDetail) {
      return;
    }

    props.onStatusChange("Removing proxy from pack...");

    try {
      await apiRequest(
        `/api/subscriptions/${subscriptionDetail.subscription.id}/items/${itemId}`,
        {
          method: "DELETE",
        },
      );
      await loadSubscriptionDetail(subscriptionDetail.subscription.id);
      await props.onRefreshDashboard();
      props.onStatusChange("Pack item removed.");
    } catch (error) {
      props.onError(error);
    }
  }

  async function handleRotateShareToken() {
    if (!subscriptionDetail) {
      return;
    }

    props.onStatusChange("Rotating share token...");

    try {
      await apiRequest(
        `/api/subscriptions/${subscriptionDetail.subscription.id}/share-token/rotate`,
        {
          method: "POST",
        },
      );
      await loadSubscriptionDetail(subscriptionDetail.subscription.id);
      await props.onRefreshDashboard();
      props.onStatusChange("Share token rotated.");
    } catch (error) {
      props.onError(error);
    }
  }

  return (
    <>
      <div className="packs-layout">
        <section className="workspace-panel packs-sidebar">
          <SectionTitle
            title="Packs"
            subtitle="Create, search, and switch between custom subscriptions."
            actions={
              <MiniStat
                label="Packs"
                tone="accent"
                value={props.dashboard.subscriptions.length}
              />
            }
          />

          <form className="stack-form create-pack-form" onSubmit={handleCreatePack}>
            <label>
              <span>Pack name</span>
              <input
                onChange={(event) =>
                  setNewPackForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Travel Pack"
                value={newPackForm.name}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                onChange={(event) =>
                  setNewPackForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Regional split, media-safe, work-safe..."
                rows={3}
                value={newPackForm.description}
              />
            </label>
            <label>
              <span>Default export</span>
              <select
                onChange={(event) =>
                  setNewPackForm((current) => ({
                    ...current,
                    defaultFormat: event.target.value as ExportFormat,
                  }))
                }
                value={newPackForm.defaultFormat}
              >
                <option value="clash-meta">Clash.Meta</option>
                <option value="sing-box">sing-box</option>
                <option value="raw">Raw</option>
              </select>
            </label>
            <div className="selection-chip-row">
              <span className="selection-chip">{newPackNodeIds.length} proxies selected</span>
              <button
                className="ghost-button"
                onClick={() => openPicker("create")}
                type="button"
              >
                Pick proxies
              </button>
            </div>
            {newPackNodeIds.length > 0 ? (
              <div className="selection-preview">
                {props.dashboard.proxies
                  .filter((proxy) => newPackNodeIds.includes(proxy.id))
                  .slice(0, 4)
                  .map((proxy) => (
                    <span className="selection-preview-chip" key={proxy.id}>
                      {proxy.displayName}
                    </span>
                  ))}
              </div>
            ) : null}
            <button className="primary-button" type="submit">
              Create pack
            </button>
          </form>

          <label className="toolbar-field">
            <span className="field-label">Search packs</span>
            <input
              onChange={(event) => setPackListQuery(event.target.value)}
              placeholder="Filter by pack name or format"
              value={packListQuery}
            />
          </label>

          <div className="pack-list">
            {filteredPacks.map((subscription) => (
              <button
                className={
                  subscription.id === props.activeSubscriptionId
                    ? "pack-list-row pack-list-row-active"
                    : "pack-list-row"
                }
                key={subscription.id}
                onClick={() => props.onSelectSubscription(subscription.id)}
                type="button"
              >
                <div>
                  <strong>{subscription.name}</strong>
                  <p className="supporting compact">{subscription.description || "No description"}</p>
                </div>
                <div className="pack-list-meta">
                  <span>{subscription.itemCount} nodes</span>
                  <span>{subscription.defaultFormat}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="workspace-panel packs-workspace">
          {selectedSubscription && subscriptionDetail ? (
            <>
              <header className="workspace-headline">
                <div>
                  <p className="eyebrow">Custom Pack</p>
                  <h2>{selectedSubscription.name}</h2>
                  <p className="supporting">
                    {selectedSubscription.description || "No description yet"} ·{" "}
                    {selectedSubscription.itemCount} nodes · Updated{" "}
                    {formatTime(selectedSubscription.updatedAt)}
                  </p>
                </div>
                <div className="headline-actions">
                  <button
                    className="primary-button"
                    onClick={() => openPicker("append")}
                    type="button"
                  >
                    Add proxies
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => setShowImportPanel((current) => !current)}
                    type="button"
                  >
                    Import links
                  </button>
                </div>
              </header>

              <div aria-label="Pack tabs" className="tab-strip" role="tablist">
                {[
                  ["content", "Content"],
                  ["share", "Share"],
                  ["settings", "Settings"],
                ].map(([tabId, label]) => (
                  <button
                    aria-selected={activeTab === tabId}
                    className={
                      activeTab === tabId ? "tab-button tab-button-active" : "tab-button"
                    }
                    key={tabId}
                    onClick={() => setActiveTab(tabId as PackTab)}
                    role="tab"
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === "content" ? (
                <div className="workspace-stack">
                  {showImportPanel ? (
                    <section className="subpanel subpanel-muted">
                      <SectionTitle
                        title="Import links into this pack"
                        subtitle="Bring in fresh nodes without leaving the current pack workspace."
                      />
                      <form className="stack-form" onSubmit={handleImportIntoPack}>
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
                            rows={5}
                            value={importForm.content}
                          />
                        </label>
                        <div className="toolbar-actions">
                          <button className="primary-button" type="submit">
                            Import into this pack
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() => setShowImportPanel(false)}
                            type="button"
                          >
                            Close
                          </button>
                        </div>
                      </form>
                    </section>
                  ) : null}

                  <section className="subpanel">
                    <SectionTitle
                      title="Pack content"
                      subtitle="Search and compare duplicate names by tag, source, and protocol."
                      actions={
                        <div className="mini-stat-grid">
                          <MiniStat label="Nodes" value={subscriptionDetail.items.length} />
                          <MiniStat
                            label="Protocols"
                            tone="accent"
                            value={getProtocolOptions(subscriptionDetail.nodes).length}
                          />
                        </div>
                      }
                    />

                    <div className="toolbar-row">
                      <label className="toolbar-field toolbar-field-wide">
                        <span className="field-label">Search</span>
                        <input
                          onChange={(event) => setContentQuery(event.target.value)}
                          placeholder="Search nodes by name, tag, source, or protocol"
                          value={contentQuery}
                        />
                      </label>
                      <label className="toolbar-field">
                        <span className="field-label">Protocol</span>
                        <select
                          onChange={(event) => setContentProtocolFilter(event.target.value)}
                          value={contentProtocolFilter}
                        >
                          <option value="all">All protocols</option>
                          {getProtocolOptions(subscriptionDetail.nodes).map((protocol) => (
                            <option key={protocol} value={protocol}>
                              {protocol}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="toolbar-field">
                        <span className="field-label">Tag</span>
                        <select
                          onChange={(event) => setContentTagFilter(event.target.value)}
                          value={contentTagFilter}
                        >
                          <option value="all">All tags</option>
                          {getTagOptions(subscriptionDetail.nodes).map((tag) => (
                            <option key={tag} value={tag}>
                              {tag}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {filteredPackNodes.length === 0 ? (
                      <EmptyPanel
                        title="No pack nodes match this filter"
                        description="Reset the filters or add more proxies from inventory."
                      />
                    ) : (
                      <div className="data-list">
                        {subscriptionDetail.items
                          .filter((item) =>
                            filteredPackNodes.some((node) => node.id === item.proxyId),
                          )
                          .map((item) => {
                            const shareTarget = openShareTarget(
                              item.proxy.shareUri,
                              `${item.proxy.displayName} URI`,
                            );

                            return (
                              <article className="data-row" key={item.id}>
                                <div className="data-row-main">
                                  <div className="identity-block">
                                    <div className="identity-heading">
                                      <h3>{item.proxy.displayName}</h3>
                                      <ProtocolBadge value={item.proxy.protocol} />
                                    </div>
                                    <p className="supporting compact">
                                      Source {item.proxy.sourceName} · Updated{" "}
                                      {formatTime(item.proxy.updatedAt)}
                                    </p>
                                    <div className="token-row">
                                      <TagTokens tags={item.proxy.tags} fallback="No tags" />
                                    </div>
                                  </div>
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
                                    <button
                                      className="ghost-button"
                                      onClick={() => void handleRemoveItem(item.id)}
                                      type="button"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                      </div>
                    )}
                  </section>
                </div>
              ) : null}

              {activeTab === "share" ? (
                <div className="workspace-stack">
                  <section className="subpanel">
                    <SectionTitle
                      title="Share links"
                      subtitle="Copy URLs, open QR codes, or inspect the exact exported payload."
                    />
                    <div className="share-grid">
                      {(["clash-meta", "raw", "sing-box"] as ExportFormat[]).map((format) => {
                        const url = buildSubscriptionShareUrl(
                          selectedSubscription.shareToken,
                          format,
                        );
                        return (
                          <article className="share-card" key={format}>
                            <div>
                              <strong>{format}</strong>
                              <p className="share-link">{url}</p>
                            </div>
                            <div className="share-card-actions">
                              <button
                                className="primary-button"
                                onClick={() => void copyText(url)}
                                type="button"
                              >
                                Copy
                              </button>
                              <button
                                className="ghost-button"
                                onClick={() =>
                                  props.onOpenShare({
                                    label: `${selectedSubscription.name} ${format}`,
                                    value: url,
                                  })
                                }
                                type="button"
                              >
                                QR
                              </button>
                              <button
                                className="ghost-button"
                                onClick={() => setExportFormat(format)}
                                type="button"
                              >
                                Preview
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <section className="subpanel">
                    <SectionTitle
                      title="Export preview"
                      subtitle="Inspect the exact payload clients will receive for the selected profile."
                      actions={
                        <label className="toolbar-field">
                          <span className="field-label">Profile</span>
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
                        </label>
                      }
                    />
                    <textarea
                      className="preview-box"
                      readOnly
                      rows={16}
                      value={exportPreview?.content ?? ""}
                    />
                    {exportPreview?.skipped.length ? (
                      <div className="warning-list">
                        {exportPreview.skipped.map((item) => (
                          <p key={item.id}>
                            {item.name}: {item.reason}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}

              {activeTab === "settings" ? (
                <section className="subpanel">
                  <SectionTitle
                    title="Pack settings"
                    subtitle="Metadata, defaults, and token rotation live here."
                  />
                  <div className="settings-grid">
                    <MiniStat label="Name" value={selectedSubscription.name} />
                    <MiniStat label="Default export" value={selectedSubscription.defaultFormat} />
                    <MiniStat label="Nodes" value={selectedSubscription.itemCount} />
                    <MiniStat label="Updated" value={formatTime(selectedSubscription.updatedAt)} />
                  </div>
                  <div className="settings-card">
                    <h3>Description</h3>
                    <p className="supporting">
                      {selectedSubscription.description || "No description yet."}
                    </p>
                  </div>
                  <div className="settings-card">
                    <h3>Share token</h3>
                    <p className="mono-block">{selectedSubscription.shareToken}</p>
                    <div className="toolbar-actions">
                      <button
                        className="primary-button"
                        onClick={() => void handleRotateShareToken()}
                        type="button"
                      >
                        Rotate token
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <EmptyPanel
              title="Select a pack"
              description="Create a new pack on the left or choose an existing one to manage its content, sharing, and settings."
            />
          )}
        </section>
      </div>

      {pickerMode ? (
        <ProxyPickerDrawer
          currentPackNodeIds={currentPackNodeIds}
          mode={pickerMode}
          onClose={closePicker}
          onConfirm={handleConfirmPicker}
          onProtocolFilterChange={setPickerProtocolFilter}
          onQueryChange={setPickerQuery}
          onSelectionChange={setPickerSelection}
          onTagFilterChange={setPickerTagFilter}
          pickerNodes={pickerNodes}
          protocolFilter={pickerProtocolFilter}
          protocols={getProtocolOptions(props.dashboard.proxies)}
          query={pickerQuery}
          selection={pickerSelection}
          tagFilter={pickerTagFilter}
          tags={getTagOptions(props.dashboard.proxies)}
        />
      ) : null}
    </>
  );
}

function ProxyPickerDrawer(props: {
  currentPackNodeIds: Set<string>;
  mode: PickerMode;
  onClose: () => void;
  onConfirm: () => void;
  onProtocolFilterChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSelectionChange: React.Dispatch<React.SetStateAction<string[]>>;
  onTagFilterChange: (value: string) => void;
  pickerNodes: ProxySummary[];
  protocolFilter: string;
  protocols: string[];
  query: string;
  selection: string[];
  tagFilter: string;
  tags: string[];
}) {
  const actionableCount =
    props.mode === "append"
      ? props.selection.filter((id) => !props.currentPackNodeIds.has(id)).length
      : props.selection.length;

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside aria-modal="true" className="drawer-panel" role="dialog">
        <SectionTitle
          title={props.mode === "create" ? "Pick starter proxies" : "Add proxies to this pack"}
          subtitle="Search the existing inventory without leaving the Packs workspace."
          actions={
            <button className="ghost-button" onClick={props.onClose} type="button">
              Close
            </button>
          }
        />
        <div className="toolbar-row">
          <label className="toolbar-field toolbar-field-wide">
            <span className="field-label">Search</span>
            <input
              onChange={(event) => props.onQueryChange(event.target.value)}
              placeholder="Search by name, tag, source, or protocol"
              value={props.query}
            />
          </label>
          <label className="toolbar-field">
            <span className="field-label">Protocol</span>
            <select
              onChange={(event) => props.onProtocolFilterChange(event.target.value)}
              value={props.protocolFilter}
            >
              <option value="all">All protocols</option>
              {props.protocols.map((protocol) => (
                <option key={protocol} value={protocol}>
                  {protocol}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbar-field">
            <span className="field-label">Tag</span>
            <select
              onChange={(event) => props.onTagFilterChange(event.target.value)}
              value={props.tagFilter}
            >
              <option value="all">All tags</option>
              {props.tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="picker-list">
          {props.pickerNodes.map((proxy) => {
            const alreadyInPack = props.mode === "append" && props.currentPackNodeIds.has(proxy.id);
            const checked = props.selection.includes(proxy.id);
            const labelSuffix = proxy.tags.join(" ") || proxy.protocol;
            return (
              <label
                className={alreadyInPack ? "picker-row picker-row-disabled" : "picker-row"}
                key={proxy.id}
              >
                <input
                  aria-label={`Pick ${proxy.displayName} ${labelSuffix}`}
                  checked={checked}
                  disabled={alreadyInPack}
                  onChange={() =>
                    props.onSelectionChange((current) =>
                      current.includes(proxy.id)
                        ? current.filter((item) => item !== proxy.id)
                        : [...current, proxy.id],
                    )
                  }
                  type="checkbox"
                />
                <div className="picker-row-main">
                  <div className="identity-heading">
                    <strong>{proxy.displayName}</strong>
                    <ProtocolBadge value={proxy.protocol} />
                  </div>
                  <p className="supporting compact">Source {proxy.sourceName}</p>
                  <div className="token-row">
                    <TagTokens tags={proxy.tags} fallback="No tags" />
                  </div>
                </div>
                {alreadyInPack ? <span className="inline-note">Already in pack</span> : null}
              </label>
            );
          })}
        </div>

        <div className="drawer-footer">
          <span className="supporting">
            {actionableCount} {actionableCount === 1 ? "proxy" : "proxies"} ready
          </span>
          <button className="primary-button" onClick={props.onConfirm} type="button">
            {props.mode === "create"
              ? `Use ${actionableCount} ${actionableCount === 1 ? "proxy" : "proxies"}`
              : `Add ${actionableCount} ${actionableCount === 1 ? "proxy" : "proxies"}`}
          </button>
        </div>
      </aside>
    </div>
  );
}
