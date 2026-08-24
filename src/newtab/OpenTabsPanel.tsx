import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { SiteIcon } from "../ui/SiteIcon";
import { HOBY_OPEN_TAB_MIME, type BrowserTab } from "./types";

interface OpenTabsPanelProps {
  allowFavicons: boolean;
  busy: boolean;
  hasTabAccess: boolean;
  isDrawerOpen?: boolean;
  onActivate: (tabId: number) => void;
  onClose: (tabId: number) => void;
  onCloseDrawer?: () => void;
  onRequestAccess: () => void;
  onSaveWindow: () => void;
  openTabs: readonly BrowserTab[];
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function OpenTabsPanel({
  allowFavicons,
  busy,
  hasTabAccess,
  isDrawerOpen = false,
  onActivate,
  onClose,
  onCloseDrawer,
  onRequestAccess,
  onSaveWindow,
  openTabs,
}: OpenTabsPanelProps) {
  return (
    <aside className={`tabs-panel${isDrawerOpen ? " is-drawer-open" : ""}`}>
      <div className="tabs-panel__header">
        <div>
          <span className="eyebrow">Current window</span>
          <h2>Open tabs</h2>
        </div>
        <div className="tabs-panel__header-actions">
          {hasTabAccess ? <span className="count-badge">{openTabs.length}</span> : null}
          {onCloseDrawer ? <Button aria-label="Close open tabs" className="drawer-close" icon="close" iconOnly onClick={onCloseDrawer} tone="quiet" /> : null}
        </div>
      </div>

      {!hasTabAccess ? (
        <div className="permission-card">
          <span className="permission-card__icon"><Icon name="window" size={20} /></span>
          <h3>Bring open tabs into view</h3>
          <p>Enable tab access to save this window and drag tabs into collections.</p>
          <Button icon="panel" onClick={onRequestAccess} tone="primary">Enable open tabs</Button>
          <small>Hoby never reads page content or browsing history.</small>
        </div>
      ) : (
        <>
          <Button
            className="save-window-button"
            disabled={busy || openTabs.length === 0}
            icon="download"
            onClick={onSaveWindow}
            tone="primary"
          >
            Save this window
          </Button>
          <div className="open-tab-list">
            {openTabs.length === 0 ? (
              <p className="quiet-copy">No capturable tabs in this window.</p>
            ) : openTabs.map((tab) => (
              <div
                className={`open-tab${tab.active ? " is-active" : ""}`}
                draggable
                key={tab.id}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(HOBY_OPEN_TAB_MIME, String(tab.id));
                }}
              >
                <button
                  className="open-tab__select"
                  onClick={() => onActivate(tab.id)}
                  title={tab.title}
                  type="button"
                >
                  <SiteIcon allowFavicon={allowFavicons} size={28} title={tab.title} url={tab.url} />
                  <span>
                    <strong>{tab.title}</strong>
                    <small>{hostname(tab.url)}</small>
                  </span>
                </button>
                <Button
                  aria-label={`Close ${tab.title}`}
                  className="open-tab__close"
                  icon="close"
                  iconOnly
                  onClick={() => onClose(tab.id)}
                  tone="quiet"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
