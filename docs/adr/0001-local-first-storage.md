# ADR 0001: Keep the canonical workspace local

- Status: Accepted
- Date: 2026-08-24

## Context

The first release must not depend on a backend. Tab workspaces can exceed Chrome Sync's small per-item and total quotas, and distributed edits require conflict semantics we cannot honestly provide by merely switching storage areas.

## Decision

Store one versioned Hoby document in `chrome.storage.local`. Validate and migrate it on read. Serialize writes through service-worker commands and one repository. Restrict storage access to trusted extension contexts. Provide lossless JSON export/import as the portable backup path.

## Alternatives challenged

- **`chrome.storage.sync`: rejected for canonical data.** It offers browser-account transport without our backend, but its quotas, throttling, and last-write behavior are a poor fit for growing tab collections.
- **IndexedDB: rejected for v1.** It scales further but adds transaction and test complexity that is not justified by the target data volume.
- **Google Drive API: rejected.** It introduces OAuth, broader permissions, external failure modes, and account UX before the local product is proven.

## Consequences

- Hoby works offline and requests no identity permission.
- Cross-device sync is absent in v1 and communicated plainly.
- Export/import is required, not optional polish.
- Writes must acknowledge persistence before destructive browser-tab operations occur.
- The repository boundary must make a future sync engine possible without changing UI-domain code.

## References

- [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
