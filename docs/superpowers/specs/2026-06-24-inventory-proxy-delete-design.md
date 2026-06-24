# Inventory Proxy Delete Design

## Summary

Add an inventory-level delete action that removes a proxy node from the global inventory and automatically removes that node from every pack and source mapping. Packs and sources themselves remain intact.

## Scope

1. Add `DELETE /api/proxies/:id` to the worker API.
2. Add store support for deleting a proxy in memory and D1-backed modes.
3. Reindex affected `subscription_items.position` values after deletion.
4. Add a `Danger Zone` in the inventory detail pane.
5. Show a confirmation modal before deletion.
6. Refresh the dashboard after deletion and fall back to the next available proxy.

## Non-Goals

1. Do not delete `subscriptions`.
2. Do not delete `sources`.
3. Do not add bulk deletion or undo.

## UX

1. The delete action lives only in the inventory detail pane, not on every row.
2. Warning copy explicitly states that the proxy is removed from all packs and source mappings.
3. Confirmation shows the proxy display name and protocol.
4. After success, the workspace refreshes and selects another proxy if one exists.

## Backend

1. The new route checks that the proxy exists before deleting.
2. The delete operation removes the proxy from inventory and all related pack/source mappings.
3. Pack item positions must be compacted after removal so future inserts keep stable ordering.
4. Affected packs should have refreshed `updated_at` values when their contents change.

## Testing

1. Worker test covers deleting one proxy from a populated pack, verifies the proxy disappears, the pack remains, and item positions are reindexed.
2. UI test covers deleting from the inventory danger zone, confirming the dialog, and observing the list fall back to the next proxy.
