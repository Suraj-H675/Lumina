import { expect, test } from "@playwright/test";

test("a third object can be added and the input then reports the maximum", async ({ page }) => {
  await page.goto("/compare?object=k2-18&object=kepler-452");

  const input = page.getByRole("combobox", { name: /add an object to compare/i });
  await input.click();
  await input.pressSequentially("51 p", { delay: 30 });

  const option = page.getByRole("option", { name: /51 Pegasi/ });
  await expect(option).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/compare\?object=k2-18&object=kepler-452&object=51-pegasi$/);
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: /51 Pegasi/ })).toBeVisible();

  // At the locked maximum the add control is replaced by an honest notice.
  await expect(page.getByText(/comparison full — 3 objects maximum/i)).toBeVisible();
  await expect(page.getByRole("combobox", { name: /add an object to compare/i })).toHaveCount(0);
});

test("an unknown slug becomes a removable slot and the page survives", async ({ page }) => {
  await page.goto("/compare?object=k2-18&object=ghost-planet");

  // The valid column still renders fully.
  await expect(page.getByRole("table").getByRole("columnheader", { name: /K2-18/ })).toBeVisible();
  // The unknown slot is understandable, not a crash, and removable.
  await expect(page.getByText(/“ghost-planet” is not in the catalogue/i).first()).toBeVisible();
  expect((await page.textContent("body")) ?? "").not.toContain("catalog.entity_not_found");

  await page.getByRole("button", { name: /Remove Unknown object from the comparison/i }).click();
  await expect(page).toHaveURL(/\/compare\?object=k2-18$/);
});
