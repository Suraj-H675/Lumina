import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Rocket / Mission Designer", () => {
  test("keeps canonical results, provenance, and limitations visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/rocket-mission-designer");

    await expect(
      page.getByRole("heading", { level: 1, name: "Rocket / Mission Designer" }),
    ).toHaveCount(1);
    await expect(page.getByText(/rocket-mission-designer-v1/)).toBeVisible();
    await expect(page.getByText(/not a mission delta-v requirement/i)).toBeVisible();
    await expect(page.getByText(/operational launch planning/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Ideal Rocket Equation/i })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(3);

    await page.goto("/lab/rocket-mission-designer?state=not-json");
    await expect(page.getByRole("heading", { name: "Shared rocket state rejected" })).toBeVisible();
    await expect(page.getByText(/not a mission delta-v requirement/i)).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(3);
    await context.close();
  });

  test("commits accepted canonical state, survives reload, and retains it after rejection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/rocket-mission-designer");

    await expect(page.getByText(/10,004\.97/).first()).toBeVisible();
    const payload = page.getByLabel("Payload mass kg");
    await payload.fill("6000");
    await page.getByRole("button", { name: "Calculate ideal model" }).click();
    await expect(page.getByText(/9,785\.613/).first()).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const accepted = new URL(page.url()).searchParams.get("state");
    const decoded = JSON.parse(accepted!);
    expect(decoded.version).toBe(1);
    expect(decoded.model_version).toBe("rocket-mission-designer-v1");
    expect(decoded.payload_mass_kg).toBe(6000);
    expect(decoded.stages).toHaveLength(2);

    const acceptedUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(acceptedUrl);
    await expect(payload).toHaveValue("6000");
    await expect(page.getByText(/9,785\.613/).first()).toBeVisible();

    await payload.fill("7000");
    await page.getByRole("button", { name: "Calculate ideal model" }).click();
    await expect(
      page.getByText(/canonical Rocket \/ Mission Designer rejected this state/i),
    ).toBeVisible();
    await expect(page.getByText(/9,785\.613/).first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("state")).toBe(accepted);

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
    await page.goto("/lab/rocket-mission-designer");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Calculate ideal model" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset synthetic preset" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    await expect(
      page.getByRole("img", { name: "Returned payload sensitivity plot" }),
    ).toBeVisible();
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
