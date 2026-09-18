import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Stellar Laboratory", () => {
  test("renders the canonical result and approximation disclosures without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/lab/stellar-laboratory");
    await expect(page.getByRole("heading", { level: 1, name: "Stellar Laboratory" })).toHaveCount(
      1,
    );
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(7);
    await expect(page.getByText(/stellar-laboratory-v1/)).toBeVisible();
    await expect(page.getByText(/not a stellar-evolution grid/i).first()).toBeVisible();
    await expect(page.getByText(/boundaries may change/i).first()).toBeVisible();

    await page.goto("/lab/stellar-laboratory?state=not-json");
    await expect(
      page.getByRole("heading", { name: "Shared stellar-laboratory state rejected" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);

    await context.close();
  });

  test("commits only accepted canonical mass states and retains the last valid result on 422", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/stellar-laboratory");

    await expect(page.getByText("carbon-oxygen white dwarf").first()).toBeVisible();
    const mass = page.getByRole("spinbutton", { name: /Initial stellar mass/i });
    await mass.fill("10");
    await page.getByRole("button", { name: "Calculate stellar model" }).click();
    await expect(page.getByText("neutron star").first()).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const acceptedState = new URL(page.url()).searchParams.get("state");
    expect(JSON.parse(acceptedState!)).toMatchObject({
      version: 1,
      model_version: "stellar-laboratory-v1",
      initial_mass_msun: 10,
    });

    await mass.fill("2");
    await page.getByRole("button", { name: "Calculate stellar model" }).click();
    await expect(
      page.getByText(/canonical Stellar Laboratory model rejected this mass/i),
    ).toBeVisible();
    await expect(page.getByText("neutron star").first()).toBeVisible();
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
    await page.goto("/lab/stellar-laboratory");

    await expect(page.getByRole("heading", { level: 1, name: "Stellar Laboratory" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Calculate stellar model" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset one-Solar-mass preset" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
