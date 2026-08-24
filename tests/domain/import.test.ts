import {
  DomainError,
  applyWorkspaceCommand,
  createWorkspaceBackup,
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
} from "../../src/domain";
import { createTestWorkspace } from "./fixtures";

describe("workspace import and export", () => {
  it("round-trips a versioned backup", () => {
    const { workspace } = createTestWorkspace();
    const backup = createWorkspaceBackup(workspace, "2026-08-24T12:00:00.000Z");
    expect(parseWorkspaceBackup(serializeWorkspaceBackup(backup))).toEqual(backup);
  });

  it("rejects malformed JSON, unsupported envelopes, and invalid workspaces", () => {
    expect(() => parseWorkspaceBackup("{")).toThrow(
      expect.objectContaining({ code: "IMPORT_INVALID" }),
    );
    expect(() =>
      parseWorkspaceBackup({
        format: "hoby-workspace",
        version: 99,
        exportedAt: "2026-08-24T00:00:00.000Z",
        workspace: {},
      }),
    ).toThrow(expect.objectContaining({ code: "IMPORT_UNSUPPORTED" }));
    expect(() =>
      parseWorkspaceBackup({
        format: "hoby-workspace",
        version: 1,
        exportedAt: "2026-08-24T00:00:00.000Z",
        workspace: { schemaVersion: 1 },
      }),
    ).toThrow(DomainError);
  });

  it("merges imported spaces with remapped globally unique IDs", () => {
    const current = createTestWorkspace();
    const source = createTestWorkspace();
    const backup = createWorkspaceBackup(source.workspace);
    const result = applyWorkspaceCommand(
      current.workspace,
      { type: "workspace.import", backup, mode: "merge" },
      current.context,
    );
    expect(result.workspace.spaces).toHaveLength(2);
    const ids = result.workspace.spaces.flatMap((space) => [
      space.id,
      ...space.collections.flatMap((collection) => [
        collection.id,
        ...collection.tabs.map((tab) => tab.id),
      ]),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.meta).toMatchObject({ kind: "import", summary: { mode: "merge", spaces: 1 } });
  });

  it("replaces data while retaining a monotonic local revision", () => {
    const current = createTestWorkspace();
    const source = createTestWorkspace();
    const backup = createWorkspaceBackup({ ...source.workspace, revision: 100 });
    const result = applyWorkspaceCommand(
      current.workspace,
      { type: "workspace.import", backup, mode: "replace" },
      current.context,
    );
    expect(result.workspace.revision).toBe(current.workspace.revision + 1);
    expect(result.workspace.spaces).toEqual(source.workspace.spaces);
  });
});
