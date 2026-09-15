import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 5B — Solar System Distance Explorer", () => {
  test("renders the reviewed model without external astronomy-data traffic", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:3000") externalRequests.push(request.url());
    });

    await page.goto("/explore/solar-system");
    await expect(
      page.getByRole("heading", { level: 1, name: "Solar System Distance Explorer" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
    await expect(page.getByText(/not a live Solar System snapshot/i)).toBeVisible();
    await expect(page.getByText(/uniform presentation size/i)).toBeVisible();
    expect(externalRequests).toEqual([]);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("compares log and linear spacing and links size to the certified Scale Explorer", async ({
    page,
  }) => {
    await page.goto("/explore/solar-system");
    await page.getByRole("button", { name: "Linear distance" }).click();
    await expect(page.getByText(/1.29% of this linear track/i)).toBeVisible();

    await page.getByRole("button", { name: "Jupiter" }).click();
    const jupiterRegion = page.getByRole("region", { name: "Jupiter" });
    await expect(jupiterRegion.getByRole("heading", { level: 2, name: "Jupiter" })).toBeVisible();
    await expect(jupiterRegion.getByText("5.2 AU", { exact: true })).toBeVisible();
    await expect(
      jupiterRegion.getByRole("link", { name: /Compare Jupiter's characteristic size/i }),
    ).toHaveAttribute("href", "/lab/scale-explorer/jupiter");
  });

  test("keeps the complete model and sources useful without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/explore/solar-system");

    await expect(
      page.getByRole("heading", { level: 1, name: "Solar System Distance Explorer" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Data alternative" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "30.05 AU" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Model and limitations" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Sources" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Basics of Space Flight, Chapter 1/i }),
    ).toBeVisible();
    await context.close();
  });

  test("remains usable at 320px, reduced motion, and forced colors", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.goto("/explore/solar-system");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const toggle = page.getByRole("button", { name: "Linear distance" });
    expect((await toggle.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
  });
});
