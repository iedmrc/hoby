# Hoby product requirements

## Product statement

Hoby is a local-first Chrome tab workspace. It replaces the new-tab page with a calm place to save, group, find, close, and reopen tabs without a server or account.

## Toby findings

Toby's durable model is `organization → space → collection → card`. The Chrome extension adds two primary surfaces: a visual new-tab workspace and a compact toolbar menu. Its core loop is to capture open tabs into collections, close browser clutter, and restore a collection later. Search, drag-and-drop, and a visible open-tabs rail shorten that loop.

Observed sources:

- [Toby website](https://www.gettoby.com/)
- [Chrome Web Store listing](https://chromewebstore.google.com/detail/toby-tab-management-tool/hddnkoipeenegfoeaoibdmnaalmgkpip)
- [Interface glossary](https://help.gettoby.com/support/solutions/articles/66000497719-toby-s-interface-glossary)
- [Extension menu](https://help.gettoby.com/support/solutions/articles/66000497270-extension-menu)
- [Collections](https://help.gettoby.com/support/solutions/articles/66000526357-collections)
- [Spaces](https://help.gettoby.com/support/solutions/articles/66000526358-spaces)
- [Saving sessions](https://help.gettoby.com/support/solutions/articles/66000521580-saving-session)
- [Search](https://help.gettoby.com/support/solutions/articles/66000520261-search)

## Functional requirements

### FR-1: New-tab workspace

- Opening a Chrome new tab opens Hoby.
- The workspace has spaces on the left, collections in the center, and current-window tabs on the right.
- The layout remains usable when the right rail is hidden on narrower windows.

### FR-2: Spaces and collections

- Create, rename, select, reorder, and delete spaces.
- Create, rename, recolor, collapse, reorder, and delete collections.
- Deleting a non-empty container requires explicit confirmation and supports immediate undo.
- A first-run starter space explains the model without a blocking tour.

### FR-3: Saved tabs

- Save an open tab into a collection by drag-and-drop or an explicit action.
- Add a valid HTTP(S) URL manually.
- Open a saved tab in the current or a new tab.
- Move, reorder, edit, and delete saved tabs.
- A collection cannot contain duplicate normalized URLs.

### FR-4: Open tabs

- The first capture action explains and requests optional tab/favicons access; denial leaves saved collections fully usable.
- Show live tabs from the current Chrome window with title, hostname, and favicon when available.
- Exclude Hoby's own page and browser-internal pages from capture actions.
- Activate or close an open tab from the rail.
- The UI reacts to tab creation, update, movement, activation, and removal.

### FR-5: Sessions and restore

- Save all capturable tabs in the current window into a new or existing collection.
- "Save" preserves open tabs; "Save & close" closes only tabs saved successfully and never closes Hoby.
- Open an entire collection without opening duplicate URLs already present in the current window.

### FR-6: Search and keyboard use

- Search saved and open tabs by title, URL, hostname, collection, and space.
- `/` and `Ctrl/Cmd+K` focus search; `Escape` clears or closes transient UI.
- Search results identify their collection or open-window status.

### FR-7: Local durability

- Persist versioned data in `chrome.storage.local` with no backend calls.
- Validate and migrate persisted data before use.
- Export all user data to JSON and import a valid Hoby backup.
- Reject malformed or unsupported imports without replacing current data.

### FR-8: Toolbar popup

- Save the active tab to an existing collection in a few clicks.
- Create a collection and save the active tab.
- Save the current window as a session.
- Open the full Hoby workspace.

### FR-9: Feedback and recovery

- Every mutation has immediate visible feedback.
- Expected errors are actionable and do not discard data.
- Destructive card/container actions offer undo where recovery is unambiguous.

## Non-functional requirements

- **Privacy:** no analytics, remote application API, account, host permission, or page-content access.
- **Accessibility:** keyboard-operable controls, visible focus, semantic labels, reduced-motion support, WCAG AA contrast.
- **Performance:** interactive within 1 second for 1,000 saved tabs on a typical desktop; search feedback within 100 ms.
- **Reliability:** service-worker-serialized state writes, schema validation, defensive Chrome API handling, no data loss on malformed imports.
- **Security:** no remote scripts, no HTML injection, HTTP(S)-only manual URLs, optional tab permissions, least-privilege manifest.
- **Compatibility:** current stable desktop Chrome, Manifest V3.
- **Quality:** type-check, lint, unit, component, build, and extension smoke gates must pass in CI.

## Explicitly out of scope

- Accounts, server sync, collaboration, sharing, organizations, or memberships.
- AI grouping/naming, notes, tasks, reminders, tags, `to/` shortcuts, and themes beyond system light/dark.
- Firefox, Safari, mobile apps, and web hosting.
- Browser-history search or page-content indexing.
