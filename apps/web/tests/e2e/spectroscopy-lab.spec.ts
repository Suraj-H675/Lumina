import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Spectroscopy Lab", () => {
  test("keeps canonical spectrum metadata and provenance visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/spectroscopy-lab");

    await expect(page.getByRole("heading", { level: 1, name: "Spectroscopy Lab" })).toHaveCount(1);
    await expect(page.getByText(/spectroscopy-lab-v1/)).toBeVisible();
    await expect(page.getByText(/^Wien peak:/)).toBeVisible();
    await expect(page.getByRole("cell", { name: "H-alpha representative" })).toBeVisible();
    await expect(page.getByRole("link", { name: /NIST Atomic Spectra Database/i })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);

    await page.goto("/lab/spectroscopy-lab?state=not-json");
    await expect(
      page.getByRole("heading", { name: "Shared spectroscopy state rejected" }),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: "H-alpha representative" })).toBeVisible();
    await context.close();
  });

  test("commits accepted canonical state and retains it after a rejected calculation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/spectroscopy-lab");

    await expect(page.getByText("H-alpha representative")).toBeVisible();
    await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("continuum");
    await page.getByLabel("Temperature K").fill("6000");
    await page.getByRole("button", { name: "Calculate spectrum" }).click();
    await expect(
      page.getByText(/Continuum mode returns no atomic fingerprint lines/i),
    ).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const accepted = new URL(page.url()).searchParams.get("state");
    expect(JSON.parse(accepted!)).toMatchObject({
      version: 1,
      model_version: "spectroscopy-lab-v1",
      mode: "continuum",
      temperature_k: 6000,
      selected_elements: [],
    });

    await page.getByLabel("Temperature K").fill("6100");
    await page.getByRole("button", { name: "Calculate spectrum" }).click();
    await expect(page.getByText(/canonical Spectroscopy Lab rejected this state/i)).toBeVisible();
    await expect(
      page.getByText(/Continuum mode returns no atomic fingerprint lines/i),
    ).toBeVisible();
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
    await page.goto("/lab/spectroscopy-lab");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Calculate spectrum" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset Solar-like absorption preset" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("img", { name: /Returned normalized spectrum/i })).toBeVisible();
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
