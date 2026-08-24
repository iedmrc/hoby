import {
  BackgroundRuntime,
  ChromePermissionAdapter,
  ChromeTabAdapter,
  RUNTIME_PROTOCOL,
  WORKSPACE_STORAGE_KEY,
  WorkspaceRepository,
  type CaptureTabsData,
  type RuntimeRequest,
} from "../../src/platform";
import { applyWorkspaceCommand } from "../../src/domain";
import {
  FakePermissions,
  FakeStorageArea,
  FakeTabs,
  createPlatformContext,
  fakeChromeTab,
} from "./fakes";

type RequestWithoutProtocol = RuntimeRequest extends infer Request
  ? Request extends RuntimeRequest
    ? Omit<Request, "protocol">
    : never
  : never;

function request(value: RequestWithoutProtocol): RuntimeRequest {
  return { ...value, protocol: RUNTIME_PROTOCOL };
}

function setup(granted = true) {
  const context = createPlatformContext();
  const storage = new FakeStorageArea();
  const browserTabs = new FakeTabs();
  const permissions = new FakePermissions();
  if (granted) {
    permissions.granted.add("tabs");
    permissions.granted.add("favicon");
  }
  const repository = new WorkspaceRepository(storage, { context });
  const runtime = new BackgroundRuntime(
    repository,
    new ChromeTabAdapter(browserTabs),
    new ChromePermissionAdapter(permissions),
    { context },
  );
  return { context, storage, browserTabs, permissions, repository, runtime };
}

describe("BackgroundRuntime", () => {
  it("serializes concurrent mutations so neither UI context loses an update", async () => {
    const { runtime, repository } = setup();
    const first = runtime.handle(
      request({
        kind: "workspace.mutate",
        requestId: "first",
        command: { type: "space.create", name: "First" },
      }),
    );
    const second = runtime.handle(
      request({
        kind: "workspace.mutate",
        requestId: "second",
        command: { type: "space.create", name: "Second" },
      }),
    );
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect((await repository.get()).spaces.map((space) => space.name)).toEqual([
      "My space",
      "First",
      "Second",
    ]);
  });

  it("persists captured tabs before closing and closes only newly saved tabs", async () => {
    const { runtime, repository, browserTabs } = setup();
    const workspace = await repository.get();
    const collectionId = workspace.spaces[0].collections[0].id;
    browserTabs.tabs = [
      fakeChromeTab(1, "https://example.com", { index: 0, title: "First" }),
      fakeChromeTab(2, "https://EXAMPLE.com/", { index: 1, title: "Duplicate" }),
      fakeChromeTab(3, "chrome://newtab", { index: 2 }),
    ];
    const response = await runtime.handle(
      request({
        kind: "tabs.capture",
        requestId: "capture-1",
        collectionId,
        closeAfterSave: true,
      }),
    );
    expect(response.ok).toBe(true);
    const data = response.ok ? (response.data as CaptureTabsData) : undefined;
    expect(data?.commandResult.meta).toMatchObject({
      kind: "savedTabs",
      added: [{ sourceId: "1" }],
      duplicates: [{ sourceId: "2" }],
    });
    expect(browserTabs.removed).toEqual([1]);
    expect((await repository.get()).spaces[0].collections[0].tabs).toHaveLength(1);
  });

  it("never closes a browser tab when persistence fails", async () => {
    const { runtime, repository, storage, browserTabs } = setup();
    const workspace = await repository.get();
    const collectionId = workspace.spaces[0].collections[0].id;
    browserTabs.tabs = [fakeChromeTab(1, "https://must-stay.test")];
    storage.failSetWhen = (items) => {
      const next = items[WORKSPACE_STORAGE_KEY] as { revision?: number } | undefined;
      return next && next.revision && next.revision > 0 ? new Error("disk unavailable") : undefined;
    };
    const response = await runtime.handle(
      request({
        kind: "tabs.capture",
        requestId: "failed-capture",
        collectionId,
        closeAfterSave: true,
      }),
    );
    expect(response).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
    expect(browserTabs.removed).toEqual([]);
    expect((await repository.get()).spaces[0].collections[0].tabs).toEqual([]);
  });

  it("replays capture metadata after a retry without duplicating saved tabs", async () => {
    const { runtime, repository, browserTabs } = setup();
    const workspace = await repository.get();
    const collectionId = workspace.spaces[0].collections[0].id;
    browserTabs.tabs = [fakeChromeTab(7, "https://retry.test")];
    const capture = request({
      kind: "tabs.capture",
      requestId: "same-capture",
      collectionId,
      closeAfterSave: true,
    });
    expect((await runtime.handle(capture)).ok).toBe(true);
    expect((await runtime.handle(capture)).ok).toBe(true);
    const current = await repository.get();
    expect(current.revision).toBe(1);
    expect(current.spaces[0].collections[0].tabs).toHaveLength(1);
    expect(browserTabs.removed).toEqual([7, 7]);
  });

  it("returns an actionable permission error without querying tabs", async () => {
    const { runtime, browserTabs } = setup(false);
    browserTabs.tabs = [fakeChromeTab(1, "https://hidden.test")];
    const response = await runtime.handle(
      request({ kind: "tabs.list", requestId: "permission-denied" }),
    );
    expect(response).toMatchObject({
      ok: false,
      error: { code: "CAPTURE_PERMISSION_REQUIRED" },
    });
  });

  it("opens a collection without URLs already open in the window", async () => {
    const { runtime, repository, context, browserTabs } = setup();
    const workspace = await repository.get();
    const collectionId = workspace.spaces[0].collections[0].id;
    await repository.commit("seed-tabs", (current) =>
      applyWorkspaceCommand(
        current,
        {
          type: "savedTab.addMany",
          collectionId,
          tabs: [{ url: "one.test" }, { url: "two.test" }],
        },
        context,
      ),
    );
    browserTabs.tabs = [fakeChromeTab(1, "https://one.test")];
    const response = await runtime.handle(
      request({ kind: "tabs.openCollection", requestId: "open-all", collectionId }),
    );
    expect(response).toMatchObject({
      ok: true,
      data: {
        openedTabIds: [1001],
        duplicateUrls: ["https://one.test"],
        failedUrls: [],
      },
    });
  });
});
