import { ChromeTabAdapter, PlatformError, createFaviconUrl } from "../../src/platform";
import { FakeTabs, fakeChromeTab } from "./fakes";

describe("ChromeTabAdapter", () => {
  it("returns ordered, normalized HTTP(S) tabs and filters private/internal pages", async () => {
    const chrome = new FakeTabs();
    chrome.tabs = [
      fakeChromeTab(3, "chrome://newtab", { index: 0 }),
      fakeChromeTab(2, "https://EXAMPLE.com/", { index: 2, title: "Example" }),
      fakeChromeTab(1, "http://one.test", { index: 1 }),
      fakeChromeTab(4, "https://private.test", { index: 3, incognito: true }),
    ];
    const tabs = await new ChromeTabAdapter(chrome).listCapturableCurrentWindow();
    expect(tabs.map((tab) => [tab.id, tab.url])).toEqual([
      [1, "http://one.test"],
      [2, "https://example.com"],
    ]);
  });

  it("reports partial close failures without failing successful closures", async () => {
    const chrome = new FakeTabs();
    chrome.failedRemoveIds.add(2);
    await expect(new ChromeTabAdapter(chrome).close([1, 2, 1])).resolves.toEqual({
      closedTabIds: [1],
      failedTabIds: [2],
    });
  });

  it("opens only URLs missing from the current window and request", async () => {
    const chrome = new FakeTabs();
    chrome.tabs = [fakeChromeTab(1, "https://existing.test")];
    const result = await new ChromeTabAdapter(chrome).openMissing([
      "https://existing.test/",
      "new.test",
      "https://new.test/",
      "chrome://settings",
    ]);
    expect(result.openedTabIds).toHaveLength(1);
    expect(result.duplicateUrls).toEqual([
      "https://existing.test",
      "https://new.test",
    ]);
    expect(result.failedUrls).toEqual(["chrome://settings"]);
  });

  it("turns missing tabs into actionable activation errors", async () => {
    const chrome = new FakeTabs();
    await expect(new ChromeTabAdapter(chrome).activate(42)).rejects.toBeInstanceOf(
      PlatformError,
    );
  });

  it("builds a bounded Chrome favicon URL", () => {
    const href = createFaviconUrl(
      { getURL: (path) => `chrome-extension://extension-id${path}` },
      "example.com",
      500,
    );
    expect(href).toContain("pageUrl=https%3A%2F%2Fexample.com");
    expect(href).toContain("size=64");
  });
});
