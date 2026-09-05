# Privacy policy

Effective date: 2026-08-24

Last updated: 2026-09-02

Hoby is a local-first Chrome extension. It has no account system, backend, analytics, advertising, or telemetry.

## Data Hoby handles

Hoby stores saved tab titles and URLs, spaces, collections, preferences, and recovery copies in `chrome.storage.local` inside the current Chrome profile. If optional tab access is granted, Hoby reads open-tab titles, URLs, window placement, and favicon references to provide capture and restore features.

Hoby does not read page contents, browsing history, cookies, form data, or credentials. It does not sell data or send workspace data to the maintainer or an external application service. Favicons are displayed through Chrome's built-in favicon mechanism and browser cache.

Hoby's use of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. That information is used only to provide Hoby's user-facing tab organization features; it is not transferred to third parties, used for advertising or credit decisions, or made available for human review.

## Control and retention

Data remains until it is deleted in Hoby, its extension storage is cleared, or the extension is uninstalled. Browser profile backups or exported files may retain separate copies.

JSON exports contain the complete workspace, including saved titles and URLs. They are created only on request and are controlled by the user after download. Imports are read locally.

Hoby does not add application-level encryption. Workspace data receives the same protection as the local Chrome profile and operating-system account.

## Permissions

- `storage` is required for the local workspace.
- `tabs` and `favicon` are optional and requested only when capture features are enabled.
- Hoby requests no host, history, identity, scripting, or page-content permission.

## Changes and questions

Material privacy changes will be documented in this file and the relevant release notes. For a privacy question, contact the maintainer through the [project repository](https://github.com/iedmrc/hoby) without including private browsing data in a public issue.
