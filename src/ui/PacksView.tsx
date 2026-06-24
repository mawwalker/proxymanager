import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  Drawer,
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
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [showImportDrawer, setShowImportDrawer] = useState(false);
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
    if (activeTab !== "share" || !subscriptionDetail) {
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

  const pickerNodes = useMemo(
    () =>
      props.dashboard.proxies.filter((proxy) => {
        const matchesQuery =
          deferredPickerQuery.trim().length === 0 ||
          proxySearchText(proxy).includes(deferredPickerQuery.trim().toLowerCase());
        const matchesProtocol =
          pickerProtocolFilter === "all" || proxy.protocol === pickerProtocolFilter;
        const matchesTag = matchesTagFilter(proxy.tags, pickerTagFilter);
        return matchesQuery && matchesProtocol && matchesTag;
      }),
    [
      deferredPickerQuery,
      pickerProtocolFilter,
      pickerTagFilter,
      props.dashboard.proxies,
    ],
  );

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
      props.onStatusChange("Pick at least one proxy before creating a pack.");
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
      setShowCreateDrawer(false);
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
      setShowImportDrawer(false);
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
    <section aria-label="Packs Workspace" className="page-section" role="region">
      <SectionTitle
        title="Packs"
        subtitle="Browse custom subscriptions first, then open drawers only when you need to create, import, or append."
        actions={
          <button
            className="primary-button"
            onClick={() => setShowCreateDrawer(true)}
            type="button"
          >
            New Pack
          </button>
        }
      />

      <div className="packs-grid">
        <div className="panel">
          <label className="toolbar-field toolbar-field-wide">
            <span className="field-label">Search Packs</span>
            <input
              onChange={(event) => setPackListQuery(event.target.value)}
              placeholder="Filter by name or export format"
              value={packListQuery}
            />
          </label>

          {filteredPacks.length === 0 ? (
            <EmptyPanel
              title="No packs found"
              description="Create a new pack or clear the search to browse the full list."
            />
          ) : (
            <div className="data-list">
              {filteredPacks.map((subscription) => {
                const isActive = subscription.id === props.activeSubscriptionId;

                return (
                  <div
                    className={isActive ? "list-row list-row-active" : "list-row"}
                    key={subscription.id}
                  >
                    <button
                      className="list-row-button"
                      onClick={() => props.onSelectSubscription(subscription.id)}
                      type="button"
                    >
                      <div className="row-heading">
                        <strong>{subscription.name}</strong>
                        <span className="inline-note">{subscription.defaultFormat}</span>
                      </div>
                      <p className="supporting compact">
                        {subscription.description || "No description"}
                      </p>
                      <p className="supporting compact">
                        {subscription.itemCount} nodes · Updated{" "}
                        {formatTime(subscription.updatedAt)}
                      </p>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel detail-pane">
          {selectedSubscription && subscriptionDetail ? (
            <>
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Selected Pack</p>
                  <h2>{selectedSubscription.name}</h2>
                  <p className="supporting">
                    {selectedSubscription.description || "No description"} ·{" "}
                    {selectedSubscription.itemCount} nodes · Updated{" "}
                    {formatTime(selectedSubscription.updatedAt)}
                  </p>
                </div>
                <div className="headline-actions">
                  <button
                    className="ghost-button"
                    onClick={() => openPicker("append")}
                    type="button"
                  >
                    Add Proxies
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => setShowImportDrawer(true)}
                    type="button"
                  >
                    Import Links
                  </button>
                </div>
              </div>

              <div aria-label="Pack Tabs" className="tab-strip" role="tablist">
                {([
                  ["content", "Content"],
                  ["share", "Share"],
                  ["settings", "Settings"],
                ] as const).map(([tabId, label]) => (
                  <button
                    aria-selected={activeTab === tabId}
                    className={
                      activeTab === tabId ? "tab-button tab-button-active" : "tab-button"
                    }
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    role="tab"
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === "content" ? (
                <div className="workspace-stack">
                  <SectionTitle
                    title="Pack Content"
                    subtitle="Duplicate names are distinguished by source, protocol, and tags."
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
                            <div className="list-row" key={item.id}>
                              <div className="list-row-body">
                                <div className="row-heading">
                                  <strong>{item.proxy.displayName}</strong>
                                  <ProtocolBadge value={item.proxy.protocol} />
                                </div>
                                <p className="supporting compact">
                                  {item.proxy.sourceName} · Updated{" "}
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
                          );
                        })}
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === "share" ? (
                <div className="workspace-stack">
                  <section className="subpanel">
                    <SectionTitle
                      title="Share Links"
                      subtitle="Copy the public URL, open a QR code, or preview the exact payload."
                    />
                    <div className="share-grid">
                      {(["clash-meta", "raw", "sing-box"] as ExportFormat[]).map((format) => {
                        const url = buildSubscriptionShareUrl(
                          selectedSubscription.shareToken,
                          format,
                        );
                        return (
                          <article className="share-card" key={format}>
                            <div className="row-heading">
                              <strong>{format}</strong>
                              <span className="inline-note">public</span>
                            </div>
                            <p className="share-link">{url}</p>
                            <div className="share-card-actions">
                              <button
                                className="ghost-button"
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
                      title="Export Preview"
                      subtitle="Inspect the exact response clients receive for the selected format."
                      actions={
                        <label className="toolbar-field">
                          <span className="field-label">Format</span>
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
                <div className="workspace-stack">
                  <SectionTitle
                    title="Settings"
                    subtitle="Metadata stays readable here even when editing is limited by the current API."
                  />
                  <div className="detail-meta">
                    <div>
                      <span className="detail-label">Default export</span>
                      <p className="detail-copy">{selectedSubscription.defaultFormat}</p>
                    </div>
                    <div>
                      <span className="detail-label">Nodes</span>
                      <p className="detail-copy">{selectedSubscription.itemCount}</p>
                    </div>
                    <div>
                      <span className="detail-label">Updated</span>
                      <p className="detail-copy">{formatTime(selectedSubscription.updatedAt)}</p>
                    </div>
                  </div>
                  <div className="detail-block">
                    <span className="detail-label">Description</span>
                    <p className="detail-copy">
                      {selectedSubscription.description || "No description yet."}
                    </p>
                  </div>
                  <div className="detail-block">
                    <span className="detail-label">Share token</span>
                    <p className="mono-block">{selectedSubscription.shareToken}</p>
                    <button
                      className="ghost-button"
                      onClick={() => void handleRotateShareToken()}
                      type="button"
                    >
                      Rotate Token
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyPanel
              title="No pack selected"
              description="Choose an existing pack or create a new one from the drawer."
            />
          )}
        </div>
      </div>

      {showCreateDrawer ? (
        <Drawer
          description="Name the pack, choose its default export, and attach inventory nodes before saving."
          onClose={() => setShowCreateDrawer(false)}
          title="Create Pack"
          width="wide"
        >
          <form className="stack-form" onSubmit={handleCreatePack}>
            <label>
              <span>Pack Name</span>
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
                placeholder="Regional split, low-latency routes, backup nodes..."
                rows={4}
                value={newPackForm.description}
              />
            </label>
            <label>
              <span>Default Export</span>
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
                Pick Proxies
              </button>
            </div>
            {newPackNodeIds.length > 0 ? (
              <div className="selection-preview">
                {props.dashboard.proxies
                  .filter((proxy) => newPackNodeIds.includes(proxy.id))
                  .slice(0, 6)
                  .map((proxy) => (
                    <span className="selection-preview-chip" key={proxy.id}>
                      {proxy.displayName}
                    </span>
                  ))}
              </div>
            ) : null}
            <button className="primary-button" type="submit">
              Create Pack
            </button>
          </form>
        </Drawer>
      ) : null}

      {showImportDrawer && subscriptionDetail ? (
        <Drawer
          description="Bring fresh nodes into the selected pack without leaving the current workspace."
          onClose={() => setShowImportDrawer(false)}
          title="Import Links Into Pack"
        >
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
                rows={8}
                value={importForm.content}
              />
            </label>
            <button className="primary-button" type="submit">
              Import Into Pack
            </button>
          </form>
        </Drawer>
      ) : null}

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
    </section>
  );
}

function ProxyPickerDrawer(props: {
  currentPackNodeIds: Set<string>;
  mode: PickerMode;
  onClose: () => void;
  onConfirm: () => void;
  onProtocolFilterChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSelectionChange: (value: string[]) => void;
  onTagFilterChange: (value: string) => void;
  pickerNodes: ProxySummary[];
  protocolFilter: string;
  protocols: string[];
  query: string;
  selection: string[];
  tagFilter: string;
  tags: string[];
}) {
  function toggleSelection(proxyId: string) {
    if (props.selection.includes(proxyId)) {
      props.onSelectionChange(props.selection.filter((id) => id !== proxyId));
      return;
    }

    props.onSelectionChange([...props.selection, proxyId]);
  }

  return (
    <Drawer
      description="Search the inventory, compare duplicate names by source and tags, and stage the exact nodes you want."
      onClose={props.onClose}
      title={props.mode === "create" ? "Pick Proxies For New Pack" : "Add Proxies"}
      width="wide"
    >
      <div className="workspace-stack">
        <div className="toolbar-row">
          <label className="toolbar-field toolbar-field-wide">
            <span className="field-label">Search</span>
            <input
              onChange={(event) => props.onQueryChange(event.target.value)}
              placeholder="Search by name, source, tag, or protocol"
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
            const isDisabled =
              props.mode === "append" && props.currentPackNodeIds.has(proxy.id);
            const isChecked = props.selection.includes(proxy.id);

            return (
              <label
                className={isDisabled ? "picker-row picker-row-disabled" : "picker-row"}
                key={proxy.id}
              >
                <input
                  aria-label={`Pick ${proxy.displayName} ${proxy.tags.join(" ") || proxy.protocol}`}
                  checked={isChecked || isDisabled}
                  disabled={isDisabled}
                  onChange={() => toggleSelection(proxy.id)}
                  type="checkbox"
                />
                <div className="picker-row-main">
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
                </div>
                <span className="inline-note">{isDisabled ? "Already in pack" : "Ready"}</span>
              </label>
            );
          })}
        </div>

        <div className="drawer-footer">
          <span className="selection-chip">{props.selection.length} selected</span>
          <button className="primary-button" onClick={props.onConfirm} type="button">
            {props.mode === "create"
              ? "Apply Selection"
              : `Add ${props.selection.length} Proxies`}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
