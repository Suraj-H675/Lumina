import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const DEFAULT_STATE = {
  version: 1,
  model_version: "hr-diagram-explorer-v1",
  view: "physical_hr",
  selected_star_id: "gaia-dr3-598546371788334080",
  spectral_classes: ["O", "B", "A", "F", "G", "K", "M"],
  stage_groups: ["main_sequence", "turnoff_transition", "red_giant_branch"],
  clusters: ["pleiades", "hyades", "praesepe", "m67"],
};

const M67_G_MAIN_SEQUENCE_STATE = {
  ...DEFAULT_STATE,
  view: "gaia_cmd",
  spectral_classes: ["G"],
  stage_groups: ["main_sequence"],
  clusters: ["m67"],
};

test.describe("Phase 3B — H-R Diagram Explorer", () => {
  test("renders the complete curated data result and valid serialized view without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/lab/hr-diagram-explorer");
    await expect(page.getByRole("heading", { level: 1, name: "H-R Diagram Explorer" })).toHaveCount(
      1,
    );
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(128);
    await expect(page.getByText(/128 of 128 curated stars match the active filters/)).toBeVisible();
    await expect(page.getByText("598546371788334080", { exact: true })).toBeVisible();
    await expect(page.getByText(/Gaia Data Release 3 Documentation release 1\.3/)).toBeVisible();

    const encodedState = encodeURIComponent(JSON.stringify(M67_G_MAIN_SEQUENCE_STATE));
    await page.goto(`/lab/hr-diagram-explorer?state=${encodedState}`);
    await expect(page.getByText(/Gaia colour–magnitude view:/)).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(4);
    await expect(page.getByText(/4 of 128 curated stars match the active filters/)).toBeVisible();

    await page.goto("/lab/hr-diagram-explorer?state=not-json");
    await expect(
      page.getByRole("alert", { name: /the shared H-R Diagram Explorer state was not valid/i }),
    ).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(128);

    await context.close();
  });

  test("supports real view/filter/selection interaction and accessible plot fallback", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/hr-diagram-explorer");

    await expect(
      page.getByRole("heading", { level: 1, name: "H-R Diagram Explorer" }),
    ).toBeVisible();
    await expect(page.getByTestId("hr-diagram-plot")).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(128);
    await expect(page.getByText(/hotter \/ higher temperature/i).first()).toBeVisible();
    await expect(page.getByLabel("Keyboard star selector")).toBeVisible();

    await page.getByLabel("Diagram view").selectOption("gaia_cmd");
    await expect(page.getByText(/Gaia BP−RP colour \(mag\)/)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("state")).toContain('"view":"gaia_cmd"');

    await page.getByLabel("G", { exact: true }).uncheck();
    await expect(page.getByText(/97 of 128 stars match the active filters/)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("state")).toContain(
      '"spectral_classes":["O","B","A","F","K","M"]',
    );
    await page.getByLabel("Keyboard star selector").selectOption({ index: 0 });
    await expect(page.getByText(/Selected star/)).toBeVisible();

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("recovers invalid state and remains usable with forced colours and touch", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 640, height: 844 },
    });
    const page = await context.newPage();
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto("/lab/hr-diagram-explorer?state=not-json");

    const alert = page.getByRole("alert", {
      name: /the shared H-R Diagram Explorer state was not valid/i,
    });
    await expect(alert).toBeVisible();
    const reset = page.getByRole("button", { name: "Reset to default state" });
    expect((await reset.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await reset.click();
    await expect(alert).toHaveCount(0);
    await expect(page).toHaveURL("/lab/hr-diagram-explorer");

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
