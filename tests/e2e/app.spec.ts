import { expect, test } from "@playwright/test";
import type { WorkspaceDocument } from "../../src/domain";

test("creates a collection, captures the window, closes originals, and searches", async ({ page }) => {
  await page.goto("/newtab.html");
  await expect(page.getByRole("heading", { name: "My space" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open tabs" })).toBeVisible();

  await page.getByRole("button", { name: "New collection" }).click();
  const createDialog = page.getByRole("dialog", { name: "Create collection" });
  await createDialog.getByLabel("Name").fill("Product research");
  await createDialog.getByText("rose", { exact: true }).click();
  await createDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Product research", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save this window" }).click();
  const saveDialog = page.getByRole("dialog", { name: "Save this window" });
  await saveDialog.getByLabel("Collection name").fill("Monday focus");
  await saveDialog.getByRole("checkbox", { name: /Close originals/ }).check();
  await saveDialog.getByRole("button", { name: "Save 4 tabs" }).click();

  await expect(page.getByText("Monday focus", { exact: true })).toBeVisible();
  await expect(page.getByText("No capturable tabs in this window.")).toBeVisible();

  const search = page.getByPlaceholder("Search tabs and collections");
  await search.fill("github.com");
  await expect(page.getByText("Monday focus", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Repository/ })).toBeVisible();
});

test("quick popup saves the active tab and reports duplicates", async ({ page }) => {
  await page.goto("/popup.html");
  await expect(page.getByText("Project brief", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Inbox/ }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Inbox/ }).click();
  await expect(page.getByText("Already saved here", { exact: true })).toBeVisible();
});

test("renders a 1,000-tab workspace within the interactive performance budget", async ({ page }) => {
  const timestamp = "2026-08-24T10:00:00.000Z";
  const workspace: WorkspaceDocument = {
    schemaVersion: 1,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeSpaceId: "space-large",
    spaces: [{
      id: "space-large",
      name: "Large workspace",
      createdAt: timestamp,
      updatedAt: timestamp,
      collections: Array.from({ length: 20 }, (_, collectionIndex) => ({
        id: `collection-${collectionIndex}`,
        name: `Collection ${collectionIndex + 1}`,
        color: "stone" as const,
        collapsed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        tabs: Array.from({ length: 50 }, (_, tabIndex) => ({
          id: `tab-${collectionIndex}-${tabIndex}`,
          title: `Reference ${collectionIndex * 50 + tabIndex + 1}`,
          url: `https://example.com/reference/${collectionIndex}/${tabIndex}`,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      })),
    }],
  };

  await page.goto("/newtab.html");
  await page.evaluate((value) => {
    localStorage.setItem("hoby.workspace.v1", JSON.stringify(value));
  }, workspace);
  await page.reload();
  await expect(page.locator(".saved-tab")).toHaveCount(1_000);
  const interactiveAt = await page.evaluate(() =>
    performance.getEntriesByName("hoby:interactive", "mark").at(-1)?.startTime,
  );
  expect(interactiveAt).toBeDefined();
  expect(interactiveAt).toBeLessThan(1_000);
});
