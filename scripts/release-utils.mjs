import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

export const repositoryRoot = resolve(import.meta.dirname, "..");
export const bootstrapVersion = "0.0.0.1";

export function assertChromeVersion(version, label = "version") {
  if (typeof version !== "string" || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) {
    throw new Error(`${label} must contain one to four dot-separated integers without leading zeroes.`);
  }

  const components = version.split(".").map(Number);
  if (components.every((component) => component === 0)) {
    throw new Error(`${label} must be greater than zero.`);
  }
  if (components.some((component) => component > 65_535)) {
    throw new Error(`${label} components must not exceed 65535.`);
  }

  return components;
}

export function compareChromeVersions(left, right) {
  const leftComponents = [...assertChromeVersion(left, "left version")];
  const rightComponents = [...assertChromeVersion(right, "right version")];

  while (leftComponents.length < 4) leftComponents.push(0);
  while (rightComponents.length < 4) rightComponents.push(0);

  for (let index = 0; index < 4; index += 1) {
    if (leftComponents[index] !== rightComponents[index]) {
      return leftComponents[index] - rightComponents[index];
    }
  }
  return 0;
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function validateSourceRelease() {
  const packageJson = await readJson(resolve(repositoryRoot, "package.json"));
  const packageLock = await readJson(resolve(repositoryRoot, "package-lock.json"));
  const sourceManifest = await readJson(resolve(repositoryRoot, "public/manifest.json"));

  assertChromeVersion(packageJson.version, "package.json version");
  if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
    throw new Error("package.json must use a stable numeric SemVer version such as 1.2.3.");
  }
  if (
    packageLock.version !== packageJson.version ||
    packageLock.packages?.[""]?.version !== packageJson.version
  ) {
    throw new Error("package-lock.json version must match package.json.");
  }
  assertReleaseManifest(sourceManifest, packageJson.version, "public/manifest.json");

  return { packageJson, packageLock, sourceManifest };
}

export function assertReleaseManifest(manifest, expectedVersion, label) {
  if (manifest.manifest_version !== 3) {
    throw new Error(`${label} must use Manifest V3.`);
  }
  if (manifest.version !== expectedVersion) {
    throw new Error(`${label} version ${String(manifest.version)} does not match ${expectedVersion}.`);
  }
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(["storage"])) {
    throw new Error(`${label} must require only the storage permission.`);
  }
  if (JSON.stringify(manifest.optional_permissions) !== JSON.stringify(["tabs", "favicon"])) {
    throw new Error(`${label} must keep tabs and favicon as the only optional permissions.`);
  }

  for (const forbiddenField of ["host_permissions", "optional_host_permissions", "content_scripts"]) {
    if (forbiddenField in manifest) {
      throw new Error(`${label} must not declare ${forbiddenField}.`);
    }
  }
}

async function collectFiles(directory, current = directory) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = resolve(current, entry.name);
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Release packages cannot contain symbolic links: ${absolutePath}`);
    }
    if (metadata.isDirectory()) {
      files.push(...(await collectFiles(directory, absolutePath)));
    } else if (metadata.isFile()) {
      files.push(relative(directory, absolutePath).split(sep).join("/"));
    }
  }

  return files;
}

async function normalizeTimestamps(directory, files) {
  const timestamp = new Date(1980, 0, 1, 0, 0, 0);
  await Promise.all(files.map((file) => utimes(resolve(directory, file), timestamp, timestamp)));
}

export function assertReleaseFiles(files) {
  const required = ["manifest.json", "newtab.html", "popup.html", "background.js", "LICENSE", "THIRD_PARTY_NOTICES.md"];
  for (const file of required) {
    if (!files.includes(file)) throw new Error(`The release package is missing ${file}.`);
  }
  for (const file of files) {
    if (required.includes(file)) continue;
    if (/^assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(file)) continue;
    if (/^icons\/icon-(16|32|48|128)\.png$/.test(file) || file === "icons/icon-source.svg") continue;
    throw new Error(`Unexpected release file: ${file}. Review the package allowlist before shipping it.`);
  }
}

export async function createReleaseZip(sourceDirectory, artifactPath) {
  const files = await collectFiles(sourceDirectory);
  assertReleaseFiles(files);

  await mkdir(dirname(artifactPath), { recursive: true });
  await rm(artifactPath, { force: true });
  await normalizeTimestamps(sourceDirectory, files);

  const result = spawnSync("zip", ["-X", "-q", artifactPath, ...files], {
    cwd: sourceDirectory,
    encoding: "utf8"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`zip failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  const digest = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
  const checksumPath = `${artifactPath}.sha256`;
  await writeFile(checksumPath, `${digest}  ${basename(artifactPath)}\n`);
  return { artifactPath, checksumPath, digest, files };
}
