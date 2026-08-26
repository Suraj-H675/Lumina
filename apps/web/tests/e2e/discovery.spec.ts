import { expect, test } from "@playwright/test";

// Deterministic targets from the reviewed Gaia DR3 seed slice.
const KEPLER_RESULTS = ["Kepler-186", "Kepler-452"];

// These journeys exercise real server-side catalogue reads through the shared
// stub harness (see status-stub-harness.mjs: catalogue fixtures are served
// independently of the status suite's disconnect mode).
test.describe.configure({ mode: "serial" });

test("explore shows the reviewed catalogue without a query", async ({ page }) => {
  await page.goto("/explore");

  await expect(
    page.getByRole("heading", { level: 1, name: /explore real objects/i }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: /search the catalogue/i })).toBeVisible();

  const browseList = page.getByRole("list", { name: "Catalogue objects" });
  await expect(browseList.getByRole("link")).toHaveCount(5);
  for (const name of ["HD 209458", "Kepler-186", "Kepler-452", "51 Pegasi", "K2-18"]) {
    await expect(browseList.getByRole("link", { name })).toBeVisible();
  }
});

test("a committed search renders results and opens the Kepler object page", async ({ page }) => {
  await page.goto("/explore");
  const input = page.getByRole("combobox", { name: /search the catalogue/i });
  await input.fill("Kepler");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/explore\?q=Kepler$/);
  const results = page.getByRole("list", { name: "Search results" });
  for (const name of KEPLER_RESULTS) {
    await expect(results.getByRole("link", { name })).toBeVisible();
  }

  await results.getByRole("link", { name: "Kepler-186" }).click();
  await expect(page).toHaveURL(/\/objects\/kepler-186$/);
  await expect(page.getByRole("heading", { level: 1, name: "Kepler-186" })).toBeVisible();
});

test("typeahead suggestions navigate directly to the chosen object", async ({ page }) => {
  await page.goto("/explore");

  const input = page.getByRole("combobox", { name: /search the catalogue/i });
  await input.pressSequentially("k2-", { delay: 40 });

  const option = page.getByRole("option", { name: /K2-18/ });
  await expect(option).toBeVisible();

  await input.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/objects\/k2-18$/);
  await expect(page.getByRole("heading", { level: 1, name: "K2-18" })).toBeVisible();
});

test("a known slug renders the object experience with provenance", async ({ page }) => {
  await page.goto("/objects/k2-18");

  await expect(page).toHaveTitle(/^K2-18 — Lumina$/);
  await expect(page.getByRole("heading", { level: 1, name: "K2-18" })).toBeVisible();
  await expect(page.getByText("Gaia G-band mean magnitude (Vega scale)").first()).toBeVisible();
  // Provenance is human-readable and truthful to the accepted slice.
  await expect(page.getByText("ESA Gaia Archive").first()).toBeVisible();
  await expect(page.getByText(/Gaia Data Release 3 main source catalogue \(dr3\)/)).toBeVisible();

  await page.getByRole("link", { name: /back to explore/i }).click();
  await expect(page).toHaveURL(/\/explore$/);
});

test("an unknown slug gets the public not-found experience", async ({ page }) => {
  await page.goto("/objects/not-a-real-object");

  await expect(page.getByRole("heading", { level: 1, name: "Object not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: /browse the catalogue/i })).toBeVisible();
  // Raw API error internals never surface.
  expect(await page.textContent("body")).not.toContain("catalog.entity_not_found");
});

test("explore and object flows stay usable at a 390px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore");

  await expect(
    page.getByRole("heading", { level: 1, name: /explore real objects/i }),
  ).toBeVisible();

  // No horizontal overflow anywhere on the flow.
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  expect(await overflow()).toBe(false);

  const input = page.getByRole("combobox", { name: /search the catalogue/i });
  await input.click();
  await input.pressSequentially("51 p", { delay: 40 });

  // Suggestion list must fit the viewport.
  const option = page.getByRole("option", { name: /51 Pegasi/ });
  await expect(option).toBeVisible();
  const optionBox = await option.boundingBox();
  expect(optionBox).not.toBeNull();
  expect(optionBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((optionBox?.x ?? 0) + (optionBox?.width ?? 0)).toBeLessThanOrEqual(390);

  await input.press("Enter");
  await expect(page).toHaveURL(/\/explore\?q=51(%20|\+)p$/);
  await expect(page.getByRole("link", { name: "51 Pegasi" }).first()).toBeVisible();

  await page.goto("/objects/51-pegasi");
  await expect(page.getByRole("heading", { level: 1, name: "51 Pegasi" })).toBeVisible();
  expect(await overflow()).toBe(false);
});
