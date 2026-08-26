import { expect, test } from "@playwright/test";

test("adding a second object by keyboard completes the comparison", async ({ page }) => {
  await page.goto("/compare?object=k2-18");

  const input = page.getByRole("combobox", { name: /add an object to compare/i });
  await input.click();
  await input.pressSequentially("Kepler-452", { delay: 30 });

  const option = page.getByRole("option", { name: /Kepler-452/ });
  await expect(option).toBeVisible();

  await input.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/compare\?object=k2-18&object=kepler-452$/);

  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: /K2-18/ })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /Kepler-452/ })).toBeVisible();

  // Shared canonical rows render for both objects with provenance attached.
  for (const quantity of [
    "Gaia G-band mean magnitude",
    "Gaia integrated BP",
    "Gaia integrated RP",
  ]) {
    await expect(table.getByRole("rowheader", { name: new RegExp(quantity, "i") })).toBeVisible();
  }
  await expect(
    table
      .getByText(/source: ESA Gaia Archive · Gaia Data Release 3 main source catalogue \(dr3\)/)
      .first(),
  ).toBeVisible();
});
