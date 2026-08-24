import { useMemo, useState } from "react";
import type { WorkspaceDocument } from "../domain";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { SiteIcon } from "../ui/SiteIcon";
import type { BrowserTab, WorkspaceActions } from "../newtab/types";
import "../styles/base.css";
import "../styles/popup.css";

interface PopupAppProps {
  actions: WorkspaceActions;
  allowFavicons: boolean;
  busy: boolean;
  hasTabAccess: boolean;
  openTabs: readonly BrowserTab[];
  workspace: WorkspaceDocument;
}

function sessionName() {
  return `Session · ${new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date())}`;
}

export function PopupApp({
  actions,
  allowFavicons,
  busy,
  hasTabAccess,
  openTabs,
  workspace,
}: PopupAppProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const activeTab = openTabs.find((tab) => tab.active) ?? openTabs[0];
  const activeSpace = workspace.spaces.find((space) => space.id === workspace.activeSpaceId)
    ?? workspace.spaces[0];
  const collections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return workspace.spaces.flatMap((space) => space.collections.map((collection) => ({
      collection,
      space,
    }))).filter(({ collection, space }) => !needle
      || collection.name.toLocaleLowerCase().includes(needle)
      || space.name.toLocaleLowerCase().includes(needle));
  }, [query, workspace.spaces]);

  const run = async (task: () => Promise<unknown>, message: string) => {
    try {
      await task();
      setStatus(message);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  };

  const saveActive = async (collectionId: string) => {
    if (!activeTab) return;
    const result = await actions.captureTabs(collectionId, [activeTab.id]);
    const duplicate = result.meta.kind === "savedTabs" && result.meta.duplicates.length > 0;
    setStatus(duplicate ? "Already saved here" : "Saved");
  };

  const createAndSave = async () => {
    if (!activeTab) return;
    const created = await actions.dispatch({
      type: "collection.create",
      spaceId: activeSpace.id,
      name,
      color: "stone",
    });
    if (created.meta.kind !== "created") throw new Error("Collection was not created.");
    await saveActive(created.meta.id);
    setCreating(false);
    setName("");
  };

  const saveWindow = async () => {
    const tabs = openTabs.filter((tab) => /^https?:/i.test(tab.url));
    const created = await actions.dispatch({
      type: "collection.create",
      spaceId: activeSpace.id,
      name: sessionName(),
      color: "mint",
    });
    if (created.meta.kind !== "created") throw new Error("Collection was not created.");
    await actions.captureTabs(created.meta.id, tabs.map((tab) => tab.id));
  };

  return (
    <div className="popup-shell">
      <header className="popup-header">
        <div className="popup-brand"><Logo size={29} /><strong>Hoby</strong></div>
        <Button icon="external" onClick={() => void actions.openWorkspace()} tone="quiet">Open workspace</Button>
      </header>

      {!hasTabAccess ? (
        <main className="popup-permission">
          <span><Icon name="window" size={22} /></span>
          <h1>Save tabs without leaving your work</h1>
          <p>Enable tab access when you want Hoby to capture the current tab or window.</p>
          <Button onClick={() => void run(actions.requestTabAccess, "Open tabs enabled")} tone="primary">Enable open tabs</Button>
          <small>No page content or browsing history is read.</small>
        </main>
      ) : (
        <main className="popup-main">
          {activeTab ? (
            <section className="current-tab">
              <span className="eyebrow">Current tab</span>
              <div>
                <SiteIcon allowFavicon={allowFavicons} size={34} title={activeTab.title} url={activeTab.url} />
                <span><strong title={activeTab.title}>{activeTab.title}</strong><small>{new URL(activeTab.url).hostname}</small></span>
              </div>
            </section>
          ) : null}

          <div className="popup-actions">
            <Button disabled={busy || openTabs.length === 0} icon="download" onClick={() => void run(saveWindow, `${openTabs.length} tabs saved`)}>
              Save window
            </Button>
            <Button icon="plus" onClick={() => setCreating(true)}>New collection</Button>
          </div>

          {creating ? (
            <form className="popup-create" onSubmit={(event) => { event.preventDefault(); void run(createAndSave, "Collection created"); }}>
              <label className="field"><span>Collection name</span><input autoFocus maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} /></label>
              <div><Button onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit" tone="primary">Create & save</Button></div>
            </form>
          ) : (
            <>
              <label className="popup-search"><Icon name="search" size={17} /><input aria-label="Find collection" onChange={(event) => setQuery(event.target.value)} placeholder="Find a collection" value={query} /></label>
              <section className="popup-collections">
                <div className="popup-section-title"><span>Save current tab to</span><small>{collections.length}</small></div>
                <div>
                  {collections.length === 0 ? <p>No matching collections.</p> : collections.map(({ collection, space }) => (
                    <button disabled={busy || !activeTab} key={collection.id} onClick={() => void saveActive(collection.id)} type="button">
                      <span className={`popup-dot popup-dot--${collection.color}`} />
                      <span><strong>{collection.name}</strong><small>{space.name} · {collection.tabs.length} saved</small></span>
                      <Icon name="chevron-right" size={16} />
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      )}

      {status ? <div aria-live="polite" className="popup-status"><Icon name="check" size={16} /><span>{status}</span><button aria-label="Dismiss" onClick={() => setStatus(null)} type="button"><Icon name="close" size={15} /></button></div> : null}
    </div>
  );
}
