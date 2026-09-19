import type { ParticipateResponse } from "@lumina/api-client";

export type ParticipateProject = ParticipateResponse["projects"][number];
export type ParticipateChallenge = ParticipateResponse["challenges"][number];
export type ParticipateActivity = ParticipateResponse["activities"][number];
export type ParticipateSource = ParticipateResponse["sources"][number];

export const PARTICIPATE_ALL_FILTER = "all" as const;

export function timeFilterLabel(value: string): string {
  switch (value) {
    case "a_few_min":
      return "A few minutes";
    case "about_10_min":
      return "About 10 minutes";
    case "five_to_fifteen_min":
      return "5–15 minutes";
    case "about_15_min":
      return "About 15 minutes";
    default:
      return value;
  }
}

export function deviceFilterLabel(value: string): string {
  switch (value) {
    case "web_device":
      return "Web-connected device";
    case "mobile_or_computer":
      return "Mobile device or computer";
    case "tablet_explicit":
      return "Tablet explicitly supported";
    default:
      return value;
  }
}

export function skillFocusLabel(value: string): string {
  switch (value) {
    case "visual_classification":
      return "Visual classification";
    case "light_curve_reading":
      return "Light-curve reading";
    case "candidate_image_validation":
      return "Candidate-image validation";
    case "spectroscopy_data":
      return "Spectroscopy data";
    case "plot_reading":
      return "Plot reading";
    default:
      return value;
  }
}

export function projectStatusLabel(project: ParticipateProject): string {
  const suffix = project.status_stale ? " — status may be stale" : "";
  switch (project.status) {
    case "active":
      return `Currently public and live${suffix}`;
    case "inactive":
      return `Currently not public/live${suffix}`;
    case "unavailable":
      return "Current project status unavailable";
  }
}

export function freshnessHeading(response: ParticipateResponse): string {
  switch (response.freshness.availability) {
    case "fresh":
      return "Fresh project-status snapshot";
    case "stale":
      return "Project status may be stale";
    case "unavailable":
      return "Current project status unavailable";
  }
}

export function timestampLabel(value: string | null): string {
  if (value === null) return "Unavailable";
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? value : instant.toISOString().replace(".000Z", "Z");
}
