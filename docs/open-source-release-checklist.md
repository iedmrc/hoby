# Open-source release checklist

## Before changing visibility

- [ ] Merge the `chore/open-source-readiness` pull request into `main`.
- [ ] Confirm `main` is the default branch and CI is required before merge.
- [ ] Confirm the repository contains no credentials, private URLs, customer data, or proprietary assets.
- [ ] Review the MIT copyright holder and public contact links.
- [ ] Confirm the Git commit email is suitable for permanent public history.
- [ ] Perform name/trademark clearance appropriate to the intended distribution.

## GitHub settings

- [ ] Change repository visibility to public.
- [ ] Enable private vulnerability reporting, Dependabot alerts, and secret scanning.
- [ ] Protect `main`: require a pull request, require the `quality` check, dismiss stale approvals, and block force pushes and deletion.
- [ ] Keep workflow permissions read-only by default.
- [ ] Confirm Issues are enabled and Discussions remain disabled unless there is a moderation plan.

## After publication

- [ ] Confirm GitHub recognizes the MIT license and community health files.
- [ ] Confirm `LICENSE` and `THIRD_PARTY_NOTICES.md` are included in `dist`.
- [ ] Verify the CI and license badges from a signed-out browser.
- [ ] Perform a clean clone, `npm ci`, `npm run check`, and `npm run test:e2e`.
- [ ] Confirm the security-reporting link opens a private report.
- [ ] Tag a release only after the version, release notes, and unpacked Chrome smoke test are complete.
