import type { DomainContext } from "../../src/domain";
import type {
  ChromePermissionsLike,
  ChromeStorageAreaLike,
  ChromeTabLike,
  ChromeTabsLike,
} from "../../src/platform";

export function createPlatformContext(): DomainContext {
  let sequence = 0;
  return {
    createId: () => `platform-id-${++sequence}`,
    now: () => `2026-08-24T10:00:${String(sequence % 60).padStart(2, "0")}.000Z`,
  };
}

export class FakeStorageArea implements ChromeStorageAreaLike {
  readonly data: Record<string, unknown> = {};
  readonly sets: Array<Record<string, unknown>> = [];
  readonly accessLevels: string[] = [];
  failSetWhen?: (items: Readonly<Record<string, unknown>>) => Error | undefined;

  async get(keys?: string | readonly string[] | null): Promise<Record<string, unknown>> {
    const selected = keys === undefined || keys === null
      ? Object.keys(this.data)
      : typeof keys === "string"
        ? [keys]
        : [...keys];
    return Object.fromEntries(
      selected
        .filter((key) => key in this.data)
        .map((key) => [key, structuredClone(this.data[key])]),
    );
  }

  async set(items: Readonly<Record<string, unknown>>): Promise<void> {
    const failure = this.failSetWhen?.(items);
    if (failure) throw failure;
    const copy = structuredClone(items) as Record<string, unknown>;
    this.sets.push(copy);
    Object.assign(this.data, copy);
  }

  async setAccessLevel(options: { accessLevel: "TRUSTED_CONTEXTS" }): Promise<void> {
    this.accessLevels.push(options.accessLevel);
  }
}

export class FakePermissions implements ChromePermissionsLike {
  granted = new Set<string>();
  requestResult = true;

  async contains(options: { permissions: readonly string[] }): Promise<boolean> {
    return options.permissions.every((permission) => this.granted.has(permission));
  }

  async request(options: { permissions: readonly string[] }): Promise<boolean> {
    if (this.requestResult) {
      for (const permission of options.permissions) this.granted.add(permission);
    }
    return this.requestResult;
  }
}

export function fakeChromeTab(
  id: number,
  url: string | undefined,
  overrides: Partial<ChromeTabLike> = {},
): ChromeTabLike {
  return {
    id,
    url,
    title: url,
    windowId: 1,
    index: id,
    active: false,
    pinned: false,
    incognito: false,
    ...overrides,
  };
}

export class FakeTabs implements ChromeTabsLike {
  readonly created: Array<Record<string, unknown>> = [];
  readonly removed: number[] = [];
  readonly updated: Array<{ tabId: number; properties: Record<string, unknown> }> = [];
  readonly failedRemoveIds = new Set<number>();
  tabs: ChromeTabLike[] = [];

  async query(): Promise<readonly ChromeTabLike[]> {
    return structuredClone(this.tabs);
  }

  async create(properties: Readonly<Record<string, unknown>>): Promise<ChromeTabLike> {
    this.created.push({ ...properties });
    const id = 1_000 + this.created.length;
    const tab = fakeChromeTab(id, String(properties.url), {
      active: Boolean(properties.active),
      index: this.tabs.length,
    });
    this.tabs.push(tab);
    return tab;
  }

  async remove(tabIds: number | readonly number[]): Promise<void> {
    const ids = typeof tabIds === "number" ? [tabIds] : [...tabIds];
    for (const id of ids) {
      if (this.failedRemoveIds.has(id)) throw new Error(`Cannot remove ${id}`);
      this.removed.push(id);
    }
  }

  async update(
    tabId: number,
    properties: Readonly<Record<string, unknown>>,
  ): Promise<ChromeTabLike> {
    this.updated.push({ tabId, properties: { ...properties } });
    const tab = this.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) throw new Error("Missing tab");
    return { ...tab, active: Boolean(properties.active ?? tab.active) };
  }
}
