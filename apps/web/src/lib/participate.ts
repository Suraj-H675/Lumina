import type { ParticipateResponse } from "@lumina/api-client";

import type { ParticipateMessages } from "./i18n/messages/types";

export type ParticipateProject = ParticipateResponse["projects"][number];
export type ParticipateChallenge = ParticipateResponse["challenges"][number];
export type ParticipateActivity = ParticipateResponse["activities"][number];
export type ParticipateSource = ParticipateResponse["sources"][number];

export const PARTICIPATE_ALL_FILTER = "all" as const;

export function cacheStateLabel(
  value: ParticipateResponse["freshness"]["cache_state"],
  messages: ParticipateMessages,
): string {
  return messages.freshness.cacheStates[value];
}

export function timeFilterLabel(value: string, messages: ParticipateMessages): string {
  switch (value) {
    case "a_few_min":
      return messages.projects.filters.timeOptions.aFewMinutes;
    case "about_10_min":
      return messages.projects.filters.timeOptions.about10Minutes;
    case "five_to_fifteen_min":
      return messages.projects.filters.timeOptions.fiveToFifteenMinutes;
    case "about_15_min":
      return messages.projects.filters.timeOptions.about15Minutes;
    default:
      return value;
  }
}

export function deviceFilterLabel(value: string, messages: ParticipateMessages): string {
  switch (value) {
    case "web_device":
      return messages.projects.filters.deviceOptions.webDevice;
    case "mobile_or_computer":
      return messages.projects.filters.deviceOptions.mobileOrComputer;
    case "tablet_explicit":
      return messages.projects.filters.deviceOptions.tabletExplicit;
    default:
      return value;
  }
}

export function skillFocusLabel(value: string, messages: ParticipateMessages): string {
  switch (value) {
    case "visual_classification":
      return messages.projects.filters.skillOptions.visualClassification;
    case "light_curve_reading":
      return messages.projects.filters.skillOptions.lightCurveReading;
    case "candidate_image_validation":
      return messages.projects.filters.skillOptions.candidateImageValidation;
    case "spectroscopy_data":
      return messages.projects.filters.skillOptions.spectroscopyData;
    case "plot_reading":
      return messages.projects.filters.skillOptions.plotReading;
    default:
      return value;
  }
}

export function projectStatusLabel(
  project: ParticipateProject,
  messages: ParticipateMessages,
): string {
  switch (project.status) {
    case "active":
      return project.status_stale
        ? messages.projects.status.activeStale
        : messages.projects.status.active;
    case "inactive":
      return project.status_stale
        ? messages.projects.status.inactiveStale
        : messages.projects.status.inactive;
    case "unavailable":
      return messages.projects.status.unavailable;
  }
}

export function freshnessHeading(
  response: ParticipateResponse,
  messages: ParticipateMessages,
): string {
  switch (response.freshness.availability) {
    case "fresh":
      return messages.freshness.headings.fresh;
    case "stale":
      return messages.freshness.headings.stale;
    case "unavailable":
      return messages.freshness.headings.unavailable;
  }
}

export function timestampLabel(value: string | null, messages: ParticipateMessages): string {
  if (value === null) return messages.unavailableValue;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? value : instant.toISOString().replace(".000Z", "Z");
}
