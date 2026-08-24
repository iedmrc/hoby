import { z } from "zod";

import { DomainError } from "./errors";
import {
  type DomainContext,
  type WorkspaceDocument,
  WORKSPACE_SCHEMA_VERSION,
  cloneWorkspace,
  migrateWorkspaceDocument,
  parseWorkspaceDocument,
} from "./workspace";

export const WORKSPACE_BACKUP_FORMAT = "hoby-workspace" as const;
export const WORKSPACE_BACKUP_VERSION = 1 as const;
export const MAX_BACKUP_JSON_LENGTH = 10 * 1_024 * 1_024;

const WorkspaceBackupEnvelopeSchema = z
  .object({
    format: z.literal(WORKSPACE_BACKUP_FORMAT),
    version: z.number().int(),
    exportedAt: z.iso.datetime({ offset: true }),
    workspace: z.unknown(),
  })
  .strict();

export interface WorkspaceBackup {
  readonly format: typeof WORKSPACE_BACKUP_FORMAT;
  readonly version: typeof WORKSPACE_BACKUP_VERSION;
  readonly exportedAt: string;
  readonly workspace: WorkspaceDocument;
}

export interface ImportSummary {
  readonly mode: "merge" | "replace";
  readonly spaces: number;
  readonly collections: number;
  readonly savedTabs: number;
}

export function createWorkspaceBackup(
  workspace: WorkspaceDocument,
  exportedAt = new Date().toISOString(),
): WorkspaceBackup {
  return {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt,
    workspace: parseWorkspaceDocument(workspace),
  };
}

export function serializeWorkspaceBackup(backup: WorkspaceBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function parseWorkspaceBackup(input: unknown): WorkspaceBackup {
  let value = input;
  if (typeof input === "string") {
    if (input.length > MAX_BACKUP_JSON_LENGTH) {
      throw new DomainError("IMPORT_INVALID", "The backup file is too large.");
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new DomainError("IMPORT_INVALID", "The backup is not valid JSON.");
    }
  }

  const envelope = WorkspaceBackupEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    throw new DomainError("IMPORT_INVALID", "The backup envelope is invalid.", {
      issues: envelope.error.issues,
    });
  }
  if (envelope.data.version !== WORKSPACE_BACKUP_VERSION) {
    throw new DomainError(
      "IMPORT_UNSUPPORTED",
      `Backup version ${envelope.data.version} is not supported.`,
      { version: envelope.data.version },
    );
  }

  try {
    return {
      format: WORKSPACE_BACKUP_FORMAT,
      version: WORKSPACE_BACKUP_VERSION,
      exportedAt: envelope.data.exportedAt,
      workspace: migrateWorkspaceDocument(envelope.data.workspace),
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "WORKSPACE_UNSUPPORTED") {
      throw new DomainError("IMPORT_UNSUPPORTED", error.message, error.details);
    }
    throw new DomainError("IMPORT_INVALID", "The backup workspace is invalid.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function countWorkspace(workspace: WorkspaceDocument): Omit<ImportSummary, "mode"> {
  let collections = 0;
  let savedTabs = 0;
  for (const space of workspace.spaces) {
    collections += space.collections.length;
    for (const collection of space.collections) savedTabs += collection.tabs.length;
  }
  return { spaces: workspace.spaces.length, collections, savedTabs };
}

function nextUniqueId(usedIds: Set<string>, context: DomainContext): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const id = context.createId();
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  throw new DomainError("IMPORT_INVALID", "Could not allocate a unique imported ID.");
}

function collectIds(workspace: WorkspaceDocument): Set<string> {
  const ids = new Set<string>();
  for (const space of workspace.spaces) {
    ids.add(space.id);
    for (const collection of space.collections) {
      ids.add(collection.id);
      for (const tab of collection.tabs) ids.add(tab.id);
    }
  }
  return ids;
}

export function importWorkspace(
  current: WorkspaceDocument,
  input: unknown,
  mode: "merge" | "replace",
  context: DomainContext,
): { readonly workspace: WorkspaceDocument; readonly summary: ImportSummary } {
  const backup = parseWorkspaceBackup(input);
  const now = context.now();
  const counts = countWorkspace(backup.workspace);

  if (mode === "replace") {
    const replacement = cloneWorkspace(backup.workspace);
    return {
      workspace: parseWorkspaceDocument({
        ...replacement,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        revision: current.revision + 1,
        updatedAt: now,
      }),
      summary: { mode, ...counts },
    };
  }

  const usedIds = collectIds(current);
  const importedSpaces = backup.workspace.spaces.map((space) => ({
    ...space,
    id: nextUniqueId(usedIds, context),
    updatedAt: now,
    collections: space.collections.map((collection) => ({
      ...collection,
      id: nextUniqueId(usedIds, context),
      updatedAt: now,
      tabs: collection.tabs.map((tab) => ({
        ...tab,
        id: nextUniqueId(usedIds, context),
        updatedAt: now,
      })),
    })),
  }));

  return {
    workspace: parseWorkspaceDocument({
      ...current,
      revision: current.revision + 1,
      updatedAt: now,
      spaces: [...cloneWorkspace(current).spaces, ...importedSpaces],
    }),
    summary: { mode, ...counts },
  };
}
