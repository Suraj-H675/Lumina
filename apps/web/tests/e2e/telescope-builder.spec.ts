import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const DEFAULT_STATE = {
  version: 1,
  model_version: "telescope-builder-v1",
  aperture_mm: 100,
  telescope_focal_length_mm: 1000,
  telescope_type: "refractor",
  eyepiece_focal_length_mm: 20,
  eyepiece_apparent_field_deg: 50,
  optical_modifier_kind: "none",
  optical_modifier_factor: 1,
  target_angular_size_arcmin: 30,
};

const BARLOW_STATE = {
  ...DEFAULT_STATE,
  optical_modifier_kind: "barlow",
  optical_modifier_factor: 2,
};

test.describe("Phase 3B — Telescope Builder", () => {
  test("renders canonical default and valid share results without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/lab/telescope-builder");
    await expect(page.getByRole("heading", { level: 1, name: "Telescope Builder" })).toHaveCount(1);
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(12);
    await expect(page.getByText(/50\.0\s*×/)).toBeVisible();
    await expect(page.getByText(/1\.00\s*°/)).toBeVisible();
    await expect(page.getByText(/2\.00\s*mm/)).toBeVisible();
    await expect(page.getByText(/telescope-builder-v1/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "How to Choose Your Telescope Magnification" }),
    ).toHaveAttribute(
      "href",
      "https://skyandtelescope.org/astronomy-equipment/choosing-your-telescopes-magnification/",
    );

    const encodedBarlow = encodeURIComponent(JSON.stringify(BARLOW_STATE));
    await page.goto(`/lab/telescope-builder?state=${encodedBarlow}`);
    await expect(page.getByText(/2000\.00\s*mm/)).toBeVisible();
    await expect(page.getByText(/100\.0\s*×/)).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Approximate true field 0\.50°/ }).getByRole("cell"),
    ).toBeVisible();
    await expect(page.getByText(/supplied effective focal-length multiplier/i)).toBeVisible();

    await page.goto("/lab/telescope-builder?state=not-json");
    await expect(
      page.getByRole("alert", { name: /the shared Telescope Builder state was not valid/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calculation unavailable" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    await context.close();
  });

  test("uses the canonical GET result for type and modifier changes", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/telescope-builder");

    const type = page.getByLabel("Telescope type");
    await type.focus();
    await expect(type).toBeFocused();
    await type.selectOption("reflector");
    await page.getByRole("button", { name: "Calculate" }).click();
    await expect(page.getByText(/Numeric outputs are invariant across the three/i)).toContainText(
      "reflector",
    );
    await expect(page.getByText(/50\.0\s*×/)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("state")).toContain('"telescope_type":"reflector"');

    await page.getByLabel("Optical modifier kind").selectOption("barlow");
    await page.getByRole("spinbutton", { name: "Effective modifier factor" }).fill("2");
    await page.getByRole("button", { name: "Calculate" }).click();
    await expect(page.getByText(/2000\.00\s*mm/)).toBeVisible();
    await expect(page.getByText(/100\.0\s*×/)).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Approximate true field 0\.50°/ }).getByRole("cell"),
    ).toBeVisible();
    await expect(page.getByText(/target fit: fits/i)).toBeVisible();

    await page.getByLabel("Optical modifier kind").selectOption("none");
    await expect(page.getByRole("spinbutton", { name: "Effective modifier factor" })).toHaveValue(
      "1",
    );
    await page.getByRole("button", { name: "Calculate" }).click();
    await expect(page.getByText(/1000\.00\s*mm/)).toBeVisible();

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
    await page.goto("/lab/telescope-builder");

    await expect(page.getByRole("heading", { level: 1, name: "Telescope Builder" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Reset", exact: true }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    await context.close();
  });
});
