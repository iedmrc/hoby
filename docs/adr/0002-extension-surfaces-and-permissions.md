# ADR 0002: Use a new-tab workspace and a narrow toolbar popup

- Status: Accepted
- Date: 2026-08-24

## Context

Toby's core advantage is that saved context and live browser state meet on every new tab. Capture also needs to be available without leaving the current page.

## Decision

Ship two Manifest V3 surfaces:

- A `chrome_url_overrides.newtab` page for full organization and restore workflows.
- An `action.default_popup` for saving the active tab or current-window session.

Require only `storage`. Request `tabs` and `favicon` together from an explicit first-capture action; saved collections remain usable if access is denied. Do not request host access, history, identity, scripting, or page-content permissions.

A service worker owns the mutation queue and Chrome tab operations. UI contexts send typed commands and observe storage changes. A save-and-close command persists first and closes only the tabs confirmed saved.

## Alternatives challenged

- **Popup only: rejected.** The available space cannot support collection overview or useful drag-and-drop.
- **Side panel: deferred.** It fits live tab management but adds a third surface and newer API behavior without replacing the new-tab workspace.
- **Hosted web app: rejected.** It violates offline/local-first constraints and cannot observe tabs with the same permission model.

## Consequences

- Users intentionally trade Chrome's default new-tab page for Hoby.
- Domain logic and components must remain shared across two differently sized entry points.
- First capture has a short permission explanation and user gesture.
- Simultaneous popup/new-tab writes cannot silently replace one another.
- Permissions are visible and testable from the manifest.

## References

- [Override Chrome pages](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages)
- [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Favicons](https://developer.chrome.com/docs/extensions/how-to/ui/favicons)
