# Chrome Web Store listing source

Use this file as the canonical copy checklist for the Chrome Web Store Developer Dashboard. Reconcile it with the released extension, `PRIVACY.md`, and the current dashboard taxonomy before every submission. Dashboard changes are manual and must be reviewed like code.

## Product details

- **Name:** Hoby — Tab workspace
- **Summary:** Save, organize, and restore tabs in a calm, private workspace that stays in your Chrome profile.
- **Category:** Productivity
- **Language:** English
- **Pricing:** Free
- **Homepage:** `https://github.com/iedmrc/hoby`
- **Support:** `https://github.com/iedmrc/hoby/issues`
- **Privacy policy:** `https://github.com/iedmrc/hoby/blob/main/PRIVACY.md`

### Detailed description

Hoby replaces your new-tab page with a calm workspace for saving, grouping, finding, closing, and reopening tabs.

Organize links into spaces and collections, keep current-window tabs beside saved context, and use the toolbar popup for quick capture. Save a whole session when browser clutter builds up, then restore it later without reopening duplicate URLs.

Key features:

- Spaces, colored collections, and searchable saved tabs
- Current-window capture with explicit Save and Save & close actions
- A compact toolbar popup for saving the active tab or a session
- Keyboard-accessible move, reorder, search, delete, and undo workflows
- Local JSON backup, safe import, recovery, and Toby v3 import
- System light and dark mode with reduced-motion support

Your workspace stays in `chrome.storage.local` in your Chrome profile. Hoby has no account, backend, analytics, advertising, telemetry, or page-content access. Optional tab and favicon access is requested only when you choose to enable capture features.

Hoby is an independent project. It is not affiliated with or endorsed by Toby.

## Privacy practices

### Single purpose

Hoby lets a user save, organize, find, close, and reopen Chrome tabs in a local tab workspace.

### Permission justifications

- **storage:** Stores the user's spaces, collections, saved tab titles and URLs, preferences, and recovery copy locally in the current Chrome profile. It is required for the workspace to persist across browser sessions.
- **tabs (optional):** When the user explicitly enables capture, reads the current window's tab titles and URLs so Hoby can display, save, activate, close, and restore those tabs. Hoby remains usable for manual link organization if permission is denied.
- **favicon (optional):** When capture is enabled, displays Chrome-provided favicon resources beside open and saved tabs. It does not grant access to page content and is requested together with optional tab access.

### Remote code

Select **No, I am not using remote code**. All executable JavaScript is bundled in the uploaded extension. Hoby does not fetch or execute remote scripts, WebAssembly, or dynamic code.

### Data-use disclosure

Disclose **Web history** because Hoby handles tab URLs and page titles, even though processing and storage remain local. Do not claim that locally processed data is unhandled; Chrome Web Store policy requires local handling to be disclosed.

Hoby does not handle personally identifiable information, health information, financial and payment information, authentication information, personal communications, precise location, broad user-activity analytics, or page contents. Recheck the dashboard's current definitions before submission and disclose more broadly if Google's taxonomy or Hoby's behavior changes.

Certify only statements that remain true in the released build:

- Data is used only to provide Hoby's single-purpose, user-facing tab organization features.
- User data is not sold or transferred to third parties.
- User data is not used or transferred for purposes unrelated to Hoby's single purpose.
- User data is not used or transferred to determine creditworthiness or for lending.
- Hoby complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

### Test instructions

No account or credentials are required.

1. Install the extension and open a new tab to see the local workspace.
2. Create a space and collection and add an HTTPS URL manually; this requires only `storage`.
3. Choose a capture action in the open-tabs rail or toolbar popup. Hoby explains and requests optional `tabs` and `favicon` permissions.
4. Deny the request and confirm manual collection and JSON backup features remain usable.
5. Grant the optional permissions and confirm current-window tabs appear and can be saved.
6. Use **Save & close** and confirm Hoby itself stays open and only successfully saved tabs close.

## Distribution

Before each release, explicitly confirm:

- The item remains free.
- Visibility is public unless a deliberate, documented release decision says otherwise.
- Country availability matches the maintainer's intended distribution and legal obligations.
- There are no in-app purchases.

An API release preserves the existing visibility settings. A visibility change must be published manually once before later API publishing can continue.

## Graphic assets

Store assets must show the current production UI and contain no real browsing data, private URLs, account information, or third-party marks without permission.

- **Store icon:** `public/icons/icon-128.png` at 128×128.
- **Screenshots:** At least one and preferably up to five, each 1280×800 or 640×400, full-bleed PNG or JPEG. Cover the workspace, optional capture explanation, search, toolbar popup, and local backup where useful.
- **Small promotional tile:** 440×280 PNG or JPEG; required.
- **Marquee promotional tile:** 1400×560 PNG or JPEG; optional unless the current dashboard requires it.
- **Video:** Optional YouTube URL if a current, privacy-safe walkthrough exists.

Use fictional domains such as `example.com`, `example.org`, and `example.net` in screenshots. Verify light/dark contrast, crop, spelling, and consistency with the released UI. The [official image guidance](https://developer.chrome.com/docs/webstore/best-listing#images) is authoritative if dashboard requirements change.
