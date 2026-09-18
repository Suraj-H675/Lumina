import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 7 — Radial Velocity Lab", () => {
  test("renders the canonical result and model disclosures without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/lab/radial-velocity");
    await expect(page.getByRole("heading", { level: 1, name: "Radial Velocity Lab" })).toHaveCount(
      1,
    );
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(6);
    await expect(page.getByText(/radial-velocity-v1/)).toBeVisible();
    await expect(page.getByText(/Mp sin\(i\)/i).first()).toBeVisible();
    await expect(page.getByText(/No stellar activity/i)).toBeVisible();

    await page.goto("/lab/radial-velocity?state=not-json");
    await expect(
      page.getByRole("heading", { name: "Shared radial-velocity state rejected" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(page.getByText(/radial-velocity-v1/)).toBeVisible();

    await context.close();
  });

  test("commits only an accepted canonical state and retains the last valid result on 422", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/radial-velocity");

    await expect(
      page.getByRole("img", { name: "Returned stellar radial-velocity curve" }),
    ).toBeVisible();
    await expect(page.getByText(/RV semi-amplitude K/i)).toBeVisible();

    await page.getByRole("button", { name: "Calculate radial velocity" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("state")).not.toBeNull();
    const acceptedState = new URL(page.url()).searchParams.get("state");
    expect(acceptedState).not.toBeNull();
    expect(JSON.parse(acceptedState!)).toMatchObject({
      model_version: "radial-velocity-v1",
      version: 1,
      stellar_mass_kg: 2e30,
      planet_mass_kg: 2e27,
      inclination_deg: 90,
    });

    const inclination = page.getByRole("spinbutton", { name: /Inclination/ });
    await inclination.fill("40");
    await page.getByRole("button", { name: "Calculate radial velocity" }).click();

    await expect(
      page.getByText(/canonical Radial Velocity model rejected this configuration/i),
    ).toBeVisible();
    await expect(page.getByText(/RV semi-amplitude K/i)).toBeVisible();
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
    await page.goto("/lab/radial-velocity");

    await expect(
      page.getByRole("heading", { level: 1, name: "Radial Velocity Lab" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Returned stellar radial-velocity curve" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    expect(
      (await page.getByRole("button", { name: "Calculate radial velocity" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset synthetic circular preset" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    await context.close();
  });
});
