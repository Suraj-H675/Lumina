import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 3B — Seasons Simulator", () => {
  test("keeps the canonical model result and disclosures readable without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/lab/seasons-simulator");
    await expect(page.getByRole("heading", { level: 1, name: "Seasons Simulator" })).toHaveCount(1);
    await expect(page.getByText(/Geometric day-length approximation/)).toBeVisible();
    await expect(page.getByText(/14\.8\s+h/)).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(2);
    await expect(page.getByText(/seasons-simulator-v1/)).toBeVisible();
    await expect(page.getByRole("link", { name: "What Causes the Seasons?" })).toHaveAttribute(
      "href",
      "https://spaceplace.nasa.gov/seasons/en/",
    );
    await expect(page.getByRole("button")).toHaveCount(0);

    await page.goto("/lab/seasons-simulator?state=not-json");
    await expect(
      page.getByRole("alert", { name: /the shared seasons simulator state was not valid/i }),
    ).toBeVisible();
    await expect(page.getByText(/14\.8\s+h/)).toBeVisible();

    await context.close();
  });

  test("supports a validated interactive eccentricity change, reduced motion, and axe", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/seasons-simulator");

    await expect(page.getByRole("heading", { level: 1, name: "Seasons Simulator" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    const phaseSlider = page.getByRole("slider", { name: "Orbital position slider" });
    await phaseSlider.focus();
    await expect(phaseSlider).toBeFocused();
    await expect(
      page.getByText(/orbital position is a seasonal angle, not a calendar date/i),
    ).toBeVisible();

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    await page.getByLabel("Eccentricity context preset").selectOption("circular");
    await expect(page.getByText("1.0000× (+0.0%)").first()).toBeVisible();
    const state = new URL(page.url()).searchParams.get("state");
    expect(state).toContain('"eccentricity_preset":"circular"');

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page).toHaveURL("/lab/seasons-simulator");
    await expect(page.getByText("0.9682× (-3.2%)").first()).toBeVisible();
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
    await page.goto("/lab/seasons-simulator");

    await expect(page.getByRole("heading", { level: 1, name: "Seasons Simulator" })).toBeVisible();
    await expect(page.getByRole("button", { name: "June solstice" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const resetButton = page.getByRole("button", { name: "Reset", exact: true });
    expect((await resetButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    await context.close();
  });
});
