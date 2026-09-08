# Release checklist

Complete this checklist on the release pull request. The tag workflow repeats automated gates but does not replace manual Chrome, policy, privacy, accessibility, migration, and rollback checks.

## Scope and metadata

- [ ] The release has a clear user-facing scope and no unresolved release-blocking issue or security report.
- [ ] `npm run release:version -- MAJOR.MINOR.PATCH` updated `package.json`, `package-lock.json`, and `public/manifest.json` to the same higher version.
- [ ] Release notes cover user-visible behavior, fixes, known limitations, and material privacy or permission changes.
- [ ] `README.md`, `PRIVACY.md`, `SECURITY.md`, architecture docs, and `THIRD_PARTY_NOTICES.md` are accurate for this build.
- [ ] No private URLs, browsing data, tokens, credentials, personal information, or third-party assets appear in fixtures, screenshots, logs, documentation, or release notes.
- [ ] Any material architecture, permission, data-handling, or scope change has an accepted ADR and explicit documentation.

## Automated gates

- [ ] `npm ci` succeeds from a clean checkout using a supported Node.js version.
- [ ] `npm run check` passes.
- [ ] `npm run test:e2e` passes with Playwright Chromium installed.
- [ ] `npm run release:package` produces a ZIP and matching SHA-256 checksum.
- [ ] `manifest.json` is at the ZIP root, the ZIP opens cleanly, and the packaged file list contains no source maps, credentials, test output, or unrelated files.
- [ ] Source and packaged manifests use Manifest V3, require only `storage`, keep `tabs` and `favicon` optional, and declare no host permissions or content scripts.
- [ ] CI passes on the exact commit that will be tagged.

## Manual stable-Chrome verification

- [ ] Load `dist` unpacked in current stable Chrome without manifest or service-worker errors.
- [ ] A new tab opens Hoby and the toolbar icon opens the popup.
- [ ] Fresh install, starter content, collection/space CRUD, manual HTTPS link entry, edit, move, reorder, delete, and undo work.
- [ ] Invalid URLs, duplicate normalized URLs, malformed imports, unsupported backup versions, and browser-internal tabs fail safely with actionable feedback.
- [ ] Denying optional access leaves manual collection management, search, export, and import usable.
- [ ] Granting optional access populates the current-window rail and enables popup capture.
- [ ] Save preserves open tabs; Save & close never closes Hoby and closes only tabs confirmed persisted.
- [ ] Collection restore does not reopen URLs already open in the current window.
- [ ] Reload, service-worker suspension, and browser restart retain the workspace.
- [ ] Export then import into a clean profile restores every space, collection, saved title, and URL.
- [ ] Upgrade from the previous store version preserves representative workspace data and recovery behavior.
- [ ] Rolling back locally to the previous version does not corrupt or discard data needed by that version.

## Accessibility, visual quality, and performance

- [ ] Keyboard-only use covers search, capture, create, rename, move, reorder, delete/undo, dialogs, menus, backup, and permission denial.
- [ ] Focus is visible and logical; labels, announcements, escape behavior, and error feedback are understandable with a screen reader.
- [ ] Light, dark, reduced-motion, 1280px, and 1024px passes are clean with WCAG AA contrast.
- [ ] A representative workspace with 1,000 saved tabs remains interactive within the product performance targets.

## Chrome Web Store readiness

- [ ] [Store listing copy](chrome-web-store-listing.md), screenshots, icon, support URL, privacy URL, distribution, and pricing match the release.
- [ ] Screenshots use only fictional/sample data and match the current UI.
- [ ] The single-purpose statement and `storage`, optional `tabs`, and optional `favicon` justifications are accurate.
- [ ] Remote code is declared as absent.
- [ ] Data-use disclosure includes locally handled tab URLs/titles and states that data is not sold or transmitted to an external application service.
- [ ] The Limited Use certification remains accurate and the public privacy policy contains the Limited Use statement.
- [ ] The publisher account has 2-Step Verification and a monitored, verified contact email.
- [ ] The protected `chrome-web-store` GitHub environment, required reviewer, OIDC provider, service-account link, publisher ID, and extension ID are current.

## Publish and observe

- [ ] Create the annotated `vMAJOR.MINOR.PATCH` tag only after the release pull request is merged to `main`; never move or reuse it.
- [ ] Review the tag workflow's tests, ZIP contents, checksum, permission validation, and environment approval before authorizing upload.
- [ ] Developer Dashboard confirms the expected version was submitted and no unexpected warning, policy notice, or permission appeared.
- [ ] After review, the public listing shows the expected version and a clean-profile store install passes the critical smoke path.
- [ ] The GitHub release contains the same versioned ZIP and checksum.
- [ ] Monitor the publisher email, Developer Dashboard, support issues, and crash/behavior reports after rollout without adding telemetry.
- [ ] If a critical regression appears, stop further publishing and follow the rollback and incident steps in [chrome-web-store-release.md](chrome-web-store-release.md).
