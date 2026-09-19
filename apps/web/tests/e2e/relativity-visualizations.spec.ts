import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Relativity Visualizations", () => {
  test("keeps canonical SR lessons, frame semantics, light cones, provenance, and GR handoff visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/relativity-visualizations");

    await expect(
      page.getByRole("heading", { level: 1, name: "Relativity Visualizations" }),
    ).toHaveCount(1);
    await expect(page.getByText(/relativity-visualizations-v1/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Time dilation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Length contraction" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Relativity of simultaneity" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Light cones" })).toBeVisible();
    await expect(page.getByText(/not a photographic appearance/i)).toBeVisible();
    await expect(page.getByText(/future-left/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /certified Schwarzschild/i })).toHaveAttribute(
      "href",
      "/lab/black-hole-relativity",
    );
    await expect(page.getByRole("link", { name: /5.3 Time Dilation/i })).toBeVisible();

    await page.goto("/lab/relativity-visualizations?state=not-json");
    await expect(
      page.getByRole("heading", { name: "Shared relativity state rejected" }),
    ).toBeVisible();
    await expect(page.getByText(/No browser-generated Lorentz factor/i)).toHaveCount(0);
    await expect(page.getByText(/relativity-visualizations-v1/)).toBeVisible();
    await context.close();
  });

  test("commits accepted canonical state, survives reload, and retains it after rejection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/relativity-visualizations");

    await expect(page.getByText("-0.75", { exact: false }).first()).toBeVisible();
    const beta = page.getByLabel("Relative speed as fraction of c");
    await beta.fill("0.8");
    await page.getByRole("button", { name: "Calculate special relativity" }).click();
    await expect(page.getByText(/1\.333333/).first()).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const accepted = new URL(page.url()).searchParams.get("state");
    const decoded = JSON.parse(accepted!);
    expect(decoded.version).toBe(1);
    expect(decoded.model_version).toBe("relativity-visualizations-v1");
    expect(decoded.relative_speed_fraction_c).toBe(0.8);
    expect(decoded.proper_time_s).toBe(10);
    expect(decoded.proper_length_m).toBe(100);
    expect(decoded.simultaneous_event_separation_m).toBe(299792458);

    const acceptedUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(acceptedUrl);
    await expect(beta).toHaveValue("0.8");
    await expect(page.getByText(/1\.333333/).first()).toBeVisible();

    await beta.fill("0.9");
    await page.getByRole("button", { name: "Calculate special relativity" }).click();
    await expect(
      page.getByText(/canonical Relativity Visualizations model rejected this state/i),
    ).toBeVisible();
    await expect(page.getByText(/1\.333333/).first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("state")).toBe(accepted);

    await expect(page.getByText(/not a photographic appearance/i)).toBeVisible();
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
    await page.goto("/lab/relativity-visualizations");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Calculate special relativity" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset synthetic preset" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    await expect(
      page.getByRole("img", {
        name: "Reviewed normalized special-relativity light-cone diagram",
      }),
    ).toBeVisible();
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
