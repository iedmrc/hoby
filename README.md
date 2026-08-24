# Hoby

[![CI](https://github.com/iedmrc/hoby/actions/workflows/ci.yml/badge.svg)](https://github.com/iedmrc/hoby/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2f6f62.svg)](LICENSE)

Hoby is a calm, local-first tab workspace for desktop Chrome. It replaces the new-tab page with spaces and collections, keeps current-window tabs beside saved context, and has a compact toolbar popup for quick capture.

No account, backend, analytics, page-content access, or runtime network service is used.

Hoby is an independent project inspired by the tab-workspace workflow popularized by Toby. It is not affiliated with or endorsed by Toby.
No Toby source code or visual assets are included; Hoby's source and icon assets were created independently.

## Features

- Spaces, colored collections, and saved tab cards.
- Drag/drop plus keyboard-accessible move and reorder actions.
- Current-window capture with explicit save or save-and-close behavior.
- Collection restore without reopening URLs already open in the window.
- Global search across spaces, collections, titles, hostnames, and URLs.
- Toolbar popup for current-tab and window capture.
- Versioned local storage, previous-state recovery, immediate undo, and JSON backup.
- Optional `tabs` and `favicon` permissions requested only when capture is enabled.
- System light/dark mode and responsive desktop layout.

## Install from source

Hoby is currently an early release distributed from source. You need Node.js 22 or newer and Chrome 120 or newer.

```bash
npm ci
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `dist` directory.

## Development

```bash
npm run dev
```

The normal-browser preview uses four sample open tabs and local storage. Chrome-only behavior is verified against the built unpacked extension.

## Quality gates

```bash
npm run check
npm run test:e2e
```

The suite covers domain invariants, migrations, import safety, storage recovery, permission handling, mutation serialization, persistence-before-close, partial tab failures, React workflows, browser journeys, and MV3 service-worker startup.

## Architecture

- [Product requirements](docs/product-requirements.md)
- [ADR 0001: Local-first storage](docs/adr/0001-local-first-storage.md)
- [ADR 0002: Extension surfaces and permissions](docs/adr/0002-extension-surfaces-and-permissions.md)
- [ADR 0003: UI and test stack](docs/adr/0003-ui-and-test-stack.md)
- [ADR 0004: Public release and license](docs/adr/0004-public-release-and-license.md)

The canonical workspace is one validated `chrome.storage.local` document. All writes are serialized by the service worker, and destructive browser-tab operations occur only after persistence succeeds.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), review the [privacy policy](PRIVACY.md), and report vulnerabilities through [SECURITY.md](SECURITY.md).

Maintainers can use the [open-source release checklist](docs/open-source-release-checklist.md) when changing repository visibility.

## License

Hoby is available under the [MIT License](LICENSE).

Runtime dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
