# Inventory Proxy Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe inventory proxy deletion flow that removes a node globally while preserving packs and sources.

**Architecture:** Extend the existing proxy API with a delete route, teach both store backends how to delete a proxy while reindexing affected pack items, and expose the action in the inventory detail pane behind a confirmation modal. The existing dashboard refresh path will pick the next remaining proxy or show the empty state.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Hono, D1

---

## File Structure

- Modify: `src/worker/store.ts`
  - Add `deleteProxy(proxyId)` to the store interface, memory store, and D1 store.
  - Reindex affected subscription items after proxy removal.
- Modify: `src/worker/app.ts`
  - Add `DELETE /api/proxies/:id`.
- Modify: `src/ui/InventoryView.tsx`
  - Add a danger zone, confirmation modal state, and delete action handling.
- Modify: `tests/worker/app.test.ts`
  - Cover proxy deletion, pack preservation, and item reindexing.
- Modify: `tests/ui/app.test.tsx`
  - Cover deleting a proxy from the inventory detail pane.

### Task 1: Lock backend proxy deletion with a failing test

**Files:**
- Modify: `tests/worker/app.test.ts`
- Test: `tests/worker/app.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("deletes a proxy and reindexes remaining pack items", async () => {
  const store = createMemoryStore();
  const app = createApp({ ... });
  const sessionCookie = ...;
  const imported = ...;
  const created = ...;

  const deleteResponse = await app.request(
    `http://worker.test/api/proxies/${imported.nodes[1].id}`,
    {
      headers: { cookie: sessionCookie },
      method: "DELETE",
    },
  );

  expect(deleteResponse.status).toBe(200);

  const dashboard = await (await app.request("http://worker.test/api/dashboard", {
    headers: { cookie: sessionCookie },
  })).json();
  expect(dashboard.proxies).toHaveLength(2);
  expect(dashboard.subscriptions[0]?.itemCount).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/worker/app.test.ts -t "deletes a proxy and reindexes remaining pack items"`

Expected: FAIL because `DELETE /api/proxies/:id` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
app.delete("/api/proxies/:id", async (context) => {
  const proxy = await options.store.getProxy(context.req.param("id"));
  if (!proxy) {
    return context.json({ error: "Proxy not found" }, 404);
  }

  await options.store.deleteProxy(proxy.id);
  return context.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/worker/app.test.ts -t "deletes a proxy and reindexes remaining pack items"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/worker/app.test.ts src/worker/app.ts src/worker/store.ts
git commit -m "Add inventory proxy deletion API"
```

### Task 2: Lock the inventory danger-zone flow with a failing UI test

**Files:**
- Modify: `tests/ui/app.test.tsx`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("deletes a proxy from inventory after confirmation", async () => {
  mockAppFetch();
  render(<App />);
  await signIn();

  await userEvent.click(
    screen.getByRole("button", { name: /edge prime manual-import/i }),
  );
  await userEvent.click(screen.getByRole("button", { name: /delete proxy/i }));

  expect(
    await screen.findByRole("dialog", { name: /delete proxy/i }),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: /edge prime manual-import/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/app.test.tsx -t "deletes a proxy from inventory after confirmation"`

Expected: FAIL because there is no delete button or confirmation flow yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
const [showDeleteDialog, setShowDeleteDialog] = useState(false);

async function handleDeleteProxy() {
  await apiRequest(`/api/proxies/${selectedProxy.id}`, {
    method: "DELETE",
  });
  await props.onRefreshDashboard();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/app.test.tsx -t "deletes a proxy from inventory after confirmation"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ui/app.test.tsx src/ui/InventoryView.tsx
git commit -m "Add inventory proxy deletion UI"
```

### Task 3: Run full verification

**Files:**
- Modify: `src/worker/store.ts`
- Modify: `src/worker/app.ts`
- Modify: `src/ui/InventoryView.tsx`
- Modify: `tests/worker/app.test.ts`
- Modify: `tests/ui/app.test.tsx`
- Test: `tests/worker/app.test.ts`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Run focused worker and UI tests**

Run: `npm test -- tests/worker/app.test.ts tests/ui/app.test.tsx`

Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS with zero failing tests.

- [ ] **Step 3: Run static verification**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run production build verification**

Run: `npm run build`

Expected: PASS with a successful Vite build and Wrangler dry-run.

- [ ] **Step 5: Commit**

```bash
git add src/worker/store.ts src/worker/app.ts src/ui/InventoryView.tsx tests/worker/app.test.ts tests/ui/app.test.tsx docs/superpowers/specs/2026-06-24-inventory-proxy-delete-design.md docs/superpowers/plans/2026-06-24-inventory-proxy-delete.md
git commit -m "Add inventory proxy deletion flow"
```
