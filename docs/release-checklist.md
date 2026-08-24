# Release checklist

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm run check` passes.
- [ ] `npm run test:e2e` passes with Playwright Chromium installed.
- [ ] `dist/manifest.json` contains only `storage` plus optional `tabs` and `favicon`.
- [ ] Load `dist` unpacked in stable Chrome without manifest errors.
- [ ] New tab opens Hoby; toolbar icon opens the popup.
- [ ] Denying optional access leaves collection CRUD and backup usable.
- [ ] Granting access populates the current-window rail.
- [ ] Save-and-close never closes Hoby and closes only successfully persisted tabs.
- [ ] Reload, service-worker suspension, and browser restart retain the workspace.
- [ ] Export then import into a clean profile restores all spaces, collections, and links.
- [ ] Keyboard-only pass covers search, create, move, delete/undo, dialogs, and menus.
- [ ] Light, dark, reduced-motion, 1280px, and 1024px visual passes are clean.
- [ ] Chrome Web Store disclosure states that saved URLs/titles remain local and no data is sold or transmitted.

