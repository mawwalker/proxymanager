# Pack Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe pack deletion flow that removes only the selected custom subscription and its pack item references.

**Architecture:** Extend the existing subscription API with a delete route, teach both store backends how to delete a subscription, and expose the action in `Packs > Settings` behind a confirmation modal. The dashboard refresh path already exists, so deletion only needs to clear the removed pack from current selection and reload the current workspace state.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Hono, D1

---

## File Structure

- Modify: `src/worker/store.ts`
  - Add `deleteSubscription(subscriptionId)` to the store interface, memory store, and D1 store.
- Modify: `src/worker/app.ts`
  - Add `DELETE /api/subscriptions/:id`.
- Modify: `src/ui/PacksView.tsx`
  - Add `Danger Zone`, confirmation modal state, and delete action handling.
- Modify: `tests/worker/app.test.ts`
  - Cover pack deletion at the API level.
- Modify: `tests/ui/app.test.tsx`
  - Cover deleting a pack from `Settings`.

### Task 1: Lock backend deletion behavior with a failing test

**Files:**
- Modify: `tests/worker/app.test.ts`
- Test: `tests/worker/app.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("deletes a subscription without deleting inventory proxies", async () => {
  const store = createMemoryStore();
  const app = createApp({ ... });
  const sessionCookie = ...;
  const imported = ...;
  const created = ...;

  const deleteResponse = await app.request(
    `http://worker.test/api/subscriptions/${created.subscription.id}`,
    {
      headers: { cookie: sessionCookie },
      method: "DELETE",
    },
  );

  expect(deleteResponse.status).toBe(200);

  const deletedDetail = await app.request(
    `http://worker.test/api/subscriptions/${created.subscription.id}`,
    {
      headers: { cookie: sessionCookie },
    },
  );
  expect(deletedDetail.status).toBe(404);

  const dashboardResponse = await app.request("http://worker.test/api/dashboard", {
    headers: { cookie: sessionCookie },
  });
  const dashboard = await dashboardResponse.json();
  expect(dashboard.subscriptions).toHaveLength(0);
  expect(dashboard.proxies).toHaveLength(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/worker/app.test.ts -t "deletes a subscription without deleting inventory proxies"`

Expected: FAIL because `DELETE /api/subscriptions/:id` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
app.delete("/api/subscriptions/:id", async (context) => {
  const subscription = await options.store.getSubscription(context.req.param("id"));
  if (!subscription) {
    return context.json({ error: "Subscription not found" }, 404);
  }

  await options.store.deleteSubscription(subscription.id);
  return context.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/worker/app.test.ts -t "deletes a subscription without deleting inventory proxies"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/worker/app.test.ts src/worker/app.ts src/worker/store.ts
git commit -m "Add pack deletion API"
```

### Task 2: Lock the Settings danger-zone flow with a failing UI test

**Files:**
- Modify: `tests/ui/app.test.tsx`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("deletes a pack from settings after confirmation", async () => {
  mockAppFetch();
  render(<App />);
  await signIn();

  await userEvent.click(screen.getByRole("button", { name: /^packs$/i }));
  await userEvent.click(screen.getByRole("tab", { name: /settings/i }));
  await userEvent.click(screen.getByRole("button", { name: /delete pack/i }));

  expect(
    await screen.findByRole("dialog", { name: /delete pack/i }),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

  await waitFor(() => {
    expect(screen.queryByText("Travel Pack")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/app.test.tsx -t "deletes a pack from settings after confirmation"`

Expected: FAIL because there is no delete button or confirmation flow yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
const [showDeleteDialog, setShowDeleteDialog] = useState(false);

async function handleDeletePack() {
  await apiRequest(`/api/subscriptions/${selectedSubscription.id}`, {
    method: "DELETE",
  });
  await props.onRefreshDashboard();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/app.test.tsx -t "deletes a pack from settings after confirmation"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ui/app.test.tsx src/ui/PacksView.tsx
git commit -m "Add pack deletion danger zone"
```

### Task 3: Run full verification

**Files:**
- Modify: `src/worker/store.ts`
- Modify: `src/worker/app.ts`
- Modify: `src/ui/PacksView.tsx`
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

- [ ] **Step 4: Commit**

```bash
git add src/worker/store.ts src/worker/app.ts src/ui/PacksView.tsx tests/worker/app.test.ts tests/ui/app.test.tsx docs/superpowers/specs/2026-06-24-pack-delete-design.md docs/superpowers/plans/2026-06-24-pack-delete.md
git commit -m "Add pack deletion flow"
```
