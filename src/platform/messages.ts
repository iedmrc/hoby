import type { WorkspaceCommand, WorkspaceCommandResult, WorkspaceDocument } from "../domain";
import type { CapturePermissionStatus } from "./permissions";
import type { CloseTabsResult, OpenTab, OpenTabsResult } from "./tabs";

export const RUNTIME_PROTOCOL = "hoby.runtime.v1" as const;

interface RuntimeRequestBase {
  readonly protocol: typeof RUNTIME_PROTOCOL;
  readonly requestId: string;
}

export type RuntimeRequest =
  | (RuntimeRequestBase & { readonly kind: "workspace.get" })
  | (RuntimeRequestBase & {
      readonly kind: "workspace.mutate";
      readonly command: WorkspaceCommand;
    })
  | (RuntimeRequestBase & { readonly kind: "workspace.restorePrevious" })
  | (RuntimeRequestBase & { readonly kind: "tabs.list" })
  | (RuntimeRequestBase & {
      readonly kind: "tabs.capture";
      readonly collectionId: string;
      readonly closeAfterSave: boolean;
      readonly tabIds?: readonly number[];
    })
  | (RuntimeRequestBase & {
      readonly kind: "tabs.open";
      readonly url: string;
      readonly active?: boolean;
    })
  | (RuntimeRequestBase & {
      readonly kind: "tabs.openCollection";
      readonly collectionId: string;
    })
  | (RuntimeRequestBase & { readonly kind: "tabs.activate"; readonly tabId: number })
  | (RuntimeRequestBase & {
      readonly kind: "tabs.close";
      readonly tabIds: readonly number[];
    });

export interface RuntimeErrorData {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly message: string;
}

export type RuntimeResponse<Data = unknown> =
  | { readonly ok: true; readonly data: Data }
  | { readonly ok: false; readonly error: RuntimeErrorData };

export interface CaptureTabsData {
  readonly closeResult: CloseTabsResult;
  readonly commandResult: WorkspaceCommandResult;
}

export type RuntimeResponseData =
  | WorkspaceDocument
  | WorkspaceCommandResult
  | readonly OpenTab[]
  | CaptureTabsData
  | CloseTabsResult
  | OpenTabsResult
  | { readonly tabId: number }
  | { readonly activated: true };

const REQUEST_KINDS = new Set<RuntimeRequest["kind"]>([
  "workspace.get",
  "workspace.mutate",
  "workspace.restorePrevious",
  "tabs.list",
  "tabs.capture",
  "tabs.open",
  "tabs.openCollection",
  "tabs.activate",
  "tabs.close",
]);

const COMMAND_KINDS = new Set<WorkspaceCommand["type"]>([
  "space.create",
  "space.rename",
  "space.select",
  "space.reorder",
  "space.delete",
  "collection.create",
  "collection.update",
  "collection.reorder",
  "collection.move",
  "collection.delete",
  "savedTab.add",
  "savedTab.addMany",
  "savedTab.update",
  "savedTab.delete",
  "savedTab.reorder",
  "savedTab.move",
  "savedTab.dedupe",
  "workspace.import",
]);

export function isRuntimeRequest(input: unknown): input is RuntimeRequest {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Record<string, unknown>;
  if (!(
    candidate.protocol === RUNTIME_PROTOCOL &&
    typeof candidate.requestId === "string" &&
    candidate.requestId.length > 0 &&
    candidate.requestId.length <= 128 &&
    typeof candidate.kind === "string" &&
    REQUEST_KINDS.has(candidate.kind as RuntimeRequest["kind"])
  )) return false;

  switch (candidate.kind) {
    case "workspace.mutate": {
      if (!candidate.command || typeof candidate.command !== "object") return false;
      const command = candidate.command as Record<string, unknown>;
      return typeof command.type === "string" &&
        COMMAND_KINDS.has(command.type as WorkspaceCommand["type"]);
    }
    case "tabs.capture":
      return typeof candidate.collectionId === "string" &&
        typeof candidate.closeAfterSave === "boolean" &&
        (candidate.tabIds === undefined ||
          (Array.isArray(candidate.tabIds) &&
            candidate.tabIds.every((tabId) => Number.isInteger(tabId))));
    case "tabs.open":
      return typeof candidate.url === "string" &&
        (candidate.active === undefined || typeof candidate.active === "boolean");
    case "tabs.openCollection":
      return typeof candidate.collectionId === "string";
    case "tabs.activate":
      return Number.isInteger(candidate.tabId);
    case "tabs.close":
      return Array.isArray(candidate.tabIds) &&
        candidate.tabIds.every((tabId) => Number.isInteger(tabId));
    default:
      return true;
  }
}

export function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export type ClientPermissionData = CapturePermissionStatus;
