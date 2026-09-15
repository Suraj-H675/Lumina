import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { assertStatusStubClean, setLaunchStubMode } from "./support/status-stub-control";

const GO_ID = "11111111-1111-4111-8111-111111111111";
const TBC_ID = "22222222-2222-4222-8222-222222222222";

test.describe("Space Now Launch Center", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    await setLaunchStubMode(testInfo, "fresh");
  });

  test.afterEach(async ({}, testInfo) => {
    await assertStatusStubClean(testInfo);
    await setLaunchStubMode(testInfo, "fresh");
  });

  test("renders the server-projected launch snapshot without browser-direct LL2 traffic", async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith("https://ll.thespacedevs.com"))
        externalRequests.push(request.url());
    });

    await page.goto("/now/launches");

    await expect(page).toHaveTitle(/Launch Center — Lumina/);
    await expect(page.getByRole("heading", { level: 1, name: "Upcoming launches" })).toBeVisible();
    await expect(page.getByText("Fixture Go Launch")).toBeVisible();
    await expect(page.getByText("Fixture TBC Launch")).toBeVisible();
    await expect(page.getByText(/Source precision: Minute/)).toBeVisible();
    await expect(page.getByText(/Source precision: Day/)).toBeVisible();
    await expect(page.getByText(/Exact countdown:/)).toHaveCount(1);
    expect(externalRequests).toEqual([]);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("keeps the list useful without client JavaScript and at 320 CSS pixels", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 720 },
    });
    const page = await context.newPage();
    try {
      await page.goto("/now/launches");
      await expect(
        page.getByRole("heading", { level: 1, name: "Upcoming launches" }),
      ).toBeVisible();
      await expect(page.getByText("Fixture Go Launch")).toBeVisible();
      await expect(page.getByText("Fixture TBC Launch")).toBeVisible();
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasOverflow).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("renders fresh launch detail and exports only calendar-eligible timing", async ({
    page,
  }) => {
    await page.goto(`/now/launches/${GO_ID}`);
    await expect(page.getByRole("heading", { level: 1, name: "Fixture Go Launch" })).toBeVisible();
    await expect(page.getByText(/Provider precision: Minute/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Add to calendar" })).toBeVisible();

    const calendar = await page.request.get(`/now/launches/${GO_ID}/calendar`);
    expect(calendar.status()).toBe(200);
    expect(calendar.headers()["content-type"]).toContain("text/calendar");
    const calendarText = await calendar.text();
    expect(calendarText).toContain("STATUS:CONFIRMED");
    expect(calendarText).toContain("DTSTART:20260920T123000Z");

    await page.goto(`/now/launches/${TBC_ID}`);
    await expect(page.getByRole("heading", { level: 1, name: "Fixture TBC Launch" })).toBeVisible();
    await expect(page.getByText(/Provider precision: Day/)).toBeVisible();
    await expect(page.getByText(/No exact countdown is shown/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Add to calendar" })).toHaveCount(0);
    const coarseCalendar = await page.request.get(`/now/launches/${TBC_ID}/calendar`);
    expect(coarseCalendar.status()).toBe(409);
  });

  test("shows stale and expired launch states explicitly", async ({ page }, testInfo) => {
    await setLaunchStubMode(testInfo, "stale");
    await page.goto("/now/launches");
    await expect(page.getByRole("status")).toContainText("Stale launch snapshot");
    await expect(page.getByText("provider.http_rate_limited")).toBeVisible();
    await expect(page.getByText("Fixture Go Launch")).toBeVisible();

    await setLaunchStubMode(testInfo, "unavailable");
    await page.goto("/now/launches");
    await expect(
      page.getByRole("heading", { level: 2, name: "Launch Center is currently unavailable" }),
    ).toBeVisible();
    await expect(page.getByText("The last validated launch snapshot has expired.")).toBeVisible();
    await expect(page.getByText("Fixture Go Launch")).toHaveCount(0);
  });
});
