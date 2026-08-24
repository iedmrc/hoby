import { defaultTitleForUrl, normalizeUrl } from "../domain";
import type { ChromeRuntimeLike, ChromeTabLike, ChromeTabsLike } from "./chrome-api";
import { PlatformError } from "./errors";

export interface OpenTab {
  readonly active: boolean;
  readonly favIconUrl?: string;
  readonly id: number;
  readonly incognito: boolean;
  readonly index: number;
  readonly normalizedUrl: string;
  readonly pinned: boolean;
  readonly title: string;
  readonly url: string;
  readonly windowId: number;
}

export interface CloseTabsResult {
  readonly closedTabIds: readonly number[];
  readonly failedTabIds: readonly number[];
}

export interface OpenTabsResult {
  readonly duplicateUrls: readonly string[];
  readonly failedUrls: readonly string[];
  readonly openedTabIds: readonly number[];
}

export interface TabAdapter {
  activate(tabId: number): Promise<void>;
  close(tabIds: readonly number[]): Promise<CloseTabsResult>;
  listCapturableCurrentWindow(): Promise<readonly OpenTab[]>;
  open(url: string, active?: boolean): Promise<number>;
  openMissing(urls: readonly string[]): Promise<OpenTabsResult>;
}

export function toOpenTab(tab: ChromeTabLike): OpenTab | null {
  const url = tab.pendingUrl ?? tab.url;
  if (tab.id === undefined || !url || tab.incognito) return null;
  let normalized: ReturnType<typeof normalizeUrl>;
  try {
    normalized = normalizeUrl(url);
  } catch {
    return null;
  }
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: tab.active,
    pinned: tab.pinned,
    incognito: tab.incognito,
    title: tab.title?.trim() || defaultTitleForUrl(normalized.href),
    url: normalized.href,
    normalizedUrl: normalized.href,
    favIconUrl: tab.favIconUrl || undefined,
  };
}

export class ChromeTabAdapter implements TabAdapter {
  constructor(private readonly tabs: ChromeTabsLike) {}

  async listCapturableCurrentWindow(): Promise<readonly OpenTab[]> {
    const tabs = await this.tabs.query({ currentWindow: true });
    return tabs
      .map(toOpenTab)
      .filter((tab): tab is OpenTab => tab !== null)
      .sort((left, right) => left.index - right.index);
  }

  async close(tabIds: readonly number[]): Promise<CloseTabsResult> {
    const uniqueIds = [...new Set(tabIds)];
    const results = await Promise.allSettled(
      uniqueIds.map(async (tabId) => {
        await this.tabs.remove(tabId);
        return tabId;
      }),
    );
    const closedTabIds: number[] = [];
    const failedTabIds: number[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") closedTabIds.push(result.value);
      else failedTabIds.push(uniqueIds[index]);
    }
    return { closedTabIds, failedTabIds };
  }

  async open(url: string, active = true): Promise<number> {
    const normalized = normalizeUrl(url).href;
    try {
      const tab = await this.tabs.create({ url: normalized, active });
      if (tab.id === undefined) {
        throw new Error("Chrome created a tab without returning an ID.");
      }
      return tab.id;
    } catch (error) {
      throw new PlatformError("TAB_OPERATION_FAILED", "The saved tab could not be opened.", {
        cause: error instanceof Error ? error.message : String(error),
        url: normalized,
      });
    }
  }

  async openMissing(urls: readonly string[]): Promise<OpenTabsResult> {
    const open = await this.listCapturableCurrentWindow();
    const existingUrls = new Set(open.map((tab) => tab.normalizedUrl));
    const requested = new Set<string>();
    const duplicateUrls: string[] = [];
    const failedUrls: string[] = [];
    const openedTabIds: number[] = [];

    for (const input of urls) {
      let url: string;
      try {
        url = normalizeUrl(input).href;
      } catch {
        failedUrls.push(input);
        continue;
      }
      if (existingUrls.has(url) || requested.has(url)) {
        duplicateUrls.push(url);
        continue;
      }
      requested.add(url);
      try {
        openedTabIds.push(await this.open(url, false));
        existingUrls.add(url);
      } catch {
        failedUrls.push(url);
      }
    }

    return { openedTabIds, duplicateUrls, failedUrls };
  }

  async activate(tabId: number): Promise<void> {
    try {
      await this.tabs.update(tabId, { active: true });
    } catch (error) {
      throw new PlatformError("TAB_OPERATION_FAILED", "The browser tab no longer exists.", {
        cause: error instanceof Error ? error.message : String(error),
        tabId,
      });
    }
  }
}

export function createFaviconUrl(
  runtime: Pick<ChromeRuntimeLike, "getURL">,
  pageUrl: string,
  size = 32,
): string {
  const normalized = normalizeUrl(pageUrl).href;
  const url = new URL(runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", normalized);
  url.searchParams.set("size", String(Math.max(16, Math.min(64, Math.round(size)))));
  return url.href;
}

export class LocalTabAdapter implements TabAdapter {
  async listCapturableCurrentWindow(): Promise<readonly OpenTab[]> {
    return [];
  }

  async close(): Promise<CloseTabsResult> {
    return { closedTabIds: [], failedTabIds: [] };
  }

  async open(): Promise<number> {
    throw new PlatformError(
      "MESSAGE_UNAVAILABLE",
      "Browser tab operations are unavailable outside the extension.",
    );
  }

  async openMissing(urls: readonly string[]): Promise<OpenTabsResult> {
    return { openedTabIds: [], duplicateUrls: [], failedUrls: [...urls] };
  }

  async activate(): Promise<void> {
    throw new PlatformError(
      "MESSAGE_UNAVAILABLE",
      "Browser tab operations are unavailable outside the extension.",
    );
  }
}
