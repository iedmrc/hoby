import type {
  WorkspaceCommandMeta,
  WorkspaceCommandResult,
  WorkspaceDocument,
} from "../../src/domain";
import type { BrowserTab, WorkspaceActions } from "../../src/newtab/types";

const timestamp = "2026-08-24T10:00:00.000Z";

export function createFakeWorkspace(): WorkspaceDocument {
  return {
    schemaVersion: 1,
    revision: 4,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeSpaceId: "space-personal",
    spaces: [
      {
        id: "space-personal",
        name: "Personal",
        createdAt: timestamp,
        updatedAt: timestamp,
        collections: [
          {
            id: "collection-research",
            name: "Research",
            color: "sky",
            collapsed: false,
            createdAt: timestamp,
            updatedAt: timestamp,
            tabs: [
              {
                id: "saved-react",
                title: "React guide",
                url: "https://react.dev/learn",
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
          },
          {
            id: "collection-reading",
            name: "Reading list",
            color: "amber",
            collapsed: false,
            createdAt: timestamp,
            updatedAt: timestamp,
            tabs: [],
          },
        ],
      },
      {
        id: "space-work",
        name: "Work",
        createdAt: timestamp,
        updatedAt: timestamp,
        collections: [
          {
            id: "collection-roadmap",
            name: "Roadmap",
            color: "mint",
            collapsed: false,
            createdAt: timestamp,
            updatedAt: timestamp,
            tabs: [
              {
                id: "saved-launch",
                title: "Launch checklist",
                url: "https://example.com/rollout",
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
          },
        ],
      },
    ],
  };
}

export function createFakeOpenTabs(): readonly BrowserTab[] {
  return [
    {
      active: true,
      id: 501,
      pinned: false,
      title: "Hoby issue",
      url: "https://github.com/iedmrc/hoby/issues/1",
      windowId: 7,
    },
    {
      active: false,
      id: 502,
      pinned: false,
      title: "React reference",
      url: "https://react.dev/reference/react",
      windowId: 7,
    },
  ];
}

export function createCommandResult(
  workspace: WorkspaceDocument,
  meta: WorkspaceCommandMeta = { kind: "none" },
): WorkspaceCommandResult {
  return { workspace, changed: meta.kind !== "none", meta };
}

export function createFakeActions(workspace = createFakeWorkspace()): WorkspaceActions {
  return {
    activateBrowserTab: vi.fn(async () => undefined),
    captureTabs: vi.fn(async () => createCommandResult(workspace, {
      kind: "savedTabs",
      added: [],
      duplicates: [],
      rejected: [],
    })),
    closeBrowserTabs: vi.fn(async () => undefined),
    dispatch: vi.fn(async () => createCommandResult(workspace)),
    exportWorkspace: vi.fn(),
    importWorkspace: vi.fn(async () => undefined),
    openCollection: vi.fn(async () => undefined),
    openWorkspace: vi.fn(async () => undefined),
    requestTabAccess: vi.fn(async () => true),
  };
}

export function installDialogPolyfill(): void {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
}

export function createDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    get types() {
      return [...data.keys()];
    },
    clearData(format?: string) {
      if (format) data.delete(format);
      else data.clear();
    },
    getData(format: string) {
      return data.get(format) ?? "";
    },
    setData(format: string, value: string) {
      data.set(format, value);
    },
    setDragImage() {
      // jsdom does not render drag feedback.
    },
  };
}
