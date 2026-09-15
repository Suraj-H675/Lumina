import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 5B — Exoplanet System Layouts", () => {
  test("renders the pinned Kepler-186 system without runtime archive traffic", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:3000") externalRequests.push(request.url());
    });

    await page.goto("/explore/exoplanet-systems");
    await expect(
      page.getByRole("heading", { level: 1, name: "Exoplanet System Layouts" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Kepler-186, 5 confirmed planets/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/not the planet's current distance/i)).toBeVisible();
    expect(externalRequests).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("keeps HD 209458 parameter references independent", async ({ page }) => {
    await page.goto("/explore/exoplanet-systems");
    await page.getByRole("button", { name: /HD 209458, 1 confirmed planet/i }).click();
    const detail = page.getByRole("region", { name: "HD 209458 b" });
    await expect(detail.getByText("0.04707 AU", { exact: true })).toBeVisible();
    await expect(detail.getByRole("link", { name: /Bonomo et al\. 2017/i })).toBeVisible();
    await expect(detail.getByRole("link", { name: /Stassun et al\. 2017/i })).toBeVisible();
  });

  test("keeps all pinned data, provenance, and limitations useful without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/explore/exoplanet-systems");
    await expect(page.getByRole("heading", { level: 2, name: "Data alternative" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Kepler-186 f" })).toBeVisible();
    await expect(
      page.getByText("74a1dde951b63b630653c94c36880cfd9b015faa2c600315f5e06fa22596c9db"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Model and limitations" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Snapshot provenance" }),
    ).toBeVisible();
    await context.close();
  });

  test("remains usable at 320px with forced colors and touch-sized controls", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto("/explore/exoplanet-systems");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const systemButton = page.getByRole("button", { name: /K2-18, 2 confirmed planets/i });
    expect((await systemButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await systemButton.click();
    await expect(page.getByRole("heading", { level: 2, name: "K2-18 b" })).toBeVisible();
  });
});
