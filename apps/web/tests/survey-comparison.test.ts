import { describe, expect, it } from "vitest";

import { surveyComparisonField } from "../src/lib/identification/survey-comparison";

describe("Phase 6C survey-comparison domain", () => {
  it("uses the solved diameter when it is inside the certified atlas range", () => {
    expect(surveyComparisonField(2.5)).toEqual({ field_of_view_deg: 5, was_clamped: false });
  });

  it("clamps only at the certified WWT field-of-view bounds", () => {
    expect(surveyComparisonField(0.001)).toEqual({
      field_of_view_deg: 0.05,
      was_clamped: true,
    });
    expect(surveyComparisonField(80)).toEqual({
      field_of_view_deg: 120,
      was_clamped: true,
    });
  });

  it("rejects invalid solved radii", () => {
    expect(() => surveyComparisonField(0)).toThrow();
    expect(() => surveyComparisonField(Number.NaN)).toThrow();
  });
});
