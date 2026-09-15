import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const WWT_HOSTS = new Set([
  "web.wwtassets.org",
  "cdn.worldwidetelescope.org",
  "www.worldwidetelescope.org",
]);

const DSS_ROOT_TILE = "https://cdn.worldwidetelescope.org/wwtweb/dss.aspx?q=0,0,0";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXkAAAAASUVORK5CYII=",
  "base64",
);

async function stubApprovedWwtNetwork(page: Page): Promise<void> {
  await page.route("https://cdn.worldwidetelescope.org/**", async (route) => {
    if (route.request().url() === DSS_ROOT_TILE) {
      await route.fulfill({ body: ONE_PIXEL_PNG, contentType: "image/png", status: 200 });
    } else {
      await route.abort("failed");
    }
  });
  await page.route("https://www.worldwidetelescope.org/**", (route) => route.abort("failed"));
  await page.route("https://web.wwtassets.org/**", (route) => route.abort("failed"));
}

test.describe("Phase 5A — deep-sky atlas", () => {
  test("renders canonical M31 science and keeps WWT dormant until explicit activation", async ({
    page,
  }) => {
    const wwtRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "127.0.0.1") wwtRequests.push(request.url());
    });

    await page.goto("/explore/deep-sky?object=messier-31&layer=infrared-wise");

    await expect(page.getByRole("heading", { level: 1, name: "Deep-sky atlas" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Messier 31" })).toBeVisible();
    await expect(page.getByText("10.684708333333333°")).toBeVisible();
    await expect(page.getByText("41.268750000000004°")).toBeVisible();
    await expect(page.getByText("J2000.0", { exact: true })).toBeVisible();
    await expect(page.getByText("CDS SIMBAD", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Wavelength context")).toHaveValue("infrared-wise");
    await expect(
      page
        .getByRole("region", { name: "WorldWide Telescope atlas" })
        .getByText(/Infrared survey imagery mapped into display colours/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Open interactive atlas" })).toBeVisible();

    expect(wwtRequests).toEqual([]);
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("keeps the server-rendered catalogue, coordinate provenance, and credits useful without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (WWT_HOSTS.has(url.hostname)) externalRequests.push(request.url());
    });

    await page.goto("/explore/deep-sky?object=messier-31&layer=ultraviolet-galex");

    await expect(page.getByRole("heading", { level: 1, name: "Deep-sky atlas" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Deep-sky objects" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Messier 31" })).toBeVisible();
    await expect(
      page.getByText(/SIMBAD Messier J2000 catalogue position at reference epoch J2000\.0/i),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "WorldWide Telescope atlas" })
        .getByText(/GALEX far- and near-ultraviolet measurements/i),
    ).toBeVisible();
    await expect(page.getByText(/Renderer: WorldWide Telescope web engine 7.40.0/i)).toBeVisible();
    expect(externalRequests).toEqual([]);

    await context.close();
  });

  test("fails safely when opt-in WWT assets are unavailable and preserves non-canvas science", async ({
    page,
  }) => {
    const wwtRequests: string[] = [];
    const abortWwt = async (route: Route) => {
      wwtRequests.push(route.request().url());
      await route.abort("failed");
    };
    await page.route("https://cdn.worldwidetelescope.org/**", abortWwt);
    await page.route("https://www.worldwidetelescope.org/**", abortWwt);
    await page.route("https://web.wwtassets.org/**", abortWwt);

    await page.goto("/explore/deep-sky?object=messier-31");
    expect(wwtRequests).toEqual([]);

    await page.getByRole("button", { name: "Open interactive atlas" }).click();
    await expect(page.getByText(/Visible · DSS2 imagery is unavailable right now/i)).toBeVisible({
      timeout: 10_000,
    });
    expect(wwtRequests.length).toBeGreaterThan(0);

    await expect(page.getByRole("heading", { level: 2, name: "Messier 31" })).toBeVisible();
    await expect(page.getByText("J2000.0", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open canonical object page" })).toBeVisible();
  });

  test("keeps exact observer location out of URLs/storage/network and cancels the render loop on route leave", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 12.9715987, longitude: 77.5945627 },
      permissions: ["geolocation"],
    });
    const page = await context.newPage();
    await stubApprovedWwtNetwork(page);
    await page.addInitScript(() => {
      const state = new Set<number>();
      const originalRequest = window.requestAnimationFrame.bind(window);
      const originalCancel = window.cancelAnimationFrame.bind(window);
      const instrumented = window as typeof window & { __luminaActiveRaf: Set<number> };
      instrumented.__luminaActiveRaf = state;
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        let id = 0;
        id = originalRequest((time) => {
          state.delete(id);
          callback(time);
        });
        state.add(id);
        return id;
      };
      window.cancelAnimationFrame = (id: number) => {
        state.delete(id);
        originalCancel(id);
      };
    });

    const requests: Array<{ body: string | null; url: string }> = [];
    page.on("request", (request) =>
      requests.push({ body: request.postData(), url: request.url() }),
    );
    await page.goto("/explore/deep-sky?object=messier-31");
    await page.getByRole("button", { name: "Open interactive atlas" }).click();
    await page.getByText("Interactive atlas ready.").waitFor({ timeout: 15_000 });

    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByLabel("Latitude °")).toHaveValue("12.971599");
    await expect(page.getByLabel("Longitude °")).toHaveValue("77.594563");
    await page.getByRole("button", { name: "Apply observer context" }).click();
    await expect(page.getByText(/Coordinates were not saved/i)).toBeVisible();

    const serializedTraffic = requests
      .map((request) => `${request.url} ${request.body ?? ""}`)
      .join("\n");
    expect(serializedTraffic).not.toContain("12.971599");
    expect(serializedTraffic).not.toContain("77.594563");
    expect(page.url()).not.toContain("12.971599");
    expect(page.url()).not.toContain("77.594563");
    const stored = await page.evaluate(() => {
      const values: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key !== null) values.push(`${key}=${localStorage.getItem(key) ?? ""}`);
      }
      return values.join("\n");
    });
    expect(stored).not.toContain("12.971599");
    expect(stored).not.toContain("77.594563");

    expect(
      await page.evaluate(
        () => (window as typeof window & { __luminaActiveRaf: Set<number> }).__luminaActiveRaf.size,
      ),
    ).toBeGreaterThan(0);
    await page.getByRole("link", { name: /Explore catalogue/i }).click();
    await expect(page).toHaveURL(/\/explore$/u);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { __luminaActiveRaf: Set<number> }).__luminaActiveRaf.size,
        ),
      )
      .toBe(0);

    const disallowed = requests
      .map((request) => new URL(request.url))
      .filter(
        (url) =>
          url.hostname !== "127.0.0.1" &&
          (url.protocol !== "https:" || !WWT_HOSTS.has(url.hostname)),
      );
    expect(disallowed).toEqual([]);
    await context.close();
  });

  test("fails to the canonical text experience when WebGL is unavailable", async ({ page }) => {
    await stubApprovedWwtNetwork(page);
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await page.goto("/explore/deep-sky?object=messier-31");
    await page.getByRole("button", { name: "Open interactive atlas" }).click();
    await expect(page.getByText(/interactive atlas could not start/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { level: 2, name: "Messier 31" })).toBeVisible();
    await expect(page.getByText("J2000.0", { exact: true })).toBeVisible();
  });

  test("keeps the non-canvas atlas usable with forced colors at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto("/explore/deep-sky?object=messier-31&layer=microwave-planck");
    await expect(page.getByRole("heading", { level: 1, name: "Deep-sky atlas" })).toBeVisible();
    await expect(page.getByLabel("Wavelength context")).toHaveValue("microwave-planck");
    await expect(
      page.getByText(/Microwave sky measurements rendered as a scientific map/i).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("stays usable at 320px with reduced motion and touch-sized controls", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/explore/deep-sky?object=messier-31");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const activation = page.getByRole("button", { name: "Open interactive atlas" });
    expect((await activation.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("link", { name: "Open canonical object page" })).toBeVisible();
  });
});
