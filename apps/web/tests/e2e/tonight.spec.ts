import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "lumina.collections.v1";
const COLLECTION_ID = "11111111-2222-4333-8444-555555555555";
const SECOND_COLLECTION_ID = "22222222-3333-4444-8555-666666666666";
const NIGHT = "2026-08-27";
const NAMES: Record<string, string> = {
  "hd-209458": "HD 209458",
  "kepler-452": "Kepler-452",
  "k2-18": "K2-18",
};
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
      cloud_cover: [90, 10, 80],
      cloud_cover_low: [70, 5, 60],
      cloud_cover_mid: [60, 5, 50],
      cloud_cover_high: [50, 5, 40],
      visibility: [8_000, 20_000, 12_000],
      relative_humidity_2m: [88, 64, 76],
      precipitation_probability: [60, 5, 30],
      wind_speed_10m: [14, 6, 10],
      weather_code: [63, 1, 2],
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

async function seedCollection(page: Page, slugs: Array<string>): Promise<void> {
  await seedCollections(page, [
    {
      id: COLLECTION_ID,
      name: "Interesting Worlds",
      slugs,
    },
  ]);
}

async function seedCollections(
  page: Page,
  collections: Array<Readonly<{ id: string; name: string; slugs: Array<string> }>>,
): Promise<void> {
  const envelope = {
    collections: collections.map(({ id, name, slugs }) => ({
      created_at: "2026-08-20T10:00:00.000Z",
      id,
      items: slugs.map((slug) => ({
        canonical_name: NAMES[slug] ?? slug,
        entity_type: "star",
        saved_at: "2026-08-20T10:00:00.000Z",
        slug,
      })),
      name,
      updated_at: "2026-08-20T10:00:00.000Z",
    })),
    version: 1,
  };
  await page.addInitScript((serialized) => {
    window.localStorage.setItem("lumina.collections.v1", serialized);
  }, JSON.stringify(envelope));
}

async function fillManualLocation(page: Page, latitude: string, longitude: string): Promise<void> {
  await page.getByLabel("Latitude").fill(latitude);
  await page.getByLabel("Longitude").fill(longitude);
  await page.getByRole("button", { name: /calculate with these coordinates/i }).click();
}

async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
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

test("Tonight core compares one local collection with factual geometry and planner links", async ({
  page,
}) => {
  await seedCollection(page, ["k2-18", "kepler-452", "hd-209458"]);
  await page.goto(`/tonight?date=${NIGHT}`);

  await expect(page.getByRole("heading", { level: 1, name: "Tonight" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /collection to analyze/i })).toHaveValue(
    COLLECTION_ID,
  );
  await expect(page.getByLabel("Night of")).toHaveValue(NIGHT);
  await expect(page.locator("#tonight-collection option:checked")).toHaveText(/Interesting Worlds/);

  await fillManualLocation(page, "12.972", "77.594");

  await expect(
    page.getByText(/Ordered by highest sampled altitude during astronomical darkness/i),
  ).toBeVisible();
  await expect(page.getByText(/Astronomical dusk/i)).toBeVisible();
  await expect(page.getByText(/Moon at peak:/i).first()).toBeVisible();
  await expect(page.getByTestId("tonight-primary-list")).toBeVisible();
  await expect(page.getByTestId("tonight-below-list")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open planner" }).first()).toHaveAttribute(
    "href",
    /\/observe\?object=.*&date=2026-08-27/u,
  );
});

test("Tonight has a useful empty state and never requests the full catalogue", async ({ page }) => {
  let catalogueRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/catalog/")) catalogueRequests += 1;
  });
  await page.goto("/tonight");

  await expect(page.getByText(/Save objects to use Tonight/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Collections" })).toHaveAttribute(
    "href",
    "/collections",
  );
  expect(catalogueRequests).toBe(0);
});

test("Tonight preserves corrupted local collection bytes", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("lumina.collections.v1", "{not valid collections");
  });
  await page.goto("/tonight");

  await expect(
    page.getByRole("heading", { name: /your saved collections could not be read/i }),
  ).toBeVisible();
  await expect(page.getByText(/nothing has been changed or deleted/i)).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY))
    .toBe("{not valid collections");
});

test("Tonight keeps its shell when browser storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked by test fixture");
      },
    });
  });
  await page.goto("/tonight");

  await expect(page.getByRole("heading", { name: /local storage is unavailable/i })).toBeVisible();
  await expect(page.getByText(/cannot save or show collections right now/i)).toBeVisible();
});

test("Tonight follows canonical collection rename, item removal, and deletion events", async ({
  page,
}) => {
  await seedCollections(page, [
    { id: COLLECTION_ID, name: "Interesting Worlds", slugs: ["k2-18"] },
    { id: SECOND_COLLECTION_ID, name: "Second Shelf", slugs: ["kepler-452"] },
  ]);
  await page.goto(`/tonight?date=${NIGHT}`);

  await expect(page.locator("#tonight-collection option:checked")).toHaveText(/Interesting Worlds/);
  await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    data.collections[0].name = "Renamed Worlds";
    data.collections[0].items = [];
    window.localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, STORAGE_KEY);

  await expect(page.locator("#tonight-collection option:checked")).toHaveText(/Renamed Worlds/);
  await expect(
    page.getByRole("heading", { name: /this collection has no saved objects/i }),
  ).toBeVisible();

  await page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    data.collections.shift();
    window.localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, STORAGE_KEY);

  await expect(page.locator("#tonight-collection")).toHaveValue(SECOND_COLLECTION_ID);
});

test("Tonight keeps below-horizon and no-darkness states factual", async ({ page }) => {
  await seedCollection(page, ["kepler-452"]);
  await page.goto(`/tonight?date=${NIGHT}`);
  await fillManualLocation(page, "-50", "0");

  await expect(page.getByTestId("tonight-below-list")).toBeVisible();
  await expect(page.getByTestId("tonight-below-list")).toContainText("−");
  await expect(page.getByTestId("tonight-primary-list")).toHaveCount(0);

  await page.goto("/tonight?date=2026-06-21");
  await fillManualLocation(page, "80", "0");
  await expect(page.getByText(/No astronomical darkness for this selected night/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved targets" })).toBeVisible();
  await expect(page.getByTestId("tonight-primary-list")).toHaveCount(0);
});

test("Tonight remains readable without overflow at 390px and 320px", async ({ page }) => {
  await seedCollection(page, ["k2-18", "kepler-452"]);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/tonight?date=${NIGHT}`);
  await fillManualLocation(page, "12.972", "77.594");
  await expect(page.getByTestId("tonight-primary-list")).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);

  await page.setViewportSize({ height: 844, width: 320 });
  await expect(page.getByTestId("tonight-primary-list")).toBeVisible();
  await expect(page.getByText(/Moon at peak:/i).first()).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test("Tonight weather is explicit, uses one rounded request, and cannot change the order", async ({
  page,
}) => {
  let weatherRequestCount = 0;
  const requestUrls: Array<URL> = [];
  await seedCollection(page, ["k2-18", "kepler-452"]);
  await useFixedBrowserDate(page);
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    requestUrls.push(new URL(route.request().url()));
    await route.fulfill({ json: weatherFixture() });
  });
  await page.goto(`/tonight?date=${NIGHT}`);
  await fillManualLocation(page, "12.972", "77.594");
  await expect(page.getByRole("button", { name: "Load weather forecast" })).toBeVisible();
  expect(weatherRequestCount).toBe(0);

  const firstTargetBeforeWeather = await page
    .getByTestId("tonight-primary-list")
    .getByTestId("tonight-target-row")
    .first()
    .locator("h3")
    .innerText();
  const localStorageBeforeWeather = await page.evaluate(() => JSON.stringify(localStorage));
  await page.getByRole("button", { name: "Load weather forecast" }).click();
  await expect(page.getByText(/Forecast context loaded for the selected night/i)).toBeVisible();
  await expect(page.getByText(/Forecast near peak/i).first()).toBeVisible();
  expect(weatherRequestCount).toBe(1);
  const requestUrl = requestUrls[0];
  if (requestUrl === undefined) throw new Error("The weather request URL was not captured.");
  expect(requestUrl.searchParams.get("latitude")).toBe("12.97");
  expect(requestUrl.searchParams.get("longitude")).toBe("77.59");
  expect(requestUrl.searchParams.get("timeformat")).toBe("unixtime");
  expect(requestUrl.searchParams.get("forecast_days")).toBe("16");
  expect(requestUrl.searchParams.get("hourly")).toContain("cloud_cover");
  expect(requestUrl.searchParams.get("hourly")).toContain("weather_code");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(localStorageBeforeWeather);
  expect(
    await page
      .getByTestId("tonight-primary-list")
      .getByTestId("tonight-target-row")
      .first()
      .locator("h3")
      .innerText(),
  ).toBe(firstTargetBeforeWeather);

  await page.getByRole("combobox", { name: "Order by" }).selectOption("name");
  expect(weatherRequestCount).toBe(1);
});

test("Tonight geolocation alone does not make a weather request", async ({ page, context }) => {
  let weatherRequestCount = 0;
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 12.972, longitude: 77.594 });
  await seedCollection(page, ["k2-18"]);
  await useFixedBrowserDate(page);
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    await route.fulfill({ json: weatherFixture() });
  });
  await page.goto(`/tonight?date=${NIGHT}`);
  await page.getByRole("button", { name: "Use my location" }).click();

  await expect(page.getByText(/Current location 12\.972°, 77\.594°/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Load weather forecast" })).toBeVisible();
  expect(weatherRequestCount).toBe(0);
});

test("Tonight collection changes do not refetch the shared weather forecast", async ({ page }) => {
  let weatherRequestCount = 0;
  await seedCollections(page, [
    { id: COLLECTION_ID, name: "Interesting Worlds", slugs: ["k2-18"] },
    { id: SECOND_COLLECTION_ID, name: "Second Shelf", slugs: ["kepler-452"] },
  ]);
  await useFixedBrowserDate(page);
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    await route.fulfill({ json: weatherFixture() });
  });
  await page.goto(`/tonight?date=${NIGHT}`);
  await fillManualLocation(page, "12.972", "77.594");
  await page.getByRole("button", { name: "Load weather forecast" }).click();
  await expect(page.getByText(/Forecast context loaded for the selected night/i)).toBeVisible();
  expect(weatherRequestCount).toBe(1);

  await page
    .getByRole("combobox", { name: /collection to analyze/i })
    .selectOption(SECOND_COLLECTION_ID);
  await expect(page.locator("#tonight-collection option:checked")).toHaveText(/Second Shelf/);
  await expect(page.getByText(/Forecast context loaded for the selected night/i)).toBeVisible();
  expect(weatherRequestCount).toBe(1);
});

test("Tonight weather failure leaves geometry available and retry bounded", async ({ page }) => {
  let weatherRequestCount = 0;
  let failWeather = true;
  await seedCollection(page, ["k2-18", "kepler-452"]);
  await useFixedBrowserDate(page);
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    if (failWeather) {
      await route.fulfill({ status: 503, body: "provider unavailable" });
      return;
    }
    await route.fulfill({ json: weatherFixture() });
  });
  await page.goto(`/tonight?date=${NIGHT}`);
  await fillManualLocation(page, "12.972", "77.594");
  await page.getByRole("button", { name: "Load weather forecast" }).click();

  await expect(page.locator('p[role="alert"]')).toContainText(
    /Could not load the weather forecast/i,
  );
  await expect(page.getByText(/Ordered by highest sampled altitude/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry forecast" })).toBeVisible();
  expect(weatherRequestCount).toBe(1);
  failWeather = false;
  await page.getByRole("button", { name: "Retry forecast" }).click();
  await expect(page.getByText(/Forecast context loaded for the selected night/i)).toBeVisible();
  expect(weatherRequestCount).toBe(2);
});

test("Tonight does not request weather for a date outside the forecast horizon", async ({
  page,
}) => {
  let weatherRequestCount = 0;
  await seedCollection(page, ["k2-18"]);
  await useFixedBrowserDate(page);
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequestCount += 1;
    await route.fulfill({ json: weatherFixture() });
  });
  await page.goto("/tonight?date=2099-01-01");
  await fillManualLocation(page, "12.972", "77.594");

  await expect(page.getByText(/Weather forecast unavailable for this date/i)).toBeVisible();
  expect(weatherRequestCount).toBe(0);
});

test("Tonight weather remains readable at 390px after opt-in", async ({ page }) => {
  await seedCollection(page, ["k2-18", "kepler-452"]);
  await page.setViewportSize({ height: 844, width: 390 });
  await useFixedBrowserDate(page);
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({ json: weatherFixture() });
  });
  await page.goto(`/tonight?date=${NIGHT}`);
  await fillManualLocation(page, "12.972", "77.594");
  await page.getByRole("button", { name: "Load weather forecast" }).click();

  await expect(page.getByText(/Forecast near peak/i).first()).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.setViewportSize({ height: 844, width: 320 });
  await expect(page.getByText(/Forecast near peak/i).first()).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
});
