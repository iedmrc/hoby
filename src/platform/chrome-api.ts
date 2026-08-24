export interface ChromeEvent<Arguments extends readonly unknown[]> {
  addListener(listener: (...args: Arguments) => void): void;
  removeListener(listener: (...args: Arguments) => void): void;
}

export interface ChromeStorageChange {
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

export interface ChromeStorageAreaLike {
  get(keys?: string | readonly string[] | null): Promise<Record<string, unknown>>;
  set(items: Readonly<Record<string, unknown>>): Promise<void>;
  setAccessLevel?(options: { accessLevel: "TRUSTED_CONTEXTS" }): Promise<void>;
}

export interface ChromeTabLike {
  readonly active: boolean;
  readonly favIconUrl?: string;
  readonly id?: number;
  readonly incognito: boolean;
  readonly index: number;
  readonly pendingUrl?: string;
  readonly pinned: boolean;
  readonly title?: string;
  readonly url?: string;
  readonly windowId: number;
}

export interface ChromeTabsLike {
  query(queryInfo: Readonly<Record<string, unknown>>): Promise<readonly ChromeTabLike[]>;
  create(createProperties: Readonly<Record<string, unknown>>): Promise<ChromeTabLike>;
  remove(tabIds: number | readonly number[]): Promise<void>;
  update(tabId: number, updateProperties: Readonly<Record<string, unknown>>): Promise<ChromeTabLike>;
  readonly onActivated?: ChromeEvent<readonly [unknown]>;
  readonly onCreated?: ChromeEvent<readonly [ChromeTabLike]>;
  readonly onMoved?: ChromeEvent<readonly [number, unknown]>;
  readonly onRemoved?: ChromeEvent<readonly [number, unknown]>;
  readonly onUpdated?: ChromeEvent<readonly [number, unknown, ChromeTabLike]>;
}

export interface ChromePermissionsLike {
  contains(permissions: { permissions: readonly string[] }): Promise<boolean>;
  request(permissions: { permissions: readonly string[] }): Promise<boolean>;
}

export type ChromeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

export interface ChromeRuntimeLike {
  getURL(path: string): string;
  sendMessage(message: unknown): Promise<unknown>;
  readonly onMessage: {
    addListener(listener: ChromeMessageListener): void;
    removeListener(listener: ChromeMessageListener): void;
  };
  readonly onInstalled?: {
    addListener(listener: () => void): void;
  };
}

export interface ChromeLike {
  readonly permissions: ChromePermissionsLike;
  readonly runtime: ChromeRuntimeLike;
  readonly storage: {
    readonly local: ChromeStorageAreaLike;
    readonly onChanged: ChromeEvent<
      readonly [Record<string, ChromeStorageChange>, string]
    >;
  };
  readonly tabs: ChromeTabsLike;
}

export function resolveChrome(): ChromeLike | undefined {
  const candidate = (globalThis as { chrome?: unknown }).chrome;
  if (!candidate || typeof candidate !== "object") return undefined;
  return candidate as ChromeLike;
}
