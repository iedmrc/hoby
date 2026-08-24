import {
  PlatformError,
  createWorkspaceClient,
  type BrowserKeyValueStorage,
} from "../../src/platform";
import { createPlatformContext } from "./fakes";

class FakeBrowserStorage implements BrowserKeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("local browser workspace client", () => {
  it("provides persistent typed mutations for React previews without Chrome", async () => {
    const browserStorage = new FakeBrowserStorage();
    const context = createPlatformContext();
    const client = createWorkspaceClient({ browserStorage, context });
    const listener = vi.fn();
    const unsubscribe = client.subscribeWorkspace(listener);

    const result = await client.mutate({ type: "space.create", name: "Preview" });
    expect(result.workspace.spaces.at(-1)?.name).toBe("Preview");
    expect(listener).toHaveBeenCalledWith(result.workspace);

    const reloaded = createWorkspaceClient({ browserStorage, context });
    expect((await reloaded.getWorkspace()).spaces.at(-1)?.name).toBe("Preview");
    unsubscribe();
  });

  it("exports the complete local document through the shared backup contract", async () => {
    const client = createWorkspaceClient({
      browserStorage: new FakeBrowserStorage(),
      context: createPlatformContext(),
    });
    const backup = await client.exportBackup();
    expect(backup).toMatchObject({
      format: "hoby-workspace",
      version: 1,
      workspace: { schemaVersion: 1 },
    });
  });

  it("degrades Chrome-only capabilities explicitly", async () => {
    const client = createWorkspaceClient({
      browserStorage: new FakeBrowserStorage(),
      context: createPlatformContext(),
    });
    await expect(
      client.captureTabs({ collectionId: "anything" }),
    ).rejects.toBeInstanceOf(PlatformError);
    await expect(client.listOpenTabs()).resolves.toEqual([]);
    await expect(client.closeOpenTabs([1, 2])).resolves.toEqual({
      closedTabIds: [],
      failedTabIds: [1, 2],
    });
  });
});
