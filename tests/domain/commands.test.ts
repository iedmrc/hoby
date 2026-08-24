import {
  DomainError,
  type WorkspaceCommand,
  type WorkspaceDocument,
  applyWorkspaceCommand,
  cloneWorkspace,
} from "../../src/domain";
import { createTestWorkspace } from "./fixtures";

function apply(
  workspace: WorkspaceDocument,
  command: WorkspaceCommand,
  context: ReturnType<typeof createTestWorkspace>["context"],
) {
  return applyWorkspaceCommand(workspace, command, context);
}

describe("workspace commands", () => {
  it("supports space CRUD, selection, and reorder while retaining one space", () => {
    const { context, workspace: starter } = createTestWorkspace();
    const created = apply(starter, { type: "space.create", name: " Work " }, context);
    expect(created.changed).toBe(true);
    expect(created.workspace.spaces.map((space) => space.name)).toEqual(["My space", "Work"]);
    expect(created.workspace.activeSpaceId).toBe(created.workspace.spaces[1].id);

    const workId = created.workspace.activeSpaceId;
    const renamed = apply(
      created.workspace,
      { type: "space.rename", spaceId: workId, name: "Clients" },
      context,
    );
    const reordered = apply(
      renamed.workspace,
      { type: "space.reorder", spaceId: workId, index: 0 },
      context,
    );
    expect(reordered.workspace.spaces[0].name).toBe("Clients");

    const deleted = apply(
      reordered.workspace,
      { type: "space.delete", spaceId: workId },
      context,
    );
    expect(deleted.workspace.spaces).toHaveLength(1);
    expect(deleted.workspace.activeSpaceId).toBe(deleted.workspace.spaces[0].id);
    expect(() =>
      apply(
        deleted.workspace,
        { type: "space.delete", spaceId: deleted.workspace.activeSpaceId },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: "LAST_SPACE" }));
  });

  it("supports collection CRUD, reorder, and cross-space move", () => {
    const { context, workspace: starter } = createTestWorkspace();
    const firstSpaceId = starter.activeSpaceId;
    const secondSpace = apply(starter, { type: "space.create", name: "Second" }, context);
    const secondSpaceId = secondSpace.workspace.activeSpaceId;
    const created = apply(
      secondSpace.workspace,
      { type: "collection.create", spaceId: firstSpaceId, name: "Research", color: "sky" },
      context,
    );
    const collectionId = created.meta.kind === "created" ? created.meta.id : "";
    const updated = apply(
      created.workspace,
      {
        type: "collection.update",
        collectionId,
        changes: { name: "Reading", color: "mint", collapsed: true },
      },
      context,
    );
    const reordered = apply(
      updated.workspace,
      { type: "collection.reorder", collectionId, index: 0 },
      context,
    );
    const moved = apply(
      reordered.workspace,
      { type: "collection.move", collectionId, toSpaceId: secondSpaceId, index: 0 },
      context,
    );
    const destination = moved.workspace.spaces.find((space) => space.id === secondSpaceId);
    expect(destination?.collections[0]).toMatchObject({
      id: collectionId,
      name: "Reading",
      color: "mint",
      collapsed: true,
    });

    const deleted = apply(
      moved.workspace,
      { type: "collection.delete", collectionId },
      context,
    );
    expect(
      deleted.workspace.spaces.flatMap((space) => space.collections).some(
        (collection) => collection.id === collectionId,
      ),
    ).toBe(false);
  });

  it("normalizes and deduplicates batch additions while reporting invalid inputs", () => {
    const { context, workspace } = createTestWorkspace();
    const collectionId = workspace.spaces[0].collections[0].id;
    const result = apply(
      workspace,
      {
        type: "savedTab.addMany",
        collectionId,
        tabs: [
          { sourceId: "1", title: "Example", url: "example.com" },
          { sourceId: "2", title: "Duplicate", url: "https://EXAMPLE.com/" },
          { sourceId: "3", title: "Internal", url: "chrome://settings" },
        ],
      },
      context,
    );
    expect(result.workspace.spaces[0].collections[0].tabs).toEqual([
      expect.objectContaining({ title: "Example", url: "https://example.com" }),
    ]);
    expect(result.meta).toMatchObject({
      kind: "savedTabs",
      added: [{ sourceId: "1" }],
      duplicates: [{ sourceId: "2" }],
      rejected: [{ sourceId: "3" }],
    });
  });

  it("supports saved-tab update, reorder, move, and delete with duplicate protection", () => {
    const { context, workspace: starter } = createTestWorkspace();
    const spaceId = starter.activeSpaceId;
    const inboxId = starter.spaces[0].collections[0].id;
    const secondCollection = apply(
      starter,
      { type: "collection.create", spaceId, name: "Later" },
      context,
    );
    const laterId = secondCollection.meta.kind === "created" ? secondCollection.meta.id : "";
    const added = apply(
      secondCollection.workspace,
      {
        type: "savedTab.addMany",
        collectionId: inboxId,
        tabs: [
          { title: "One", url: "https://one.test" },
          { title: "Two", url: "https://two.test" },
        ],
      },
      context,
    );
    const [one, two] = added.workspace.spaces[0].collections[0].tabs;
    const updated = apply(
      added.workspace,
      { type: "savedTab.update", savedTabId: one.id, changes: { title: "First" } },
      context,
    );
    expect(() =>
      apply(
        updated.workspace,
        { type: "savedTab.update", savedTabId: one.id, changes: { url: two.url } },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: "DUPLICATE_URL" }));

    const reordered = apply(
      updated.workspace,
      { type: "savedTab.reorder", savedTabId: two.id, index: 0 },
      context,
    );
    expect(reordered.workspace.spaces[0].collections[0].tabs[0].id).toBe(two.id);
    const moved = apply(
      reordered.workspace,
      { type: "savedTab.move", savedTabId: one.id, toCollectionId: laterId, index: 0 },
      context,
    );
    expect(
      moved.workspace.spaces[0].collections.find((item) => item.id === laterId)?.tabs[0].id,
    ).toBe(one.id);
    const deleted = apply(
      moved.workspace,
      { type: "savedTab.delete", savedTabId: one.id },
      context,
    );
    expect(
      deleted.workspace.spaces.flatMap((space) =>
        space.collections.flatMap((collection) => collection.tabs),
      ),
    ).not.toContainEqual(expect.objectContaining({ id: one.id }));
  });

  it("dedupes a recoverable pre-invariant collection and keeps the first occurrence", () => {
    const { context, workspace } = createTestWorkspace();
    const collection = workspace.spaces[0].collections[0];
    const corrupt = cloneWorkspace(workspace);
    corrupt.spaces[0].collections[0].tabs = [
      {
        id: "tab-a",
        title: "A",
        url: "https://example.com",
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      },
      {
        id: "tab-b",
        title: "B",
        url: "https://example.com",
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      },
    ];
    const result = apply(
      corrupt,
      { type: "savedTab.dedupe", collectionId: collection.id },
      context,
    );
    expect(result.workspace.spaces[0].collections[0].tabs.map((tab) => tab.id)).toEqual([
      "tab-a",
    ]);
    expect(result.meta).toEqual({ kind: "dedupe", removedSavedTabIds: ["tab-b"] });
  });

  it("does not bump revisions for no-op commands and never mutates the input", () => {
    const { context, workspace } = createTestWorkspace();
    const snapshot = JSON.stringify(workspace);
    const result = apply(
      workspace,
      { type: "space.rename", spaceId: workspace.activeSpaceId, name: "My space" },
      context,
    );
    expect(result.changed).toBe(false);
    expect(result.workspace).toBe(workspace);
    expect(JSON.stringify(workspace)).toBe(snapshot);
  });

  it("rejects missing entities and invalid names with stable error codes", () => {
    const { context, workspace } = createTestWorkspace();
    expect(() =>
      apply(workspace, { type: "space.rename", spaceId: "missing", name: "X" }, context),
    ).toThrow(expect.objectContaining({ code: "SPACE_NOT_FOUND" }));
    expect(() =>
      apply(
        workspace,
        { type: "space.rename", spaceId: workspace.activeSpaceId, name: " " },
        context,
      ),
    ).toThrow(DomainError);
  });
});
