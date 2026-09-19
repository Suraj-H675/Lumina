import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Impact Simulator", () => {
  test("keeps canonical science, uncertainty, provenance, and limitations visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/impact-simulator");

    await expect(page.getByRole("heading", { level: 1, name: "Impact Simulator" })).toHaveCount(1);
    await expect(page.getByText(/impact-simulator-v1/)).toBeVisible();
    await expect(page.getByText(/not a complete statistical confidence interval/i)).toBeVisible();
    await expect(page.getByText(/not an equivalent blast-damage footprint/i)).toBeVisible();
    await expect(page.getByText(/lower-bound deposit/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Earth Impact Effects Program/i })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(2);

    await page.goto("/lab/impact-simulator?state=not-json");
    await expect(page.getByRole("heading", { name: "Shared impact state rejected" })).toBeVisible();
    await expect(page.getByText(/No browser-generated energy/i)).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(2);
    await context.close();
  });

  test("commits accepted canonical state, survives reload, and retains it after rejection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/impact-simulator");

    await expect(page.getByText(/20,661\.64/).first()).toBeVisible();
    const diameter = page.getByLabel("Impactor diameter m");
    await diameter.fill("2000");
    await page.getByRole("button", { name: "Calculate teaching model" }).click();
    await expect(page.getByText(/26,624\.77/).first()).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const accepted = new URL(page.url()).searchParams.get("state");
    const decoded = JSON.parse(accepted!);
    expect(decoded.version).toBe(1);
    expect(decoded.model_version).toBe("impact-simulator-v1");
    expect(decoded.diameter_m).toBe(2000);
    expect(decoded.target_material).toBe("sedimentary_rock");

    const acceptedUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(acceptedUrl);
    await expect(diameter).toHaveValue("2000");
    await expect(page.getByText(/26,624\.77/).first()).toBeVisible();

    await diameter.fill("2500");
    await page.getByRole("button", { name: "Calculate teaching model" }).click();
    await expect(page.getByText(/canonical Impact Simulator rejected this state/i)).toBeVisible();
    await expect(page.getByText(/26,624\.77/).first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("state")).toBe(accepted);

    await expect(page.getByText(/map, target location/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
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
    await page.goto("/lab/impact-simulator");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Calculate teaching model" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset synthetic preset" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    await expect(
      page.getByRole("img", { name: "Returned crater and ejecta relative scale" }),
    ).toBeVisible();
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
