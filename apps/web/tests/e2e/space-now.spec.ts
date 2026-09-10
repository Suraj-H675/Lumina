import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { assertStatusStubClean, setApodStubMode } from "./support/status-stub-control";

test.describe("Space Now Daily Visual", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    await setApodStubMode(testInfo, "fresh");
  });

  test.afterEach(async ({}, testInfo) => {
    await assertStatusStubClean(testInfo);
    await setApodStubMode(testInfo, "fresh");
  });

  test("renders the server-projected APOD without loading external media", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("https://api.nasa.gov") || url.startsWith("https://apod.nasa.gov")) {
        externalRequests.push(url);
      }
    });

    await page.goto("/now");

    await expect(page).toHaveTitle(/Space Now — Lumina/);
    await expect(page.getByRole("heading", { level: 1, name: "Space Now" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Fixture Daily Visual" }),
    ).toBeVisible();
    await expect(page.getByText("2026-09-09")).toBeVisible();
    await expect(page.getByText("Retrieved at (UTC)")).toBeVisible();
    await expect(page.getByText("2026-09-10T12:00:00Z")).toBeVisible();

    const action = page.getByRole("link", { name: "View today's APOD image" });
    await expect(action).toHaveAttribute("href", "https://apod.nasa.gov/apod/ap260909.html");
    await expect(action).toHaveAttribute("target", "_blank");
    await expect(action).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.locator("img, video, iframe")).toHaveCount(0);
    expect(externalRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("stays usable at a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/now");

    await expect(page.getByRole("heading", { level: 1, name: "Space Now" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View today's APOD image" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });

  test("renders the cached Daily Visual without client JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/now");

      await expect(page.getByRole("heading", { level: 1, name: "Space Now" })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Fixture Daily Visual" }),
      ).toBeVisible();
      await expect(page.getByText("2026-09-09")).toBeVisible();
      await expect(page.getByRole("link", { name: "View today's APOD image" })).toBeVisible();
      await expect(page.locator("img, video, iframe")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("shows an explicit stale snapshot after a controlled provider outage", async ({
    page,
  }, testInfo) => {
    await setApodStubMode(testInfo, "stale");
    await page.goto("/now");

    await expect(page.getByRole("status")).toContainText("Stale Daily Visual snapshot");
    await expect(page.getByText("2026-09-09")).toBeVisible();
    await expect(page.getByText("2026-09-10T12:00:00Z")).toBeVisible();
    await expect(page.getByText("provider.timeout")).toBeVisible();
    await expect(page.getByRole("link", { name: "View today's APOD image" })).toBeVisible();
  });

  test("shows a useful unavailable state after the cached snapshot expires", async ({
    page,
  }, testInfo) => {
    await setApodStubMode(testInfo, "unavailable");
    await page.goto("/now");

    await expect(
      page.getByRole("heading", { level: 2, name: "Daily Visual is currently unavailable." }),
    ).toBeVisible();
    await expect(page.getByText("The cached Daily Visual snapshot has expired.")).toBeVisible();
    await expect(page.getByText("expired", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /APOD image|APOD video/i })).toHaveCount(0);
  });
});
