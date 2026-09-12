import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { assertStatusStubClean } from "./support/status-stub-control";

test.describe("Space Now Space Weather", () => {
  test.afterEach(async ({}, testInfo) => {
    await assertStatusStubClean(testInfo);
  });

  test("renders the cache projection without browser-direct NOAA traffic", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith("https://services.swpc.noaa.gov")) {
        externalRequests.push(request.url());
      }
    });

    await page.goto("/now/space-weather");

    await expect(page).toHaveTitle(/Space Weather — Lumina/);
    await expect(page.getByRole("heading", { level: 1, name: "Space Weather" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Current NOAA scales" }),
    ).toBeVisible();
    await expect(page.getByText("R1 — Minor")).toBeVisible();
    await expect(page.getByText("S0 — Below NOAA scale thresholds")).toBeVisible();
    await expect(page.getByText("G2 — Moderate")).toBeVisible();
    await expect(page.getByText("Latest observed Kp")).toBeVisible();
    await expect(page.getByText("Latest estimated Kp")).toBeVisible();
    await expect(page.getByText("404 km/s")).toBeVisible();
    await expect(page.getByText("-3 nT")).toBeVisible();
    await expect(page.getByText("Plain provider notification text.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "NOAA Aurora 30-Minute Forecast" }),
    ).toHaveAttribute("href", "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast");
    await expect(page.getByText("Retrieved at (UTC)")).toBeVisible();
    expect(externalRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("stays useful at 320 CSS pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/now/space-weather");

    await expect(page.getByRole("heading", { level: 1, name: "Space Weather" })).toBeVisible();
    await expect(page.getByText("R1 — Minor")).toBeVisible();
    await expect(page.getByRole("link", { name: "NOAA Aurora 30-Minute Forecast" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });

  test("renders the essential view without client JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/now/space-weather");

      await expect(page.getByRole("heading", { level: 1, name: "Space Weather" })).toBeVisible();
      await expect(page.getByText("R1 — Minor")).toBeVisible();
      await expect(page.getByText("Latest observed Kp")).toBeVisible();
      await expect(page.getByText("404 km/s")).toBeVisible();
      await expect(
        page.getByRole("link", { name: "NOAA Aurora 30-Minute Forecast" }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
