import { expect, test, type Page } from "@playwright/test";

const NIGHT = "2026-08-27";
const LATITUDE = "12.972";
const LONGITUDE = "77.594";
const WEATHER_TIMES = [
  Date.parse("2026-08-27T21:00:00Z") / 1_000,
  Date.parse("2026-08-27T22:00:00Z") / 1_000,
  Date.parse("2026-08-27T23:00:00Z") / 1_000,
];

function weatherFixture() {
  return {
    latitude: 12.97,
    longitude: 77.59,
    elevation: 900,
    hourly: {
      time: WEATHER_TIMES,
      cloud_cover: [18, 42, 66],
      cloud_cover_low: [4, 22, 40],
      cloud_cover_mid: [8, 32, 54],
      cloud_cover_high: [2, 12, 28],
      visibility: [24_000, 18_000, 12_000],
      relative_humidity_2m: [71, 74, 78],
      precipitation_probability: [5, 10, 25],
      wind_speed_10m: [7, 9, 11],
      weather_code: [1, 42, 63],
    },
    hourly_units: {
      cloud_cover: "%",
      cloud_cover_low: "%",
      cloud_cover_mid: "%",
      cloud_cover_high: "%",
      visibility: "m",
      relative_humidity_2m: "%",
      precipitation_probability: "%",
      wind_speed_10m: "km/h",
      weather_code: "wmo code",
    },
  };
}

test.describe.configure({ mode: "serial" });

async function fillManualLocation(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  const latitude = page.getByLabel("Latitude");
  const longitude = page.getByLabel("Longitude");
  await expect(latitude).toBeEditable();
  await expect(longitude).toBeEditable();
  await latitude.fill(LATITUDE);
  await expect(latitude).toHaveValue(LATITUDE);
  await longitude.fill(LONGITUDE);
  await expect(longitude).toHaveValue(LONGITUDE);
  await page.getByRole("button", { name: /calculate with these coordinates/i }).click();
}

async function useFixedBrowserDate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fixedNow = Date.parse("2026-08-27T12:00:00.000Z");
    const RealDate = Date;
    function FixedDate(...args: Array<string | number | Date>): Date {
      return args.length === 0
        ? new RealDate(fixedNow)
        : (Reflect.construct(RealDate, args) as Date);
    }
    FixedDate.prototype = RealDate.prototype;
    Object.setPrototypeOf(FixedDate, RealDate);
    Object.defineProperties(FixedDate, {
      now: { value: () => fixedNow },
      parse: { value: RealDate.parse },
      UTC: { value: RealDate.UTC },
    });
    Object.defineProperty(window, "Date", { configurable: true, value: FixedDate });
  });
}

test("geolocation alone does not make a weather request", async ({ page, context }) => {
  let weatherRequestCount = 0;
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 12.972, longitude: 77.594 });
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    await route.fulfill({ json: weatherFixture() });
  });
  await useFixedBrowserDate(page);
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await page.getByRole("button", { name: "Use my location" }).click();

  await expect(page.getByText(/Current location 12\.972°, 77\.594°/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Load weather forecast" })).toBeVisible();
  expect(weatherRequestCount).toBe(0);
});

test("lunar conditions do not make a weather request before opt-in", async ({ page }) => {
  let weatherRequestCount = 0;
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    await route.fulfill({ json: weatherFixture() });
  });
  await useFixedBrowserDate(page);
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);

  await expect(page.getByRole("heading", { name: "Lunar conditions" })).toBeVisible();
  await expect(page.getByText("Moon at selected time")).toBeVisible();
  await expect(page.getByText("Target separation")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sky Finder" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: /^Moon:/ })).toBeVisible();
  expect(weatherRequestCount).toBe(0);
});

test("weather is explicitly enabled with rounded coordinates and UTC hourly variables", async ({
  page,
}) => {
  let weatherRequestCount = 0;
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    const url = new URL(route.request().url());
    expect(url.searchParams.get("latitude")).toBe("12.97");
    expect(url.searchParams.get("longitude")).toBe("77.59");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("hourly")).toContain("cloud_cover");
    expect(url.searchParams.get("hourly")).toContain("visibility");
    expect(url.searchParams.get("hourly")).toContain("weather_code");
    await route.fulfill({ json: weatherFixture() });
  });
  await useFixedBrowserDate(page);
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  await expect(page.getByRole("button", { name: "Load weather forecast" })).toBeVisible();
  expect(weatherRequestCount).toBe(0);
  const localStorageBefore = await page.evaluate(() => JSON.stringify(localStorage));

  await page.getByRole("button", { name: "Load weather forecast" }).click();
  await expect(page.getByText(/Forecast nearest/i)).toBeVisible();
  await expect(page.getByText("Cloud cover", { exact: true })).toBeVisible();
  await expect(page.getByText("Meteorological visibility", { exact: true })).toBeVisible();
  await expect(page.getByText("Relative humidity", { exact: true })).toBeVisible();
  await expect(page.getByText("Precipitation probability", { exact: true })).toBeVisible();
  await expect(page.getByText(/Weather data by Open-Meteo/i)).toBeVisible();
  await expect(page.getByText(/Retrieved/i)).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(localStorageBefore);
  expect(weatherRequestCount).toBe(1);
});

test("weather provider failure leaves target geometry and lunar conditions usable", async ({
  page,
}) => {
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({ status: 503, body: "provider unavailable" });
  });
  await useFixedBrowserDate(page);
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  await page.getByRole("button", { name: "Load weather forecast" }).click();

  await expect(page.locator('p[role="alert"]')).toContainText(
    /Could not load the weather forecast/i,
  );
  await expect(page.getByRole("heading", { name: "Sky Finder" })).toBeVisible();
  await expect(page.getByText(/altitude through the night/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lunar conditions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry forecast" })).toBeVisible();
});

test("past or out-of-horizon dates show unavailable weather without a live request", async ({
  page,
}) => {
  let weatherRequestCount = 0;
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    await route.fulfill({ json: weatherFixture() });
  });
  await useFixedBrowserDate(page);
  await page.goto("/observe?object=k2-18&date=2099-01-01");
  await fillManualLocation(page);

  await expect(page.getByText(/Weather forecast unavailable for this date/i)).toBeVisible();
  await expect(page.getByText(/altitude through the night/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lunar conditions" })).toBeVisible();
  expect(weatherRequestCount).toBe(0);
});

test("conditions remain readable at 390px after enabling weather", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({ json: weatherFixture() });
  });
  await useFixedBrowserDate(page);
  await page.goto(`/observe?object=k2-18&date=${NIGHT}`);
  await fillManualLocation(page);
  await page.getByRole("button", { name: "Load weather forecast" }).click();

  await expect(page.getByText(/Weather data by Open-Meteo/i)).toBeVisible();
  await expect(page.getByText(/Cloud cover through the observing window/i)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});
