#!/usr/bin/env node

import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertReleaseManifest,
  bootstrapVersion,
  compareChromeVersions,
  createReleaseZip,
  repositoryRoot,
  validateSourceRelease,
  writeJson
} from "./release-utils.mjs";

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a value.`);
  return process.argv[index + 1];
}

async function packageRelease() {
  const bootstrap = process.argv.includes("--bootstrap");
  const expectedTag = optionValue("--tag");
  const { packageJson } = await validateSourceRelease();
  const distDirectory = resolve(repositoryRoot, "dist");
  const distManifestPath = resolve(distDirectory, "manifest.json");
  const distManifest = JSON.parse(await readFile(distManifestPath, "utf8"));
  assertReleaseManifest(distManifest, packageJson.version, "dist/manifest.json");

  if (expectedTag && expectedTag !== `v${packageJson.version}`) {
    throw new Error(`Tag ${expectedTag} does not match version v${packageJson.version}.`);
  }
  if (bootstrap && compareChromeVersions(packageJson.version, bootstrapVersion) <= 0) {
    throw new Error(`The source version must be greater than bootstrap version ${bootstrapVersion}.`);
  }

  const releaseDirectory = resolve(repositoryRoot, "release");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "hoby-release-"));
  const packageDirectory = resolve(temporaryDirectory, "extension");
  let artifactName = `hoby-v${packageJson.version}.zip`;

  try {
    await cp(distDirectory, packageDirectory, { recursive: true });
    if (bootstrap) {
      const bootstrapManifestPath = resolve(packageDirectory, "manifest.json");
      const bootstrapManifest = JSON.parse(await readFile(bootstrapManifestPath, "utf8"));
      bootstrapManifest.version = bootstrapVersion;
      await writeJson(bootstrapManifestPath, bootstrapManifest);
      assertReleaseManifest(bootstrapManifest, bootstrapVersion, "bootstrap manifest.json");
      artifactName = `hoby-bootstrap-v${bootstrapVersion}.zip`;
    }

    const result = await createReleaseZip(packageDirectory, resolve(releaseDirectory, artifactName));
    console.log(`Created ${result.artifactPath}`);
    console.log(`SHA-256 ${result.digest}`);
    console.log(`Packaged ${result.files.length} files with manifest.json at the ZIP root.`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

packageRelease().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
