import { useEffect, useMemo, useRef, useState } from "react";
import {
  CollectionColorSchema,
  createWorkspaceBackup,
  type Collection,
  type CollectionColor,
  type SavedTab,
  type Space,
  type WorkspaceCommand,
  type WorkspaceDocument,
} from "../domain";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Toast } from "../ui/Toast";
import { CollectionCard } from "./CollectionCard";
import { OpenTabsPanel } from "./OpenTabsPanel";
import { Sidebar } from "./Sidebar";
import type { BrowserTab, WorkspaceActions } from "./types";
import "../styles/base.css";
import "../styles/newtab.css";

interface NewTabAppProps {
  actions: WorkspaceActions;
  allowFavicons: boolean;
  busy: boolean;
  error?: string | null;
  hasTabAccess: boolean;
  openTabs: readonly BrowserTab[];
  workspace: WorkspaceDocument;
}

type EditorState =
  | { kind: "space-create" }
  | { kind: "space-edit"; space: Space }
  | { kind: "collection-create"; spaceId: string }
  | { kind: "collection-edit"; collection: Collection }
  | { kind: "url-add"; collection: Collection };

type DeleteTarget =
  | { kind: "space"; item: Space }
  | { kind: "collection"; item: Collection }
  | { kind: "saved-tab"; item: SavedTab };

interface ToastState {
  message: string;
  undo?: () => void;
}

const collectionColors = CollectionColorSchema.options;

function includesQuery(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query);
}

function formatSessionName() {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date());
}

function findCollection(workspace: WorkspaceDocument, collectionId: string) {
  for (const [spaceIndex, space] of workspace.spaces.entries()) {
    const collectionIndex = space.collections.findIndex((collection) => collection.id === collectionId);
    if (collectionIndex >= 0) return { collectionIndex, space, spaceIndex };
  }
  return null;
}

function findSavedTab(workspace: WorkspaceDocument, savedTabId: string) {
  for (const space of workspace.spaces) {
    for (const collection of space.collections) {
      if (collection.tabs.some((tab) => tab.id === savedTabId)) return collection;
    }
  }
  return null;
}

export function NewTabApp({
  actions,
  allowFavicons,
  busy,
  error,
  hasTabAccess,
  openTabs,
  workspace,
}: NewTabAppProps) {
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorColor, setEditorColor] = useState<CollectionColor>("stone");
  const [editorName, setEditorName] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorUrl, setEditorUrl] = useState("");
  const [query, setQuery] = useState("");
  const [saveSessionOpen, setSaveSessionOpen] = useState(false);
  const [sessionClose, setSessionClose] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabsDrawerOpen, setTabsDrawerOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const activeSpace = workspace.spaces.find((space) => space.id === workspace.activeSpaceId)
    ?? workspace.spaces[0];
  const collectionOptions = useMemo(
    () => workspace.spaces.flatMap((space) =>
      space.collections.map((collection) => ({
        id: collection.id,
        label: `${space.name} / ${collection.name}`,
      })),
    ),
    [workspace.spaces],
  );

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleCollections = useMemo(() => {
    if (!normalizedQuery) {
      return activeSpace.collections.map((collection) => ({ collection, space: activeSpace, tabs: collection.tabs }));
    }
    return workspace.spaces.flatMap((space) => space.collections.flatMap((collection) => {
      const collectionMatch = includesQuery(collection.name, normalizedQuery)
        || includesQuery(space.name, normalizedQuery);
      const tabs = collectionMatch
        ? collection.tabs
        : collection.tabs.filter((tab) =>
          includesQuery(tab.title, normalizedQuery)
          || includesQuery(tab.url, normalizedQuery),
        );
      return collectionMatch || tabs.length > 0 ? [{ collection, space, tabs }] : [];
    }));
  }, [activeSpace, normalizedQuery, workspace.spaces]);

  useEffect(() => {
    performance.mark("hoby:interactive");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (!typing && event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (!typing && event.key.toLocaleLowerCase() === "n") {
        setEditorName("");
        setEditorColor("stone");
        setEditor({ kind: "collection-create", spaceId: activeSpace.id });
      } else if (event.key === "Escape" && normalizedQuery) {
        setQuery("");
      } else if (event.key === "Escape") {
        setTabsDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSpace.id, normalizedQuery]);

  const run = async (task: () => Promise<unknown>, success?: string) => {
    try {
      await task();
      if (success) setToast({ message: success });
    } catch (caught) {
      setToast({ message: caught instanceof Error ? caught.message : "Something went wrong." });
    }
  };

  const dispatch = (command: WorkspaceCommand, success?: string) =>
    run(() => actions.dispatch(command), success);

  const importWorkspace = async (file: File) => {
    try {
      const result = await actions.importWorkspace(file, "merge");
      setSettingsOpen(false);
      if (result.meta.kind !== "import") {
        setToast({ message: "Import completed" });
        return;
      }
      const { collections, savedTabs, skippedItems, source } = result.meta.summary;
      const sourceName = source === "toby" ? "Toby" : "Hoby";
      const skipped = skippedItems > 0 ? ` Skipped ${skippedItems} unsupported items.` : "";
      setToast({
        message: `Imported ${collections} collections and ${savedTabs} links from ${sourceName}.${skipped}`,
      });
    } catch (caught) {
      setToast({ message: caught instanceof Error ? caught.message : "Could not import data." });
    }
  };

  const openEditor = (next: EditorState) => {
    setEditor(next);
    setEditorUrl("");
    setEditorTitle("");
    if (next.kind === "space-edit") setEditorName(next.space.name);
    else if (next.kind === "collection-edit") {
      setEditorName(next.collection.name);
      setEditorColor(next.collection.color);
    } else {
      setEditorName("");
      setEditorColor("stone");
    }
  };

  const submitEditor = async () => {
    if (!editor) return;
    let command: WorkspaceCommand;
    let success: string;
    switch (editor.kind) {
      case "space-create":
        command = { type: "space.create", name: editorName };
        success = "Space created";
        break;
      case "space-edit":
        command = { type: "space.rename", spaceId: editor.space.id, name: editorName };
        success = "Space renamed";
        break;
      case "collection-create":
        command = {
          type: "collection.create",
          spaceId: editor.spaceId,
          name: editorName,
          color: editorColor,
        };
        success = "Collection created";
        break;
      case "collection-edit":
        command = {
          type: "collection.update",
          collectionId: editor.collection.id,
          changes: { name: editorName, color: editorColor },
        };
        success = "Collection updated";
        break;
      case "url-add":
        command = {
          type: "savedTab.add",
          collectionId: editor.collection.id,
          tab: { title: editorTitle || undefined, url: editorUrl },
        };
        success = "Link saved";
        break;
    }
    try {
      await actions.dispatch(command);
      setEditor(null);
      setToast({ message: success });
    } catch (caught) {
      setToast({ message: caught instanceof Error ? caught.message : "Could not save changes." });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const backup = createWorkspaceBackup(workspace);
    let command: WorkspaceCommand;
    let label: string;
    if (deleteTarget.kind === "space") {
      command = { type: "space.delete", spaceId: deleteTarget.item.id };
      label = "Space deleted";
    } else if (deleteTarget.kind === "collection") {
      command = { type: "collection.delete", collectionId: deleteTarget.item.id };
      label = "Collection deleted";
    } else {
      command = { type: "savedTab.delete", savedTabId: deleteTarget.item.id };
      label = "Link deleted";
    }
    try {
      await actions.dispatch(command);
      setDeleteTarget(null);
      setToast({
        message: label,
        undo: () => {
          void actions.dispatch({ type: "workspace.import", backup, mode: "replace" });
          setToast({ message: "Restored" });
        },
      });
    } catch (caught) {
      setToast({ message: caught instanceof Error ? caught.message : "Could not delete item." });
    }
  };

  const saveOpenTab = async (collectionId: string, tab: BrowserTab) => {
    try {
      const result = await actions.captureTabs(collectionId, [tab.id]);
      const duplicate = result.meta.kind === "savedTabs" && result.meta.duplicates.length > 0;
      setToast({ message: duplicate ? "Already saved in this collection" : "Tab saved" });
    } catch (caught) {
      setToast({ message: caught instanceof Error ? caught.message : "Could not save tab." });
    }
  };

  const moveSavedTab = (savedTabId: string, collectionId: string, index: number) => {
    const source = findSavedTab(workspace, savedTabId);
    if (!source) return;
    const targetIndex = Math.min(index, workspace.spaces.flatMap((space) => space.collections)
      .find((collection) => collection.id === collectionId)?.tabs.length ?? 0);
    const command: WorkspaceCommand = source.id === collectionId
      ? { type: "savedTab.reorder", savedTabId, index: targetIndex }
      : { type: "savedTab.move", savedTabId, toCollectionId: collectionId, index: targetIndex };
    void dispatch(command, "Link moved");
  };

  const moveCollection = (collection: Collection, direction: -1 | 1) => {
    const location = findCollection(workspace, collection.id);
    if (!location) return;
    void dispatch({
      type: "collection.reorder",
      collectionId: collection.id,
      index: location.collectionIndex + direction,
    });
  };

  const dropCollection = (sourceCollectionId: string, targetCollectionId: string) => {
    const source = findCollection(workspace, sourceCollectionId);
    const target = findCollection(workspace, targetCollectionId);
    if (!source || !target) return;
    const command: WorkspaceCommand = source.space.id === target.space.id
      ? { type: "collection.reorder", collectionId: sourceCollectionId, index: target.collectionIndex }
      : {
        type: "collection.move",
        collectionId: sourceCollectionId,
        toSpaceId: target.space.id,
        index: target.collectionIndex,
      };
    void dispatch(command, "Collection moved");
  };

  const submitSession = async () => {
    const tabs = openTabs.filter((tab) => /^https?:/i.test(tab.url));
    if (tabs.length === 0) return;
    try {
      const created = await actions.dispatch({
        type: "collection.create",
        spaceId: activeSpace.id,
        name: sessionName.trim() || formatSessionName(),
        color: "mint",
      });
      if (created.meta.kind !== "created") throw new Error("Collection was not created.");
      await actions.captureTabs(created.meta.id, tabs.map((tab) => tab.id), sessionClose);
      setSaveSessionOpen(false);
      setToast({ message: `${tabs.length} tabs saved` });
    } catch (caught) {
      setToast({ message: caught instanceof Error ? caught.message : "Could not save this window." });
    }
  };

  const deleteName = !deleteTarget
    ? "item"
    : deleteTarget.kind === "saved-tab"
      ? deleteTarget.item.title
      : deleteTarget.item.name;

  return (
    <div className="app-shell">
      <Sidebar
        activeSpaceId={activeSpace.id}
        onCreateSpace={() => openEditor({ kind: "space-create" })}
        onEditSpace={(space) => openEditor({ kind: "space-edit", space })}
        onOpenSettings={() => setSettingsOpen(true)}
        onSelectSpace={(spaceId) => void dispatch({ type: "space.select", spaceId })}
        spaces={workspace.spaces}
      />

      <main className="workspace-main">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">Workspace</span>
            <h1>{normalizedQuery ? "Search" : activeSpace.name}</h1>
            <p>{normalizedQuery ? `${visibleCollections.length} matching collections` : "Your saved context, ready when you are."}</p>
          </div>
          <div className="workspace-header__actions">
            <Button className="mobile-tabs-button" icon="panel" onClick={() => setTabsDrawerOpen(true)}>
              Open tabs
            </Button>
            <label className="search-box">
              <Icon name="search" size={18} />
              <span className="sr-only">Search tabs and collections</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tabs and collections"
                ref={searchRef}
                value={query}
              />
              <kbd>⌘K</kbd>
            </label>
            <Button
              icon="plus"
              onClick={() => openEditor({ kind: "collection-create", spaceId: activeSpace.id })}
              tone="primary"
            >
              New collection
            </Button>
          </div>
        </header>

        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        <div className="collection-grid" data-testid="collection-grid">
          {visibleCollections.length === 0 ? (
            <EmptyState
              action={normalizedQuery ? (
                <Button icon="close" onClick={() => setQuery("")}>Clear search</Button>
              ) : (
                <Button icon="plus" onClick={() => openEditor({ kind: "collection-create", spaceId: activeSpace.id })} tone="primary">
                  Create collection
                </Button>
              )}
              description={normalizedQuery
                ? `Nothing matches “${query.trim()}”. Try a title, hostname, collection, or space.`
                : "Create a collection, then drag an open tab into it. Hoby keeps everything on this device."}
              eyebrow={normalizedQuery ? "No results" : "Start here"}
              title={normalizedQuery ? "No saved context found" : "Make room to focus"}
            />
          ) : visibleCollections.map(({ collection, space, tabs }) => (
            <CollectionCard
              allowFavicons={allowFavicons}
              busy={busy}
              collection={collection}
              collectionOptions={collectionOptions}
              displayedTabs={tabs}
              forceExpanded={Boolean(normalizedQuery)}
              key={collection.id}
              onAddUrl={(item) => openEditor({ kind: "url-add", collection: item })}
              onDelete={(item) => setDeleteTarget({ kind: "collection", item })}
              onDeleteSavedTab={(item) => setDeleteTarget({ kind: "saved-tab", item })}
              onDropCollection={dropCollection}
              onDropOpenTab={(collectionId, tab) => void saveOpenTab(collectionId, tab)}
              onDropSavedTab={moveSavedTab}
              onEdit={(item) => openEditor({ kind: "collection-edit", collection: item })}
              onMove={moveCollection}
              onOpenAll={(item) => void run(() => actions.openCollection(item.id), `${item.tabs.length} tabs opened`)}
              onToggleCollapsed={(item) => void dispatch({
                type: "collection.update",
                collectionId: item.id,
                changes: { collapsed: !item.collapsed },
              })}
              openTabs={openTabs}
              showSpaceName={normalizedQuery ? space.name : undefined}
            />
          ))}
        </div>
      </main>

      <OpenTabsPanel
        allowFavicons={allowFavicons}
        busy={busy}
        hasTabAccess={hasTabAccess}
        isDrawerOpen={tabsDrawerOpen}
        onActivate={(tabId) => void run(() => actions.activateBrowserTab(tabId))}
        onClose={(tabId) => void run(() => actions.closeBrowserTabs([tabId]))}
        onCloseDrawer={() => setTabsDrawerOpen(false)}
        onRequestAccess={() => void run(async () => {
          const granted = await actions.requestTabAccess();
          if (!granted) throw new Error("Tab access was not enabled. Saved collections still work normally.");
        })}
        onSaveWindow={() => {
          setSessionName(formatSessionName());
          setSessionClose(false);
          setSaveSessionOpen(true);
        }}
        openTabs={openTabs}
      />
      {tabsDrawerOpen ? <button aria-label="Close open tabs" className="tabs-backdrop" onClick={() => setTabsDrawerOpen(false)} type="button" /> : null}

      <Dialog
        description={editor?.kind === "url-add" ? `Save a link to ${editor.collection.name}.` : undefined}
        onClose={() => setEditor(null)}
        open={Boolean(editor)}
        title={editor?.kind === "space-create" ? "Create space"
          : editor?.kind === "space-edit" ? "Edit space"
          : editor?.kind === "collection-create" ? "Create collection"
          : editor?.kind === "collection-edit" ? "Edit collection"
          : "Add URL"}
      >
        <form
          className="dialog__body"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEditor();
          }}
        >
          {editor?.kind === "url-add" ? (
            <>
              <label className="field"><span>URL</span><input autoFocus onChange={(event) => setEditorUrl(event.target.value)} placeholder="https://example.com" required value={editorUrl} /></label>
              <label className="field"><span>Title <small>(optional)</small></span><input onChange={(event) => setEditorTitle(event.target.value)} placeholder="Useful reference" value={editorTitle} /></label>
            </>
          ) : (
            <>
              <label className="field"><span>Name</span><input autoFocus maxLength={80} onChange={(event) => setEditorName(event.target.value)} required value={editorName} /></label>
              {editor?.kind.includes("collection") ? (
                <fieldset className="color-field">
                  <legend>Color</legend>
                  <div>{collectionColors.map((color) => (
                    <label className={`color-option color-option--${color}`} key={color}>
                      <input checked={editorColor === color} name="color" onChange={() => setEditorColor(color)} type="radio" />
                      <span>{color}</span>
                    </label>
                  ))}</div>
                </fieldset>
              ) : null}
            </>
          )}
          <div className="dialog__actions">
            {editor?.kind === "space-edit" ? (
              <Button onClick={() => {
                setEditor(null);
                setDeleteTarget({ kind: "space", item: editor.space });
              }} tone="danger">Delete space</Button>
            ) : null}
            <span className="dialog__spacer" />
            <Button onClick={() => setEditor(null)}>Cancel</Button>
            <Button disabled={busy} type="submit" tone="primary">Save</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        description={`This removes ${deleteName} and its contents from this device.`}
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteName}?`}
      >
        <div className="dialog__body">
          <p className="dialog-warning">You can undo immediately after deletion.</p>
          <div className="dialog__actions">
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button disabled={busy} onClick={() => void confirmDelete()} tone="danger">Delete</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        description={`Capture ${openTabs.length} tabs into a new collection in ${activeSpace.name}.`}
        onClose={() => setSaveSessionOpen(false)}
        open={saveSessionOpen}
        title="Save this window"
      >
        <form className="dialog__body" onSubmit={(event) => { event.preventDefault(); void submitSession(); }}>
          <label className="field"><span>Collection name</span><input autoFocus maxLength={80} onChange={(event) => setSessionName(event.target.value)} required value={sessionName} /></label>
          <label className="check-field">
            <input checked={sessionClose} onChange={(event) => setSessionClose(event.target.checked)} type="checkbox" />
            <span><strong>Close originals after saving</strong><small>Hoby stays open. Tabs close only after they are safely stored.</small></span>
          </label>
          <div className="dialog__actions"><Button onClick={() => setSaveSessionOpen(false)}>Cancel</Button><Button disabled={busy || openTabs.length === 0} type="submit" tone="primary">Save {openTabs.length} tabs</Button></div>
        </form>
      </Dialog>

      <Dialog
        description="Hoby stores data locally. Export a backup before switching devices or uninstalling."
        onClose={() => setSettingsOpen(false)}
        open={settingsOpen}
        title="Settings & backup"
      >
        <div className="dialog__body">
          <div className="settings-row"><span><strong>Export workspace</strong><small>Download spaces, collections, and saved links as JSON.</small></span><Button icon="download" onClick={actions.exportWorkspace}>Export</Button></div>
          <label className="settings-row settings-row--file"><span><strong>Import data</strong><small>Merge a Hoby backup or Toby v3 JSON export into this workspace.</small></span><span className="button"><Icon name="upload" size={16} />Import<input accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importWorkspace(file);
            event.target.value = "";
          }} type="file" /></span></label>
          <div className="local-only"><Icon name="check" size={18} /><span><strong>Private by design</strong><small>No account, analytics, or backend. Hoby never reads page content.</small></span></div>
        </div>
      </Dialog>

      {toast ? (
        <Toast
          actionLabel={toast.undo ? "Undo" : undefined}
          message={toast.message}
          onAction={toast.undo}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
