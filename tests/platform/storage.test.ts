import {
  APPLIED_COMMANDS_STORAGE_KEY,
  BrowserStorageArea,
  PlatformError,
  RECOVERY_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  WorkspaceRepository,
} from "../../src/platform";
import { applyWorkspaceCommand } from "../../src/domain";
import { FakeStorageArea, createPlatformContext } from "./fakes";

describe("WorkspaceRepository", () => {
  it("initializes starter data and restricts storage to trusted contexts", async () => {
    const storage = new FakeStorageArea();
    const repository = new WorkspaceRepository(storage, { context: createPlatformContext() });
    const workspace = await repository.initialize();
    expect(workspace.spaces[0].name).toBe("My space");
    expect(storage.data[WORKSPACE_STORAGE_KEY]).toEqual(workspace);
    expect(storage.accessLevels).toEqual(["TRUSTED_CONTEXTS"]);
  });

  it("commits once and replays a persisted request without applying it twice", async () => {
    const context = createPlatformContext();
    const storage = new FakeStorageArea();
    const repository = new WorkspaceRepository(storage, { context });
    const mutate = (workspace: Awaited<ReturnType<typeof repository.get>>) =>
      applyWorkspaceCommand(workspace, { type: "space.create", name: "Work" }, context);

    const first = await repository.commit("request-1", mutate);
    const second = await repository.commit("request-1", mutate);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.workspace.spaces.filter((space) => space.name === "Work")).toHaveLength(1);
    expect(second.workspace.revision).toBe(first.workspace.revision);
    expect(storage.data[APPLIED_COMMANDS_STORAGE_KEY]).toBeDefined();
  });

  it("bounds recovery and swaps to the previous valid state", async () => {
    const context = createPlatformContext();
    const storage = new FakeStorageArea();
    const repository = new WorkspaceRepository(storage, { context, recoveryLimit: 2 });
    for (const [index, name] of ["A", "B", "C"].entries()) {
      await repository.commit(`request-${index}`, (workspace) =>
        applyWorkspaceCommand(workspace, { type: "space.create", name }, context),
      );
    }
    const recovery = storage.data[RECOVERY_STORAGE_KEY] as { entries: unknown[] };
    expect(recovery.entries).toHaveLength(2);
    const restored = await repository.restorePrevious("restore-1");
    expect(restored.workspace.spaces.map((space) => space.name)).toEqual([
      "My space",
      "A",
      "B",
    ]);
  });

  it("recovers a corrupt current document from the newest valid previous state", async () => {
    const context = createPlatformContext();
    const storage = new FakeStorageArea();
    const repository = new WorkspaceRepository(storage, { context });
    const starter = await repository.get();
    storage.data[RECOVERY_STORAGE_KEY] = {
      version: 1,
      entries: [{ savedAt: context.now(), workspace: starter }],
    };
    storage.data[WORKSPACE_STORAGE_KEY] = { schemaVersion: 1, spaces: "corrupt" };
    expect(await repository.get()).toEqual(starter);
    expect(storage.data[WORKSPACE_STORAGE_KEY]).toEqual(starter);
  });

  it("does not replace a future unsupported document", async () => {
    const storage = new FakeStorageArea();
    storage.data[WORKSPACE_STORAGE_KEY] = { schemaVersion: 99 };
    const repository = new WorkspaceRepository(storage, { context: createPlatformContext() });
    await expect(repository.get()).rejects.toMatchObject({ code: "WORKSPACE_UNSUPPORTED" });
    expect(storage.data[WORKSPACE_STORAGE_KEY]).toEqual({ schemaVersion: 99 });
  });

  it("drops oldest recovery copies on quota pressure before failing a mutation", async () => {
    const context = createPlatformContext();
    const storage = new FakeStorageArea();
    const repository = new WorkspaceRepository(storage, { context });
    await repository.get();
    storage.failSetWhen = (items) => {
      const recovery = items[RECOVERY_STORAGE_KEY] as { entries?: unknown[] } | undefined;
      return recovery?.entries?.length ? new Error("QUOTA_BYTES exceeded") : undefined;
    };
    const result = await repository.commit("quota-retry", (workspace) =>
      applyWorkspaceCommand(workspace, { type: "space.create", name: "Fits" }, context),
    );
    expect(result.workspace.spaces.at(-1)?.name).toBe("Fits");
    expect((storage.data[RECOVERY_STORAGE_KEY] as { entries: unknown[] }).entries).toEqual([]);
  });

  it("surfaces storage failure and leaves current data untouched", async () => {
    const context = createPlatformContext();
    const storage = new FakeStorageArea();
    const repository = new WorkspaceRepository(storage, { context });
    const before = await repository.get();
    storage.failSetWhen = () => new Error("disk unavailable");
    await expect(
      repository.commit("failure", (workspace) =>
        applyWorkspaceCommand(workspace, { type: "space.create", name: "Lost" }, context),
      ),
    ).rejects.toBeInstanceOf(PlatformError);
    expect(storage.data[WORKSPACE_STORAGE_KEY]).toEqual(before);
  });
});

describe("BrowserStorageArea", () => {
  it("provides an in-memory local-browser fallback", async () => {
    const area = new BrowserStorageArea();
    await area.set({ hello: { value: 1 } });
    expect(await area.get("hello")).toEqual({ hello: { value: 1 } });
  });
});
