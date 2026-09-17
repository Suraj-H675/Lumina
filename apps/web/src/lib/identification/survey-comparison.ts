import { ATLAS_MAX_FIELD_OF_VIEW_DEG, ATLAS_MIN_FIELD_OF_VIEW_DEG } from "../wwt/atlas";

export type SurveyComparisonField = Readonly<{
  field_of_view_deg: number;
  was_clamped: boolean;
}>;

export function surveyComparisonField(radiusDeg: number): SurveyComparisonField {
  if (!Number.isFinite(radiusDeg) || radiusDeg <= 0) {
    throw new RangeError("Solved field radius must be positive and finite");
  }

  const diameter = radiusDeg * 2;
  const fieldOfView = Math.min(
    ATLAS_MAX_FIELD_OF_VIEW_DEG,
    Math.max(ATLAS_MIN_FIELD_OF_VIEW_DEG, diameter),
  );
  return Object.freeze({
    field_of_view_deg: fieldOfView,
    was_clamped: fieldOfView !== diameter,
  });
}
