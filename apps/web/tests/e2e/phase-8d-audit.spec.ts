import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CORE_ROUTES: ReadonlyArray<Readonly<{ path: string; heading: RegExp }>> = [
  { path: "/", heading: /Mission Control/i },
  { path: "/explore", heading: /Explore real objects/i },
  { path: "/learn", heading: /Understand the sky by looking up/i },
  { path: "/lab", heading: /^Lab$/i },
  { path: "/observe", heading: /Choose an object/i },
  { path: "/identify", heading: /Identify an astronomical image/i },
  { path: "/journal", heading: /Journal/i },
  { path: "/participate", heading: /Participate/i },
  { path: "/tonight", heading: /Tonight/i },
];

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test.describe("Phase 8D — accessibility and low-end audit", () => {
  test("core product surfaces reflow at the 200% presentation target", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      // A 640 CSS-pixel viewport plus 200% zoom exercises the 320 CSS-pixel
      // reflow target used elsewhere in the certified Phase 8B/Scale suites.
      viewport: { width: 640, height: 900 },
    });
    const page = await context.newPage();

    for (const route of CORE_ROUTES) {
      await page.goto(route.path);
      await page.evaluate(() => {
        document.documentElement.style.zoom = "2";
      });
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expectNoDocumentOverflow(page);
    }

    await context.close();
  });

  test("core product surfaces expose stable landmarks and pass automated axe checks", async ({
    page,
  }) => {
    for (const route of CORE_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(1);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `axe violations on ${route.path}`).toEqual([]);
    }
  });

  test("core discovery stays usable under a constrained low-end browser profile", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      connectionType: "cellular4g",
      downloadThroughput: 200_000,
      latency: 150,
      offline: false,
      uploadThroughput: 100_000,
    });

    try {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: "Mission Control" })).toBeVisible({
        timeout: 15_000,
      });

      await page.goto("/explore");
      await expect(
        page.getByRole("heading", { level: 1, name: /Explore real objects/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("combobox", { name: /search the catalogue/i })).toBeVisible();

      await page.goto("/objects/k2-18");
      await expect(page.getByRole("heading", { level: 1, name: "K2-18" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("ESA Gaia Archive").first()).toBeVisible();

      await page.goto("/lab");
      await expect(page.getByRole("heading", { level: 1, name: /^Lab$/i })).toBeVisible({
        timeout: 15_000,
      });
      await expectNoDocumentOverflow(page);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await cdp.send("Network.emulateNetworkConditions", {
        downloadThroughput: -1,
        latency: 0,
        offline: false,
        uploadThroughput: -1,
      });
    }
  });
});
