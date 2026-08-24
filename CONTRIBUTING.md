# Contributing to Hoby

Thanks for helping improve Hoby. Keep changes focused on its core purpose: a calm, local-first Chrome tab workspace.

## Before you start

- Search existing issues and pull requests before opening a new one.
- Open an issue before a substantial feature or architectural change.
- Report security vulnerabilities through the process in [SECURITY.md](SECURITY.md), not a public issue.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

You need Node.js 22 or newer and a current desktop Chrome installation.

```bash
npm ci
npm run dev
```

For Chrome-specific testing, build the extension and load `dist` from `chrome://extensions` using **Load unpacked**.

```bash
npm run build
```

## Making changes

- Branch names use `<type>/<short-description>`, such as `fix/session-restore`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/), such as `fix: preserve tabs when storage fails`.
- Keep domain logic pure and Chrome APIs behind the adapters in `src/platform`.
- Do not add analytics, remote services, host permissions, or page-content access without an accepted ADR.
- Add or update tests for behavior changes.
- Record consequential architecture decisions under `docs/adr`.

Run the complete local quality gates before submitting a pull request:

```bash
npm run check
npm run test:e2e
```

## Pull requests

Explain the user-facing problem, the chosen solution, and any privacy or permission impact. Keep each pull request reviewable and free of unrelated cleanup. CI must pass before merge.

By submitting a contribution, you confirm that you have the right to provide it and agree that it may be distributed under Hoby's [MIT License](LICENSE).
