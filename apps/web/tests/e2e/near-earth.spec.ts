import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { assertStatusStubClean, setNeowsStubMode } from "./support/status-stub-control";

test.describe("Space Now Near-Earth Objects", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    await setNeowsStubMode(testInfo, "fresh");
  });

  test.afterEach(async ({}, testInfo) => {
    await assertStatusStubClean(testInfo);
    await setNeowsStubMode(testInfo, "fresh");
  });

  test("renders the server-projected feed without browser-direct NASA traffic", async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith("https://api.nasa.gov")) externalRequests.push(request.url());
    });

    await page.goto("/now/near-earth");

    await expect(page).toHaveTitle(/Near-Earth Objects — Lumina/);
    await expect(page.getByRole("heading", { level: 1, name: "Near-Earth Objects" })).toBeVisible();
    await expect(page.getByText("2026-09-12", { exact: true })).toBeVisible();
    await expect(page.getByText("2026-09-18", { exact: true })).toBeVisible();
    await expect(page.getByText("Fixture NEO 1")).toBeVisible();
    await expect(page.getByText("Potentially hazardous asteroid: Yes")).toBeVisible();
    await expect(
      page.getByText(
        "Close-approach uncertainty is not provided by the NeoWs feed used in this version.",
      ),
    ).toBeVisible();
    await expect(page.getByText("It does not mean an impact is predicted.")).toBeVisible();
    expect(externalRequests).toEqual([]);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("remains useful without client JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/now/near-earth");
      await expect(
        page.getByRole("heading", { level: 1, name: "Near-Earth Objects" }),
      ).toBeVisible();
      await expect(page.getByText("Fixture NEO 1")).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("shows an explicit stale snapshot", async ({ page }, testInfo) => {
    await setNeowsStubMode(testInfo, "stale");
    await page.goto("/now/near-earth");
    await expect(page.getByRole("status")).toContainText("Stale near-Earth approach snapshot");
    await expect(page.getByText("provider.timeout")).toBeVisible();
    await expect(page.getByText("Fixture NEO 1")).toBeVisible();
  });

  test("shows an explicit unavailable state after expiry", async ({ page }, testInfo) => {
    await setNeowsStubMode(testInfo, "unavailable");
    await page.goto("/now/near-earth");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Near-Earth approach data is currently unavailable.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("The cached Near-Earth Objects snapshot has expired."),
    ).toBeVisible();
    await expect(page.getByText("expired", { exact: true })).toBeVisible();
  });
});
