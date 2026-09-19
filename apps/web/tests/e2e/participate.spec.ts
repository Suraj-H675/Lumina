import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { assertStatusStubClean, setParticipateStubMode } from "./support/status-stub-control";

test.describe("Phase 8A — Participate", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    await setParticipateStubMode(testInfo, "fresh");
  });

  test.afterEach(async ({}, testInfo) => {
    await assertStatusStubClean(testInfo);
    await setParticipateStubMode(testInfo, "fresh");
  });

  test("keeps reviewed projects, challenges, safety, provenance, and handoff text usable without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/participate");

      await expect(page.getByRole("heading", { level: 1, name: "Participate" })).toHaveCount(1);
      await expect(page.getByText("Galaxy Zoo", { exact: true })).toBeVisible();
      await expect(page.getByText("Planet Hunters TESS", { exact: true })).toBeVisible();
      await expect(page.getByText("Month 1: Moon journal", { exact: true })).toBeVisible();
      await expect(page.getByText("Month 12: Repeat and compare", { exact: true })).toBeVisible();
      await expect(page.getByText("Never look at the Sun through the pinhole.")).toBeVisible();
      await expect(page.getByText("Never point the spectroscope at the Sun.")).toBeVisible();
      await expect(page.getByText(/There is no universal planisphere/i)).toBeVisible();
      await expect(page.getByText(/poor fit very near the equator/i)).toBeVisible();
      await expect(page.getByText(/You are leaving Lumina for Zooniverse/i).first()).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Open Galaxy Zoo on Zooniverse" }),
      ).toHaveAttribute("href", "https://www.zooniverse.org/projects/zookeeper/galaxy-zoo");
      await expect(
        page.getByRole("link", { name: "Open latitude-specific planisphere generator" }),
      ).toHaveAttribute("href", "https://in-the-sky.org/planisphere/index.php");
    } finally {
      await context.close();
    }
  });

  test("filters only the reviewed local project set and makes no browser-direct Panoptes request", async ({
    page,
  }) => {
    const zooniverseRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("zooniverse.org")) zooniverseRequests.push(request.url());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/participate");

    await expect(page).toHaveTitle(/Participate — Lumina/);
    await expect(page.getByText("6 of 6 projects shown")).toBeVisible();
    await page.getByLabel("Training time").selectOption("about_10_min");
    await expect(page.getByText("2 of 6 projects shown")).toBeVisible();
    await page.getByLabel("Skill focus").selectOption("visual_classification");
    await expect(page.getByText("1 of 6 projects shown")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Galaxy Zoo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planet Hunters TESS" })).toHaveCount(0);

    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByText("6 of 6 projects shown")).toBeVisible();
    expect(zooniverseRequests).toEqual([]);

    const galaxyLink = page.getByRole("link", { name: "Open Galaxy Zoo on Zooniverse" });
    await expect(galaxyLink).toHaveAttribute("target", "_blank");
    await expect(galaxyLink).toHaveAttribute("aria-describedby", /participate-handoff-galaxy-zoo/);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("labels stale status and withholds current status after expiry while keeping reviewed content", async ({
    page,
  }, testInfo) => {
    await setParticipateStubMode(testInfo, "stale");
    await page.goto("/participate");
    await expect(page.getByText("Project status may be stale")).toBeVisible();
    await expect(
      page.getByText(/Currently public and live — status may be stale/).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Galaxy Zoo" })).toBeVisible();

    await setParticipateStubMode(testInfo, "unavailable");
    await page.goto("/participate");
    await expect(page.getByText("Current project status unavailable").first()).toBeVisible();
    await expect(page.getByText("Currently public and live")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Galaxy Zoo" })).toBeVisible();
    await expect(page.getByText("Twelve evergreen monthly challenges")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hands-on activities" })).toBeVisible();
  });

  test("remains usable with forced colours, touch targets, and no horizontal overflow", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 640, height: 844 },
    });
    const page = await context.newPage();
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto("/participate");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect((await page.getByLabel("Training time").boundingBox())?.height).toBeGreaterThanOrEqual(
      44,
    );
    expect((await page.getByLabel("Device").boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await page.getByLabel("Skill focus").boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Reset filters" }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);

    const pinholeDetails = page.locator("details").filter({ hasText: "Pinhole projector" });
    await pinholeDetails.locator("summary").click();
    await expect(
      pinholeDetails.getByText("Never look at the Sun through the pinhole."),
    ).toBeVisible();
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    await context.close();
  });
});
