import { expect, test, chromium, type BrowserContext } from "@playwright/test";
import { resolve } from "node:path";

test("built MV3 extension boots through its service worker and persists mutations", async () => {
  const extensionPath = resolve(import.meta.dirname, "../../dist");
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext("", {
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      channel: "chromium",
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);

    await expect(page.getByRole("heading", { name: "My space" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bring open tabs into view" })).toBeVisible();
    await page.getByRole("button", { name: "New collection" }).click();
    await page.getByRole("dialog", { name: "Create collection" }).getByLabel("Name").fill("Extension smoke");
    await page.getByRole("dialog", { name: "Create collection" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Extension smoke", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText("Extension smoke", { exact: true })).toBeVisible();
  } finally {
    await context?.close();
  }
});
