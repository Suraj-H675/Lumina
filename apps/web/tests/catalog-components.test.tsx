import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  CatalogSearchResponse,
  EntityDetailResponse,
  EntitySummaryResponse,
} from "@lumina/api-client";

import { ObjectNotFoundView } from "../src/components/object-not-found-view";
import { ObjectView } from "../src/components/object-view";
import { ResultCard } from "../src/components/result-card";
import { ExploreResultsView } from "../src/components/search-results-view";

const K2_18_ID = "403d0e71-8d81-5c52-abad-c4666c1b5cd6";

const k2_18: EntitySummaryResponse = {
  canonical_name: "K2-18",
  entity_type: "star",
  id: K2_18_ID,
  slug: "k2-18",
};

function searchItem(
  overrides: Partial<CatalogSearchResponse["items"][number]> = {},
): CatalogSearchResponse["items"][number] {
  return {
    entity: k2_18,
    match_reason: "canonical_name_prefix",
    matched_alias: null,
    ...overrides,
  };
}

describe("ResultCard", () => {
  it("renders the canonical name as the hero identity with a restrained secondary line", () => {
    render(<ResultCard result={searchItem()} />);

    const link = screen.getByRole("link", { name: /K2-18/ });
    expect(link).toHaveAttribute("href", "/objects/k2-18");
    expect(within(link).getByText("Star")).toBeVisible();
  });

  it("shows the matched alias only when the backend reported one", () => {
    render(
      <ResultCard
        result={searchItem({ match_reason: "exact_alias", matched_alias: "K2-18 b host" })}
      />,
    );
    expect(screen.getByText(/K2-18 b host/)).toBeVisible();
  });
});

describe("ExploreResultsView", () => {
  it("lists results in backend order and never displays similarity internals", () => {
    render(
      <ExploreResultsView
        items={[searchItem(), searchItem({ entity: { ...k2_18, canonical_name: "Kepler-186" } })]}
        query="ke"
      />,
    );

    expect(screen.getByRole("list")).toBeVisible();
    const pageText = document.body.textContent ?? "";
    for (const reason of ["canonical_name_prefix", "exact_slug", "fuzzy", "similarity"] as const) {
      expect(pageText).not.toContain(reason);
    }
  });

  it("communicates that nothing matched without inventing suggestions", () => {
    render(<ExploreResultsView items={[]} query="zzzz" />);

    expect(screen.getByRole("heading", { name: /no objects matched/i })).toBeVisible();
  });
});

describe("ObjectView", () => {
  function detail(): EntityDetailResponse {
    return {
      canonical_name: "51 Pegasi",
      entity_type: "star",
      id: K2_18_ID,
      quantities: [
        {
          current_selection: {
            measurement: {
              id: "11111111-2222-5333-8444-555555555555",
              original_unit: "mag",
              original_value: "5.2832120",
              source: {
                dataset: {
                  code: "gaia-source",
                  name: "Gaia Data Release 3 main source catalogue",
                  release_version: "dr3",
                },
                provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
                source_record_id: "2835207319109249920",
              },
              unit: { code: "mag", name: "magnitude", symbol: "mag" },
              value: "5.2832120",
            },
            selection: {
              explanation: "Only reviewed measurement for this quantity in the accepted slice.",
              rule: "single-reviewed-measurement",
              selected_at: "2026-08-15T08:23:59Z",
              version: "1",
            },
          },
          measurement_count: 1,
          quantity: {
            code: "gaia_g_mean_magnitude",
            name: "Gaia G-band mean magnitude (Vega scale)",
          },
        },
      ],
    };
  }

  it("presents identity, scientific data with units, provenance, and a return affordance", () => {
    render(<ObjectView detail={detail()} slug="51-pegasi" />);

    expect(screen.getByRole("heading", { level: 1, name: "51 Pegasi" })).toBeVisible();
    expect(screen.getByText("Gaia G-band mean magnitude (Vega scale)")).toBeVisible();
    expect(screen.getByText("mag")).toBeVisible();
    expect(screen.getByRole("link", { name: /back to explore/i })).toHaveAttribute(
      "href",
      "/explore",
    );
    expect(screen.getAllByText(/ESA Gaia Archive/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Gaia Data Release 3 main source catalogue (dr3)")).toBeVisible();
  });

  it("stays intentional when no scientific data is available yet", () => {
    render(
      <ObjectView
        detail={{ canonical_name: "HD 209458", entity_type: "star", id: K2_18_ID, quantities: [] }}
        slug="hd-209458"
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "HD 209458" })).toBeVisible();
    expect(
      screen.getByText(/no measurements are published through lumina for this object yet/i),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("undefined");
  });

  it("passes an axe accessibility scan with data present", async () => {
    const { container } = render(<ObjectView detail={detail()} slug="51-pegasi" />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("ObjectNotFoundView", () => {
  it("offers discovery instead of raw API errors", () => {
    render(<ObjectNotFoundView slug="not-a-real-object" />);

    expect(screen.getByRole("heading", { level: 1, name: "Object not found" })).toBeVisible();
    expect(screen.queryByText(/catalog.entity_not_found/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse the catalogue/i })).toHaveAttribute(
      "href",
      "/explore",
    );
  });
});
