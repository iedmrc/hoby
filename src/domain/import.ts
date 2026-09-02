import { z } from "zod";

import { DomainError } from "./errors";
import {
  DEFAULT_COLLECTION_COLOR,
  type DomainContext,
  type WorkspaceDocument,
  WORKSPACE_SCHEMA_VERSION,
  cloneWorkspace,
  migrateWorkspaceDocument,
  parseWorkspaceDocument,
} from "./workspace";
import { normalizeUrl } from "./url";

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

const TobyCardSchema = z
  .object({
    title: z.string(),
    url: z.string(),
    customTitle: z.string().optional().default(""),
    customDescription: z.string().optional().default(""),
  })
  .passthrough();

const TobyListSchema = z
  .object({
    title: z.string(),
    cards: z.array(TobyCardSchema),
  })
  .passthrough();

const TobyExportSchema = z
  .object({
    version: z.literal(3),
    lists: z.array(TobyListSchema),
  })
  .passthrough();

export interface WorkspaceBackup {
  readonly format: typeof WORKSPACE_BACKUP_FORMAT;
  readonly version: typeof WORKSPACE_BACKUP_VERSION;
  readonly exportedAt: string;
  readonly workspace: WorkspaceDocument;
}

export type TobyExport = z.infer<typeof TobyExportSchema>;
export type WorkspaceImport = WorkspaceBackup | TobyExport;

function isWorkspaceBackup(input: WorkspaceImport): input is WorkspaceBackup {
  return "format" in input && input.format === WORKSPACE_BACKUP_FORMAT;
}

export interface ImportSummary {
  readonly mode: "merge" | "replace";
  readonly source: "hoby" | "toby";
  readonly spaces: number;
  readonly collections: number;
  readonly savedTabs: number;
  readonly skippedItems: number;
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

function parseJsonInput(input: unknown): unknown {
  if (typeof input === "string") {
    if (input.length > MAX_BACKUP_JSON_LENGTH) {
      throw new DomainError("IMPORT_INVALID", "The backup file is too large.");
    }
    try {
      return JSON.parse(input) as unknown;
    } catch {
      throw new DomainError("IMPORT_INVALID", "The import file is not valid JSON.");
    }
  }
  return input;
}

export function parseWorkspaceBackup(input: unknown): WorkspaceBackup {
  const value = parseJsonInput(input);

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

export function parseWorkspaceImport(input: unknown): WorkspaceImport {
  const value = parseJsonInput(input);
  if (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    value.format === WORKSPACE_BACKUP_FORMAT
  ) {
    return parseWorkspaceBackup(value);
  }

  const toby = TobyExportSchema.safeParse(value);
  if (toby.success) return toby.data;

  const possibleToby = z
    .object({ version: z.number().int(), lists: z.unknown() })
    .passthrough()
    .safeParse(value);
  if (possibleToby.success && possibleToby.data.version !== 3) {
    throw new DomainError(
      "IMPORT_UNSUPPORTED",
      `Toby export version ${possibleToby.data.version} is not supported.`,
      { version: possibleToby.data.version },
    );
  }

  throw new DomainError(
    "IMPORT_INVALID",
    "Choose a valid Hoby backup or Toby v3 JSON export.",
    { issues: toby.error.issues },
  );
}

function countWorkspace(workspace: WorkspaceDocument): Omit<ImportSummary, "mode"> {
  let collections = 0;
  let savedTabs = 0;
  for (const space of workspace.spaces) {
    collections += space.collections.length;
    for (const collection of space.collections) savedTabs += collection.tabs.length;
  }
  return {
    source: "hoby",
    spaces: workspace.spaces.length,
    collections,
    savedTabs,
    skippedItems: 0,
  };
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

function toValidName(value: string, fallback: string): string {
  return (value.trim() || fallback).slice(0, 80);
}

function convertTobyExport(
  input: TobyExport,
  context: DomainContext,
): { readonly workspace: WorkspaceDocument; readonly skippedItems: number } {
  const now = context.now();
  const usedIds = new Set<string>();
  const spaceId = nextUniqueId(usedIds, context);
  let skippedItems = 0;

  const collections = input.lists.map((list) => {
    const seenUrls = new Set<string>();
    const tabs = list.cards.flatMap((card) => {
      let url: string;
      if (!/^https?:\/\//i.test(card.url.trim())) {
        skippedItems += 1;
        return [];
      }
      try {
        url = normalizeUrl(card.url).href;
      } catch {
        skippedItems += 1;
        return [];
      }
      if (seenUrls.has(url)) {
        skippedItems += 1;
        return [];
      }
      seenUrls.add(url);

      const preferredTitle = card.customTitle.trim() || card.title.trim();
      return [{
        id: nextUniqueId(usedIds, context),
        title: (preferredTitle || normalizeUrl(url).hostname).slice(0, 512),
        url,
        createdAt: now,
        updatedAt: now,
      }];
    });

    return {
      id: nextUniqueId(usedIds, context),
      name: toValidName(list.title, "Untitled collection"),
      color: DEFAULT_COLLECTION_COLOR,
      collapsed: false,
      createdAt: now,
      updatedAt: now,
      tabs,
    };
  });

  return {
    workspace: parseWorkspaceDocument({
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      activeSpaceId: spaceId,
      spaces: [{
        id: spaceId,
        name: "Toby import",
        createdAt: now,
        updatedAt: now,
        collections,
      }],
    }),
    skippedItems,
  };
}

export function importWorkspace(
  current: WorkspaceDocument,
  input: unknown,
  mode: "merge" | "replace",
  context: DomainContext,
): { readonly workspace: WorkspaceDocument; readonly summary: ImportSummary } {
  const source = parseWorkspaceImport(input);
  const now = context.now();
  const imported = isWorkspaceBackup(source)
    ? { workspace: source.workspace, skippedItems: 0, source: "hoby" as const }
    : { ...convertTobyExport(source, context), source: "toby" as const };
  const counts = {
    ...countWorkspace(imported.workspace),
    source: imported.source,
    skippedItems: imported.skippedItems,
  };

  if (mode === "replace") {
    const replacement = cloneWorkspace(imported.workspace);
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
  const importedSpaces = imported.workspace.spaces.map((space) => ({
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
