import {
  type DomainContext,
  type WorkspaceCommandMeta,
  applyWorkspaceCommand,
  defaultDomainContext,
  isDomainError,
} from "../domain";
import { PlatformError } from "./errors";
import {
  type CaptureTabsData,
  type RuntimeErrorData,
  type RuntimeRequest,
  type RuntimeResponse,
} from "./messages";
import type { PermissionAdapter } from "./permissions";
import type { WorkspaceRepository } from "./storage";
import { type WorkspaceCommitResult } from "./storage";
import type { TabAdapter } from "./tabs";

export interface BackgroundRuntimeOptions {
  readonly context?: DomainContext;
}

function serializeError(error: unknown): RuntimeErrorData {
  if (isDomainError(error) || error instanceof PlatformError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return {
    code: "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
  };
}

function addedSourceTabIds(meta: WorkspaceCommandMeta): number[] {
  if (meta.kind !== "savedTabs") return [];
  return meta.added
    .map((entry) => Number(entry.sourceId))
    .filter((tabId) => Number.isInteger(tabId) && tabId >= 0);
}

export class BackgroundRuntime {
  private readonly context: DomainContext;
  private initialization?: Promise<void>;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly tabs: TabAdapter,
    private readonly permissions: PermissionAdapter,
    options: BackgroundRuntimeOptions = {},
  ) {
    this.context = options.context ?? defaultDomainContext;
  }

  initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.repository.initialize().then(() => undefined);
      void this.initialization.catch(() => {
        this.initialization = undefined;
      });
    }
    return this.initialization;
  }

  async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
    try {
      await this.initialize();
      return { ok: true, data: await this.dispatch(request) };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  }

  private async dispatch(request: RuntimeRequest): Promise<unknown> {
    switch (request.kind) {
      case "workspace.get":
        await this.mutationTail;
        return this.repository.get();
      case "workspace.mutate":
        return this.serializeMutation(() =>
          this.repository.commit(request.requestId, (workspace) =>
            applyWorkspaceCommand(workspace, request.command, this.context),
          ),
        );
      case "workspace.restorePrevious":
        return this.serializeMutation(() => this.repository.restorePrevious(request.requestId));
      case "tabs.list":
        await this.requireCapturePermission();
        return this.tabs.listCapturableCurrentWindow();
      case "tabs.capture":
        return this.serializeMutation(() => this.capture(request));
      case "tabs.open":
        return { tabId: await this.tabs.open(request.url, request.active ?? true) };
      case "tabs.openCollection": {
        await this.mutationTail;
        const workspace = await this.repository.get();
        const collection = workspace.spaces
          .flatMap((space) => space.collections)
          .find((candidate) => candidate.id === request.collectionId);
        if (!collection) {
          throw new PlatformError("MESSAGE_INVALID", "The collection no longer exists.", {
            collectionId: request.collectionId,
          });
        }
        return this.tabs.openMissing(collection.tabs.map((tab) => tab.url));
      }
      case "tabs.activate":
        await this.tabs.activate(request.tabId);
        return { activated: true as const };
      case "tabs.close":
        return this.tabs.close(request.tabIds);
      default: {
        const exhaustive: never = request;
        throw new PlatformError("MESSAGE_INVALID", "Unknown runtime request.", {
          request: exhaustive,
        });
      }
    }
  }

  private async capture(
    request: Extract<RuntimeRequest, { kind: "tabs.capture" }>,
  ): Promise<CaptureTabsData> {
    await this.requireCapturePermission();
    const openTabs = await this.tabs.listCapturableCurrentWindow();
    const requestedIds = request.tabIds ? new Set(request.tabIds) : undefined;
    const selected = requestedIds
      ? openTabs.filter((tab) => requestedIds.has(tab.id))
      : openTabs;

    const commandResult: WorkspaceCommitResult = await this.repository.commit(
      request.requestId,
      (workspace) =>
        applyWorkspaceCommand(
          workspace,
          {
            type: "savedTab.addMany",
            collectionId: request.collectionId,
            tabs: selected.map((tab) => ({
              sourceId: String(tab.id),
              title: tab.title,
              url: tab.url,
            })),
          },
          this.context,
        ),
    );

    // commit() has resolved here. A failed write can never reach tabs.close().
    const closeResult = request.closeAfterSave
      ? await this.tabs.close(addedSourceTabIds(commandResult.meta))
      : { closedTabIds: [], failedTabIds: [] };
    return { commandResult, closeResult };
  }

  private async requireCapturePermission(): Promise<void> {
    const status = await this.permissions.getCaptureStatus();
    if (!status.tabs) {
      throw new PlatformError(
        "CAPTURE_PERMISSION_REQUIRED",
        "Allow tab access before reading or saving open tabs.",
      );
    }
  }

  private serializeMutation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const run = this.mutationTail.then(operation, operation);
    this.mutationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
