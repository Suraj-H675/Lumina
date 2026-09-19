import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Mission Control home loads with an honest construction-state message", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page).toHaveTitle(/Mission Control/);
  await expect(page.getByRole("heading", { level: 1, name: "Mission Control" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Observation planner" })).toHaveAttribute(
    "href",
    "/observe",
  );
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

test("the locale route seam keeps English canonical and draft locale prefixes fail closed", async ({
  page,
}) => {
  const canonicalResponse = await page.goto("/");
  expect(canonicalResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const duplicateEnglish = await page.goto("/en");
  expect(duplicateEnglish?.status()).toBe(404);
  await expect(page).toHaveURL(/\/en$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();

  const draftSpanish = await page.goto("/es");
  expect(draftSpanish?.status()).toBe(404);
  await expect(page).toHaveURL(/\/es$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const unknownEnglishPath = await page.goto("/fr/not-a-lumina-route");
  expect(unknownEnglishPath?.status()).toBe(404);
  await expect(page).toHaveURL(/\/fr\/not-a-lumina-route$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
});

test("the home page is accessible and usable at 320 CSS pixels without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Mission Control" })).toBeVisible();
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
