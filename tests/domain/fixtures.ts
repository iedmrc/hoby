import {
  type DomainContext,
  type WorkspaceDocument,
  createStarterWorkspace,
} from "../../src/domain";

export function createTestContext(start = 0): DomainContext & { readonly issued: () => number } {
  let sequence = start;
  return {
    createId: () => `id-${++sequence}`,
    now: () => `2026-08-24T00:00:${String(sequence % 60).padStart(2, "0")}.000Z`,
    issued: () => sequence,
  };
}

export function createTestWorkspace(): {
  readonly context: DomainContext & { readonly issued: () => number };
  readonly workspace: WorkspaceDocument;
} {
  const context = createTestContext();
  return { context, workspace: createStarterWorkspace(context) };
}
