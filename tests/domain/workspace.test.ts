import {
  DomainError,
  WORKSPACE_SCHEMA_VERSION,
  cloneWorkspace,
  createStarterWorkspace,
  migrateWorkspaceDocument,
  parseWorkspaceDocument,
} from "../../src/domain";
import { createTestContext } from "./fixtures";

describe("workspace document", () => {
  it("creates a small, valid starter state", () => {
    const workspace = createStarterWorkspace(createTestContext());
    expect(workspace).toMatchObject({
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      revision: 0,
      activeSpaceId: workspace.spaces[0].id,
    });
    expect(workspace.spaces).toHaveLength(1);
    expect(workspace.spaces[0].collections[0]).toMatchObject({
      name: "Inbox",
      color: "stone",
      collapsed: false,
      tabs: [],
    });
  });

  it("rejects duplicate IDs, missing active spaces, and duplicate collection URLs", () => {
    const workspace = createStarterWorkspace(createTestContext());
    const collection = workspace.spaces[0].collections[0];
    const invalid = {
      ...workspace,
      activeSpaceId: "missing",
      spaces: [
        {
          ...workspace.spaces[0],
          collections: [
            {
              ...collection,
              tabs: [
                {
                  id: workspace.spaces[0].id,
                  title: "A",
                  url: "https://example.com",
                  createdAt: workspace.createdAt,
                  updatedAt: workspace.updatedAt,
                },
                {
                  id: "another-id",
                  title: "B",
                  url: "https://example.com",
                  createdAt: workspace.createdAt,
                  updatedAt: workspace.updatedAt,
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() => parseWorkspaceDocument(invalid)).toThrow(DomainError);
  });

  it("migrates schema version zero with safe collection and tab defaults", () => {
    const workspace = createStarterWorkspace(createTestContext());
    const tab = {
      id: "legacy-tab",
      title: "Legacy",
      url: "https://example.com",
      createdAt: workspace.createdAt,
    };
    const legacy = {
      schemaVersion: 0,
      revision: 4,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      activeSpaceId: workspace.activeSpaceId,
      spaces: workspace.spaces.map((space) => ({
        id: space.id,
        name: space.name,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt,
        collections: space.collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          createdAt: collection.createdAt,
          updatedAt: collection.updatedAt,
          tabs: [tab],
        })),
      })),
    };

    expect(migrateWorkspaceDocument(legacy).spaces[0].collections[0]).toMatchObject({
      color: "stone",
      collapsed: false,
      tabs: [{ ...tab, updatedAt: tab.createdAt }],
    });
  });

  it("does not overwrite an unsupported future version", () => {
    expect(() => migrateWorkspaceDocument({ schemaVersion: 99 })).toThrow(
      expect.objectContaining({ code: "WORKSPACE_UNSUPPORTED" }),
    );
  });

  it("deep-clones mutable workspace arrays", () => {
    const workspace = createStarterWorkspace(createTestContext());
    const copy = cloneWorkspace(workspace);
    copy.spaces[0].collections[0].name = "Changed";
    expect(workspace.spaces[0].collections[0].name).toBe("Inbox");
  });
});
