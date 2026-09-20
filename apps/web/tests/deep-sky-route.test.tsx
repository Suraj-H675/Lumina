import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DeepSkySelectionOutcome } from "../src/lib/server/deep-sky";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { DeepSkyMessages } from "../src/lib/i18n/messages/types";

const { browseMock, selectionMock } = vi.hoisted(() => ({
  browseMock: vi.fn(),
  selectionMock: vi.fn(),
}));

vi.mock("../src/lib/server/deep-sky", () => ({
  loadDeepSkyBrowse: browseMock,
  loadDeepSkySelection: selectionMock,
}));

vi.mock("../src/app/explore/deep-sky/deep-sky-atlas", () => ({
  DeepSkyAtlas: () => null,
}));

import DeepSkyPage, { createDeepSkyMetadata } from "../src/app/explore/deep-sky/route-page";

const M31_ID = "63f8a58a-a62b-5ae7-824b-35f3ebf1f6f0";

const READY_SELECTION: DeepSkySelectionOutcome = {
  coordinate: {
    declinationDegrees: 41.26875,
    epoch: 2000,
    originalDeclination: "41.26875",
    originalRightAscension: "10.684708333333334",
    rightAscensionDegrees: 10.684708333333334,
    source: {
      dataset: {
        code: "messier-j2000",
        name: "Reviewed CDS SIMBAD Messier J2000 catalogue",
        release_version: "v2",
      },
      provider: { code: "cds-simbad", name: "CDS SIMBAD" },
      source_record_id: "11111111-1111-5111-8111-111111111111",
    },
    sourceKey: "fixture-source",
  },
  coordinateDisclosure: {
    kind: "messier-resolver-j2000",
    referenceEpoch: "J2000.0",
  },
  detail: {
    canonical_name: "Messier 31",
    entity_type: "galaxy",
    id: M31_ID,
    quantities: [],
  },
  kind: "ready",
  slug: "messier-31",
};

async function renderDeepSky(messages: DeepSkyMessages = enMessages.deepSky) {
  browseMock.mockResolvedValue({
    items: [
      {
        canonical_name: "Messier 31",
        entity_type: "galaxy",
        id: M31_ID,
        slug: "messier-31",
      },
    ],
    kind: "ok",
    truncatedTypes: ["nebula"],
    unavailableTypes: ["cluster"],
  });
  selectionMock.mockResolvedValue(READY_SELECTION);

  const page = await DeepSkyPage({
    coordinateDisclosureMessages: enMessages.coordinateDisclosure,
    messages,
    searchParams: Promise.resolve({ layer: "infrared-wise", object: "messier-31" }),
  });
  return render(page);
}

describe("Deep-sky route localization boundary", () => {
  it("localizes route-owned chrome without rewriting catalogue or survey data", async () => {
    const messages: DeepSkyMessages = {
      ...enMessages.deepSky,
      browse: {
        ...enMessages.deepSky.browse,
        ariaLabel: "Fixture deep-sky list",
        boundedSlice: "Fixture bounded types: {types}.",
        title: "Fixture reviewed catalogue",
        unavailableTypes: "Fixture unavailable types: {types}.",
      },
      header: {
        ...enMessages.deepSky.header,
        backToExplore: "Fixture explore action",
        title: "Fixture deep-sky title",
      },
      layers: {
        ...enMessages.deepSky.layers,
        title: "Fixture survey layers",
      },
      selection: {
        ...enMessages.deepSky.selection,
        openObject: "Fixture canonical object action",
        selectedEyebrow: "Fixture selected object",
      },
    };

    await renderDeepSky(messages);

    expect(screen.getByRole("heading", { level: 1, name: "Fixture deep-sky title" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Fixture explore action" })).toHaveAttribute(
      "href",
      "/explore",
    );
    expect(screen.getByRole("list", { name: "Fixture deep-sky list" })).toBeVisible();
    expect(screen.getByText("Fixture unavailable types: Cluster.")).toBeVisible();
    expect(screen.getByText("Fixture bounded types: Nebula.")).toBeVisible();
    expect(screen.getByText("Fixture selected object")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Messier 31" })).toBeVisible();
    expect(screen.getByText("10.684708333333334°")).toBeVisible();
    expect(screen.getByText("41.26875°")).toBeVisible();
    expect(screen.getByText("J2000.0", { exact: true })).toBeVisible();
    expect(screen.getByText("CDS SIMBAD", { exact: true })).toBeVisible();
    expect(screen.getByText(/Reviewed CDS SIMBAD Messier J2000 catalogue \(v2\)/)).toBeVisible();
    expect(screen.getByText("Infrared · WISE", { exact: true })).toBeVisible();
    expect(
      screen.getByText(
        "Infrared survey imagery mapped into display colours. The colours represent infrared measurements, not visible-light colour.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(screen.getByText("NASA/JPL-Caltech/UCLA", { exact: true })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Fixture survey layers" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Fixture canonical object action" })).toHaveAttribute(
      "href",
      "/objects/messier-31",
    );
    expect(screen.getByRole("link", { name: "Open observation planner" })).toHaveAttribute(
      "href",
      "/observe?object=messier-31",
    );
  });

  it("creates metadata from the route message group", () => {
    const messages: DeepSkyMessages = {
      ...enMessages.deepSky,
      metadataDescription: "Fixture metadata description",
      metadataTitle: "Fixture metadata title",
    };

    expect(createDeepSkyMetadata(messages)).toMatchObject({
      description: "Fixture metadata description",
      title: "Fixture metadata title",
    });
  });
});
