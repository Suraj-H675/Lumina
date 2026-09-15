import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { assertStatusStubClean, setSatelliteStubMode } from "./support/status-stub-control";

test.describe("Satellite Passes", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    await setSatelliteStubMode(testInfo, "fresh");
  });

  test.afterEach(async ({}, testInfo) => {
    await assertStatusStubClean(testInfo);
    await setSatelliteStubMode(testInfo, "fresh");
  });

  test("renders the cache-only selected-group snapshot without provider traffic", async ({
    page,
  }) => {
    const providerRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("celestrak.org")) providerRequests.push(request.url());
    });

    await page.goto("/now/satellites");

    await expect(page).toHaveTitle(/Satellite Passes — Lumina/);
    await expect(page.getByRole("heading", { level: 1, name: "Satellite passes" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "ISS (ZARYA)" })).toBeVisible();
    await expect(page.getByText("LARGE ID TEST SAT")).toBeVisible();
    await expect(
      page.getByText(/not real-time tracking or guaranteed optical visibility/i),
    ).toBeVisible();
    await expect(page.getByText(/Coordinates are used only for this calculation/i)).toBeVisible();
    expect(providerRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("keeps the selected satellite list useful without client JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/now/satellites");
      await expect(page.getByRole("heading", { level: 1, name: "Satellite passes" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "ISS (ZARYA)" })).toBeVisible();
      await expect(page.getByText("Element epoch").first()).toBeVisible();
      await expect(page.getByRole("link", { name: "CelesTrak GP documentation" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("posts private coordinates only through the same-origin pass route", async ({ page }) => {
    const browserRequests: string[] = [];
    page.on("request", (request) => browserRequests.push(request.url()));
    await page.goto("/now/satellites");

    await page.getByLabel("Latitude (degrees)").fill("35.1234");
    await page.getByLabel("Longitude (degrees)").fill("-105.5678");
    await page.getByLabel("Elevation (metres)").fill("920");
    await page.getByRole("button", { name: "Calculate next 24 hours" }).click();

    await expect(
      page.getByRole("heading", { level: 3, name: "ISS (ZARYA) predicted passes" }),
    ).toBeVisible();
    await expect(page.getByText(/SGP4 · WGS72 · observer WGS84/i)).toBeVisible();
    await expect(page.getByText(/does not claim that a pass will be visible/i)).toBeVisible();
    expect(page.url()).not.toContain("35.1234");
    expect(page.url()).not.toContain("-105.5678");
    expect(browserRequests.some((url) => url.includes("/api/satellite-passes"))).toBe(true);
    expect(browserRequests.some((url) => url.includes("celestrak.org"))).toBe(false);
  });

  test("requests browser geolocation only after the explicit action", async ({ context, page }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 35.1234, longitude: -105.5678 });
    await page.goto("/now/satellites");

    await expect(page.getByLabel("Latitude (degrees)")).toHaveValue("");
    await expect(page.getByLabel("Longitude (degrees)")).toHaveValue("");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByLabel("Latitude (degrees)")).toHaveValue("35.123400");
    await expect(page.getByLabel("Longitude (degrees)")).toHaveValue("-105.567800");
  });

  test("makes stale element/cache state explicit without hiding the records", async ({
    page,
  }, testInfo) => {
    await setSatelliteStubMode(testInfo, "stale");
    await page.goto("/now/satellites");

    await expect(page.getByRole("status").first()).toContainText("Stale element snapshot");
    await expect(page.getByRole("heading", { level: 3, name: "ISS (ZARYA)" })).toBeVisible();
    await expect(page.getByText(/24-hour warning threshold/i)).toBeVisible();
    await expect(page.getByText("provider.timeout")).toBeVisible();
  });

  test("withholds pass controls after the selected-group cache expires", async ({
    page,
  }, testInfo) => {
    await setSatelliteStubMode(testInfo, "unavailable");
    await page.goto("/now/satellites");

    await expect(page.getByRole("status")).toContainText(
      "last validated element snapshot has expired",
    );
    await expect(page.getByRole("button", { name: "Calculate next 24 hours" })).toHaveCount(0);
  });
});
