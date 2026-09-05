#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertChromeVersion, compareChromeVersions } from "./release-utils.mjs";

const apiOrigin = "https://chromewebstore.googleapis.com";
const inProgressStates = new Set(["IN_PROGRESS", "UPLOAD_IN_PROGRESS"]);
const successfulStates = new Set(["SUCCEEDED", "UPLOAD_SUCCEEDED"]);

function requiredEnvironment(name, pattern) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  if (pattern && !pattern.test(value)) throw new Error(`${name} has an invalid value.`);
  return value;
}

async function apiRequest(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60_000) });
  const responseText = await response.text();
  let responseBody = {};
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { message: responseText };
    }
  }

  if (!response.ok) {
    const apiMessage = responseBody?.error?.message ?? responseBody?.message ?? "No API details returned";
    throw new Error(`Chrome Web Store API returned ${response.status}: ${apiMessage}`);
  }
  return responseBody;
}

function uploadState(response) {
  return response.uploadState ?? response.lastAsyncUploadState;
}

function revisionVersions(revisionStatus) {
  return (revisionStatus?.distributionChannels ?? [])
    .map((channel) => channel.crxVersion)
    .filter(Boolean);
}

export function assertCanUpload(status, version) {
  assertChromeVersion(version);
  if (status.takenDown || status.warned) {
    throw new Error("The Chrome Web Store item has an active policy action; inspect Developer Dashboard.");
  }
  for (const published of revisionVersions(status.publishedItemRevisionStatus)) {
    if (compareChromeVersions(version, published) <= 0) {
      throw new Error(`Version ${version} must be newer than published version ${published}. Do not reuse a release tag.`);
    }
  }
  // A matching version alone cannot prove that the remote ZIP matches this artifact.
  // In particular, REJECTED and CANCELLED submissions must never count as success.
  if (status.submittedItemRevisionStatus) {
    throw new Error(`An existing submission needs attention (state: ${String(status.submittedItemRevisionStatus.state)}). Inspect Developer Dashboard before uploading.`);
  }
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function waitForUpload(itemUrl, authorization, initialResponse) {
  let response = initialResponse;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = uploadState(response);
    if (successfulStates.has(state)) return response;
    if (!inProgressStates.has(state)) {
      throw new Error(`Chrome Web Store upload did not succeed (state: ${String(state)}).`);
    }

    await wait(5_000);
    response = await apiRequest(`${itemUrl}:fetchStatus`, {
      headers: { Authorization: authorization }
    });
  }
  throw new Error("Chrome Web Store upload was still processing after five minutes.");
}

async function publish() {
  const artifactArgument = process.argv[2];
  if (!artifactArgument) {
    throw new Error("Usage: node scripts/publish-chrome-web-store.mjs <extension.zip>");
  }

  const accessToken = requiredEnvironment("CWS_ACCESS_TOKEN");
  const publisherId = requiredEnvironment("CWS_PUBLISHER_ID", /^[A-Za-z0-9_-]+$/);
  const extensionId = requiredEnvironment("CWS_EXTENSION_ID", /^[a-p]{32}$/);
  const itemName = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
  const itemUrl = `${apiOrigin}/v2/${itemName}`;
  const authorization = `Bearer ${accessToken}`;

  const currentStatus = await apiRequest(`${itemUrl}:fetchStatus`, {
    headers: { Authorization: authorization }
  });
  if (artifactArgument === "--status") {
    console.log(JSON.stringify({
      itemId: currentStatus.itemId,
      published: currentStatus.publishedItemRevisionStatus ?? null,
      submitted: currentStatus.submittedItemRevisionStatus ?? null,
      warned: Boolean(currentStatus.warned),
      takenDown: Boolean(currentStatus.takenDown)
    }, null, 2));
    return;
  }
  const expectedVersion = requiredEnvironment("CWS_RELEASE_VERSION", /^\d+\.\d+\.\d+$/);
  assertCanUpload(currentStatus, expectedVersion);
  const artifactPath = resolve(artifactArgument);
  const artifact = await readFile(artifactPath);

  console.log(`Uploading ${basename(artifactPath)} to Chrome Web Store item ${extensionId}.`);
  const initialUpload = await apiRequest(`${apiOrigin}/upload/v2/${itemName}:upload`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/zip"
    },
    body: artifact
  });
  const completedUpload = await waitForUpload(itemUrl, authorization, initialUpload);
  const uploadedVersion = initialUpload.crxVersion ?? completedUpload.crxVersion;
  if (uploadedVersion && uploadedVersion !== expectedVersion) {
    throw new Error(`Chrome Web Store received version ${uploadedVersion}, expected ${expectedVersion}.`);
  }

  console.log(`Upload succeeded${uploadedVersion ? ` for version ${uploadedVersion}` : ""}.`);
  const publication = await apiRequest(`${itemUrl}:publish`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      publishType: "DEFAULT_PUBLISH",
      blockOnWarnings: true
    })
  });

  if (!["PENDING_REVIEW", "PUBLISHED"].includes(publication.state)) {
    throw new Error(`Unexpected submission state: ${String(publication.state)}. Inspect Developer Dashboard.`);
  }
  console.log(`Submission accepted (state: ${String(publication.state ?? "unknown")}).`);
  console.log("Google will publish the update automatically after it passes review.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  publish().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
