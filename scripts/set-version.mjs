#!/usr/bin/env node

import { resolve } from "node:path";
import {
  assertChromeVersion,
  compareChromeVersions,
  readJson,
  repositoryRoot,
  writeJson
} from "./release-utils.mjs";

const version = process.argv[2];

try {
  assertChromeVersion(version, "release version");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Release versions must use stable numeric SemVer, such as 1.2.3.");
  }

  const packagePath = resolve(repositoryRoot, "package.json");
  const lockPath = resolve(repositoryRoot, "package-lock.json");
  const manifestPath = resolve(repositoryRoot, "public/manifest.json");
  const [packageJson, packageLock, manifest] = await Promise.all([
    readJson(packagePath),
    readJson(lockPath),
    readJson(manifestPath)
  ]);
  if (compareChromeVersions(version, packageJson.version) <= 0) {
    throw new Error(`Release version ${version} must be greater than ${packageJson.version}.`);
  }

  packageJson.version = version;
  packageLock.version = version;
  packageLock.packages[""].version = version;
  manifest.version = version;

  await Promise.all([
    writeJson(packagePath, packageJson),
    writeJson(lockPath, packageLock),
    writeJson(manifestPath, manifest)
  ]);
  console.log(`Set Hoby version to ${version}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
