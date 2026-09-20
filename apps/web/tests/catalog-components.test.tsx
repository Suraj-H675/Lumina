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
import {
  EntityCardGrid,
  ExploreEmptyState,
  ExploreUnavailableState,
} from "../src/components/explore-catalogue-view";
import { collectionSaveMessageSlice } from "../src/lib/collections-messages";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";

const K2_18_ID = "403d0e71-8d81-5c52-abad-c4666c1b5cd6";
const SAVE_MESSAGES = collectionSaveMessageSlice(enMessages.collections);

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
    render(
      <ResultCard
        collectionSaveMessages={SAVE_MESSAGES}
        entityTypeMessages={enMessages.entityTypes}
        locale={DEFAULT_LOCALE}
        matchedAliasMessage={enMessages.explore.search.matchedAlias}
        result={searchItem()}
      />,
    );

    const link = screen.getByRole("link", { name: /K2-18/ });
    expect(link).toHaveAttribute("href", "/objects/k2-18");
    expect(within(link).getByText("Star")).toBeVisible();
  });

  it("shows the matched alias only when the backend reported one", () => {
    render(
      <ResultCard
        collectionSaveMessages={SAVE_MESSAGES}
        entityTypeMessages={enMessages.entityTypes}
        locale={DEFAULT_LOCALE}
        matchedAliasMessage={enMessages.explore.search.matchedAlias}
        result={searchItem({ match_reason: "exact_alias", matched_alias: "K2-18 b host" })}
      />,
    );
    expect(screen.getByText(/K2-18 b host/)).toBeVisible();
  });

  it("localizes the alias wrapper without rewriting the backend alias or identity", () => {
    const entityTypeMessages = { ...enMessages.entityTypes, star: "Fixture star type" };
    render(
      <ResultCard
        collectionSaveMessages={SAVE_MESSAGES}
        entityTypeMessages={entityTypeMessages}
        locale={DEFAULT_LOCALE}
        matchedAliasMessage="Fixture match {alias}"
        result={searchItem({ match_reason: "exact_alias", matched_alias: "K2-18 b host" })}
      />,
    );

    expect(screen.getByRole("link", { name: /K2-18/ })).toHaveAttribute("href", "/objects/k2-18");
    expect(screen.getByText("Fixture match K2-18 b host")).toBeVisible();
    expect(screen.getByText("Fixture star type")).toBeVisible();
  });
});

describe("ExploreResultsView", () => {
  it("lists results in backend order and never displays similarity internals", () => {
    render(
      <ExploreResultsView
        collectionSaveMessages={SAVE_MESSAGES}
        entityTypeMessages={enMessages.entityTypes}
        items={[searchItem(), searchItem({ entity: { ...k2_18, canonical_name: "Kepler-186" } })]}
        locale={DEFAULT_LOCALE}
        messages={enMessages.explore.search}
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
    render(
      <ExploreResultsView
        collectionSaveMessages={SAVE_MESSAGES}
        entityTypeMessages={enMessages.entityTypes}
        items={[]}
        locale={DEFAULT_LOCALE}
        messages={enMessages.explore.search}
        query="zzzz"
      />,
    );

    expect(screen.getByRole("heading", { name: /no objects matched/i })).toBeVisible();
  });

  it("localizes result-state chrome without rewriting the submitted query", () => {
    const messages = {
      ...enMessages.explore.search,
      noResultsDescription: "Fixture retry with {example}.",
      noResultsTitle: "Fixture no match for {query}",
      resultsAriaLabel: "Fixture results",
    };
    render(
      <ExploreResultsView
        collectionSaveMessages={SAVE_MESSAGES}
        entityTypeMessages={enMessages.entityTypes}
        items={[]}
        locale={DEFAULT_LOCALE}
        messages={messages}
        query="zzzz"
      />,
    );

    expect(screen.getByRole("heading", { name: "Fixture no match for zzzz" })).toBeVisible();
    expect(screen.getByText("Fixture retry with HD 209458.")).toBeVisible();
  });
});

describe("Explore catalogue localization boundary", () => {
  it("localizes browse states while preserving catalogue identities and object URLs", () => {
    const browseMessages = {
      ...enMessages.explore.browse,
      emptyDescription: "Fixture empty description",
      emptyTitle: "Fixture empty title",
      objectsAriaLabel: "Fixture catalogue objects",
    };
    const unavailableMessages = {
      ...enMessages.explore.unavailable,
      searchTitle: "Fixture search unavailable",
    };

    const { rerender } = render(
      <EntityCardGrid
        collectionSaveMessages={SAVE_MESSAGES}
        entityTypeMessages={{ ...enMessages.entityTypes, star: "Fixture browse type" }}
        items={[k2_18]}
        locale={DEFAULT_LOCALE}
        messages={browseMessages}
      />,
    );
    expect(screen.getByRole("list", { name: "Fixture catalogue objects" })).toBeVisible();
    expect(screen.getByRole("link", { name: /K2-18/ })).toHaveAttribute("href", "/objects/k2-18");
    expect(screen.getByText("Fixture browse type")).toBeVisible();

    rerender(<ExploreEmptyState messages={browseMessages} />);
    expect(screen.getByRole("heading", { name: "Fixture empty title" })).toBeVisible();
    expect(screen.getByText("Fixture empty description")).toBeVisible();

    rerender(<ExploreUnavailableState context="search" messages={unavailableMessages} />);
    expect(screen.getByRole("heading", { name: "Fixture search unavailable" })).toBeVisible();
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
    render(
      <ObjectView
        collectionSaveMessages={SAVE_MESSAGES}
        detail={detail()}
        entityTypeMessages={enMessages.entityTypes}
        journalEntryMessages={enMessages.journal.entry}
        locale={DEFAULT_LOCALE}
        messages={enMessages.object}
        slug="51-pegasi"
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "51 Pegasi" })).toBeVisible();
    expect(screen.getByRole("link", { name: /observe/i })).toHaveAttribute(
      "href",
      "/observe?object=51-pegasi",
    );
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
        collectionSaveMessages={SAVE_MESSAGES}
        detail={{ canonical_name: "HD 209458", entity_type: "star", id: K2_18_ID, quantities: [] }}
        entityTypeMessages={enMessages.entityTypes}
        journalEntryMessages={enMessages.journal.entry}
        locale={DEFAULT_LOCALE}
        messages={enMessages.object}
        slug="hd-209458"
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "HD 209458" })).toBeVisible();
    expect(
      screen.getByText(/no measurements are published through lumina for this object yet/i),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("undefined");
  });

  it("localizes Object chrome without rewriting catalogue science or provenance data", () => {
    const messages = {
      ...enMessages.object,
      footerBackToExplore: "Fixture back",
      header: {
        ...enMessages.object.header,
        compare: "Fixture compare",
        eyebrow: "Fixture object eyebrow",
        measuredQuantities: {
          one: "{entityType} / fixture {count} quantity",
          other: "{entityType} / fixture {count} quantities",
        },
        observe: "Fixture observe",
      },
      provenance: {
        ...enMessages.object.provenance,
        covers: "Fixture covers {quantities}",
        heading: "Fixture provenance",
        sourceRecord: "Fixture record {recordId}",
      },
      science: {
        ...enMessages.object.science,
        heading: "Fixture science",
        measurementDetails: {
          one: "Fixture {count} measurement / {originalValue} {originalUnit}",
          other: "Fixture {count} measurements / {originalValue} {originalUnit}",
        },
      },
    };
    const entityTypes = {
      ...enMessages.entityTypes,
      star: "Fixture star",
    };

    render(
      <ObjectView
        collectionSaveMessages={SAVE_MESSAGES}
        detail={detail()}
        entityTypeMessages={entityTypes}
        journalEntryMessages={enMessages.journal.entry}
        locale={DEFAULT_LOCALE}
        messages={messages}
        slug="51-pegasi"
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "51 Pegasi" })).toBeVisible();
    expect(screen.getByText("Fixture star / fixture 1 quantity")).toBeVisible();
    expect(screen.getByRole("link", { name: /fixture observe/i })).toHaveAttribute(
      "href",
      "/observe?object=51-pegasi",
    );
    expect(screen.getByRole("link", { name: /fixture compare/i })).toHaveAttribute(
      "href",
      "/compare?object=51-pegasi",
    );
    expect(screen.getByRole("heading", { name: "Fixture science" })).toBeVisible();
    expect(screen.getByText("Gaia G-band mean magnitude (Vega scale)")).toBeVisible();
    expect(screen.getByText("5.2832")).toBeVisible();
    expect(screen.getByText("mag")).toBeVisible();
    expect(screen.getByText("Fixture 1 measurement / 5.2832120 mag")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fixture provenance" })).toBeVisible();
    expect(screen.getByText("ESA Gaia Archive")).toBeVisible();
    expect(screen.getByText("Gaia Data Release 3 main source catalogue (dr3)")).toBeVisible();
    expect(screen.getByText("Fixture record 2835207319109249920")).toBeVisible();
    expect(
      screen.getByText("Fixture covers Gaia G-band mean magnitude (Vega scale)"),
    ).toBeVisible();
  });

  it("passes an axe accessibility scan with data present", async () => {
    const { container } = render(
      <ObjectView
        collectionSaveMessages={SAVE_MESSAGES}
        detail={detail()}
        entityTypeMessages={enMessages.entityTypes}
        journalEntryMessages={enMessages.journal.entry}
        locale={DEFAULT_LOCALE}
        messages={enMessages.object}
        slug="51-pegasi"
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("ObjectNotFoundView", () => {
  it("offers discovery instead of raw API errors", () => {
    render(<ObjectNotFoundView messages={enMessages.object.notFound} slug="not-a-real-object" />);

    expect(screen.getByRole("heading", { level: 1, name: "Object not found" })).toBeVisible();
    expect(screen.queryByText(/catalog.entity_not_found/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse the catalogue/i })).toHaveAttribute(
      "href",
      "/explore",
    );
  });

  it("localizes the not-found wrapper while preserving the requested object path", () => {
    const messages = {
      ...enMessages.object.notFound,
      browseCatalogue: "Fixture browse",
      description: "Fixture missing object at {path}.",
      title: "Fixture missing",
    };

    render(<ObjectNotFoundView messages={messages} slug="not-a-real-object" />);

    expect(screen.getByRole("heading", { level: 1, name: "Fixture missing" })).toBeVisible();
    expect(screen.getByText("Fixture missing object at /objects/not-a-real-object.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Fixture browse" })).toHaveAttribute(
      "href",
      "/explore",
    );
  });
});
