# Pack Delete Design

## Summary

Add a pack-level delete action that removes only the selected custom subscription and its subscription item references. Inventory proxies remain untouched.

## Scope

1. Add `DELETE /api/subscriptions/:id` to the worker API.
2. Add store support for deleting a subscription in memory and D1-backed modes.
3. Add a `Danger Zone` inside the `Packs` `Settings` tab.
4. Show a confirmation modal before deletion.
5. After deletion, refresh the dashboard and select the next remaining pack if one exists.

## Non-Goals

1. Do not delete `proxy_nodes`.
2. Do not add bulk pack deletion.
3. Do not introduce soft delete or undo.

## UX

1. The delete action lives only in `Settings`, not in the pack list or header.
2. The warning copy explicitly states that inventory proxies stay untouched.
3. Confirmation shows the pack name and node count.
4. On success, the current pack view falls back to another pack or the empty state.

## Backend

1. The new route checks that the subscription exists before deleting.
2. The store delete method removes the subscription record.
3. `subscription_items` already cascade on D1 delete, so no extra item cleanup is needed there.
4. The memory store must remove both the subscription and its in-memory item list.

## Testing

1. Worker test covers deleting a created pack and verifies dashboard/subscription lookup behavior after deletion.
2. UI test covers deleting from `Settings`, confirming the dialog, and observing the pack disappear from the workspace.
