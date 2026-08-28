import { expect, test, type Page } from "@playwright/test";

const NIGHT = "2026-08-27";
const LATITUDE = "12.972";
const LONGITUDE = "77.594";

test.describe.configure({ mode: "serial" });

async function fillManualLocation(page: Page): Promise<void> {
  await page.getByLabel("Latitude").fill(LATITUDE);
  await page.getByLabel("Longitude").fill(LONGITUDE);
  await page.getByRole("button", { name: /calculate with these coordinates/i }).click();
}

test("empty planner explains how to choose a target", async ({ page }) => {
  await page.goto("/observe");

  await expect(page.getByRole("heading", { level: 1, name: "Choose an object" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /search the catalogue/i })).toBeVisible();
  await expect(page.getByText(/select an object to begin/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use my location" })).not.toBeVisible();
});

test("bright-star artifact stays lazy until a finder has target, location, and time", async ({
  page,
}) => {
  let starArtifactRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/data/gaia-dr3-bright-sky-context-v1.csv") {
      starArtifactRequests += 1;
    }
  });

  await page.goto("/");
  await page.goto("/explore");
  await page.goto("/observe");
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  expect(starArtifactRequests).toBe(0);

  await fillManualLocation(page);
  await expect(page.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
  expect(starArtifactRequests).toBe(1);
});

test("object page opens the selected target in the observation planner", async ({ page }) => {
  await page.goto("/objects/k2-18");
  await page.getByRole("link", { name: /^observe$/i }).click();

  await expect(page).toHaveURL(/\/observe\?object=k2-18(?:&date=\d{4}-\d{2}-\d{2})?$/);
  await expect(page.getByRole("heading", { level: 1, name: "K2-18" })).toBeVisible();
  await page.getByLabel("Night of").fill(NIGHT);
  await fillManualLocation(page);

  await expect(page.getByText(/altitude through the night/i)).toBeVisible();
  await expect(page.getByText("Azimuth · 0° north, eastward", { exact: true })).toBeVisible();
  await expect(page.getByText(/Position source/)).toBeVisible();
});

test("sky finder gives selected-time direction guidance and reference context", async ({
  page,
}) => {
  let starArtifactRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/data/gaia-dr3-bright-sky-context-v1.csv") {
      starArtifactRequests += 1;
    }
  });
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  await page.getByLabel("Selected local time").fill("12:00");

  const finder = page
    .getByRole("heading", { name: "Sky Finder" })
    .locator("xpath=ancestor::section[1]");
  await expect(finder).toBeVisible();
  await expect(finder.getByText("Face", { exact: true })).toBeVisible();
  await expect(finder.getByText("True azimuth", { exact: true })).toBeVisible();
  await expect(finder.getByText("Look up", { exact: true })).toBeVisible();
  await expect(finder.getByText(/North is at the top, east is right/i)).toBeVisible();
  await expect(finder.getByTestId("sky-finder-target-marker")).toBeVisible();
  await expect(finder.getByText("Reference objects at selected time")).toBeVisible();
  await expect(finder.getByRole("listitem", { name: /^Sun:/ })).toBeVisible();
  await expect(finder.getByRole("checkbox", { name: /show solar-system markers/i })).toBeChecked();
  await expect(finder.getByRole("checkbox", { name: /show bright-star context/i })).toBeChecked();
  await expect(finder.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
  expect(await finder.getByTestId("sky-finder-context-star").count()).toBeGreaterThan(0);
  await expect(finder.getByText(/Gaia DR3 · G ≤ 5.5/i)).toBeVisible();
  await expect(finder.getByText(/context stars are above the geometric horizon/i)).toBeVisible();
  await expect(finder.getByText(/Proper motion not propagated/i)).toBeVisible();
  expect(starArtifactRequests).toBe(1);
});

test("bright-star context toggles truthfully while target and Moon remain", async ({ page }) => {
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  await page.getByLabel("Selected local time").fill("12:00");
  const finder = page
    .getByRole("heading", { name: "Sky Finder" })
    .locator("xpath=ancestor::section[1]");
  const toggle = finder.getByRole("checkbox", { name: /show bright-star context/i });

  await expect(finder.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
  await toggle.uncheck();
  await expect(finder.getByTestId("sky-finder-bright-star-layer")).not.toBeAttached();
  await expect(finder.getByText("Bright-star context is hidden.")).toBeVisible();
  await expect(finder.getByTestId("sky-finder-target-marker")).toBeVisible();
  await expect(finder.getByRole("listitem", { name: /^Moon:/ })).toBeVisible();

  await toggle.check();
  await expect(finder.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
});

test("selected time rotates context without reloading the artifact", async ({ page }) => {
  let starArtifactRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/data/gaia-dr3-bright-sky-context-v1.csv") {
      starArtifactRequests += 1;
    }
  });
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  const finder = page
    .getByRole("heading", { name: "Sky Finder" })
    .locator("xpath=ancestor::section[1]");
  await expect(finder.getByTestId("sky-finder-bright-star-layer")).toBeVisible();

  const positions = async () =>
    new Map(
      await finder
        .getByTestId("sky-finder-context-star")
        .evaluateAll((markers) =>
          markers
            .slice(0, 100)
            .map((marker) => [
              (marker as SVGCircleElement).dataset.sourceId ?? "",
              `${marker.getAttribute("cx")},${marker.getAttribute("cy")}`,
            ]),
        ),
    );
  const before = await positions();
  await page.getByLabel("Selected local time").fill("12:00");
  await expect
    .poll(async () => {
      const after = await positions();
      return [...before].some(
        ([sourceId, coordinates]) => after.has(sourceId) && after.get(sourceId) !== coordinates,
      );
    })
    .toBe(true);
  expect(starArtifactRequests).toBe(1);
});

test("sky finder keeps a below-horizon target outside the visible sky", async ({ page }) => {
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  await page.getByLabel("Selected local time").fill("22:00");

  const finder = page
    .getByRole("heading", { name: "Sky Finder" })
    .locator("xpath=ancestor::section[1]");
  await expect(finder.getByText("Target is below the horizon", { exact: true })).toBeVisible();
  await expect(
    finder.getByTestId("sky-finder-target-guidance").getByText(/−\d+\.\d+°/),
  ).toBeVisible();
  await expect(finder.getByText("Direction", { exact: true })).toBeVisible();
  await expect(finder.getByTestId("sky-finder-target-below")).toBeVisible();
  await expect(finder.getByText("Look up", { exact: true })).not.toBeVisible();
  await expect(finder.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
  expect(
    await finder.getByTestId("sky-finder-context-star").evaluateAll((markers) =>
      markers.every((marker) => {
        const x = Number(marker.getAttribute("cx"));
        const y = Number(marker.getAttribute("cy"));
        return Math.hypot(x - 180, y - 180) <= 122.000_001;
      }),
    ),
  ).toBe(true);
});

test("target changes reuse the all-sky context request", async ({ page }) => {
  let starArtifactRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/data/gaia-dr3-bright-sky-context-v1.csv") {
      starArtifactRequests += 1;
    }
  });
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  await expect(page.getByTestId("sky-finder-bright-star-layer")).toBeVisible();

  const input = page.getByRole("combobox", { name: /search the catalogue/i });
  await input.pressSequentially("Kepler-452", { delay: 25 });
  await page.getByRole("option", { name: /Kepler-452/ }).click();

  await expect(page).toHaveURL(/\/observe\?object=kepler-452/);
  await expect(page.getByRole("heading", { level: 1, name: "Kepler-452" })).toBeVisible();
  await expect(page.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
  await expect(
    page.locator(
      '[data-testid="sky-finder-target-marker"], [data-testid="sky-finder-target-below"]',
    ),
  ).toBeVisible();
  expect(starArtifactRequests).toBe(1);
});

test("planner target search uses B3 suggestions and keyboard selection", async ({ page }) => {
  await page.goto(`/observe?date=${NIGHT}`);
  const input = page.getByRole("combobox", { name: /search the catalogue/i });
  await input.pressSequentially("Kepler-452", { delay: 25 });
  const option = page.getByRole("option", { name: /Kepler-452/ });
  await expect(option).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/observe\?object=kepler-452(?:&date=2026-08-27)?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Kepler-452" })).toBeVisible();
  await fillManualLocation(page);
  await expect(page.getByText(/altitude through the night/i)).toBeVisible();
  await expect(page.getByRole("listitem", { name: /^Kepler-452:/ })).toBeVisible();
});

test("manual location validation rejects invalid coordinates and accepts a fixture location", async ({
  page,
}) => {
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await page.getByLabel("Latitude").fill("91");
  await page.getByLabel("Longitude").fill(LONGITUDE);
  await page.getByRole("button", { name: /calculate with these coordinates/i }).click();
  await expect(page.getByText(/enter a latitude from/i)).toBeVisible();
  await page.getByLabel("Latitude").fill(LATITUDE);
  await page.getByLabel("Longitude").fill("181");
  await page.getByRole("button", { name: /calculate with these coordinates/i }).click();
  await expect(page.getByText(/enter a latitude from/i)).toBeVisible();
  await fillManualLocation(page);
  await expect(page.getByText(/Current location 12\.972°, 77\.594°/)).toBeVisible();
  await expect(page.getByText(/altitude through the night/i)).toBeVisible();
});

test("missing coordinate data stays an honest unavailable planner state", async ({ page }) => {
  await page.goto(`/observe?object=no-coordinate-fixture&date=${NIGHT}`);

  await expect(page.getByRole("heading", { name: "No Coordinate Fixture" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Observation planning unavailable" }),
  ).toBeVisible();
  await expect(page.getByText(/has not estimated or substituted coordinates/i)).toBeVisible();
  await expect(page.getByText(/altitude through the night/i)).not.toBeVisible();
});

test("geolocation denial gives a useful message and keeps manual fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: unknown, error: (reason: unknown) => void) =>
          error({ code: 1, message: "denied" }),
      },
    });
  });
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await page.getByRole("button", { name: "Use my location" }).click();

  await expect(page.getByText(/location permission was denied/i)).toBeVisible();
  await expect(page.getByLabel("Latitude")).toBeVisible();
  await expect(page.getByLabel("Longitude")).toBeVisible();
});

test("planner remains readable at 390px without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  await page.getByLabel("Selected local time").fill("12:00");

  await expect(page.getByText(/altitude through the night/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lunar conditions" })).toBeVisible();
  const skyMap = page.getByTestId("sky-finder-map");
  const skyMapBox = await skyMap.boundingBox();
  expect(skyMapBox).not.toBeNull();
  expect(skyMapBox?.width ?? 0).toBeLessThanOrEqual(390);
  await expect(page.getByRole("heading", { name: "Sky Finder" })).toBeVisible();
  await expect(page.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
  await expect(page.getByText(/Gaia DR3 · G ≤ 5.5/i)).toBeVisible();
  await expect(page.getByText("Face", { exact: true })).toBeVisible();
  const chart = page
    .locator("figure")
    .filter({ hasText: /altitude through the night/i })
    .first();
  const chartBox = await chart.boundingBox();
  expect(chartBox).not.toBeNull();
  expect(chartBox?.width ?? 0).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test("conditions remain readable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);

  await expect(page.getByRole("heading", { name: "Lunar conditions" })).toBeVisible();
  await expect(page.getByTestId("sky-finder-map")).toBeVisible();
  await expect(page.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
  await expect(page.getByTestId("sky-finder-target-below")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});
