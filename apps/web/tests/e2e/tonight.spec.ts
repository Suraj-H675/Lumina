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
