# Chrome Web Store release runbook

This runbook covers the one-time Chrome Web Store setup and every Hoby release after it. The release workflow builds one ZIP, verifies it, uploads that exact ZIP to the Chrome Web Store, submits it for review, and attaches it and its SHA-256 checksum to a GitHub release.

The extension remains local-first. GitHub and Google receive only source/build artifacts and release metadata; Hoby does not gain runtime network access, telemetry, or additional Chrome permissions.

## Release design

A pushed `vMAJOR.MINOR.PATCH` tag starts `.github/workflows/release.yml`.

1. The workflow requires the tagged commit to be reachable from `main`.
2. It requires the tag, `package.json`, both lockfile version fields, source manifest, and built manifest versions to agree.
3. It runs lint, type checks, unit/component coverage, a production build, and Playwright extension tests.
4. It refuses packages that add required permissions beyond `storage`, make `tabs` or `favicon` required, or add host permissions or content scripts.
5. It allows only expected production extension files, creates `release/hoby-vMAJOR.MINOR.PATCH.zip` with `manifest.json` at the ZIP root, and writes a SHA-256 checksum.
6. The `chrome-web-store` GitHub environment gates publishing. GitHub exchanges its OIDC identity for a short-lived Google access token; no Google service-account key is stored in GitHub.
7. Chrome Web Store API v2 uploads the ZIP and submits it with warnings treated as blocking. Google publishes it automatically only after review succeeds.
8. A GitHub release is created only after Google accepts the submission.

The workflow serializes all releases and never cancels an in-progress store submission.

## Current rollout baseline

As verified in Developer Dashboard on September 5, 2026, item `ldmdmjcmdmhkmgmpakppdnanmpmbchol` is pending its first review with version `0.0.0.1`. Leave that submission unchanged. The source version is `0.1.0`, which can be the first automated update once the initial review is complete. Do not tag it until the Cloud identity, protected environment, and read-only connection check below are working.

The workflows in the repository do not by themselves activate Google access. Account linking, federation, environment configuration, and a successful connection check are required separately.

## One-time publisher setup

### 1. Prepare the publisher account

- Register a Chrome Web Store developer account, pay Google's registration fee, enable 2-Step Verification, and verify the publisher contact email.
- Confirm the publisher identity and public developer information are correct.
- Review the current [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies).

### 2. Create the store item without consuming the first release version

Chrome Web Store API v2 updates an existing item; the Developer Dashboard must create the item and extension ID first. Build a throwaway `0.0.0.1` bootstrap package from the current production build:

```bash
npm ci
npm run release:bootstrap
(cd release && shasum -a 256 -c hoby-bootstrap-v0.0.0.1.zip.sha256)
```

In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), choose **Add new item** and upload `release/hoby-bootstrap-v0.0.0.1.zip`.

For a new item, do not submit or publish the bootstrap package: it exists only to create the item. Hoby's initial bootstrap has already been submitted manually; there is no need to cancel it. The first tagged release must have a version greater than the store's version, so the current `0.1.0` is valid after that review completes.

Record the item ID from the dashboard or item URL. It is the 32-character value made from letters `a` through `p`.

After the first public release, add the final store listing URL to `README.md` so users do not need to infer where the official package lives.

### 3. Complete the listing, privacy, and distribution tabs

Use [chrome-web-store-listing.md](chrome-web-store-listing.md) as the reviewed source for listing copy, privacy declarations, permission justifications, URLs, test instructions, and image requirements.

Before the API can submit a release:

- Upload the required store icon, at least one current 1280×800 or 640×400 screenshot, and a 440×280 small promotional tile.
- Complete every field under **Store listing** and **Privacy practices**.
- Select the intended public visibility, countries, and free pricing under **Distribution**.
- Set the privacy-policy URL to the public `PRIVACY.md` page.
- Do not change listing visibility immediately before an API release. Google requires the new visibility to be published manually once before API publishing can resume.

### 4. Create the Google Cloud service account

Follow Google's [service-account guide](https://developer.chrome.com/docs/webstore/service-accounts):

1. Create or select a dedicated Google Cloud project.
2. Enable the **Chrome Web Store API** (`chromewebstore.googleapis.com`), IAM Service Account Credentials API (`iamcredentials.googleapis.com`), and Security Token Service API (`sts.googleapis.com`). Enable IAM (`iam.googleapis.com`) if needed to create the service account through an API or CLI.
3. Create a service account dedicated to Hoby releases. It needs no Google Cloud project role.
4. In Chrome Web Store Developer Dashboard **Account** settings, add the service-account email to the publisher. Google currently permits one service account per publisher.

Do not create or download a JSON key.

Linking this identity authorizes it for the publisher's items, not just Hoby. Review that scope before linking it. A dedicated project needs no billing account or paid application resources for this setup.

### 5. Trust GitHub through Workload Identity Federation

Create a Workload Identity Pool and an OIDC provider for `https://token.actions.githubusercontent.com`. Map at least:

- `google.subject` to `assertion.sub`
- `attribute.repository_id` to `assertion.repository_id`

Constrain the provider to this repository's immutable numeric IDs, the protected environment, and only the two intended workflow paths. These IDs were verified through the GitHub API; verify them again if transferring the repository:

```text
assertion.repository_id == '1344671848' &&
assertion.repository_owner_id == '13666448' &&
assertion.sub == 'repo:iedmrc/hoby:environment:chrome-web-store' &&
(
  (assertion.event_name == 'push' &&
   assertion.ref.startsWith('refs/tags/v') &&
   assertion.workflow_ref.startsWith('iedmrc/hoby/.github/workflows/release.yml@refs/tags/v')) ||
  (assertion.event_name == 'workflow_dispatch' &&
   assertion.ref == 'refs/heads/main' &&
   assertion.workflow_ref == 'iedmrc/hoby/.github/workflows/chrome-web-store-check.yml@refs/heads/main')
)
```

Grant `roles/iam.workloadIdentityUser` on the release service account only to `principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/attribute.repository_id/1344671848`. Replace the two uppercase placeholders with the project's numeric number and pool ID. Do not grant Owner, Editor, Service Account Token Creator, or Chrome Web Store permissions as Cloud project roles; store authority comes from linking the service account in the Developer Dashboard.

Google's [Workload Identity Federation deployment guide](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines#github-actions) contains the current console and `gcloud` instructions.

### 6. Protect and configure the GitHub environment

Create an environment named exactly `chrome-web-store` in repository settings.

- Add the maintainer as a required reviewer and prevent self-review when a second trusted maintainer is available. A sole maintainer must allow self-review to avoid blocking every release; approval is still required for each deployment.
- Use selected deployment branches and tags: the `main` branch for the connection check and `v*` tags for releases. The provider condition above additionally limits the workflow and event.
- Protect the `v*` tag pattern so only maintainers can create release tags.
- Store these as environment variables, not secrets:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name: `projects/NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` |
| `CWS_SERVICE_ACCOUNT_EMAIL` | Release service-account email |
| `CWS_PUBLISHER_ID` | Publisher ID from Developer Dashboard **Publisher → Settings** |
| `CWS_EXTENSION_ID` | Hoby store item ID |

The workflow requests `id-token: write` only in the protected publishing job. All third-party actions are pinned to full commit SHAs and are kept current by Dependabot.

### 7. Verify the connection without changing the store item

After merging the workflows to `main`, manually run **Check Chrome Web Store connection** from GitHub Actions and approve its environment deployment. It authenticates through OIDC and calls only `fetchStatus`; it does not upload or publish. Confirm the returned item and review state match Developer Dashboard. This check is safe while the initial review is pending.

The check uses the same publisher-capable identity as releases: its read-only behavior comes from the reviewed workflow, not from a separately read-only Google token. Keep workflow changes reviewed and the environment approval in place.

## Prepare a release

Create a focused release pull request from the latest `main`:

```bash
npm ci
npm run release:version -- 0.2.0
npm run check
npm run test:e2e
npm run release:package
```

Then:

- Review all user-facing changes since the previous version.
- Update release-facing documentation and `THIRD_PARTY_NOTICES.md` when applicable.
- Complete [release-checklist.md](release-checklist.md), including manual Chrome, accessibility, backup, migration, and permission checks.
- Inspect `git diff` and confirm `package.json`, `package-lock.json`, and `public/manifest.json` carry the same version.
- Merge only after CI passes.

Never put private URLs, browsing data, credentials, or real user workspaces in tests, screenshots, artifacts, or release notes.

## Publish

From an up-to-date `main`, create one annotated tag whose value exactly matches the merged version:

```bash
git switch main
git pull --ff-only
git tag -a v0.2.0 -m "Hoby v0.2.0"
git push origin v0.2.0
```

Review the workflow's test output, packaged file list, and checksum. Approve the `chrome-web-store` environment only when the artifact, store copy, privacy declarations, permissions, and manual checklist are ready.

Pushing the tag is the release signal. Never move or reuse a release tag. If a release fails before Google accepts the upload, fix the cause and use GitHub's **Re-run failed jobs** when it is safe to upload the same version. If Google already accepted the ZIP but submission failed, inspect the existing draft in Developer Dashboard instead of blindly uploading the same version again.

Existing submissions, policy actions, and versions at or below a published version deliberately stop the publisher script. A matching version cannot prove that a remote ZIP is identical. If submission succeeded but GitHub release creation failed, rerun only that failed job; do not resubmit. If the API response was lost, inspect Developer Dashboard first and reconcile the release manually using the original tested artifact.

## After submission

Google review is asynchronous. The workflow succeeding means the submission was accepted, not that the update is already live.

- Watch Developer Dashboard and the publisher contact email for review questions or policy notices.
- When the version is live, install it from the public listing in a clean Chrome profile and repeat the critical smoke checks.
- Confirm the store listing shows the expected version, privacy link, support link, screenshots, and permission disclosure.
- Compare the GitHub release checksum with the workflow artifact if provenance is questioned.
- Record any release-specific follow-up in a public issue only when it contains no sensitive data.

## Failures, cancellation, and rollback

- **Build or test failure:** no store upload occurred. Fix through a new commit and version/tag as appropriate.
- **Authentication failure:** verify the GitHub environment variables, OIDC provider condition, service-account IAM binding, API enablement, and service-account link in Developer Dashboard. Never work around it with a committed or long-lived JSON key.
- **Upload warning or rejection:** inspect the API error and Developer Dashboard. Correct the package or disclosure. A package change always requires a higher version and a new tag.
- **Submission under review:** use Developer Dashboard or the API `cancelSubmission` operation if it must be withdrawn. Do not upload another package until the state is understood.
- **Bad live release:** use Developer Dashboard **Roll back to previous version**. Google requires a new, higher rollback version and republishes the previous package without a new review. Test storage backward compatibility first; a rollback can otherwise lose data.
- **Compromised release identity:** disable the Workload Identity provider, remove the service account from the Chrome Web Store publisher, cancel pending submissions, inspect GitHub environment approvals and audit logs, and rotate/recreate the service account before restoring publishing.

The official references are [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api), [publishing updates](https://developer.chrome.com/docs/webstore/update/), and [rollback behavior](https://developer.chrome.com/docs/webstore/rollback).
