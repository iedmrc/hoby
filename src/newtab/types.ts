import type { WorkspaceCommand, WorkspaceCommandResult } from "../domain";

export interface BrowserTab {
  readonly active: boolean;
  readonly id: number;
  readonly pinned: boolean;
  readonly title: string;
  readonly url: string;
  readonly windowId: number;
}

export interface WorkspaceActions {
  readonly activateBrowserTab: (tabId: number) => Promise<void>;
  readonly captureTabs: (
    collectionId: string,
    tabIds?: readonly number[],
    closeAfterSave?: boolean,
  ) => Promise<WorkspaceCommandResult>;
  readonly closeBrowserTabs: (tabIds: readonly number[]) => Promise<void>;
  readonly dispatch: (command: WorkspaceCommand) => Promise<WorkspaceCommandResult>;
  readonly exportWorkspace: () => void;
  readonly importWorkspace: (file: File, mode: "merge" | "replace") => Promise<void>;
  readonly openCollection: (collectionId: string) => Promise<void>;
  readonly openWorkspace: () => Promise<void>;
  readonly requestTabAccess: () => Promise<boolean>;
}

export const HOBY_OPEN_TAB_MIME = "application/x-hoby-open-tab";
export const HOBY_SAVED_TAB_MIME = "application/x-hoby-saved-tab";
export const HOBY_COLLECTION_MIME = "application/x-hoby-collection";
