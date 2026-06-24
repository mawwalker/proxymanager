# Linear Workspace Dashboard Redesign

## Summary

This redesign replaces the current oversized, card-heavy dashboard with a calmer Linear/Notion-inspired workspace. The new UI is list-first, English-only, lighter in visual weight, and built around focused panes instead of stacked forms.

The main behavioral shift is that create/import flows stop living permanently on the page. `New pack`, `Import links`, `Add source`, and inventory import all move into drawers or modals so the default experience prioritizes browsing, searching, comparing, and editing existing data.

## Problems In The Current UI

1. The sidebar is too wide and visually dominant.
2. Metrics consume too much permanent space and read like filler instead of useful context.
3. `Packs` tries to show creation, discovery, filtering, and content management at the same time.
4. Large rounded cards and heavy borders make dense data feel bulkier than it is.
5. Repeated helper text and oversized spacing reduce scan speed.
6. Inventory rows are readable but still feel like detached cards instead of a coherent tool surface.

## Goals

1. Make each section feel like a working tool, not a landing page.
2. Prioritize lists and detail panes over always-open forms.
3. Keep default screens balanced in density: compact enough to scan, not cramped.
4. Use English UI copy consistently.
5. Keep metrics visible but subtle.
6. Preserve the current feature set and backend behavior while improving flow.

## Non-Goals

1. No protocol parsing changes.
2. No backend schema redesign.
3. No new sharing/export capability beyond what already exists.
4. No full pack metadata editor unless an existing frontend-compatible route already supports it without backend changes.

## Design Direction

### Overall Shell

The app becomes a cleaner workspace shell with three structural layers:

1. A narrow left rail for global navigation only.
2. A top summary strip inside the main area for light metrics.
3. A section workspace that uses list and detail panes rather than stacked panels.

The left rail should contain:

1. Product name.
2. Section navigation for `Inventory`, `Sources`, and `Packs`.
3. A subtle session/status footer with sign out.

The left rail should not contain:

1. Large metric tiles.
2. Long explanatory paragraphs.
3. Section-specific controls.

### Visual Language

The visual model should feel closer to Linear than to a marketing dashboard:

1. Off-white or near-white background with faint contrast steps between layers.
2. Thin borders, restrained shadows, and far less glassy treatment.
3. Smaller corner radii.
4. Dark neutral text with one cool accent for active states and primary actions.
5. Secondary text that is quieter and shorter.
6. Pills for protocol and tags that remain useful but visually quieter.

Typography must shift away from the current bulky contrast between headline and body styles. Use a cleaner, more even hierarchy with sharper sizing steps and less decorative weight.

## Information Architecture

### Global Pattern

Each section follows the same macro pattern:

1. Small header with section title and one-line explanation.
2. Light summary row with 2-4 compact counters.
3. Toolbar row for search/filter/action controls.
4. Main content area optimized for list browsing.
5. Drawers or modals for create/import tasks.

This consistency matters more than preserving the current per-page layouts.

### Inventory

Inventory becomes a two-pane workspace:

1. Primary pane: searchable, filterable proxy list.
2. Secondary pane: selected proxy detail and metadata editor.

Default behavior:

1. Search and filters stay visible at the top.
2. Rows are flatter and denser than the current cards.
3. Selecting a proxy opens its details in the right pane.
4. `Edit` becomes part of the detail pane rather than expanding the row inline.
5. `Share` remains available from the row and detail pane.
6. `Import inventory links` moves into a drawer opened from the header action area.

Each inventory row should show:

1. Display name.
2. Protocol pill.
3. Source name.
4. Updated time.
5. Tag pills.
6. Quick actions with restrained styling.

### Sources

Sources mirror the inventory structure instead of behaving like a standalone form page:

1. Primary pane: source list with health state.
2. Secondary pane: selected source details, URL, sync state, and errors.

Default behavior:

1. `Add source` opens a drawer.
2. `Refresh now` stays inline and in the detail pane.
3. Error state is visible but not visually noisy.
4. Empty state is simpler and more utilitarian.

Each source row should show:

1. Source name.
2. Health badge.
3. Last sync time.
4. Refresh cadence.
5. Shortened URL or muted URL line.

### Packs

`Packs` is the most important redesign target. It becomes a real split workspace:

1. Middle pane: pack list.
2. Right pane: selected pack detail workspace.

`New pack` moves out of the persistent sidebar and into a drawer.

The selected pack view keeps tabs, but the surrounding layout changes:

1. Header line with pack name, short metadata, and primary actions.
2. Tabs for `Content`, `Share`, and `Settings`.
3. `Content` is the default tab and behaves like an operational list, not a block of stacked cards.

`Content` tab:

1. Search and filters stay above the list.
2. Rows show proxy name, protocol, source, updated time, and tags clearly.
3. Duplicate names are distinguished by source and tag without needing extra clicks.
4. `Add proxies` opens a picker drawer.
5. `Import links` opens a dedicated drawer scoped to the selected pack.
6. Row actions stay available but visually quieter.

`Share` tab:

1. Export formats appear as compact selectable cards or segmented options.
2. Share link, copy, QR, and preview actions are grouped more tightly.
3. Preview panel should read like a utility output, not a marketing card.

`Settings` tab:

1. Show pack metadata and share token controls in a lighter settings layout.
2. If metadata editing is still unsupported by backend routes, present read-only fields cleanly rather than making the tab feel unfinished.

## Interaction Model

### Drawers And Modals

Use drawers for multi-field workflows tied to the current page context:

1. Import inventory links.
2. Add source.
3. New pack.
4. Add proxies to pack.
5. Import links into pack.

Use modals for focused output or confirmation:

1. QR sharing.
2. The redesign does not introduce any new confirmation flow beyond existing share actions.

### Selection Behavior

Section workspaces keep a persistent selected item:

1. Selecting a proxy keeps the detail pane stable until another proxy is chosen.
2. Selecting a source does the same.
3. Selecting a different pack preserves the active tab within the `Packs` section during the same session.

### Density And Motion

Density target is balanced:

1. Enough vertical space to scan names, tags, and metadata.
2. No oversized card padding.
3. No long helper paragraphs between controls and data.

Motion should be minimal:

1. Short hover/focus transitions.
2. Drawer slide-in.
3. No decorative animation.

## Responsive Behavior

### Desktop

1. Left rail remains narrow and fixed.
2. Inventory and Sources use two panes.
3. Packs uses list + detail split.

### Tablet

1. Left rail can compress.
2. Secondary pane may collapse below the list if width is constrained.
3. Toolbars can wrap into two rows.

### Mobile

1. Navigation becomes a compact top or drawer trigger.
2. List remains primary.
3. Detail panes become stacked sections or overlay drawers.
4. Large horizontal controls must collapse cleanly.

## Copy Strategy

1. English-only interface copy.
2. Short labels and short descriptions.
3. Remove redundant explanatory sentences.
4. Prefer operational wording like `New Pack`, `Import Links`, `Refresh`, `Add Proxies`.

## Accessibility And Usability

1. Keep keyboard focus states clear.
2. Preserve semantic buttons, labels, tabs, and list selection affordances.
3. Ensure contrast is strong enough despite lighter surfaces.
4. Keep destructive actions clearly separated from share/edit actions.

## Implementation Boundaries

The redesign should primarily be a frontend refactor using the existing API surface. Expected code impact:

1. Rebuild the main shell in `src/ui/App.tsx`.
2. Rework `InventoryView`, `SourcesView`, and `PacksView` into pane-based layouts.
3. Expand shared UI primitives in `src/ui/chrome.tsx`.
4. Replace the current visual system in `src/ui/styles.css`.
5. Update tests to reflect the new layout and interaction entry points.

No backend API change is required for the redesign itself.

## Acceptance Criteria

1. Sidebar is visibly narrower and no longer contains large metric cards.
2. Default pages show lists first, not large creation forms.
3. All create/import flows are reachable through drawers or modals.
4. Inventory, Sources, and Packs share a clearer and more consistent workspace structure.
5. `Packs` no longer requires stacked left-side creation and right-side management blocks in the default state.
6. Proxy rows in pack content clearly expose name, protocol, source, and tags.
7. UI copy is consistently English.
8. The final layout feels materially lighter, less crowded, and more deliberate than the current screenshots.
