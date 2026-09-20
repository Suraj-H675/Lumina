import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Transit Method Lab", () => {
  test("renders the canonical result and model disclosures without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/lab/transit-method");
    await expect(page.getByRole("heading", { level: 1, name: "Transit Method Lab" })).toHaveCount(
      1,
    );
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(10);
    await expect(page.getByText("Full transit", { exact: true })).toBeVisible();
    await expect(page.getByText("301", { exact: true })).toBeVisible();
    await expect(page.getByText(/transit-method-v1/)).toBeVisible();
    await expect(page.getByText(/No limb darkening/i)).toBeVisible();
    await expect(page.getByText(/synthetic central transit/i)).toBeVisible();

    await page.goto("/lab/transit-method?state=not-json");
    await expect(
      page.getByRole("heading", { name: "Shared transit state rejected" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByText("Full transit", { exact: true })).toBeVisible();

    await context.close();
  });

  test("commits only an accepted canonical state and retains the last valid result on 422", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/transit-method");

    await expect(
      page.getByRole("img", { name: "Returned relative-flux light curve" }),
    ).toBeVisible();
    await expect(page.getByText("Full transit", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Calculate transit" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const acceptedUrl = new URL(page.url());
    const acceptedState = acceptedUrl.searchParams.get("state");
    expect(acceptedState).not.toBeNull();
    expect(JSON.parse(acceptedState!)).toMatchObject({
      model_version: "transit-method-v1",
      version: 1,
      stellar_radius_m: 1_000_000_000,
      planet_radius_m: 100_000_000,
      inclination_deg: 90,
    });

    const planetRadius = page.getByRole("spinbutton", { name: /Planet radius/ });
    await planetRadius.fill("1000000000");
    await page.getByRole("button", { name: "Calculate transit" }).click();

    await expect(
      page.getByText(/canonical Transit Method model rejected this configuration/i),
    ).toBeVisible();
    await expect(page.getByText("Full transit", { exact: true })).toBeVisible();
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
    await page.goto("/lab/transit-method");

    await expect(page.getByRole("heading", { level: 1, name: "Transit Method Lab" })).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Returned relative-flux light curve" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    expect(
      (await page.getByRole("button", { name: "Calculate transit" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (
        await page
          .getByRole("button", { name: "Reset synthetic central-transit preset" })
          .boundingBox()
      )?.height,
    ).toBeGreaterThanOrEqual(44);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    await context.close();
  });
});
