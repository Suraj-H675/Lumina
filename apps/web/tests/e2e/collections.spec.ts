import { expect, test, type Page } from "@playwright/test";

// Phase 1B6: browser-local collections. Deterministic identities come from the
// shared stub harness (the reviewed Gaia DR3 seed slice); collections
// themselves are pure client state in localStorage under lumina.collections.v1.
test.describe.configure({ mode: "serial" });

const K2_18 = "k2-18";
const KEPLER_452 = "kepler-452";
const STORAGE_KEY = "lumina.collections.v1";
/** Fixed local collection id so journeys can navigate straight to it. */
const SHELF_ID = "11111111-2222-4333-8444-555555555555";
const SHELF_NAME = "Interesting Worlds";

const CANONICAL_NAMES: Record<string, string> = {
  "hd-209458": "HD 209458",
  "kepler-186": "Kepler-186",
  "kepler-452": "Kepler-452",
  "51-pegasi": "51 Pegasi",
  "k2-18": "K2-18",
};

type SeedEnvelope = {
  version: 1;
  collections: Array<{
    created_at: string;
    id: string;
    items: Array<{
      canonical_name: string;
      entity_type: "star";
      saved_at: string;
      slug: string;
    }>;
    name: string;
    updated_at: string;
  }>;
};

/**
 * Seed the exact accepted schema before any app code runs. This is the same
 * shape the store writes, so hydration validates it like a returning visitor.
 */
async function seedShelf(page: Page, slugs: Array<string>, name = SHELF_NAME): Promise<void> {
  const envelope: SeedEnvelope = {
    collections: [
      {
        created_at: "2026-08-20T10:00:00.000Z",
        id: SHELF_ID,
        items: slugs.map((slug) => ({
          canonical_name: CANONICAL_NAMES[slug] ?? slug,
          entity_type: "star" as const,
          saved_at: "2026-08-20T10:00:00.000Z",
          slug,
        })),
        name,
        updated_at: "2026-08-20T10:00:00.000Z",
      },
    ],
    version: 1,
  };
  // NOTE: the init script runs in the BROWSER context, where module-scope
  // consts (STORAGE_KEY) do not exist — the key must be a literal here.
  // It is also ONE-SHOT, guarded by a localStorage flag (window props reset
  // per navigation): addInitScript otherwise re-runs on every navigation and
  // would clobber collections saved by earlier steps of a journey.
  await page.addInitScript(
    (payload: string) => {
      const markerKey = "__lumina_e2e_seed_applied__";
      if (window.localStorage.getItem(markerKey) === "1") return;
      window.localStorage.setItem(markerKey, "1");
      const parsed = JSON.parse(payload) as { storage: Record<string, string> };
      for (const [key, value] of Object.entries(parsed.storage)) {
        window.localStorage.setItem(key, value);
      }
    },
    JSON.stringify({
      storage: { "lumina.collections.v1": JSON.stringify(envelope) },
    }),
  );
}

async function readCollections(page: Page): Promise<SeedEnvelope> {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? "{}") as never,
    STORAGE_KEY,
  );
}

async function openCollection(page: Page) {
  await page.goto(`/collections/${SHELF_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: SHELF_NAME })).toBeVisible();
}

/**
 * Open a modal by clicking its trigger, retrying until the dialog is visible.
 *
 * The first click can land between SSR paint and React hydration (handlers
 * not yet attached), which silently swallows it — retrying closes that race
 * without arbitrary sleeps. Retries only fire while the dialog never opened,
 * so a successful open is never toggled closed.
 */
async function openDialog(page: Page, triggerName: RegExp, title: string) {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(async () => {
    await page.getByRole("button", { name: triggerName }).first().click();
    await expect(dialog).toBeVisible();
  }).toPass({ timeout: 15_000 });
  return dialog;
}

test("journey 1 — create + persist across a full reload", async ({ page }) => {
  await page.goto("/collections");
  // Local-only truthfulness is visible immediately.
  await expect(page.getByText(/saved in this browser on this device/i)).toBeVisible();

  const dialog = await openDialog(page, /\+ Create a collection/u, "Create a collection");
  await dialog.getByLabel("Name").fill(SHELF_NAME);
  await dialog.getByRole("button", { name: "Create collection" }).click();
  await expect(page).toHaveURL(/\/collections\/[0-9a-f-]{36}$/u);
  await expect(page.getByRole("heading", { level: 1, name: SHELF_NAME })).toBeVisible();

  // Full reload: the collection survives.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: SHELF_NAME })).toBeVisible();
  const data = await readCollections(page);
  expect(data.version).toBe(1);
  expect(data.collections[0]?.name).toBe(SHELF_NAME);

  // It appears on the overview too, with its count.
  await page.goto("/collections");
  await expect(
    page
      .getByRole("list", { name: "Your collections" })
      .getByRole("link", { name: /Interesting Worlds/ }),
  ).toBeVisible();
});

test("journey 2 — save from the object page into an existing collection", async ({ page }) => {
  await seedShelf(page, []);
  await page.goto(`/objects/${K2_18}`);

  // Save sits beside (not inside) Compare this object.
  await expect(page.getByRole("link", { name: /compare this object/i })).toBeVisible();
  const picker = await openDialog(page, /save k2-18 to a collection/iu, "Save to a collection");
  await picker.getByRole("checkbox", { name: SHELF_NAME }).check();
  await expect(picker.getByText(/Saved K2-18 to Interesting Worlds/i)).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();

  const data = await readCollections(page);
  expect(data.collections[0]?.items.map((item) => item.slug)).toEqual([K2_18]);

  await openCollection(page);
  await expect(
    page
      .getByRole("list", { name: /objects in interesting worlds/i })
      .getByRole("link", { name: /K2-18/ }),
  ).toHaveAttribute("href", `/objects/${K2_18}`);
});

test("journeys 3+4 — duplicate save is idempotent; a second object joins cleanly", async ({
  page,
}) => {
  await seedShelf(page, [K2_18]);

  // Journey 3: saving the already-present object again changes nothing.
  await page.goto(`/objects/${K2_18}`);
  const picker = await openDialog(
    page,
    /saved\. manage where k2-18 is saved/iu,
    "Save to a collection",
  );
  await expect(picker.getByRole("checkbox", { name: SHELF_NAME })).toBeChecked();
  let data = await readCollections(page);
  expect(data.collections[0]?.items.map((item) => item.slug)).toEqual([K2_18]);
  await picker.getByRole("button", { name: "Done" }).click();

  // Journey 4: a second known object joins the same collection.
  await page.goto(`/objects/${KEPLER_452}`);
  const picker452 = await openDialog(
    page,
    /save kepler-452 to a collection/iu,
    "Save to a collection",
  );
  await picker452.getByRole("checkbox", { name: SHELF_NAME }).check();
  await page.keyboard.press("Escape");

  data = await readCollections(page);
  expect(data.collections[0]?.items.map((item) => item.slug)).toEqual([K2_18, KEPLER_452]);

  await openCollection(page);
  const items = page.getByRole("list", { name: /objects in interesting worlds/i });
  await expect(items.getByRole("link", { name: /K2-18/ })).toBeVisible();
  await expect(items.getByRole("link", { name: /Kepler-452/ })).toBeVisible();
});

test("journey 5 — select two objects and launch the frozen /compare contract", async ({ page }) => {
  await seedShelf(page, [K2_18, KEPLER_452]);
  await openCollection(page);

  const section = page.getByRole("region", { name: /compare saved objects/i });
  await section.getByRole("checkbox", { name: /K2-18/ }).check();
  await section.getByRole("checkbox", { name: /Kepler-452/ }).check();
  await section.getByRole("button", { name: /Compare selected \(2\)/i }).click();

  await expect(page).toHaveURL(/object=k2-18&object=kepler-452/u);
  // The existing comparison experience renders its accepted content.
  await expect(page.getByRole("heading", { level: 1, name: "Compare" })).toBeVisible();
  await expect(page.getByText(/Gaia G-band mean magnitude/i).first()).toBeVisible();
});

test("journey 6 — remove an object; removal persists across reload", async ({ page }) => {
  await seedShelf(page, [K2_18, KEPLER_452]);
  await openCollection(page);

  await page.getByRole("button", { name: "Remove Kepler-452 from the collection" }).click();

  await expect(
    page
      .getByRole("list", { name: /objects in interesting worlds/i })
      .getByRole("link", { name: /Kepler-452/ }),
  ).toBeHidden();

  await page.reload();
  const data = await readCollections(page);
  expect(data.collections[0]?.items.map((item) => item.slug)).toEqual([K2_18]);
  await expect(
    page
      .getByRole("list", { name: /objects in interesting worlds/i })
      .getByRole("link", { name: /Kepler-452/ }),
  ).toBeHidden();
});

test("journey 7 — rename preserves id and items across reload", async ({ page }) => {
  await seedShelf(page, [K2_18]);
  await openCollection(page);

  const rename = await openDialog(page, /^Rename$/u, "Rename collection");
  await rename.getByLabel("Name").fill("Exoplanet Shortlist");
  await rename.getByRole("button", { name: "Save name" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Exoplanet Shortlist" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Exoplanet Shortlist" })).toBeVisible();
  const data = await readCollections(page);
  expect(data.collections[0]?.id).toBe(SHELF_ID); // identity preserved
  expect(data.collections[0]?.items.map((item) => item.slug)).toEqual([K2_18]);
});

test("journey 8 — delete requires naming confirmation and stays deleted", async ({ page }) => {
  await seedShelf(page, [K2_18]);
  await openCollection(page);

  const confirm = await openDialog(page, /^Delete$/u, `Delete ${SHELF_NAME}?`);
  // Confirmation identifies the collection by name and scopes the destruction.
  await expect(confirm.getByText(/from this browser only/i)).toBeVisible();

  await confirm.getByRole("button", { name: "Delete collection" }).click();
  await expect(page).toHaveURL(/\/collections$/u);
  await expect(page.getByText(/no collections yet/i)).toBeVisible();

  await page.reload();
  const data = await readCollections(page);
  expect(data.collections).toEqual([]);
});

test("journey 9 — malformed persisted data enters recovery without crashing", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("lumina.collections.v1", "{this is definitely not json");
  });
  await page.goto("/collections");

  await expect(
    page.getByRole("heading", { name: /your saved collections could not be read/i }),
  ).toBeVisible();
  // Nothing is silently destroyed…
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  expect(raw).toBe("{this is definitely not json");

  // …the catalogue remains fully usable…
  await page.goto("/explore");
  await expect(
    page.getByRole("heading", { level: 1, name: /explore real objects/i }),
  ).toBeVisible();
  const browseList = page.getByRole("list", { name: "Catalogue objects" });
  await expect(browseList.getByRole("link", { name: "K2-18" })).toBeVisible();

  // …and reset only happens on explicit double confirmation.
  await page.goto("/collections");
  await page.getByRole("button", { name: /reset local collections/i }).click();
  await page.getByRole("button", { name: /confirm reset/i }).click();
  await expect(page.getByRole("heading", { name: /no collections yet/i })).toBeVisible();
  const after = await readCollections(page);
  expect(after.version).toBe(1);
  expect(after.collections).toEqual([]);
});

test("journey 10 — create/save/open/remove flow stays usable at ~390px without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

  await page.goto("/collections");
  expect(await overflow()).toBe(false);

  // Create at mobile width.
  const dialog = await openDialog(page, /\+ Create a collection/u, "Create a collection");
  await dialog.getByLabel("Name").fill("Mobile Shelf");
  await dialog.getByRole("button", { name: "Create collection" }).click();
  await expect(page).toHaveURL(/\/collections\/[0-9a-f-]{36}$/u);
  expect(await overflow()).toBe(false);

  // Save from the object page at mobile width.
  await page.goto(`/objects/${K2_18}`);
  const picker = await openDialog(page, /save k2-18 to a collection/iu, "Save to a collection");
  await picker.getByRole("checkbox", { name: "Mobile Shelf" }).check();
  await picker.getByRole("button", { name: "Done" }).click();
  expect(await overflow()).toBe(false);

  // Open the collection, verify content, remove the object again.
  await page.goto(
    `/collections/${JSON.parse((await page.evaluate((key) => window.localStorage.getItem(key) ?? '""', STORAGE_KEY)) as string).collections?.[0]?.id as string}`,
  );
  await expect(page.getByRole("heading", { level: 1, name: "Mobile Shelf" })).toBeVisible();
  expect(await overflow()).toBe(false);
  await expect(
    page
      .getByRole("list", { name: /objects in mobile shelf/i })
      .getByRole("link", { name: /K2-18/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove K2-18 from the collection" }).click();
  await expect(page.getByText(/no objects saved here yet/i)).toBeVisible();
  expect(await overflow()).toBe(false);
});

test("cross-tab — a second tab observes writes through the storage event", async ({ browser }) => {
  // Two PAGES share one browser context (one profile's localStorage), which is
  // exactly the deployment model for local collections.
  const context = await browser.newContext();
  const tabA = await context.newPage();
  await tabA.goto("/collections");
  const dialogA = await openDialog(tabA, /\+ Create a collection/u, "Create a collection");
  await dialogA.getByLabel("Name").fill("Synced Shelf");
  await dialogA.getByRole("button", { name: "Create collection" }).click();
  await expect(tabA.getByRole("heading", { level: 1, name: "Synced Shelf" })).toBeVisible();

  const tabB = await context.newPage();
  await tabB.goto("/collections");
  // Tab B sees tab A's collection after its own load…
  await expect(
    tabB
      .getByRole("list", { name: "Your collections" })
      .getByRole("link", { name: /Synced Shelf/ }),
  ).toBeVisible();

  // …and a write performed while B sits on the overview arrives LIVE through
  // the storage event, without a reload.
  await tabA.goto("/collections");
  const dialogA2 = await openDialog(tabA, /\+ Create a collection/u, "Create a collection");
  await dialogA2.getByLabel("Name").fill("Second Tab Set");
  await dialogA2.getByRole("button", { name: "Create collection" }).click();

  await expect(tabB.getByRole("link", { name: /Second Tab Set/ })).toBeVisible({ timeout: 10_000 });

  await context.close();
});
