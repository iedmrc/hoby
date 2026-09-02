import { useEffect, useMemo, useState } from "react";
import {
  parseWorkspaceImport,
  type WorkspaceCommand,
  type WorkspaceCommandResult,
  type WorkspaceDocument,
} from "../domain";
import { createWorkspaceClient, type WorkspaceClient } from "../platform";
import type { BrowserTab, WorkspaceActions } from "../newtab/types";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const demoTabs: readonly BrowserTab[] = [
  { id: 101, windowId: 1, active: true, pinned: false, title: "Project brief", url: "https://docs.google.com/document/d/example" },
  { id: 102, windowId: 1, active: false, pinned: false, title: "Design exploration", url: "https://www.figma.com/file/example" },
  { id: 103, windowId: 1, active: false, pinned: false, title: "Repository", url: "https://github.com/iedmrc/hoby" },
  { id: 104, windowId: 1, active: false, pinned: false, title: "Research notes", url: "https://developer.chrome.com/docs/extensions/" },
];

function isExtensionContext() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

function downloadJson(value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = `hoby-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

function mapOpenTabs(tabs: Awaited<ReturnType<WorkspaceClient["listOpenTabs"]>>): BrowserTab[] {
  return tabs.map((tab) => ({
    active: tab.active,
    id: tab.id,
    pinned: tab.pinned,
    title: tab.title,
    url: tab.url,
    windowId: tab.windowId,
  }));
}

export interface WorkspaceAppState {
  readonly actions: WorkspaceActions;
  readonly allowFavicons: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly hasTabAccess: boolean;
  readonly openTabs: readonly BrowserTab[];
  readonly workspace: WorkspaceDocument | null;
}

export function useWorkspaceApp(clientOverride?: WorkspaceClient): WorkspaceAppState {
  const [client] = useState(() => clientOverride ?? createWorkspaceClient());
  const extension = isExtensionContext();
  const [allowFavicons, setAllowFavicons] = useState(!extension);
  const [busyCount, setBusyCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasTabAccess, setHasTabAccess] = useState(!extension);
  const [openTabs, setOpenTabs] = useState<readonly BrowserTab[]>(extension ? [] : demoTabs);
  const [workspace, setWorkspace] = useState<WorkspaceDocument | null>(null);

  const withBusy = async <Result,>(task: () => Promise<Result>): Promise<Result> => {
    setBusyCount((count) => count + 1);
    try {
      const result = await task();
      setError(null);
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unexpected extension error.";
      setError(message);
      throw caught;
    } finally {
      setBusyCount((count) => Math.max(0, count - 1));
    }
  };

  const refreshOpenTabs = async () => {
    if (!extension) return;
    try {
      setOpenTabs(mapOpenTabs(await client.listOpenTabs()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read open tabs.");
    }
  };

  useEffect(() => {
    let mounted = true;
    void client.getWorkspace().then((next) => {
      if (mounted) setWorkspace(next);
    }).catch((caught: unknown) => {
      if (mounted) setError(caught instanceof Error ? caught.message : "Could not load the workspace.");
    });
    const unsubscribeWorkspace = client.subscribeWorkspace((next) => {
      if (mounted) setWorkspace(next);
    });
    const unsubscribeTabs = client.subscribeOpenTabs(() => void refreshOpenTabs());

    if (extension) {
      void client.getCapturePermission().then((status) => {
        if (!mounted) return;
        setHasTabAccess(status.tabs);
        setAllowFavicons(status.favicon);
        if (status.tabs) void client.listOpenTabs().then((tabs) => {
          if (mounted) setOpenTabs(mapOpenTabs(tabs));
        });
      });
    }

    return () => {
      mounted = false;
      unsubscribeWorkspace();
      unsubscribeTabs();
    };
    // The client is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, extension]);

  const actions = useMemo<WorkspaceActions>(() => ({
    activateBrowserTab: async (tabId) => {
      if (!extension) {
        setOpenTabs((tabs) => tabs.map((tab) => ({ ...tab, active: tab.id === tabId })));
        return;
      }
      await withBusy(() => client.activateOpenTab(tabId));
      await refreshOpenTabs();
    },
    captureTabs: async (collectionId, tabIds, closeAfterSave = false) => {
      if (!extension) {
        const selected = openTabs.filter((tab) => !tabIds || tabIds.includes(tab.id));
        const result = await withBusy(() => client.mutate({
          type: "savedTab.addMany",
          collectionId,
          tabs: selected.map((tab) => ({ sourceId: String(tab.id), title: tab.title, url: tab.url })),
        }));
        if (closeAfterSave && result.meta.kind === "savedTabs") {
          const closed = new Set(result.meta.added.map((item) => Number(item.sourceId)));
          setOpenTabs((tabs) => tabs.filter((tab) => !closed.has(tab.id)));
        }
        return result;
      }
      const result = await withBusy(() => client.captureTabs({
        collectionId,
        closeAfterSave,
        tabIds,
      }));
      await refreshOpenTabs();
      return result.commandResult;
    },
    closeBrowserTabs: async (tabIds) => {
      if (!extension) {
        setOpenTabs((tabs) => tabs.filter((tab) => !tabIds.includes(tab.id)));
        return;
      }
      await withBusy(() => client.closeOpenTabs(tabIds));
      await refreshOpenTabs();
    },
    dispatch: (command: WorkspaceCommand): Promise<WorkspaceCommandResult> =>
      withBusy(() => client.mutate(command)),
    exportWorkspace: () => {
      void withBusy(async () => downloadJson(await client.exportBackup()));
    },
    importWorkspace: async (file, mode) => {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("The backup is larger than 5 MB.");
      const backup = parseWorkspaceImport(await file.text());
      return withBusy(() => client.mutate({ type: "workspace.import", backup, mode }));
    },
    openCollection: async (collectionId) => {
      if (!extension) {
        const collection = workspace?.spaces.flatMap((space) => space.collections)
          .find((item) => item.id === collectionId);
        collection?.tabs.forEach((tab) => window.open(tab.url, "_blank", "noopener"));
        return;
      }
      await withBusy(() => client.openCollection(collectionId));
    },
    openWorkspace: async () => {
      if (extension) {
        await chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html") });
        window.close();
      } else {
        window.open("/newtab.html", "_blank", "noopener");
      }
    },
    requestTabAccess: async () => {
      if (!extension) {
        setHasTabAccess(true);
        setAllowFavicons(true);
        return true;
      }
      const status = await withBusy(() => client.requestCapturePermission());
      setHasTabAccess(status.tabs);
      setAllowFavicons(status.favicon);
      if (status.tabs) setOpenTabs(mapOpenTabs(await client.listOpenTabs()));
      return status.tabs;
    },
  // Functions intentionally capture the latest workspace and open-tab snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [client, extension, openTabs, workspace]);

  return {
    actions,
    allowFavicons,
    busy: busyCount > 0,
    error,
    hasTabAccess,
    openTabs,
    workspace,
  };
}
