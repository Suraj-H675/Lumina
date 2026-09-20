import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 5B — Voyager 1 mission and trajectory", () => {
  test("renders sourced mission history and pinned trajectory without external runtime traffic", async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:3000") externalRequests.push(request.url());
    });

    await page.goto("/explore/missions/voyager-1");
    await expect(
      page.getByRole("heading", { level: 1, name: /Voyager 1 Mission Timeline and Trajectory/i }),
    ).toBeVisible();
    await expect(page.getByText(/launch on September 5, 1977/i)).toBeVisible();
    await expect(page.getByText(/Horizons vector series begins September 6/i)).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Interstellar space" })).toBeVisible();
    expect(externalRequests).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("moves to the first pinned vector while preserving XYZ and projection disclosure", async ({
    page,
  }) => {
    await page.goto("/explore/missions/voyager-1");
    const slider = page.getByRole("slider", { name: "Voyager 1 annual trajectory sample" });
    await slider.focus();
    await slider.press("Home");
    await expect(page.getByText(/Selected annual sample: 1977/i)).toBeVisible();
    const vector = page.getByRole("region", { name: /Selected Horizons vector · 1977/i });
    await expect(vector.getByText("0.967932 AU", { exact: true })).toBeVisible();
    await expect(vector.getByText("0.000171 AU", { exact: true })).toBeVisible();
    await expect(page.getByText(/Z is not drawn in the projection/i)).toBeVisible();
  });

  test("keeps complete mission, provenance, and fifty-vector table useful without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/explore/missions/voyager-1");
    await expect(page.getByRole("heading", { level: 2, name: "Mission milestones" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Complete annual vector table" }),
    ).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "1977" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "2026" })).toBeVisible();
    await expect(
      page.getByText("827e0323d9a64632fc7dedf5d9d905adf2690adf7270d4e7251ea03ef7042d1f"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Model and limitations" }),
    ).toBeVisible();
    await context.close();
  });

  test("stays usable at 320px with forced colors, reduced motion, and touch controls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto("/explore/missions/voyager-1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const slider = page.getByRole("slider", { name: "Voyager 1 annual trajectory sample" });
    expect((await slider.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(
      page.getByRole("img", { name: /ecliptic XY trajectory projection/i }),
    ).toBeVisible();
  });
});
