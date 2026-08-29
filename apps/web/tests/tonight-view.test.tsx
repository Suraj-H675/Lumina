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
import { localDateString } from "../src/lib/observation/domain";
import { clearTonightCatalogueDetailCache } from "../src/lib/tonight/catalogue-loader";
import { clearWeatherForecastCache } from "../src/lib/weather/use-observation-weather";

const ORIGIN = "http://127.0.0.1:8000";
const NIGHT = "2026-08-27";
const COLLECTION_ID = "11111111-2222-4333-8444-555555555555";
const SECOND_COLLECTION_ID = "22222222-3333-4444-8555-666666666666";

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
  seedCollections([{ id: COLLECTION_ID, items: slugs, name: "Interesting Worlds" }]);
}

function seedCollections(
  collections: Array<
    Readonly<{ id: string; items: Array<keyof typeof targetDefinitions>; name: string }>
  >,
): void {
  window.localStorage.setItem(
    COLLECTIONS_STORAGE_KEY,
    JSON.stringify({
      collections: collections.map(({ id, items, name }) => ({
        created_at: "2026-08-20T10:00:00.000Z",
        id,
        items: items.map((slug) => ({
          canonical_name: targetDefinitions[slug].canonical_name,
          entity_type: "star",
          saved_at: "2026-08-20T10:00:00.000Z",
          slug,
        })),
        name,
        updated_at: "2026-08-20T10:00:00.000Z",
      })),
      version: 1,
    }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
}

function weatherPayload() {
  const times = [
    Date.parse("2026-08-27T21:00:00Z") / 1_000,
    Date.parse("2026-08-27T22:00:00Z") / 1_000,
    Date.parse("2026-08-27T23:00:00Z") / 1_000,
  ];
  return {
    hourly: {
      time: times,
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

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    COLLECTIONS_STORAGE_KEY,
    JSON.stringify({ collections: [], version: 1 }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
  clearTonightCatalogueDetailCache();
  clearWeatherForecastCache();
  replaceMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearWeatherForecastCache();
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

  it("requires weather opt-in and keeps the single forecast out of target ordering", async () => {
    seedCollection(["k2-18", "kepler-452"]);
    const today = localDateString(new Date());
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://api.open-meteo.com") {
        return new Response(JSON.stringify(weatherPayload()), {
          headers: { "content-type": "application/json" },
        });
      }
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
    render(<TonightView apiOrigin={ORIGIN} initialDate={today} />);
    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));
    await screen.findByTestId("tonight-primary-list");

    const weatherRequests = () =>
      fetchImplementation.mock.calls.filter(
        ([input]) => new URL(String(input)).origin === "https://api.open-meteo.com",
      );
    expect(weatherRequests()).toHaveLength(0);
    const firstTargetName = within(screen.getByTestId("tonight-primary-list"))
      .getAllByTestId("tonight-target-row")[0]
      ?.querySelector("h3")?.textContent;
    await user.click(screen.getByRole("button", { name: "Load weather forecast" }));
    await screen.findByText(/Forecast context loaded for the selected night/i);
    expect(weatherRequests()).toHaveLength(1);
    const weatherUrl = new URL(String(weatherRequests()[0]?.[0]));
    expect(weatherUrl.searchParams.get("latitude")).toBe("12.97");
    expect(weatherUrl.searchParams.get("longitude")).toBe("77.59");
    expect(screen.getAllByTestId("tonight-weather-facts")).not.toHaveLength(0);
    expect(
      within(screen.getByTestId("tonight-primary-list"))
        .getAllByTestId("tonight-target-row")[0]
        ?.querySelector("h3")?.textContent,
    ).toBe(firstTargetName);
  });

  it("does not refetch weather when the collection changes or catalogue details retry", async () => {
    seedCollections([
      { id: COLLECTION_ID, items: ["k2-18"], name: "Interesting Worlds" },
      { id: SECOND_COLLECTION_ID, items: ["kepler-452"], name: "Second Shelf" },
    ]);
    const today = localDateString(new Date());
    let failK2Detail = true;
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://api.open-meteo.com") {
        return new Response(JSON.stringify(weatherPayload()));
      }
      const bySlug = /^\/api\/v1\/catalog\/entities\/by-slug\/([^/]+)$/u.exec(url.pathname);
      if (bySlug !== null) {
        const slug = decodeURIComponent(bySlug[1]!) as keyof typeof targetDefinitions;
        return new Response(JSON.stringify(summaryFor(slug)), {
          headers: { "content-type": "application/json" },
        });
      }
      const detail = /^\/api\/v1\/catalog\/entities\/([^/]+)$/u.exec(url.pathname);
      if (detail !== null && detail[1] === targetDefinitions["k2-18"].id && failK2Detail) {
        return new Response("unavailable", { status: 503 });
      }
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
    render(<TonightView apiOrigin={ORIGIN} initialDate={today} />);
    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));
    await screen.findByRole("button", { name: "Retry catalogue loading" });
    await user.click(screen.getByRole("button", { name: "Load weather forecast" }));
    await screen.findByText(/Forecast context loaded for the selected night/i);
    const weatherRequestCount = () =>
      fetchImplementation.mock.calls.filter(
        ([input]) => new URL(String(input)).origin === "https://api.open-meteo.com",
      ).length;
    expect(weatherRequestCount()).toBe(1);

    failK2Detail = false;
    await user.click(screen.getByRole("button", { name: "Retry catalogue loading" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Retry catalogue loading" }),
      ).not.toBeInTheDocument(),
    );
    expect(weatherRequestCount()).toBe(1);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /collection to analyze/i }),
      SECOND_COLLECTION_ID,
    );
    await screen.findByText("Second Shelf · 1 saved");
    await screen.findByText(/Forecast context loaded for the selected night/i);
    expect(weatherRequestCount()).toBe(1);
  });

  it("renders the accepted one-hundred-target collection with bounded catalogue loading", async () => {
    // Deterministic scale fixture: production collections remain identity-only
    // and the current catalogue detail supplies the repeated test position.
    const scaleItems = Array.from({ length: 100 }, (_, index) => {
      const suffix = String(index).padStart(3, "0");
      return {
        canonical_name: `Scale target ${suffix}`,
        entity_type: "star",
        saved_at: "2026-08-20T10:00:00.000Z",
        slug: `scale-target-${suffix}`,
      };
    });
    window.localStorage.setItem(
      COLLECTIONS_STORAGE_KEY,
      JSON.stringify({
        collections: [
          {
            created_at: "2026-08-20T10:00:00.000Z",
            id: COLLECTION_ID,
            items: scaleItems,
            name: "Scale fixture",
            updated_at: "2026-08-20T10:00:00.000Z",
          },
        ],
        version: 1,
      }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const bySlug = /^\/api\/v1\/catalog\/entities\/by-slug\/([^/]+)$/u.exec(url.pathname);
      if (bySlug !== null) {
        const slug = decodeURIComponent(bySlug[1]!);
        return new Response(
          JSON.stringify({
            canonical_name: `Scale catalogue ${slug}`,
            entity_type: "star",
            id: targetDefinitions["k2-18"].id,
            slug,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (/^\/api\/v1\/catalog\/entities\/[^/]+$/u.test(url.pathname)) {
        return new Response(JSON.stringify(detailFor("k2-18")), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fixture URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchImplementation);

    const user = userEvent.setup();
    render(<TonightView apiOrigin={ORIGIN} initialDate={NIGHT} />);
    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    await waitFor(() => expect(screen.getAllByTestId("tonight-target-row")).toHaveLength(100));
    expect(fetchImplementation).toHaveBeenCalledTimes(200);
  });
});
