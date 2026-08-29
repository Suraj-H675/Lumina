import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import type { EntityDetailResponse, EntitySummaryResponse } from "@lumina/api-client";

import { TonightView } from "../src/components/tonight-view";
import { COLLECTIONS_STORAGE_KEY } from "../src/lib/collections-model";
import { clearTonightCatalogueDetailCache } from "../src/lib/tonight/catalogue-loader";

const ORIGIN = "http://127.0.0.1:8000";
const NIGHT = "2026-08-27";
const COLLECTION_ID = "11111111-2222-4333-8444-555555555555";

const source = {
  dataset: {
    code: "gaia-source-astrometry",
    name: "Gaia Data Release 3 main source catalogue — reviewed astrometry slice",
    release_version: "dr3",
  },
  provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
  source_record_id: "90000000-0000-5000-8000-391074753181",
} as const;

const targetDefinitions = {
  "kepler-452": {
    canonical_name: "Kepler-452",
    declination: "44.2775873685433",
    id: "bfd42670-3013-598e-8eb5-5a1c084dd1a0",
    rightAscension: "296.0037539639907",
  },
  "k2-18": {
    canonical_name: "K2-18",
    declination: "7.58781312214569",
    id: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
    rightAscension: "172.5601297577743",
  },
} as const;

function detailFor(slug: keyof typeof targetDefinitions): EntityDetailResponse {
  const target = targetDefinitions[slug];
  const measurement = (code: string, value: string, index: number) => ({
    current_selection: {
      measurement: {
        id: `33333333-4444-5555-8666-${String(index).padStart(12, "0")}`,
        original_unit: "deg",
        original_value: value,
        source,
        unit: { code: "deg", name: "degree", symbol: "deg" },
        value,
      },
      selection: {
        explanation: "Only reviewed measurement for this quantity.",
        rule: "single-reviewed-measurement",
        selected_at: "2026-08-27T00:00:00Z",
        version: "1",
      },
    },
    measurement_count: 1,
    quantity: { code, name: code },
  });

  return {
    canonical_name: target.canonical_name,
    entity_type: "star",
    id: target.id,
    quantities: [
      measurement("gaia_icrs_right_ascension", target.rightAscension, 1),
      measurement("gaia_icrs_declination", target.declination, 2),
    ],
  };
}

function summaryFor(slug: keyof typeof targetDefinitions): EntitySummaryResponse {
  const target = targetDefinitions[slug];
  return {
    canonical_name: target.canonical_name,
    entity_type: "star",
    id: target.id,
    slug,
  };
}

function seedCollection(slugs: Array<keyof typeof targetDefinitions>): void {
  window.localStorage.setItem(
    COLLECTIONS_STORAGE_KEY,
    JSON.stringify({
      collections: [
        {
          created_at: "2026-08-20T10:00:00.000Z",
          id: COLLECTION_ID,
          items: slugs.map((slug) => ({
            canonical_name: targetDefinitions[slug].canonical_name,
            entity_type: "star",
            saved_at: "2026-08-20T10:00:00.000Z",
            slug,
          })),
          name: "Interesting Worlds",
          updated_at: "2026-08-20T10:00:00.000Z",
        },
      ],
      version: 1,
    }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    COLLECTIONS_STORAGE_KEY,
    JSON.stringify({ collections: [], version: 1 }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
  clearTonightCatalogueDetailCache();
  replaceMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TonightView", () => {
  it("loads one selected collection, shows factual results, and keeps sorting client-side", async () => {
    seedCollection(["k2-18", "kepler-452"]);
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const bySlug = /^\/api\/v1\/catalog\/entities\/by-slug\/([^/]+)$/u.exec(url.pathname);
      if (bySlug !== null) {
        const slug = decodeURIComponent(bySlug[1]!) as keyof typeof targetDefinitions;
        return new Response(JSON.stringify(summaryFor(slug)), {
          headers: { "content-type": "application/json" },
        });
      }
      const detail = /^\/api\/v1\/catalog\/entities\/([^/]+)$/u.exec(url.pathname);
      if (detail !== null) {
        const slug = (
          detail[1] === targetDefinitions["k2-18"].id ? "k2-18" : "kepler-452"
        ) as keyof typeof targetDefinitions;
        return new Response(JSON.stringify(detailFor(slug)), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fixture URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchImplementation);

    const user = userEvent.setup();
    render(<TonightView apiOrigin={ORIGIN} initialDate={NIGHT} />);

    expect(await screen.findByRole("heading", { name: "Tonight" })).toBeVisible();
    expect(await screen.findByRole("combobox", { name: /collection to analyze/i })).toHaveValue(
      COLLECTION_ID,
    );
    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    const primaryList = await screen.findByTestId("tonight-primary-list");
    const belowList = await screen.findByTestId("tonight-below-list");
    await expect(
      screen.findByText(/Ordered by highest sampled altitude during astronomical darkness/i),
    ).resolves.toBeVisible();
    expect(within(primaryList).getAllByText(/Moon at peak:/i)).toHaveLength(1);
    expect(within(belowList).getAllByText(/Moon at peak:/i)).toHaveLength(1);
    expect(within(primaryList).getAllByTestId("tonight-target-row")).toHaveLength(1);
    expect(within(belowList).getAllByTestId("tonight-target-row")).toHaveLength(1);
    expect(screen.getByText(/Scientifically analyzed/i)).toBeVisible();
    expect(within(belowList).getByRole("link", { name: "Open planner" })).toHaveAttribute(
      "href",
      expect.stringContaining(`/observe?object=k2-18&date=${NIGHT}`),
    );
    await waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(4));

    const requestsBeforeSort = fetchImplementation.mock.calls.length;
    await user.selectOptions(screen.getByRole("combobox", { name: "Order by" }), "name");
    expect(fetchImplementation).toHaveBeenCalledTimes(requestsBeforeSort);
    const sortedRows = within(screen.getByTestId("tonight-primary-list")).getAllByTestId(
      "tonight-target-row",
    );
    expect(sortedRows[0]).toHaveTextContent("Kepler-452");

    const nightDateInput = screen.getByDisplayValue(NIGHT);
    await user.clear(nightDateInput);
    await user.type(nightDateInput, "2026-08-28");
    expect(fetchImplementation).toHaveBeenCalledTimes(requestsBeforeSort);
    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "13");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));
    expect(fetchImplementation).toHaveBeenCalledTimes(requestsBeforeSort);
  });

  it("does not fall back to a catalogue-wide request when no collections exist", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchImplementation);

    render(<TonightView apiOrigin={ORIGIN} initialDate={NIGHT} />);

    expect(await screen.findByText(/Save objects to use Tonight/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Collections" })).toHaveAttribute(
      "href",
      "/collections",
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("leaves corrupted collection bytes untouched and shows recovery guidance", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, "{corrupt");
    window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));

    render(<TonightView initialDate={NIGHT} />);

    expect(
      await screen.findByRole("heading", { name: /your saved collections could not be read/i }),
    ).toBeVisible();
    expect(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY)).toBe("{corrupt");
    expect(screen.getByText(/nothing has been changed or deleted/i)).toBeVisible();
  });
});
