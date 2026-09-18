import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Eclipse Simulator", () => {
  test("keeps canonical geometry, safety, and limits visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/eclipse-simulator");

    await expect(page.getByRole("heading", { level: 1, name: "Eclipse Simulator" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Solar-viewing safety" })).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(7);
    await expect(page.getByText(/eclipse-simulator-v1/)).toBeVisible();
    await expect(page.getByText(/whole UTC minutes/i)).toBeVisible();

    await page.goto("/lab/eclipse-simulator?state=not-json");
    await expect(
      page.getByRole("heading", { name: "Shared eclipse state rejected" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solar-viewing safety" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);
    await context.close();
  });

  test("commits only accepted canonical states and retains the last valid result on 422", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/eclipse-simulator");

    await expect(page.getByText("umbra")).toBeVisible();
    const utc = page.getByLabel("UTC date and time");
    await utc.fill("2024-04-09T18:42");
    await page.getByRole("button", { name: "Calculate eclipse geometry" }).click();
    await expect(page.getByText("outside", { exact: true })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const accepted = new URL(page.url()).searchParams.get("state");
    expect(JSON.parse(accepted!)).toMatchObject({
      version: 1,
      model_version: "eclipse-simulator-v1",
      at_utc: "2024-04-09T18:42:00Z",
    });

    await utc.fill("2024-04-10T18:42");
    await page.getByRole("button", { name: "Calculate eclipse geometry" }).click();
    await expect(page.getByText(/canonical Eclipse Simulator rejected this state/i)).toBeVisible();
    await expect(page.getByText("outside", { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("state")).toBe(accepted);
    await expect(page.getByRole("heading", { name: "Solar-viewing safety" })).toBeVisible();

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("remains usable with forced colours, touch sizing, and no horizontal overflow", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 640, height: 844 },
    });
    const page = await context.newPage();
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto("/lab/eclipse-simulator");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Calculate eclipse geometry" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset Dallas 2024 reference" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("heading", { name: "Solar-viewing safety" })).toBeVisible();
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
