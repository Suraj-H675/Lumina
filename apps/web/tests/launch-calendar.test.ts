import { describe, expect, it } from "vitest";
import type { LaunchItemResponse } from "@lumina/api-client";

import { buildLaunchCalendar, launchCalendarFilename } from "../src/lib/launch-calendar";

function launch(overrides: Partial<LaunchItemResponse> = {}): LaunchItemResponse {
  return {
    launch_id: "11111111-1111-4111-8111-111111111111",
    slug: "falcon-9-science",
    name: "Falcon 9 | Science; Mission, One",
    status: { id: 1, name: "Go for Launch", abbreviation: "Go" },
    timing: {
      net_utc: "2026-09-16T12:30:00Z",
      precision_id: 1,
      precision_name: "Minute",
      precision_abbreviation: "MIN",
      window_start_utc: "2026-09-16T12:30:00Z",
      window_end_utc: "2026-09-16T13:00:00Z",
      provider_updated_at: "2026-09-15T00:10:00Z",
      countdown_eligible: true,
      calendar_eligible: true,
    },
    agency: { id: 121, name: "SpaceX" },
    vehicle: null,
    mission: null,
    site: {
      pad_id: 80,
      pad_name: "SLC-40",
      location_name: null,
      country_name: null,
      country_code: null,
    },
    official_page_url: "https://example.org/official",
    official_webcast_url: null,
    webcast_live: false,
    ...overrides,
  };
}

describe("launch calendar export", () => {
  it("exports exact Go timing as CONFIRMED RFC 5545 content", () => {
    const result = buildLaunchCalendar(launch());
    expect(result).not.toBeNull();
    expect(result).toContain("DTSTART:20260916T123000Z\r\n");
    expect(result).toContain("DTEND:20260916T130000Z\r\n");
    expect(result).toContain("STATUS:CONFIRMED\r\n");
    expect(result).toContain("SUMMARY:Falcon 9 | Science\\; Mission\\, One");
    expect(result?.endsWith("\r\n")).toBe(true);
  });

  it("exports precise TBC timing as TENTATIVE", () => {
    const base = launch();
    const result = buildLaunchCalendar(
      launch({
        status: { id: 8, name: "To Be Confirmed", abbreviation: "TBC" },
        timing: { ...base.timing, countdown_eligible: false },
      }),
    );
    expect(result).toContain("STATUS:TENTATIVE");
  });

  it("refuses coarse schedule values instead of inventing precision", () => {
    const base = launch();
    expect(
      buildLaunchCalendar(
        launch({
          timing: {
            ...base.timing,
            precision_id: 5,
            precision_name: "Day",
            precision_abbreviation: "DAY",
            countdown_eligible: false,
            calendar_eligible: false,
          },
        }),
      ),
    ).toBeNull();
  });

  it("uses a deterministic safe filename", () => {
    expect(launchCalendarFilename(launch())).toBe("falcon-9-science.ics");
  });
});
