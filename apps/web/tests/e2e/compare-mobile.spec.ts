import { expect, test } from "@playwright/test";

test("two-object compare stays readable and usable at ~390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/compare?object=k2-18&object=kepler-452");

  // The desktop matrix is replaced by quantity-by-quantity stacked sections.
  await expect(page.getByRole("table")).toHaveCount(0);
  const sections = page.getByRole("list", { name: "Quantity comparisons" });
  await expect(
    sections.getByRole("heading", { name: /Gaia G-band mean magnitude/i }),
  ).toBeVisible();

  // Per-quantity cards name the object above each value with its source.
  const firstCell = sections.getByTestId("mobile-cell-gaia_g_mean_magnitude-0");
  await expect(firstCell.getByText("K2-18")).toBeVisible();
  await expect(firstCell.getByText(/source: ESA Gaia Archive/)).toBeVisible();

  // No accidental page-level horizontal overflow; controls remain usable.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.getByRole("button", { name: /Remove Kepler-452 from the comparison/i }).click();
  await expect(page).toHaveURL(/\/compare\?object=k2-18$/);

  // Adding still works on mobile.
  const input = page.getByRole("combobox", { name: /add an object to compare/i });
  await input.click();
  await input.pressSequentially("51 p", { delay: 30 });
  await expect(page.getByRole("option", { name: /51 Pegasi/ })).toBeVisible();
});
