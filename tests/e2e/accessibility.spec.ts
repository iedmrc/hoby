import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function summarize(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`new-tab workspace has no automatic WCAG A/AA violations in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/newtab.html");
    await expect(page.getByTestId("collection-grid")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(summarize(results.violations)).toEqual([]);
  });
}

test("toolbar popup has no automatic WCAG A/AA violations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 540 });
  await page.goto("/popup.html");
  await expect(page.locator(".popup-shell")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(summarize(results.violations)).toEqual([]);
});

