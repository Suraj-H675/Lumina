import { expect, test, type Page } from "@playwright/test";

// Deterministic targets from the reviewed Gaia DR3 seed slice (see
// status-stub-harness.mjs: BP/RP fixtures are the published DR3 photometry of
// those same accepted source_ids).
test.describe.configure({ mode: "serial" });

/** True when the page forces a page-level horizontal scrollbar. */
function hasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test("empty compare offers a useful starting point", async ({ page }) => {
  await page.goto("/compare");

  await expect(page.getByRole("heading", { level: 1, name: "Compare" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing selected yet" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /add an object to compare/i })).toBeEnabled();
  await expect(page).toHaveTitle("Compare catalogue objects — Lumina");
});

test("an object page links into a one-object partial compare", async ({ page }) => {
  await page.goto("/objects/k2-18");
  await page.getByRole("link", { name: /compare this object/i }).click();

  await expect(page).toHaveURL(/\/compare\?object=k2-18$/);
  await expect(
    page
      .getByRole("list", { name: "Selected compare objects" })
      .getByRole("link", { name: "K2-18" }),
  ).toBeVisible();
  await expect(page.getByText(/add one more object/i)).toBeVisible();
  // The measured quantity renders even before a partner arrives.
  await expect(
    page.getByRole("table").getByRole("rowheader", { name: /Gaia G-band mean magnitude/i }),
  ).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
