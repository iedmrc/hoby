import type { Space } from "../domain";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";

interface SidebarProps {
  activeSpaceId: string;
  onCreateSpace: () => void;
  onEditSpace: (space: Space) => void;
  onOpenSettings: () => void;
  onSelectSpace: (spaceId: string) => void;
  spaces: readonly Space[];
}

export function Sidebar({
  activeSpaceId,
  onCreateSpace,
  onEditSpace,
  onOpenSettings,
  onSelectSpace,
  spaces,
}: SidebarProps) {
  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="brand">
        <Logo />
        <div>
          <strong>Hoby</strong>
          <span>Tab workspace</span>
        </div>
      </div>

      <div className="sidebar__heading">
        <span>Spaces</span>
        <Button aria-label="Create space" icon="plus" iconOnly onClick={onCreateSpace} tone="quiet" />
      </div>

      <nav aria-label="Spaces" className="space-list">
        {spaces.map((space) => {
          const savedCount = space.collections.reduce((sum, collection) => sum + collection.tabs.length, 0);
          const active = space.id === activeSpaceId;
          return (
            <div className={`space-row${active ? " is-active" : ""}`} key={space.id}>
              <button
                aria-current={active ? "page" : undefined}
                className="space-row__select"
                onClick={() => onSelectSpace(space.id)}
                type="button"
              >
                <Icon name="folder" size={17} />
                <span>{space.name}</span>
                <small>{savedCount}</small>
              </button>
              <Button
                aria-label={`Edit ${space.name}`}
                className="space-row__edit"
                icon="more"
                iconOnly
                onClick={() => onEditSpace(space)}
                tone="quiet"
              />
            </div>
          );
        })}
      </nav>

      <div className="sidebar__note">
        <Icon name="archive" size={16} />
        <span>Stored only on this device</span>
      </div>

      <Button className="sidebar__settings" icon="settings" onClick={onOpenSettings} tone="quiet">
        Settings & backup
      </Button>
    </aside>
  );
}

