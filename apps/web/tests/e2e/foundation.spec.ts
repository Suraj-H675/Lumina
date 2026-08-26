import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the foundation home page loads with an honest under-construction message", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Lumina — Foundation/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Lumina is under construction" }),
  ).toBeVisible();
});

test("the skip link moves keyboard focus to the main content", async ({ page }) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("#main-content")).toBeFocused();
});

test("an unknown route uses the not-found experience", async ({ page }) => {
  await page.goto("/not-a-lumina-route");

  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /return to the lumina foundation home page/i }),
  ).toBeVisible();
});

test("the home page is accessible and usable at 320 CSS pixels without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Lumina is under construction" }),
  ).toBeVisible();
  const exploreLink = page.getByRole("link", { name: "Explore the catalogue" }).first();
  await expect(exploreLink).toBeVisible();

  expect((await exploreLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  const axeResults = await new AxeBuilder({ page }).analyze();
  expect(axeResults.violations).toEqual([]);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
