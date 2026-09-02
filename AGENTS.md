# Hoby repository instructions

These instructions apply to the entire repository.

## Read the project contract first

Before planning, reviewing, or implementing a change, read the relevant canonical documents:

- `README.md`
- `docs/product-requirements.md`
- all accepted decisions under `docs/adr/`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `PRIVACY.md`
- `docs/release-checklist.md`
- `.github/pull_request_template.md`

Treat those documents as the source of truth. If a requested change conflicts with them, or requires a material exception, surface the conflict before implementation. Do not silently weaken a product, privacy, security, accessibility, or architectural constraint. Consequential architectural changes require an accepted ADR.

## Product principles

- Keep Hoby a calm, local-first Chrome tab workspace that works without an account or backend.
- Do not add analytics, advertising, telemetry, remote application services, page-content access, or data transmission.
- Preserve least privilege: `storage` is required; `tabs` and `favicon` remain optional and user-initiated. Do not add host, history, identity, scripting, or page-content permissions without an accepted ADR.
- Keep user data in the validated, versioned `chrome.storage.local` workspace. Preserve lossless JSON backup and safe import behavior.
- Persist successfully before destructive browser-tab operations. Save-and-close must close only tabs confirmed saved and must never close Hoby.
- Keep features within the explicit product scope unless the product requirements are intentionally revised.
- Maintain keyboard operation, semantic labeling, visible focus, reduced-motion support, WCAG AA contrast, actionable feedback, and responsive desktop behavior.

## Architecture and implementation

- Use TypeScript, React, and Vite according to the accepted ADRs.
- Keep state transitions and domain invariants in pure domain functions.
- Keep Chrome APIs, persistence, command transport, and tab operations behind typed adapters in `src/platform`.
- Keep the service worker restart-safe. It owns serialized mutations but must not keep authoritative state in globals.
- Share domain logic and components across the new-tab workspace and toolbar popup.
- Prefer native pointer/drag behavior, CSS, and the local icon set over adding component frameworks, drag libraries, or icon packages.
- Keep dependencies narrow and justify additions against privacy, security, performance, licensing, and bundle impact.
- Preserve HTTP(S)-only manual URLs, schema validation, defensive Chrome API handling, safe migrations, duplicate-normalized-URL prevention, and malformed-import rejection.

## Development workflow

- Keep changes focused and free of unrelated cleanup.
- Search existing issues and pull requests before proposing work. Open an issue before a substantial feature or architectural change.
- Use `<type>/<short-description>` branch names and Conventional Commits.
- Add or update tests for behavior changes.
- Run `npm run check` and `npm run test:e2e` before submitting a pull request, or document why a gate does not apply.
- Explain the user-facing problem, solution, verification, and privacy or permission impact in pull requests.
- Update relevant documentation and ADRs when behavior or architecture changes.
- Use the release checklist for release-affecting work. CI must pass before merge.

## Security, privacy, and community

- Never place suspected vulnerabilities, private URLs, browsing data, tokens, credentials, or personal information in public issues, logs, fixtures, screenshots, or examples.
- Route vulnerability reports through the private process in `SECURITY.md`.
- Treat unexpected network access, permission expansion, data loss, script injection, and stored-URL exposure as security-sensitive.
- Follow `CODE_OF_CONDUCT.md`: be respectful, constructive, specific, inclusive, and focused on the work; respect privacy and account for impact.
- Preserve Hoby's independent-project statement and do not incorporate Toby source code or visual assets.
- Preserve MIT licensing requirements and maintain accurate third-party notices when runtime dependencies change.

