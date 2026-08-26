import { describe, expect, it } from "vitest";

import {
  buildCompareHref,
  compareSelectionFromSearchParams,
  COMPARE_MAX_OBJECTS,
  parseCompareSelection,
} from "../src/lib/compare-url";

describe("parseCompareSelection", () => {
  it("returns an empty selection for no values", () => {
    expect(parseCompareSelection([])).toEqual({ droppedSlugs: [], slugs: [] });
  });

  it("preserves URL order", () => {
    expect(parseCompareSelection(["k2-18", "kepler-452"]).slugs).toEqual(["k2-18", "kepler-452"]);
    expect(parseCompareSelection(["kepler-452", "k2-18"]).slugs).toEqual(["kepler-452", "k2-18"]);
  });

  it("deduplicates repeated slugs while preserving the first occurrence", () => {
    const parsed = parseCompareSelection(["k2-18", "kepler-452", "k2-18"]);
    expect(parsed.slugs).toEqual(["k2-18", "kepler-452"]);
    expect(parsed.droppedSlugs).toEqual(["k2-18"]);
  });

  it("caps at three unique slugs and reports the rest as dropped", () => {
    const parsed = parseCompareSelection([
      "k2-18",
      "kepler-452",
      "51-pegasi",
      "hd-209458",
      "kepler-186",
    ]);
    expect(parsed.slugs).toEqual(["k2-18", "kepler-452", "51-pegasi"]);
    expect(parsed.droppedSlugs).toEqual(["hd-209458", "kepler-186"]);
    expect(parsed.slugs).toHaveLength(COMPARE_MAX_OBJECTS);
  });

  it("ignores values outside the public slug vocabulary instead of storing them", () => {
    const parsed = parseCompareSelection(["K2-18", "has_underscore", "-leading", "", "ok-slug"]);
    expect(parsed.slugs).toEqual(["ok-slug"]);
    // Invalid tokens are dropped entirely; they never become removable slots.
    expect(parsed.droppedSlugs).toEqual([]);
  });

  it("accepts single-token slugs like digits", () => {
    expect(parseCompareSelection(["1234"]).slugs).toEqual(["1234"]);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(parseCompareSelection(["  k2-18  "]).slugs).toEqual(["k2-18"]);
  });
});

describe("compareSelectionFromSearchParams", () => {
  it("reads repeated singular object parameters in order", () => {
    expect(compareSelectionFromSearchParams({ object: ["k2-18", "kepler-452"] }).slugs).toEqual([
      "k2-18",
      "kepler-452",
    ]);
  });

  it("reads a singular parameter", () => {
    expect(compareSelectionFromSearchParams({ object: "k2-18" }).slugs).toEqual(["k2-18"]);
  });

  it("treats missing parameters as an empty comparison", () => {
    expect(compareSelectionFromSearchParams({})).toEqual({ droppedSlugs: [], slugs: [] });
    expect(compareSelectionFromSearchParams({ q: "kepler", other: ["x"] })).toEqual({
      droppedSlugs: [],
      slugs: [],
    });
  });
});

describe("buildCompareHref", () => {
  it("builds repeated singular query parameters in order", () => {
    expect(buildCompareHref(["k2-18", "kepler-452"])).toBe(
      "/compare?object=k2-18&object=kepler-452",
    );
  });

  it("returns the bare route for an empty selection", () => {
    expect(buildCompareHref([])).toBe("/compare");
  });

  it("round-trips through parsing with dedupe, cap, and order intact", () => {
    const href = buildCompareHref(["b", "a", "b", "c", "d"]);
    const params = new URLSearchParams(href.split("?")[1] ?? "");
    const reparsed = parseCompareSelection(params.getAll("object"));
    expect(reparsed.slugs).toEqual(["b", "a", "c"]);
  });
});
