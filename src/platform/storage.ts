import { z } from "zod";

import {
  type DomainContext,
  type WorkspaceCommandMeta,
  type WorkspaceCommandResult,
  type WorkspaceDocument,
  createStarterWorkspace,
  defaultDomainContext,
  migrateWorkspaceDocument,
  parseWorkspaceDocument,
} from "../domain";
import type { ChromeStorageAreaLike } from "./chrome-api";
import { PlatformError } from "./errors";

export const WORKSPACE_STORAGE_KEY = "hoby.workspace.v1";
export const RECOVERY_STORAGE_KEY = "hoby.recovery.v1";
export const APPLIED_COMMANDS_STORAGE_KEY = "hoby.applied-commands.v1";
export const DEFAULT_RECOVERY_LIMIT = 2;
export const DEFAULT_COMMAND_LOG_LIMIT = 64;

const RecoveryEnvelopeSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(
      z
        .object({
          savedAt: z.iso.datetime({ offset: true }),
          workspace: z.unknown(),
        })
        .strict(),
    ),
  })
  .strict();

const AppliedCommandEnvelopeSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(
      z
        .object({
          requestId: z.string().min(1).max(128),
          appliedAt: z.iso.datetime({ offset: true }),
          changed: z.boolean(),
          meta: z.unknown(),
        })
        .strict(),
    ),
  })
  .strict();

interface RecoveryEntry {
  readonly savedAt: string;
  readonly workspace: unknown;
}

interface AppliedCommandEntry {
  readonly requestId: string;
  readonly appliedAt: string;
  readonly changed: boolean;
  readonly meta: WorkspaceCommandMeta;
}

export type WorkspaceMutation = (
  workspace: WorkspaceDocument,
) => WorkspaceCommandResult;

export interface WorkspaceCommitResult extends WorkspaceCommandResult {
  readonly replayed: boolean;
}

export interface WorkspaceRepositoryOptions {
  readonly commandLogLimit?: number;
  readonly context?: DomainContext;
  readonly recoveryLimit?: number;
}

function isQuotaError(error: unknown): boolean {
  if (error instanceof PlatformError && error.code === "STORAGE_QUOTA") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /quota|QUOTA_BYTES/i.test(message);
}

function validRequestId(requestId: string): string {
  const value = requestId.trim();
  if (!value || value.length > 128) {
    throw new PlatformError("MESSAGE_INVALID", "A valid request ID is required.");
  }
  return value;
}

export class WorkspaceRepository {
  private readonly commandLogLimit: number;
  private readonly context: DomainContext;
  private readonly recoveryLimit: number;

  constructor(
    private readonly storage: ChromeStorageAreaLike,
    options: WorkspaceRepositoryOptions = {},
  ) {
    this.commandLogLimit = options.commandLogLimit ?? DEFAULT_COMMAND_LOG_LIMIT;
    this.context = options.context ?? defaultDomainContext;
    this.recoveryLimit = options.recoveryLimit ?? DEFAULT_RECOVERY_LIMIT;
  }

  async restrictToTrustedContexts(): Promise<void> {
    await this.storage.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  }

  async initialize(): Promise<WorkspaceDocument> {
    await this.restrictToTrustedContexts();
    return this.get();
  }

  async get(): Promise<WorkspaceDocument> {
    const values = await this.storage.get([
      WORKSPACE_STORAGE_KEY,
      RECOVERY_STORAGE_KEY,
    ]);
    const current = values[WORKSPACE_STORAGE_KEY];
    if (current === undefined) {
      const starter = createStarterWorkspace(this.context);
      await this.persist({ [WORKSPACE_STORAGE_KEY]: starter });
      return starter;
    }

    try {
      const migrated = migrateWorkspaceDocument(current);
      if ((current as { schemaVersion?: unknown }).schemaVersion !== migrated.schemaVersion) {
        await this.persist({
          [WORKSPACE_STORAGE_KEY]: migrated,
          [RECOVERY_STORAGE_KEY]: {
            version: 1,
            entries: [{ savedAt: this.context.now(), workspace: current }],
          },
        });
      }
      return migrated;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "WORKSPACE_UNSUPPORTED"
      ) {
        throw error;
      }
      return this.recoverCorruptCurrent(values[RECOVERY_STORAGE_KEY]);
    }
  }

  async commit(requestId: string, mutate: WorkspaceMutation): Promise<WorkspaceCommitResult> {
    const id = validRequestId(requestId);
    const commandEnvelope = await this.readAppliedCommands();
    const previousApplication = commandEnvelope.entries.find((entry) => entry.requestId === id);
    if (previousApplication) {
      return {
        workspace: await this.get(),
        changed: previousApplication.changed,
        meta: previousApplication.meta,
        replayed: true,
      };
    }

    const current = await this.get();
    const result = mutate(current);
    const appliedAt = this.context.now();
    const commands = {
      version: 1 as const,
      entries: [
        { requestId: id, appliedAt, changed: result.changed, meta: result.meta },
        ...commandEnvelope.entries.filter((entry) => entry.requestId !== id),
      ].slice(0, this.commandLogLimit),
    };

    if (!result.changed) {
      await this.persist({ [APPLIED_COMMANDS_STORAGE_KEY]: commands });
      return { ...result, replayed: false };
    }

    const recovery = await this.readRecovery();
    const entries: RecoveryEntry[] = [
      { savedAt: appliedAt, workspace: current },
      ...recovery.entries.filter((entry) => {
        try {
          return migrateWorkspaceDocument(entry.workspace).revision !== current.revision;
        } catch {
          return false;
        }
      }),
    ].slice(0, this.recoveryLimit);

    await this.persistWithRecoveryFallback(
      {
        [WORKSPACE_STORAGE_KEY]: parseWorkspaceDocument(result.workspace),
        [APPLIED_COMMANDS_STORAGE_KEY]: commands,
      },
      entries,
    );
    return { ...result, replayed: false };
  }

  async restorePrevious(requestId: string): Promise<WorkspaceCommitResult> {
    const id = validRequestId(requestId);
    const commandEnvelope = await this.readAppliedCommands();
    const replay = commandEnvelope.entries.find((entry) => entry.requestId === id);
    if (replay) {
      return {
        workspace: await this.get(),
        changed: replay.changed,
        meta: replay.meta,
        replayed: true,
      };
    }

    const current = await this.get();
    const recovery = await this.readRecovery();
    const [candidate, ...remaining] = recovery.entries;
    if (!candidate) {
      throw new PlatformError("RECOVERY_EMPTY", "There is no previous workspace to restore.");
    }
    const restored = migrateWorkspaceDocument(candidate.workspace);
    const appliedAt = this.context.now();
    const commands = {
      version: 1 as const,
      entries: [
        {
          requestId: id,
          appliedAt,
          changed: true,
          meta: { kind: "none" } satisfies WorkspaceCommandMeta,
        },
        ...commandEnvelope.entries,
      ].slice(0, this.commandLogLimit),
    };
    const swappedRecovery = [
      { savedAt: appliedAt, workspace: current },
      ...remaining,
    ].slice(0, this.recoveryLimit);

    await this.persistWithRecoveryFallback(
      {
        [WORKSPACE_STORAGE_KEY]: restored,
        [APPLIED_COMMANDS_STORAGE_KEY]: commands,
      },
      swappedRecovery,
    );
    return {
      workspace: restored,
      changed: true,
      meta: { kind: "none" },
      replayed: false,
    };
  }

  private async recoverCorruptCurrent(recoveryValue: unknown): Promise<WorkspaceDocument> {
    const recovery = this.parseRecovery(recoveryValue);
    for (const [index, entry] of recovery.entries.entries()) {
      try {
        const restored = migrateWorkspaceDocument(entry.workspace);
        await this.persist({
          [WORKSPACE_STORAGE_KEY]: restored,
          [RECOVERY_STORAGE_KEY]: {
            version: 1,
            entries: recovery.entries.filter((_, entryIndex) => entryIndex !== index),
          },
        });
        return restored;
      } catch {
        // Try the next bounded recovery entry.
      }
    }

    const starter = createStarterWorkspace(this.context);
    await this.persist({
      [WORKSPACE_STORAGE_KEY]: starter,
      [RECOVERY_STORAGE_KEY]: { version: 1, entries: [] },
    });
    return starter;
  }

  private parseRecovery(value: unknown): { version: 1; entries: RecoveryEntry[] } {
    const parsed = RecoveryEnvelopeSchema.safeParse(value);
    if (!parsed.success) return { version: 1, entries: [] };
    return {
      version: 1,
      entries: parsed.data.entries.slice(0, this.recoveryLimit),
    };
  }

  private async readRecovery(): Promise<{ version: 1; entries: RecoveryEntry[] }> {
    const values = await this.storage.get(RECOVERY_STORAGE_KEY);
    return this.parseRecovery(values[RECOVERY_STORAGE_KEY]);
  }

  private async readAppliedCommands(): Promise<{
    version: 1;
    entries: AppliedCommandEntry[];
  }> {
    const values = await this.storage.get(APPLIED_COMMANDS_STORAGE_KEY);
    const parsed = AppliedCommandEnvelopeSchema.safeParse(
      values[APPLIED_COMMANDS_STORAGE_KEY],
    );
    if (!parsed.success) return { version: 1, entries: [] };
    return {
      version: 1,
      entries: parsed.data.entries.slice(0, this.commandLogLimit) as AppliedCommandEntry[],
    };
  }

  private async persistWithRecoveryFallback(
    values: Readonly<Record<string, unknown>>,
    entries: readonly RecoveryEntry[],
  ): Promise<void> {
    for (let length = entries.length; length >= 0; length -= 1) {
      try {
        await this.persist({
          ...values,
          [RECOVERY_STORAGE_KEY]: { version: 1, entries: entries.slice(0, length) },
        });
        return;
      } catch (error) {
        if (!isQuotaError(error) || length === 0) throw error;
      }
    }
  }

  private async persist(values: Readonly<Record<string, unknown>>): Promise<void> {
    try {
      await this.storage.set(values);
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      throw new PlatformError(
        isQuotaError(error) ? "STORAGE_QUOTA" : "STORAGE_FAILED",
        isQuotaError(error)
          ? "Hoby could not save because local extension storage is full."
          : "Hoby could not save the workspace.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }
}

export interface BrowserKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class BrowserStorageArea implements ChromeStorageAreaLike {
  private readonly memory = new Map<string, string>();

  constructor(private readonly browserStorage?: BrowserKeyValueStorage) {}

  async get(keys?: string | readonly string[] | null): Promise<Record<string, unknown>> {
    const selected = keys === null || keys === undefined
      ? [...this.memory.keys()]
      : typeof keys === "string"
        ? [keys]
        : [...keys];
    const result: Record<string, unknown> = {};
    for (const key of selected) {
      const raw = this.browserStorage?.getItem(key) ?? this.memory.get(key) ?? null;
      if (raw === null) continue;
      try {
        result[key] = JSON.parse(raw) as unknown;
      } catch {
        result[key] = raw;
      }
    }
    return result;
  }

  async set(items: Readonly<Record<string, unknown>>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      const serialized = JSON.stringify(value);
      if (this.browserStorage) this.browserStorage.setItem(key, serialized);
      else this.memory.set(key, serialized);
    }
  }

  async setAccessLevel(): Promise<void> {
    // Browser development storage has no content-script exposure.
  }
}
