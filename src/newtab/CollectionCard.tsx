import type { Collection, SavedTab } from "../domain";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { SiteIcon } from "../ui/SiteIcon";
import {
  HOBY_COLLECTION_MIME,
  HOBY_OPEN_TAB_MIME,
  HOBY_SAVED_TAB_MIME,
  type BrowserTab,
} from "./types";

interface CollectionOption {
  id: string;
  label: string;
}

interface CollectionCardProps {
  allowFavicons: boolean;
  busy: boolean;
  collection: Collection;
  collectionOptions: readonly CollectionOption[];
  displayedTabs?: readonly SavedTab[];
  forceExpanded?: boolean;
  onAddUrl: (collection: Collection) => void;
  onDelete: (collection: Collection) => void;
  onDeleteSavedTab: (savedTab: SavedTab) => void;
  onDropCollection: (sourceCollectionId: string, targetCollectionId: string) => void;
  onDropOpenTab: (collectionId: string, tab: BrowserTab) => void;
  onDropSavedTab: (savedTabId: string, collectionId: string, index: number) => void;
  onEdit: (collection: Collection) => void;
  onMove: (collection: Collection, direction: -1 | 1) => void;
  onOpenAll: (collection: Collection) => void;
  onToggleCollapsed: (collection: Collection) => void;
  openTabs: readonly BrowserTab[];
  showSpaceName?: string;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function readSavedTabId(event: React.DragEvent) {
  const raw = event.dataTransfer.getData(HOBY_SAVED_TAB_MIME);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { savedTabId?: string }).savedTabId ?? null;
  } catch {
    return null;
  }
}

export function CollectionCard({
  allowFavicons,
  busy,
  collection,
  collectionOptions,
  displayedTabs = collection.tabs,
  forceExpanded = false,
  onAddUrl,
  onDelete,
  onDeleteSavedTab,
  onDropCollection,
  onDropOpenTab,
  onDropSavedTab,
  onEdit,
  onMove,
  onOpenAll,
  onToggleCollapsed,
  openTabs,
  showSpaceName,
}: CollectionCardProps) {
  const handleDrop = (event: React.DragEvent, index = collection.tabs.length) => {
    event.preventDefault();
    const openTabValue = event.dataTransfer.getData(HOBY_OPEN_TAB_MIME);
    const openTabId = Number(openTabValue);
    if (openTabValue && Number.isInteger(openTabId)) {
      const openTab = openTabs.find((tab) => tab.id === openTabId);
      if (openTab) onDropOpenTab(collection.id, openTab);
      return;
    }

    const savedTabId = readSavedTabId(event);
    if (savedTabId) {
      onDropSavedTab(savedTabId, collection.id, index);
      return;
    }

    const sourceCollectionId = event.dataTransfer.getData(HOBY_COLLECTION_MIME);
    if (sourceCollectionId && sourceCollectionId !== collection.id) {
      onDropCollection(sourceCollectionId, collection.id);
    }
  };

  return (
    <section
      className={`collection-card collection-card--${collection.color}${collection.collapsed && !forceExpanded ? " is-collapsed" : ""}`}
      data-collection-id={collection.id}
      onDragOver={(event) => {
        if (
          event.dataTransfer.types.includes(HOBY_OPEN_TAB_MIME) ||
          event.dataTransfer.types.includes(HOBY_SAVED_TAB_MIME) ||
          event.dataTransfer.types.includes(HOBY_COLLECTION_MIME)
        ) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={handleDrop}
    >
      <div className="collection-card__accent" />
      <header className="collection-card__header">
        <button
          aria-label={`Drag ${collection.name}`}
          className="drag-handle"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(HOBY_COLLECTION_MIME, collection.id);
          }}
          type="button"
        >
          <Icon name="grip" size={18} />
        </button>
        <button
          aria-expanded={forceExpanded || !collection.collapsed}
          className="collection-card__title"
          onClick={() => onToggleCollapsed(collection)}
          type="button"
        >
          <Icon name={collection.collapsed && !forceExpanded ? "chevron-right" : "chevron-down"} size={17} />
          <span>
            <strong>{collection.name}</strong>
            {showSpaceName ? <small>{showSpaceName}</small> : null}
          </span>
          <em>{collection.tabs.length}</em>
        </button>
        <div className="collection-card__actions">
          <Button
            disabled={busy || collection.tabs.length === 0}
            icon="external"
            onClick={() => onOpenAll(collection)}
            tone="quiet"
          >
            Open all
          </Button>
          <details className="menu">
            <summary aria-label={`More actions for ${collection.name}`}><Icon name="more" size={18} /></summary>
            <div className="menu__popover">
              <button onClick={() => onAddUrl(collection)} type="button"><Icon name="plus" size={16} />Add URL</button>
              <button onClick={() => onEdit(collection)} type="button"><Icon name="edit" size={16} />Edit collection</button>
              <button onClick={() => onMove(collection, -1)} type="button"><Icon name="upload" size={16} />Move earlier</button>
              <button onClick={() => onMove(collection, 1)} type="button"><Icon name="download" size={16} />Move later</button>
              <button className="danger" onClick={() => onDelete(collection)} type="button"><Icon name="trash" size={16} />Delete</button>
            </div>
          </details>
        </div>
      </header>

      {!collection.collapsed || forceExpanded ? (
        <div className="saved-tab-list">
          {displayedTabs.length === 0 ? (
            <button className="collection-dropzone" onClick={() => onAddUrl(collection)} type="button">
              <Icon name="plus" size={18} />
              <span><strong>Drop tabs here</strong><small>or add a URL</small></span>
            </button>
          ) : displayedTabs.map((tab, index) => (
            <div
              className="saved-tab"
              draggable
              key={tab.id}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(HOBY_SAVED_TAB_MIME)) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                }
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(
                  HOBY_SAVED_TAB_MIME,
                  JSON.stringify({ savedTabId: tab.id, collectionId: collection.id }),
                );
              }}
              onDrop={(event) => {
                event.stopPropagation();
                handleDrop(event, index);
              }}
            >
              <span className="saved-tab__grip"><Icon name="grip" size={16} /></span>
              <SiteIcon allowFavicon={allowFavicons} size={30} title={tab.title} url={tab.url} />
              <a href={tab.url} rel="noreferrer" target="_blank" title={tab.title}>
                <strong>{tab.title}</strong>
                <small>{hostname(tab.url)}</small>
              </a>
              <details className="menu menu--row">
                <summary aria-label={`Actions for ${tab.title}`}><Icon name="more" size={16} /></summary>
                <div className="menu__popover">
                  <label className="menu__select">
                    <span>Move to</span>
                    <select
                      aria-label={`Move ${tab.title} to collection`}
                      onChange={(event) => {
                        if (event.target.value) {
                          onDropSavedTab(tab.id, event.target.value, Number.MAX_SAFE_INTEGER);
                          event.target.value = "";
                        }
                      }}
                      value=""
                    >
                      <option value="">Choose collection…</option>
                      {collectionOptions.filter((option) => option.id !== collection.id).map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <button className="danger" onClick={() => onDeleteSavedTab(tab)} type="button">
                    <Icon name="trash" size={16} />Delete link
                  </button>
                </div>
              </details>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
