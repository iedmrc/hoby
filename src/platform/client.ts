import {
  type DomainContext,
  type WorkspaceBackup,
  type WorkspaceCommand,
  type WorkspaceCommandResult,
  type WorkspaceDocument,
  applyWorkspaceCommand,
  createWorkspaceBackup,
  defaultDomainContext,
  migrateWorkspaceDocument,
} from "../domain";
import type { ChromeLike } from "./chrome-api";
import { resolveChrome } from "./chrome-api";
import { ClientError, type ClientErrorCode, PlatformError } from "./errors";
import {
  RUNTIME_PROTOCOL,
  type CaptureTabsData,
  type RuntimeRequest,
  type RuntimeResponse,
  isRuntimeRequest,
  newRequestId,
} from "./messages";
import {
  type CapturePermissionStatus,
  ChromePermissionAdapter,
  LocalPermissionAdapter,
  type PermissionAdapter,
} from "./permissions";
import {
  BrowserStorageArea,
  type BrowserKeyValueStorage,
  WORKSPACE_STORAGE_KEY,
  WorkspaceRepository,
} from "./storage";
import type { CloseTabsResult, OpenTab, OpenTabsResult } from "./tabs";

export type Unsubscribe = () => void;

export interface WorkspaceClient {
  activateOpenTab(tabId: number): Promise<void>;
  captureTabs(options: {
    readonly collectionId: string;
    readonly closeAfterSave?: boolean;
    readonly tabIds?: readonly number[];
  }): Promise<CaptureTabsData>;
  closeOpenTabs(tabIds: readonly number[]): Promise<CloseTabsResult>;
  exportBackup(): Promise<WorkspaceBackup>;
  getCapturePermission(): Promise<CapturePermissionStatus>;
  getWorkspace(): Promise<WorkspaceDocument>;
  listOpenTabs(): Promise<readonly OpenTab[]>;
  mutate(command: WorkspaceCommand): Promise<WorkspaceCommandResult>;
  openCollection(collectionId: string): Promise<OpenTabsResult>;
  openSavedTab(url: string, active?: boolean): Promise<number>;
  requestCapturePermission(): Promise<CapturePermissionStatus>;
  restorePrevious(): Promise<WorkspaceCommandResult>;
  subscribeOpenTabs(listener: () => void): Unsubscribe;
  subscribeWorkspace(listener: (workspace: WorkspaceDocument) => void): Unsubscribe;
}

export interface CreateWorkspaceClientOptions {
  readonly browserStorage?: BrowserKeyValueStorage;
  readonly chrome?: ChromeLike;
  readonly context?: DomainContext;
}

type RuntimeRequestInput = RuntimeRequest extends infer Request
  ? Request extends RuntimeRequest
    ? Omit<Request, "protocol" | "requestId">
    : never
  : never;

function assertResponse<Data>(input: unknown): Data {
  if (!input || typeof input !== "object" || !("ok" in input)) {
    throw new ClientError("MESSAGE_INVALID", "The extension returned an invalid response.");
  }
  const response = input as RuntimeResponse<Data>;
  if (!response.ok) {
    throw new ClientError(
      response.error.code as ClientErrorCode,
      response.error.message,
      response.error.details,
    );
  }
  return response.data;
}

class ChromeWorkspaceClient implements WorkspaceClient {
  private readonly permissions: PermissionAdapter;

  constructor(private readonly chrome: ChromeLike) {
    this.permissions = new ChromePermissionAdapter(chrome.permissions);
  }

  getWorkspace(): Promise<WorkspaceDocument> {
    return this.send<WorkspaceDocument>({ kind: "workspace.get" });
  }

  mutate(command: WorkspaceCommand): Promise<WorkspaceCommandResult> {
    return this.send<WorkspaceCommandResult>({ kind: "workspace.mutate", command });
  }

  restorePrevious(): Promise<WorkspaceCommandResult> {
    return this.send<WorkspaceCommandResult>({ kind: "workspace.restorePrevious" });
  }

  listOpenTabs(): Promise<readonly OpenTab[]> {
    return this.send<readonly OpenTab[]>({ kind: "tabs.list" });
  }

  captureTabs(options: {
    readonly collectionId: string;
    readonly closeAfterSave?: boolean;
    readonly tabIds?: readonly number[];
  }): Promise<CaptureTabsData> {
    return this.send<CaptureTabsData>({
      kind: "tabs.capture",
      collectionId: options.collectionId,
      closeAfterSave: options.closeAfterSave ?? false,
      tabIds: options.tabIds,
    });
  }

  async openSavedTab(url: string, active = true): Promise<number> {
    return (await this.send<{ tabId: number }>({ kind: "tabs.open", url, active })).tabId;
  }

  openCollection(collectionId: string): Promise<OpenTabsResult> {
    return this.send<OpenTabsResult>({ kind: "tabs.openCollection", collectionId });
  }

  async activateOpenTab(tabId: number): Promise<void> {
    await this.send<{ activated: true }>({ kind: "tabs.activate", tabId });
  }

  closeOpenTabs(tabIds: readonly number[]): Promise<CloseTabsResult> {
    return this.send<CloseTabsResult>({ kind: "tabs.close", tabIds });
  }

  getCapturePermission(): Promise<CapturePermissionStatus> {
    return this.permissions.getCaptureStatus();
  }

  requestCapturePermission(): Promise<CapturePermissionStatus> {
    return this.permissions.requestCaptureAccess();
  }

  async exportBackup(): Promise<WorkspaceBackup> {
    return createWorkspaceBackup(await this.getWorkspace());
  }

  subscribeWorkspace(listener: (workspace: WorkspaceDocument) => void): Unsubscribe {
    const onChanged = (
      changes: Record<string, { readonly newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[WORKSPACE_STORAGE_KEY]?.newValue) return;
      try {
        listener(migrateWorkspaceDocument(changes[WORKSPACE_STORAGE_KEY].newValue));
      } catch {
        // The repository owns recovery; subscribers ignore invalid intermediate data.
      }
    };
    this.chrome.storage.onChanged.addListener(onChanged);
    return () => this.chrome.storage.onChanged.removeListener(onChanged);
  }

  subscribeOpenTabs(listener: () => void): Unsubscribe {
    const callbacks: Array<readonly [
      { addListener(callback: (...args: readonly unknown[]) => void): void; removeListener(callback: (...args: readonly unknown[]) => void): void },
      (...args: readonly unknown[]) => void,
    ]> = [];
    const schedule = () => listener();
    const events = [
      this.chrome.tabs.onActivated,
      this.chrome.tabs.onCreated,
      this.chrome.tabs.onMoved,
      this.chrome.tabs.onRemoved,
      this.chrome.tabs.onUpdated,
    ];
    for (const event of events) {
      if (!event) continue;
      const compatible = event as {
        addListener(callback: (...args: readonly unknown[]) => void): void;
        removeListener(callback: (...args: readonly unknown[]) => void): void;
      };
      compatible.addListener(schedule);
      callbacks.push([compatible, schedule]);
    }
    return () => {
      for (const [event, callback] of callbacks) event.removeListener(callback);
    };
  }

  private send<Data>(
    request: RuntimeRequestInput,
  ): Promise<Data> {
    const message = {
      ...request,
      protocol: RUNTIME_PROTOCOL,
      requestId: newRequestId(),
    } as RuntimeRequest;
    if (!isRuntimeRequest(message)) {
      throw new PlatformError("MESSAGE_INVALID", "Could not construct a runtime request.");
    }
    return this.chrome.runtime.sendMessage(message).then(assertResponse<Data>);
  }
}

class LocalWorkspaceClient implements WorkspaceClient {
  private readonly listeners = new Set<(workspace: WorkspaceDocument) => void>();
  private readonly permissions = new LocalPermissionAdapter();
  private readonly repository: WorkspaceRepository;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(
    browserStorage: BrowserKeyValueStorage | undefined,
    private readonly context: DomainContext,
  ) {
    this.repository = new WorkspaceRepository(new BrowserStorageArea(browserStorage), {
      context,
    });
  }

  getWorkspace(): Promise<WorkspaceDocument> {
    return this.repository.get();
  }

  async mutate(command: WorkspaceCommand): Promise<WorkspaceCommandResult> {
    return this.serializeMutation(async () => {
      const result = await this.repository.commit(newRequestId(), (workspace) =>
        applyWorkspaceCommand(workspace, command, this.context),
      );
      for (const listener of this.listeners) listener(result.workspace);
      return result;
    });
  }

  async restorePrevious(): Promise<WorkspaceCommandResult> {
    return this.serializeMutation(async () => {
      const result = await this.repository.restorePrevious(newRequestId());
      for (const listener of this.listeners) listener(result.workspace);
      return result;
    });
  }

  private serializeMutation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const run = this.mutationTail.then(operation, operation);
    this.mutationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async listOpenTabs(): Promise<readonly OpenTab[]> {
    return [];
  }

  async captureTabs(): Promise<CaptureTabsData> {
    throw new PlatformError(
      "MESSAGE_UNAVAILABLE",
      "Open-tab capture is available only inside the Chrome extension.",
    );
  }

  async openSavedTab(): Promise<number> {
    throw new PlatformError(
      "MESSAGE_UNAVAILABLE",
      "Opening browser tabs is available only inside the Chrome extension.",
    );
  }

  async openCollection(): Promise<OpenTabsResult> {
    throw new PlatformError(
      "MESSAGE_UNAVAILABLE",
      "Opening browser tabs is available only inside the Chrome extension.",
    );
  }

  async activateOpenTab(): Promise<void> {
    throw new PlatformError(
      "MESSAGE_UNAVAILABLE",
      "Activating browser tabs is available only inside the Chrome extension.",
    );
  }

  async closeOpenTabs(tabIds: readonly number[]): Promise<CloseTabsResult> {
    return { closedTabIds: [], failedTabIds: [...tabIds] };
  }

  getCapturePermission(): Promise<CapturePermissionStatus> {
    return this.permissions.getCaptureStatus();
  }

  requestCapturePermission(): Promise<CapturePermissionStatus> {
    return this.permissions.requestCaptureAccess();
  }

  async exportBackup(): Promise<WorkspaceBackup> {
    return createWorkspaceBackup(await this.getWorkspace());
  }

  subscribeWorkspace(listener: (workspace: WorkspaceDocument) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeOpenTabs(): Unsubscribe {
    return () => undefined;
  }
}

export function createWorkspaceClient(
  options: CreateWorkspaceClientOptions = {},
): WorkspaceClient {
  const chrome = options.chrome ?? resolveChrome();
  if (chrome?.runtime?.sendMessage) return new ChromeWorkspaceClient(chrome);

  let browserStorage = options.browserStorage;
  if (!browserStorage && typeof window !== "undefined") {
    try {
      browserStorage = window.localStorage;
    } catch {
      // Sandboxed previews may disable localStorage; BrowserStorageArea uses memory.
    }
  }
  return new LocalWorkspaceClient(
    browserStorage,
    options.context ?? defaultDomainContext,
  );
}
