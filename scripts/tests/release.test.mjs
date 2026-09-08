import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCanUpload } from "../publish-chrome-web-store.mjs";
import { assertChromeVersion, assertReleaseFiles, assertReleaseManifest, compareChromeVersions } from "../release-utils.mjs";

test("packages contain only production extension files", () => {
  const files = ["manifest.json", "newtab.html", "popup.html", "background.js", "LICENSE", "THIRD_PARTY_NOTICES.md", "assets/base-abc.js", "icons/icon-128.png"];
  assert.doesNotThrow(() => assertReleaseFiles(files));
  for (const extra of ["assets/base.js.map", ".env", "credentials.json", "test-results/result.png", "workspace.json"]) {
    assert.throws(() => assertReleaseFiles([...files, extra]), /Unexpected release file/);
  }
  assert.throws(() => assertReleaseFiles(files.slice(1)), /missing manifest.json/);
});

test("Chrome version rules reject unsupported versions", () => {
  for (const version of ["0", "0.0.0", "01.2.3", "1.2.3-beta", "65536.0.0", "1.2.3.4.5"]) {
    assert.throws(() => assertChromeVersion(version));
  }
  assert.ok(compareChromeVersions("0.1.0", "0.0.0.1") > 0);
  assert.equal(compareChromeVersions("1.2.0", "1.2"), 0);
  assert.ok(compareChromeVersions("1.10.0", "1.9.0") > 0);
});

test("permission expansion blocks release", () => {
  const manifest = { manifest_version: 3, version: "0.1.0", permissions: ["storage"], optional_permissions: ["tabs", "favicon"] };
  assert.doesNotThrow(() => assertReleaseManifest(manifest, "0.1.0", "test"));
  for (const override of [{ permissions: ["storage", "tabs"] }, { host_permissions: [] }, { content_scripts: [] }, { optional_permissions: ["history"] }]) {
    assert.throws(() => assertReleaseManifest({ ...manifest, ...override }, "0.1.0", "test"));
  }
});

test("a new version can upload after the previous revision was published", () => {
  assert.doesNotThrow(() => assertCanUpload({ publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "0.1.0" }] } }, "0.1.1"));
});

test("pending, rejected, and cancelled submissions never count as successful releases", () => {
  for (const state of ["PENDING_REVIEW", "STAGED", "REJECTED", "CANCELLED"]) {
    assert.throws(() => assertCanUpload({ submittedItemRevisionStatus: { state, distributionChannels: [{ crxVersion: "0.1.1" }] } }, "0.1.1"), /existing submission/);
  }
});

test("same-version and downgrade uploads are refused", () => {
  const status = { publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "0.2.0" }] } };
  for (const version of ["0.1.0", "0.2.0"]) assert.throws(() => assertCanUpload(status, version), /must be newer/);
});

test("policy warnings and takedowns block uploads", () => {
  for (const status of [{ warned: true }, { takenDown: true }]) assert.throws(() => assertCanUpload(status, "0.1.1"), /policy action/);
});
