import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SHORT_STATE_DURATION_S = 100;

test.describe("Phase 7 — Orbit Sandbox", () => {
  test("renders the canonical server result and failure disclosures without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/lab/orbit-sandbox");
    await expect(page.getByRole("heading", { level: 1, name: "Orbit Sandbox" })).toHaveCount(1);
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(12);
    await expect(page.getByText("Bound", { exact: true })).toBeVisible();
    await expect(page.getByText("601", { exact: true })).toBeVisible();
    await expect(page.getByText(/orbit-sandbox-v1/)).toBeVisible();
    await expect(page.getByText(/No n-body perturbations/i)).toBeVisible();

    await page.goto("/lab/orbit-sandbox?state=not-json");
    await expect(page.getByRole("heading", { name: "Shared orbit state rejected" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByText("Bound", { exact: true })).toBeVisible();

    await context.close();
  });

  test("uses only accepted canonical API results for recalculation and share state", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/orbit-sandbox");

    await expect(page.getByRole("img", { name: "Returned relative trajectory" })).toBeVisible();
    await expect(page.getByText("601", { exact: true })).toBeVisible();

    const duration = page.getByRole("spinbutton", { name: /Simulation duration/ });
    await duration.fill(String(SHORT_STATE_DURATION_S));
    await page.getByRole("button", { name: "Calculate orbit" }).click();

    await expect(page.getByText("11", { exact: true })).toBeVisible();
    await expect(page.getByText(/Current committed state:/)).toContainText("100 s duration");
    const acceptedUrl = new URL(page.url());
    const acceptedState = acceptedUrl.searchParams.get("state");
    expect(acceptedState).not.toBeNull();
    expect(JSON.parse(acceptedState!)).toMatchObject({
      model_version: "orbit-sandbox-v1",
      version: 1,
      duration_s: SHORT_STATE_DURATION_S,
    });

    await duration.fill("101");
    await page.getByRole("button", { name: "Calculate orbit" }).click();

    await expect(
      page.getByText(/The canonical Orbit Sandbox rejected this configuration/i),
    ).toBeVisible();
    await expect(page.getByText("11", { exact: true })).toBeVisible();
    await expect(page.getByText(/Current committed state:/)).toContainText("100 s duration");
    expect(new URL(page.url()).searchParams.get("state")).toBe(acceptedState);

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
    await page.goto("/lab/orbit-sandbox");

    await expect(page.getByRole("heading", { level: 1, name: "Orbit Sandbox" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Returned relative trajectory" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    expect(
      (await page.getByRole("button", { name: "Calculate orbit" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset Earth-like circular preset" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    await context.close();
  });
});
