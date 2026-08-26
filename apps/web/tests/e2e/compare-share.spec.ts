import { expect, test } from "@playwright/test";

test("a direct share URL renders identities, shared rows, and provenance", async ({ page }) => {
  await page.goto("/compare?object=kepler-452&object=k2-18");

  // Column order follows URL order.
  const headers = page.getByRole("columnheader");
  await expect(headers.filter({ hasText: "Kepler-452" })).toBeVisible();
  await expect(headers.filter({ hasText: "K2-18" })).toBeVisible();
  const headerTexts = (await page.getByRole("columnheader").allInnerTexts()).join("|");
  expect(headerTexts.indexOf("Kepler-452")).toBeLessThan(headerTexts.indexOf("K2-18"));

  // Truthful share metadata from canonical names, in URL order.
  await expect(page).toHaveTitle("Kepler-452 vs K2-18 — Lumina");

  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  // Deterministic presentation order: G first.
  const rowHeaderTexts = (await table.getByRole("rowheader").allInnerTexts()).join("|");
  expect(rowHeaderTexts.indexOf("G-band")).toBeLessThan(rowHeaderTexts.indexOf("BP"));

  // Every value keeps its source; nothing is scored or ranked.
  await expect(table.getByText(/source: ESA Gaia Archive/).first()).toBeVisible();
  expect((await page.textContent("body")) ?? "").not.toMatch(/\b(winner|better|best)\b/i);
});

test("removing a selected object updates the URL and keeps the rest", async ({ page }) => {
  await page.goto("/compare?object=k2-18&object=kepler-452");

  await page
    .getByRole("list", { name: "Selected compare objects" })
    .getByRole("button", { name: /Remove K2-18 from the comparison/i })
    .click();

  await expect(page).toHaveURL(/\/compare\?object=kepler-452$/);
  await expect(
    page
      .getByRole("list", { name: "Selected compare objects" })
      .getByRole("link", { name: "Kepler-452" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();

  // Browser back returns to the two-object comparison because the URL owns state.
  await page.goBack();
  await expect(page).toHaveURL(/\/compare\?object=k2-18&object=kepler-452$/);
  await expect(page.getByRole("table")).toBeVisible();
});
