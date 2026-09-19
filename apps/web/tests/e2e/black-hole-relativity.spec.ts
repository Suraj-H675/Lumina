import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Black-Hole / Relativity Lab", () => {
  test("keeps canonical landmarks, static-clock semantics, provenance, and limits visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/black-hole-relativity");

    await expect(
      page.getByRole("heading", { level: 1, name: "Black-Hole / Relativity Lab" }),
    ).toHaveCount(1);
    await expect(page.getByText(/black-hole-relativity-v1/)).toBeVisible();
    await expect(page.getByText(/hypothetical static Schwarzschild observer/i)).toBeVisible();
    await expect(page.getByText(/not freely falling/i)).toBeVisible();
    await expect(page.getByText(/ray tracing/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /IAU 2015 Resolution B3/i })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);

    await page.goto("/lab/black-hole-relativity?state=not-json");
    await expect(
      page.getByRole("heading", { name: "Shared relativity state rejected" }),
    ).toBeVisible();
    await expect(page.getByText(/No browser-generated horizon/i)).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(1);
    await context.close();
  });

  test("commits accepted canonical state, survives reload, and retains it after rejection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/black-hole-relativity");

    await expect(page.getByText(/0\.4142136/).first()).toBeVisible();
    const radius = page.getByLabel("Static observer radius in Schwarzschild radii");
    await radius.fill("4");
    await page.getByRole("button", { name: "Calculate Schwarzschild model" }).click();
    await expect(page.getByText(/0\.1547005/).first()).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const accepted = new URL(page.url()).searchParams.get("state");
    const decoded = JSON.parse(accepted!);
    expect(decoded.version).toBe(1);
    expect(decoded.model_version).toBe("black-hole-relativity-v1");
    expect(decoded.mass_nominal_solar).toBe(10);
    expect(decoded.static_observer_radius_rs).toBe(4);

    const acceptedUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(acceptedUrl);
    await expect(radius).toHaveValue("4");
    await expect(page.getByText(/0\.1547005/).first()).toBeVisible();

    await radius.fill("5");
    await page.getByRole("button", { name: "Calculate Schwarzschild model" }).click();
    await expect(
      page.getByText(/canonical Black-Hole \/ Relativity Lab rejected this state/i),
    ).toBeVisible();
    await expect(page.getByText(/0\.1547005/).first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("state")).toBe(accepted);

    await expect(page.getByText(/not proper radial distance, ray tracing/i)).toBeVisible();
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
    await page.goto("/lab/black-hole-relativity");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Calculate Schwarzschild model" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset synthetic preset" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    await expect(
      page.getByRole("img", { name: "Returned Schwarzschild landmark areal-radius schematic" }),
    ).toBeVisible();
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
