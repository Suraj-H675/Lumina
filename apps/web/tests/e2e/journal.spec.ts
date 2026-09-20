import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ENTRY_ID = "11000000-0000-4000-8000-000000000001";

const ENTRY = {
  attachment_ids: [],
  conditions: "Clear with light haze",
  created_at: "2026-09-16T16:00:00.000Z",
  equipment: ["Telescope: 100 mm refractor", "Camera: APS-C"],
  follow_up: false,
  id: ENTRY_ID,
  import_provenance: null,
  location: {
    confirmed_by_user: true,
    label: "Back garden",
    latitude_deg: 12.9716,
    longitude_deg: 77.5946,
  },
  notes: "Broad core visible.",
  objects: [{ entity_id: null, name: "Orion Nebula", source: "plate_annotation" }],
  observed_time: { confirmed_by_user: true, utc: "2026-09-16T15:00:00.000Z" },
  plate_solve: {
    center_dec_deg: -6.2,
    center_ra_deg: 82.5,
    frame: "ICRS",
    orientation_deg: 12.5,
    parity: "positive",
    pixel_scale_arcsec: 1.45,
    radius_deg: 0.72,
    snapshot_id: "71000000-0000-4000-8000-000000000001",
    solved_at: "2026-09-16T15:04:00.000Z",
    solver_version: "nova-fixture-v1",
    wcs_source_sha256: "a".repeat(64),
  },
  rating: null,
  schema_version: 1,
  tags: [],
  title: "Orion test",
  updated_at: "2026-09-16T16:00:00.000Z",
} as const;

async function seedJournal(page: Page): Promise<void> {
  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "No journal entries yet" })).toBeVisible();
  await page.evaluate(async (entry) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("lumina-personal");
      request.onerror = () => reject(request.error ?? new Error("journal database open failed"));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("journalEntries", "readwrite");
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("journal transaction failed"));
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.objectStore("journalEntries").put(entry);
      };
    });
  }, ENTRY);
  await page.reload();
}

test("Journal renders local personal data and requires confirmed local deletion", async ({
  page,
}) => {
  await seedJournal(page);

  await expect(page).toHaveTitle(/Journal · Lumina/);
  await expect(page.getByRole("heading", { level: 1, name: "Observation Journal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Orion test" })).toBeVisible();
  await expect(page.getByText("Back garden", { exact: false })).toBeVisible();
  await expect(page.getByText("Orion Nebula")).toBeVisible();
  await expect(page.getByText("Broad core visible.")).toBeVisible();
  await expect(page.getByText(/82\.500000° RA, -6\.200000° Dec/)).toBeVisible();
  await expect(page.getByText(ENTRY_ID)).toBeVisible();

  const deleteAction = page.getByRole("button", { name: "Delete local journal entry" });
  await deleteAction.click();
  await expect(page.getByRole("button", { name: "Confirm local delete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep entry" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm local delete" }).click();
  await expect(page.getByRole("heading", { name: "No journal entries yet" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "No journal entries yet" })).toBeVisible();

  const axeResults = await new AxeBuilder({ page }).analyze();
  expect(axeResults.violations).toEqual([]);
});

test("Journal keeps its privacy shell useful without client JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/journal");
    await expect(page).toHaveTitle(/Journal · Lumina/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Observation Journal" }),
    ).toBeVisible();
    await expect(page.getByText(/only in this browser's local IndexedDB/i)).toBeVisible();
    await expect(page.getByText(/does not send journal notes/i)).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Loading the local journal…");
  } finally {
    await context.close();
  }
});
