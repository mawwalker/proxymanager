# Linear Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard into a lighter Linear-style workspace with narrow navigation, list-first pages, and drawer-based create/import flows.

**Architecture:** Keep the existing API surface and data types, but reorganize the frontend into a consistent shell plus pane-based section views. Inventory and Sources become list/detail workspaces, while Packs becomes a split list/work pane with drawer-scoped creation and import flows.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, CSS

---

## File Structure

- Modify: `src/ui/App.tsx`
  - Replace the current heavy shell with a narrow left rail, a light top metrics strip, and cleaner section headers.
- Modify: `src/ui/InventoryView.tsx`
  - Convert inventory into a list/detail workspace with drawer-based import and side-pane editing.
- Modify: `src/ui/SourcesView.tsx`
  - Convert sources into a list/detail workspace with drawer-based source creation.
- Modify: `src/ui/PacksView.tsx`
  - Move pack creation/import into drawers and make the default screen list-first.
- Modify: `src/ui/chrome.tsx`
  - Add reusable layout primitives for headers, summary strips, drawers, row labels, and detail panes.
- Modify: `src/ui/styles.css`
  - Replace the current rounded-card-heavy system with a lighter pane/list visual language.
- Modify: `tests/ui/app.test.tsx`
  - Update the existing app flow tests and add regression coverage for the redesigned workspace interactions.

### Task 1: Lock the redesigned shell behavior with tests

**Files:**
- Modify: `tests/ui/app.test.tsx`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("renders a narrow workspace shell with a summary strip instead of sidebar metric tiles", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          proxies: [{ id: "node_1", displayName: "Edge Prime", enabled: true, protocol: "vless", shareToken: "unused", shareUri: "vless://one#Edge", sourceName: "manual-import", tags: ["hk"], updatedAt: "2026-06-24T00:00:00.000Z" }],
          sources: [{ id: "source_1", kind: "raw", lastError: null, lastSyncAt: "2026-06-24T00:00:00.000Z", lastSyncStatus: "success", name: "Friend Feed", refreshIntervalMinutes: 15, updatedAt: "2026-06-24T00:00:00.000Z", url: "https://friend.example/sub.txt" }],
          subscriptions: [{ id: "subscription_1", name: "Travel Pack", description: "", defaultFormat: "clash-meta", itemCount: 1, shareToken: "travel-pack-token", updatedAt: "2026-06-24T00:00:00.000Z" }],
        }),
      ),
    );

  render(<App />);

  await userEvent.type(await screen.findByLabelText(/username/i), "admin");
  await userEvent.type(screen.getByLabelText(/password/i), "admin-pass");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

  expect(await screen.findByRole("heading", { name: /proxy manager/i })).toBeInTheDocument();
  expect(screen.getByText(/workspace overview/i)).toBeInTheDocument();
  expect(screen.queryByText(/healthy feeds/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/app.test.tsx -t "renders a narrow workspace shell with a summary strip instead of sidebar metric tiles"`

Expected: FAIL because the current app still renders the old `Proxy Command Center` shell and sidebar metric tiles.

- [ ] **Step 3: Write minimal implementation**

```tsx
<aside className="workspace-rail">
  <h1>Proxy Manager</h1>
  <nav aria-label="Primary">
    ...
  </nav>
</aside>
<section className="workspace-main">
  <div className="summary-strip" aria-label="Workspace overview">
    ...
  </div>
</section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/app.test.tsx -t "renders a narrow workspace shell with a summary strip instead of sidebar metric tiles"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ui/app.test.tsx src/ui/App.tsx src/ui/styles.css
git commit -m "Refine workspace shell layout"
```

### Task 2: Lock list/detail inventory and source workflows with tests

**Files:**
- Modify: `tests/ui/app.test.tsx`
- Modify: `src/ui/InventoryView.tsx`
- Modify: `src/ui/SourcesView.tsx`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it("opens inventory import from a drawer and edits proxy metadata in the detail pane", async () => {
  render(<App />);
  ...
  await userEvent.click(screen.getByRole("button", { name: /import links/i }));
  expect(screen.getByRole("dialog", { name: /import inventory links/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /edge prime/i }));
  expect(screen.getByRole("heading", { name: /proxy details/i })).toBeInTheDocument();
  expect(screen.getByDisplayValue("Edge Prime")).toBeInTheDocument();
});

it("opens add source from a drawer and shows source details in a side pane", async () => {
  render(<App />);
  ...
  await userEvent.click(screen.getByRole("button", { name: /sources/i }));
  await userEvent.click(screen.getByRole("button", { name: /new source/i }));
  expect(screen.getByRole("dialog", { name: /add remote source/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /friend feed/i }));
  expect(screen.getByRole("heading", { name: /source details/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/app.test.tsx -t "opens inventory import from a drawer and edits proxy metadata in the detail pane|opens add source from a drawer and shows source details in a side pane"`

Expected: FAIL because inventory import is still inline and sources do not yet use a detail pane.

- [ ] **Step 3: Write minimal implementation**

```tsx
const [showImportDrawer, setShowImportDrawer] = useState(false);
const [selectedProxyId, setSelectedProxyId] = useState<string | null>(null);

<button onClick={() => setShowImportDrawer(true)} type="button">Import Links</button>
<div className="workspace-split">
  <div className="list-pane">...</div>
  <aside className="detail-pane">...</aside>
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/app.test.tsx -t "opens inventory import from a drawer and edits proxy metadata in the detail pane|opens add source from a drawer and shows source details in a side pane"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ui/app.test.tsx src/ui/InventoryView.tsx src/ui/SourcesView.tsx src/ui/chrome.tsx src/ui/styles.css
git commit -m "Convert inventory and sources to pane workflows"
```

### Task 3: Lock the pack workflow redesign with tests

**Files:**
- Modify: `tests/ui/app.test.tsx`
- Modify: `src/ui/PacksView.tsx`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("keeps packs list-first and moves new-pack and import flows into drawers", async () => {
  render(<App />);
  ...
  await userEvent.click(screen.getByRole("button", { name: /^packs$/i }));

  expect(screen.queryByLabelText(/pack name/i)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /new pack/i }));
  expect(screen.getByRole("dialog", { name: /create pack/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /import links/i }));
  expect(screen.getByRole("dialog", { name: /import links into pack/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/app.test.tsx -t "keeps packs list-first and moves new-pack and import flows into drawers"`

Expected: FAIL because pack creation still renders as a permanent form and import lives inline.

- [ ] **Step 3: Write minimal implementation**

```tsx
const [showCreatePackDrawer, setShowCreatePackDrawer] = useState(false);
const [showPackImportDrawer, setShowPackImportDrawer] = useState(false);

<button onClick={() => setShowCreatePackDrawer(true)} type="button">New Pack</button>
<button onClick={() => setShowPackImportDrawer(true)} type="button">Import Links</button>
{showCreatePackDrawer ? <Drawer title="Create Pack">...</Drawer> : null}
{showPackImportDrawer ? <Drawer title="Import Links Into Pack">...</Drawer> : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/app.test.tsx -t "keeps packs list-first and moves new-pack and import flows into drawers"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ui/app.test.tsx src/ui/PacksView.tsx src/ui/chrome.tsx src/ui/styles.css
git commit -m "Redesign pack workflows around drawers"
```

### Task 4: Implement the shared chrome and visual system

**Files:**
- Modify: `src/ui/chrome.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/styles.css`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("renders section pages with a summary strip and shared pane layout", async () => {
  render(<App />);
  ...
  expect(screen.getByRole("region", { name: /workspace overview/i })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: /inventory workspace/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/app.test.tsx -t "renders section pages with a summary strip and shared pane layout"`

Expected: FAIL because the shared layout primitives do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
export function SummaryStrip(...) { ... }
export function WorkspaceSplit(...) { ... }
export function Drawer(...) { ... }
export function DetailPane(...) { ... }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/app.test.tsx -t "renders section pages with a summary strip and shared pane layout"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/chrome.tsx src/ui/App.tsx src/ui/styles.css tests/ui/app.test.tsx
git commit -m "Introduce shared workspace chrome"
```

### Task 5: Run full verification and clean integration

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/InventoryView.tsx`
- Modify: `src/ui/SourcesView.tsx`
- Modify: `src/ui/PacksView.tsx`
- Modify: `src/ui/chrome.tsx`
- Modify: `src/ui/styles.css`
- Modify: `tests/ui/app.test.tsx`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Run the focused UI test suite**

Run: `npm test -- tests/ui/app.test.tsx`

Expected: PASS with the redesigned flows covered.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS with zero failing tests.

- [ ] **Step 3: Run static verification**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run production build verification**

Run: `npm run build`

Expected: PASS with Vite build success and Wrangler dry-run success.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.tsx src/ui/InventoryView.tsx src/ui/SourcesView.tsx src/ui/PacksView.tsx src/ui/chrome.tsx src/ui/styles.css tests/ui/app.test.tsx
git commit -m "Apply linear workspace redesign"
```
