import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 5B — System Scale Compare", () => {
  test("renders the three reviewed default quantities without external runtime traffic", async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:3000") externalRequests.push(request.url());
    });
    await page.goto("/explore/system-compare");
    await expect(
      page.getByRole("heading", { level: 1, name: "System Scale Compare" }),
    ).toBeVisible();
    await expect(page.getByText(/Shared units support arithmetic comparison/i)).toBeVisible();
    await expect(page.getByRole("region", { name: "Earth shared scale reference" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Kepler-452 b shared scale reference" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Voyager 1 · 2026 shared scale reference" }),
    ).toBeVisible();
    expect(externalRequests).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("changes all three references while preserving quantity labels", async ({ page }) => {
    await page.goto("/explore/system-compare");
    await page.getByLabel("Solar System reference").selectOption("solar:neptune");
    await page.getByLabel("Exoplanet orbital reference").selectOption("exoplanet:51-peg-b");
    await page.getByLabel("Voyager annual reference").selectOption("voyager:1977");
    await page.getByRole("button", { name: "Linear AU scale" }).click();

    await expect(
      page.getByRole("region", { name: "Neptune shared scale reference" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "51 Peg b shared scale reference" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Voyager 1 · 1977 shared scale reference" }),
    ).toBeVisible();
    await expect(
      page.getByText("Mean distance from the Sun", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Orbit semi-major axis", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Heliocentric position-vector magnitude", { exact: true }).first(),
    ).toBeVisible();
  });

  test("keeps default numeric comparison, model limits, and full inventory available without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/explore/system-compare");
    await expect(
      page.getByRole("heading", { level: 2, name: "Default comparison data" }),
    ).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Earth" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Kepler-452 b" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Voyager 1 · 2026" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Composition model and limits" }),
    ).toBeVisible();
    await page.getByText("Show all 68 AU references").click();
    await expect(page.getByRole("rowheader", { name: "Voyager 1 · 1977" })).toBeVisible();
    await context.close();
  });

  test("remains usable at 320px with forced colors and touch-sized controls", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto("/explore/system-compare");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const select = page.getByLabel("Solar System reference");
    expect((await select.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("region", { name: "Earth shared scale reference" })).toBeVisible();
  });
});
