import { DomainError } from "./errors";
import { type ImportSummary, importWorkspace } from "./import";
import { defaultTitleForUrl, normalizeUrl } from "./url";
import {
  type Collection,
  type CollectionColor,
  type DomainContext,
  type SavedTab,
  type Space,
  type WorkspaceDocument,
  cloneWorkspace,
  defaultDomainContext,
  parseWorkspaceDocument,
} from "./workspace";

export interface SavedTabInput {
  readonly sourceId?: string;
  readonly title?: string;
  readonly url: string;
}

export type WorkspaceCommand =
  | { readonly type: "space.create"; readonly name: string }
  | { readonly type: "space.rename"; readonly spaceId: string; readonly name: string }
  | { readonly type: "space.select"; readonly spaceId: string }
  | { readonly type: "space.reorder"; readonly spaceId: string; readonly index: number }
  | { readonly type: "space.delete"; readonly spaceId: string }
  | {
      readonly type: "collection.create";
      readonly spaceId: string;
      readonly name: string;
      readonly color?: CollectionColor;
    }
  | {
      readonly type: "collection.update";
      readonly collectionId: string;
      readonly changes: Readonly<{
        name?: string;
        color?: CollectionColor;
        collapsed?: boolean;
      }>;
    }
  | {
      readonly type: "collection.reorder";
      readonly collectionId: string;
      readonly index: number;
    }
  | {
      readonly type: "collection.move";
      readonly collectionId: string;
      readonly toSpaceId: string;
      readonly index: number;
    }
  | { readonly type: "collection.delete"; readonly collectionId: string }
  | {
      readonly type: "savedTab.add";
      readonly collectionId: string;
      readonly tab: SavedTabInput;
    }
  | {
      readonly type: "savedTab.addMany";
      readonly collectionId: string;
      readonly tabs: readonly SavedTabInput[];
    }
  | {
      readonly type: "savedTab.update";
      readonly savedTabId: string;
      readonly changes: Readonly<{ title?: string; url?: string }>;
    }
  | { readonly type: "savedTab.delete"; readonly savedTabId: string }
  | {
      readonly type: "savedTab.reorder";
      readonly savedTabId: string;
      readonly index: number;
    }
  | {
      readonly type: "savedTab.move";
      readonly savedTabId: string;
      readonly toCollectionId: string;
      readonly index: number;
    }
  | { readonly type: "savedTab.dedupe"; readonly collectionId?: string }
  | {
      readonly type: "workspace.import";
      readonly backup: unknown;
      readonly mode: "merge" | "replace";
    };

export interface AddedSavedTab {
  readonly sourceId?: string;
  readonly savedTabId: string;
  readonly url: string;
}

export interface DuplicateSavedTab {
  readonly sourceId?: string;
  readonly existingSavedTabId: string;
  readonly url: string;
}

export interface RejectedSavedTab {
  readonly sourceId?: string;
  readonly reason: string;
  readonly url: string;
}

export type WorkspaceCommandMeta =
  | { readonly kind: "none" }
  | { readonly kind: "created"; readonly id: string }
  | {
      readonly kind: "savedTabs";
      readonly added: readonly AddedSavedTab[];
      readonly duplicates: readonly DuplicateSavedTab[];
      readonly rejected: readonly RejectedSavedTab[];
    }
  | { readonly kind: "dedupe"; readonly removedSavedTabIds: readonly string[] }
  | { readonly kind: "import"; readonly summary: ImportSummary };

export interface WorkspaceCommandResult {
  readonly workspace: WorkspaceDocument;
  readonly changed: boolean;
  readonly meta: WorkspaceCommandMeta;
}

interface CollectionLocation {
  readonly spaceIndex: number;
  readonly collectionIndex: number;
  readonly space: Space;
  readonly collection: Collection;
}

interface SavedTabLocation extends CollectionLocation {
  readonly tabIndex: number;
  readonly tab: SavedTab;
}

function cleanName(name: string): string {
  const cleaned = name.trim();
  if (!cleaned || cleaned.length > 80) {
    throw new DomainError("INVALID_NAME", "Names must contain between 1 and 80 characters.");
  }
  return cleaned;
}

function cleanTitle(title: string | undefined, url: string): string {
  const cleaned = title?.trim();
  return (cleaned || defaultTitleForUrl(url)).slice(0, 512);
}

function boundedIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(Math.trunc(index), length));
}

function findSpace(workspace: WorkspaceDocument, spaceId: string): [Space, number] {
  const index = workspace.spaces.findIndex((space) => space.id === spaceId);
  if (index < 0) {
    throw new DomainError("SPACE_NOT_FOUND", "The requested space does not exist.", {
      spaceId,
    });
  }
  return [workspace.spaces[index], index];
}

function findCollection(
  workspace: WorkspaceDocument,
  collectionId: string,
): CollectionLocation {
  for (const [spaceIndex, space] of workspace.spaces.entries()) {
    const collectionIndex = space.collections.findIndex(
      (collection) => collection.id === collectionId,
    );
    if (collectionIndex >= 0) {
      return {
        spaceIndex,
        collectionIndex,
        space,
        collection: space.collections[collectionIndex],
      };
    }
  }
  throw new DomainError("COLLECTION_NOT_FOUND", "The requested collection does not exist.", {
    collectionId,
  });
}

function findSavedTab(workspace: WorkspaceDocument, savedTabId: string): SavedTabLocation {
  for (const [spaceIndex, space] of workspace.spaces.entries()) {
    for (const [collectionIndex, collection] of space.collections.entries()) {
      const tabIndex = collection.tabs.findIndex((tab) => tab.id === savedTabId);
      if (tabIndex >= 0) {
        return {
          spaceIndex,
          collectionIndex,
          tabIndex,
          space,
          collection,
          tab: collection.tabs[tabIndex],
        };
      }
    }
  }
  throw new DomainError("SAVED_TAB_NOT_FOUND", "The requested saved tab does not exist.", {
    savedTabId,
  });
}

function collectIds(workspace: WorkspaceDocument): Set<string> {
  const ids = new Set<string>();
  for (const space of workspace.spaces) {
    ids.add(space.id);
    for (const collection of space.collections) {
      ids.add(collection.id);
      for (const tab of collection.tabs) ids.add(tab.id);
    }
  }
  return ids;
}

function createUniqueId(workspace: WorkspaceDocument, context: DomainContext): string {
  const ids = collectIds(workspace);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const id = context.createId();
    if (!ids.has(id)) return id;
  }
  throw new DomainError("INVALID_COMMAND", "Could not allocate a unique ID.");
}

function finish(
  original: WorkspaceDocument,
  draft: WorkspaceDocument,
  now: string,
  changed: boolean,
  meta: WorkspaceCommandMeta = { kind: "none" },
): WorkspaceCommandResult {
  if (!changed) return { workspace: original, changed: false, meta };
  return {
    workspace: parseWorkspaceDocument({
      ...draft,
      revision: original.revision + 1,
      updatedAt: now,
    }),
    changed: true,
    meta,
  };
}

function touchCollection(
  draft: WorkspaceDocument,
  location: Pick<CollectionLocation, "spaceIndex" | "collectionIndex">,
  now: string,
): void {
  draft.spaces[location.spaceIndex].updatedAt = now;
  draft.spaces[location.spaceIndex].collections[location.collectionIndex].updatedAt = now;
}

function addSavedTabs(
  workspace: WorkspaceDocument,
  collectionId: string,
  inputs: readonly SavedTabInput[],
  context: DomainContext,
): WorkspaceCommandResult {
  const location = findCollection(workspace, collectionId);
  const now = context.now();
  const draft = cloneWorkspace(workspace);
  const target = draft.spaces[location.spaceIndex].collections[location.collectionIndex];
  const existingByUrl = new Map(target.tabs.map((tab) => [tab.url, tab.id]));
  const usedIds = collectIds(workspace);
  const added: AddedSavedTab[] = [];
  const duplicates: DuplicateSavedTab[] = [];
  const rejected: RejectedSavedTab[] = [];

  for (const input of inputs) {
    let normalized: ReturnType<typeof normalizeUrl>;
    try {
      normalized = normalizeUrl(input.url);
    } catch (error) {
      rejected.push({
        sourceId: input.sourceId,
        reason: error instanceof Error ? error.message : "Invalid URL.",
        url: input.url,
      });
      continue;
    }

    const duplicateId = existingByUrl.get(normalized.href);
    if (duplicateId) {
      duplicates.push({
        sourceId: input.sourceId,
        existingSavedTabId: duplicateId,
        url: normalized.href,
      });
      continue;
    }

    let id = "";
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const candidate = context.createId();
      if (!usedIds.has(candidate)) {
        id = candidate;
        usedIds.add(candidate);
        break;
      }
    }
    if (!id) throw new DomainError("INVALID_COMMAND", "Could not allocate a unique tab ID.");

    target.tabs.push({
      id,
      title: cleanTitle(input.title, normalized.href),
      url: normalized.href,
      createdAt: now,
      updatedAt: now,
    });
    existingByUrl.set(normalized.href, id);
    added.push({ sourceId: input.sourceId, savedTabId: id, url: normalized.href });
  }

  if (added.length > 0) touchCollection(draft, location, now);
  return finish(workspace, draft, now, added.length > 0, {
    kind: "savedTabs",
    added,
    duplicates,
    rejected,
  });
}

export function applyWorkspaceCommand(
  workspace: WorkspaceDocument,
  command: WorkspaceCommand,
  context: DomainContext = defaultDomainContext,
): WorkspaceCommandResult {
  const now = context.now();

  switch (command.type) {
    case "space.create": {
      const id = createUniqueId(workspace, context);
      const draft = cloneWorkspace(workspace);
      draft.spaces.push({
        id,
        name: cleanName(command.name),
        createdAt: now,
        updatedAt: now,
        collections: [],
      });
      draft.activeSpaceId = id;
      return finish(workspace, draft, now, true, { kind: "created", id });
    }
    case "space.rename": {
      const [space, index] = findSpace(workspace, command.spaceId);
      const name = cleanName(command.name);
      if (space.name === name) return finish(workspace, workspace, now, false);
      const draft = cloneWorkspace(workspace);
      draft.spaces[index].name = name;
      draft.spaces[index].updatedAt = now;
      return finish(workspace, draft, now, true);
    }
    case "space.select": {
      findSpace(workspace, command.spaceId);
      if (workspace.activeSpaceId === command.spaceId) {
        return finish(workspace, workspace, now, false);
      }
      const draft = cloneWorkspace(workspace);
      draft.activeSpaceId = command.spaceId;
      return finish(workspace, draft, now, true);
    }
    case "space.reorder": {
      const [, fromIndex] = findSpace(workspace, command.spaceId);
      const toIndex = boundedIndex(command.index, workspace.spaces.length - 1);
      if (fromIndex === toIndex) return finish(workspace, workspace, now, false);
      const draft = cloneWorkspace(workspace);
      const [space] = draft.spaces.splice(fromIndex, 1);
      draft.spaces.splice(toIndex, 0, space);
      return finish(workspace, draft, now, true);
    }
    case "space.delete": {
      const [, index] = findSpace(workspace, command.spaceId);
      if (workspace.spaces.length === 1) {
        throw new DomainError("LAST_SPACE", "The final space cannot be deleted.");
      }
      const draft = cloneWorkspace(workspace);
      draft.spaces.splice(index, 1);
      if (draft.activeSpaceId === command.spaceId) {
        draft.activeSpaceId = draft.spaces[Math.min(index, draft.spaces.length - 1)].id;
      }
      return finish(workspace, draft, now, true);
    }
    case "collection.create": {
      const [, spaceIndex] = findSpace(workspace, command.spaceId);
      const id = createUniqueId(workspace, context);
      const draft = cloneWorkspace(workspace);
      draft.spaces[spaceIndex].collections.push({
        id,
        name: cleanName(command.name),
        color: command.color ?? "stone",
        collapsed: false,
        createdAt: now,
        updatedAt: now,
        tabs: [],
      });
      draft.spaces[spaceIndex].updatedAt = now;
      return finish(workspace, draft, now, true, { kind: "created", id });
    }
    case "collection.update": {
      const location = findCollection(workspace, command.collectionId);
      const name = command.changes.name === undefined
        ? location.collection.name
        : cleanName(command.changes.name);
      const color = command.changes.color ?? location.collection.color;
      const collapsed = command.changes.collapsed ?? location.collection.collapsed;
      if (
        name === location.collection.name &&
        color === location.collection.color &&
        collapsed === location.collection.collapsed
      ) {
        return finish(workspace, workspace, now, false);
      }
      const draft = cloneWorkspace(workspace);
      const target = draft.spaces[location.spaceIndex].collections[location.collectionIndex];
      target.name = name;
      target.color = color;
      target.collapsed = collapsed;
      touchCollection(draft, location, now);
      return finish(workspace, draft, now, true);
    }
    case "collection.reorder": {
      const location = findCollection(workspace, command.collectionId);
      const collections = workspace.spaces[location.spaceIndex].collections;
      const toIndex = boundedIndex(command.index, collections.length - 1);
      if (location.collectionIndex === toIndex) {
        return finish(workspace, workspace, now, false);
      }
      const draft = cloneWorkspace(workspace);
      const target = draft.spaces[location.spaceIndex];
      const [collection] = target.collections.splice(location.collectionIndex, 1);
      target.collections.splice(toIndex, 0, collection);
      target.updatedAt = now;
      return finish(workspace, draft, now, true);
    }
    case "collection.move": {
      const from = findCollection(workspace, command.collectionId);
      const [, toSpaceIndex] = findSpace(workspace, command.toSpaceId);
      if (from.space.id === command.toSpaceId) {
        return applyWorkspaceCommand(
          workspace,
          { type: "collection.reorder", collectionId: command.collectionId, index: command.index },
          context,
        );
      }
      const draft = cloneWorkspace(workspace);
      const [collection] = draft.spaces[from.spaceIndex].collections.splice(
        from.collectionIndex,
        1,
      );
      const destination = draft.spaces[toSpaceIndex];
      destination.collections.splice(
        boundedIndex(command.index, destination.collections.length),
        0,
        { ...collection, updatedAt: now },
      );
      draft.spaces[from.spaceIndex].updatedAt = now;
      destination.updatedAt = now;
      return finish(workspace, draft, now, true);
    }
    case "collection.delete": {
      const location = findCollection(workspace, command.collectionId);
      const draft = cloneWorkspace(workspace);
      draft.spaces[location.spaceIndex].collections.splice(location.collectionIndex, 1);
      draft.spaces[location.spaceIndex].updatedAt = now;
      return finish(workspace, draft, now, true);
    }
    case "savedTab.add":
      return addSavedTabs(workspace, command.collectionId, [command.tab], context);
    case "savedTab.addMany":
      return addSavedTabs(workspace, command.collectionId, command.tabs, context);
    case "savedTab.update": {
      const location = findSavedTab(workspace, command.savedTabId);
      const url = command.changes.url === undefined
        ? location.tab.url
        : normalizeUrl(command.changes.url).href;
      const title = command.changes.title === undefined
        ? location.tab.title
        : cleanTitle(command.changes.title, url);
      if (url !== location.tab.url) {
        const duplicate = location.collection.tabs.find(
          (tab) => tab.id !== location.tab.id && tab.url === url,
        );
        if (duplicate) {
          throw new DomainError("DUPLICATE_URL", "This URL is already in the collection.", {
            existingSavedTabId: duplicate.id,
            url,
          });
        }
      }
      if (url === location.tab.url && title === location.tab.title) {
        return finish(workspace, workspace, now, false);
      }
      const draft = cloneWorkspace(workspace);
      const tab = draft.spaces[location.spaceIndex].collections[location.collectionIndex].tabs[
        location.tabIndex
      ];
      tab.url = url;
      tab.title = title;
      tab.updatedAt = now;
      touchCollection(draft, location, now);
      return finish(workspace, draft, now, true);
    }
    case "savedTab.delete": {
      const location = findSavedTab(workspace, command.savedTabId);
      const draft = cloneWorkspace(workspace);
      draft.spaces[location.spaceIndex].collections[location.collectionIndex].tabs.splice(
        location.tabIndex,
        1,
      );
      touchCollection(draft, location, now);
      return finish(workspace, draft, now, true);
    }
    case "savedTab.reorder": {
      const location = findSavedTab(workspace, command.savedTabId);
      const toIndex = boundedIndex(command.index, location.collection.tabs.length - 1);
      if (location.tabIndex === toIndex) return finish(workspace, workspace, now, false);
      const draft = cloneWorkspace(workspace);
      const collection = draft.spaces[location.spaceIndex].collections[location.collectionIndex];
      const [tab] = collection.tabs.splice(location.tabIndex, 1);
      collection.tabs.splice(toIndex, 0, tab);
      touchCollection(draft, location, now);
      return finish(workspace, draft, now, true);
    }
    case "savedTab.move": {
      const from = findSavedTab(workspace, command.savedTabId);
      const to = findCollection(workspace, command.toCollectionId);
      if (from.collection.id === to.collection.id) {
        return applyWorkspaceCommand(
          workspace,
          { type: "savedTab.reorder", savedTabId: command.savedTabId, index: command.index },
          context,
        );
      }
      const duplicate = to.collection.tabs.find((tab) => tab.url === from.tab.url);
      if (duplicate) {
        throw new DomainError("DUPLICATE_URL", "This URL is already in the destination.", {
          existingSavedTabId: duplicate.id,
          url: duplicate.url,
        });
      }
      const draft = cloneWorkspace(workspace);
      const [tab] = draft.spaces[from.spaceIndex].collections[from.collectionIndex].tabs.splice(
        from.tabIndex,
        1,
      );
      const destination = draft.spaces[to.spaceIndex].collections[to.collectionIndex];
      destination.tabs.splice(boundedIndex(command.index, destination.tabs.length), 0, {
        ...tab,
        updatedAt: now,
      });
      touchCollection(draft, from, now);
      touchCollection(draft, to, now);
      return finish(workspace, draft, now, true);
    }
    case "savedTab.dedupe": {
      if (command.collectionId) findCollection(workspace, command.collectionId);
      const draft = cloneWorkspace(workspace);
      const removedSavedTabIds: string[] = [];
      let normalizedUrlChanged = false;
      for (const [spaceIndex, space] of draft.spaces.entries()) {
        for (const [collectionIndex, collection] of space.collections.entries()) {
          if (command.collectionId && collection.id !== command.collectionId) continue;
          const seen = new Set<string>();
          const tabs = collection.tabs.filter((tab) => {
            const normalized = normalizeUrl(tab.url).href;
            if (seen.has(normalized)) {
              removedSavedTabIds.push(tab.id);
              return false;
            }
            seen.add(normalized);
            if (tab.url !== normalized) normalizedUrlChanged = true;
            tab.url = normalized;
            return true;
          });
          if (tabs.length !== collection.tabs.length || normalizedUrlChanged) {
            collection.tabs = tabs;
            touchCollection(draft, { spaceIndex, collectionIndex }, now);
          }
        }
      }
      return finish(
        workspace,
        draft,
        now,
        removedSavedTabIds.length > 0 || normalizedUrlChanged,
        {
        kind: "dedupe",
        removedSavedTabIds,
        },
      );
    }
    case "workspace.import": {
      const imported = importWorkspace(workspace, command.backup, command.mode, context);
      return {
        workspace: imported.workspace,
        changed: true,
        meta: { kind: "import", summary: imported.summary },
      };
    }
    default: {
      const exhaustive: never = command;
      throw new DomainError("INVALID_COMMAND", "Unknown workspace command.", {
        command: exhaustive,
      });
    }
  }
}
