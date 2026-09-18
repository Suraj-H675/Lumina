import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Planetary System Builder", () => {
  test("keeps canonical results, provenance, and limitations visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/lab/planetary-system-builder");

    await expect(
      page.getByRole("heading", { level: 1, name: "Planetary System Builder" }),
    ).toHaveCount(1);
    await expect(page.getByText(/planetary-system-builder-v1/)).toBeVisible();
    await expect(page.getByText(/does not establish habitability or life/i)).toBeVisible();
    await expect(page.getByText(/no long-term multi-planet stability claim/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Habitable Zones Around Main-Sequence Stars/i }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(2);

    await page.goto("/lab/planetary-system-builder?state=not-json");
    await expect(
      page.getByRole("heading", { name: "Shared planetary-system state rejected" }),
    ).toBeVisible();
    await expect(page.getByText(/does not establish habitability or life/i)).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(2);
    await context.close();
  });

  test("commits accepted canonical state and retains it after a rejected calculation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/planetary-system-builder");

    await expect(page.getByText(/213\.916/)).toBeVisible();
    const firstAxis = page.getByLabel("Planet 1 semimajor axis AU");
    await firstAxis.fill("0.8");
    await page.getByRole("button", { name: "Calculate system" }).click();
    await expect(page.getByText(/261\.356/)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const accepted = new URL(page.url()).searchParams.get("state");
    const decoded = JSON.parse(accepted!);
    expect(decoded.version).toBe(1);
    expect(decoded.model_version).toBe("planetary-system-builder-v1");
    expect(decoded.planets[0]).toEqual({ mass_mearth: 1, semi_major_axis_au: 0.8 });

    await firstAxis.fill("0.9");
    await page.getByRole("button", { name: "Calculate system" }).click();
    await expect(
      page.getByText(/canonical Planetary System Builder rejected this state/i),
    ).toBeVisible();
    await expect(page.getByText(/261\.356/)).toBeVisible();
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
    await page.goto("/lab/planetary-system-builder");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("button", { name: "Calculate system" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset illustrative preset" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    await expect(
      page.getByRole("img", { name: /Returned planetary-system placement diagram/i }),
    ).toBeVisible();
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
