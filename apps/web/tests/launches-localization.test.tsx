import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  LaunchDetailResponse,
  LaunchItemResponse,
  LaunchListResponse,
} from "@lumina/api-client";

import { LaunchDetailView } from "../src/app/now/launches/[launchId]/launch-detail-view";
import { LaunchCountdown } from "../src/app/now/launches/launch-countdown";
import { LaunchesView } from "../src/app/now/launches/launches-view";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { LaunchCenterMessages } from "../src/lib/i18n/messages/types";

const launch: LaunchItemResponse = {
  launch_id: "11111111-1111-4111-8111-111111111111",
  slug: "fixture-go-launch",
  name: "Fixture Go Launch",
  status: { id: 1, name: "Go for Launch", abbreviation: "Go" },
  timing: {
    net_utc: "2026-09-20T12:30:00Z",
    precision_id: 1,
    precision_name: "Minute",
    precision_abbreviation: "MIN",
    window_start_utc: "2026-09-20T12:25:00Z",
    window_end_utc: "2026-09-20T12:35:00Z",
    provider_updated_at: "2026-09-15T00:01:00Z",
    countdown_eligible: true,
    calendar_eligible: true,
  },
  agency: { id: 1, name: "Fixture Space Agency" },
  vehicle: {
    configuration_id: 11,
    name: "Fixture Rocket",
    full_name: "Fixture Rocket Block 1",
    variant: "Block 1",
  },
  mission: {
    id: 101,
    name: "Fixture Mission One",
    mission_type: "Science",
    description: "A deterministic mission description for localization certification.",
    orbit_name: "Low Earth Orbit",
    orbit_abbreviation: "LEO",
    destination_body: "Earth",
    agency_names: ["Fixture Space Agency"],
  },
  site: {
    pad_id: 201,
    pad_name: "Fixture Pad A",
    location_name: "Fixture Spaceport",
    country_name: "United States",
    country_code: "US",
  },
  official_page_url: "https://www.nasa.gov/fixture-launch",
  official_webcast_url: "https://www.youtube.com/watch?v=fixture-launch",
  webcast_live: false,
};

const source = {
  name: "Launch Library 2 by The Space Devs",
  official_documentation_url: "https://ll.thespacedevs.com/",
  terms_url: "https://ll.thespacedevs.com/terms",
  attribution_text:
    "Launch schedule metadata is provided by Launch Library 2, a community-maintained spaceflight aggregator operated by The Space Devs.",
} as const;

const freshness = {
  cache_state: "fresh" as const,
  retrieved_at: "2026-09-15T00:05:00Z",
  fresh_until: "2026-09-15T02:05:00Z",
  stale_until: "2026-09-16T00:05:00Z",
  last_refresh_failure_code: "provider.http_rate_limited",
  snapshot_latest_updated_utc: "2026-09-15T00:02:00Z",
};

const listResponse: LaunchListResponse = {
  availability: "fresh",
  unavailable_reason: null,
  total_launch_count: 1,
  returned_launch_count: 1,
  active_mission_launch_ids: [launch.launch_id],
  launches: [launch],
  freshness,
  source,
};

const detailResponse: LaunchDetailResponse = {
  availability: "fresh",
  unavailable_reason: null,
  launch,
  freshness,
  source,
};

function localizedMessages(): LaunchCenterMessages {
  return {
    ...enMessages.spaceNow.launches,
    common: {
      ...enMessages.spaceNow.launches.common,
      spaceNowLaunchCenter: "Fixture launch center",
    },
    detail: {
      ...enMessages.spaceNow.launches.detail,
      factsTitle: "Fixture launch facts",
      labels: {
        ...enMessages.spaceNow.launches.detail.labels,
        launchProvider: "Fixture provider label",
      },
      officialLaunchPage: "Fixture official page",
      provenanceTitle: "Fixture provenance",
      sourceActionsTitle: "Fixture source actions",
    },
    list: {
      ...enMessages.spaceNow.launches.list,
      currentSnapshotTitle: "Fixture snapshot",
      facts: {
        ...enMessages.spaceNow.launches.list.facts,
        vehicle: "Fixture vehicle label",
      },
      title: "Fixture upcoming launches",
    },
    schedule: {
      ...enMessages.spaceNow.launches.schedule,
      providerPrecision: "Fixture provider precision {precision} {abbreviation} {countdown}",
      sourcePrecision: "Fixture source precision {precision} {abbreviation} {countdown}",
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Launch Center localization boundary", () => {
  it("localizes list chrome without rewriting LL2 launch, source, precision, or URL data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:29:00Z"));
    const messages = localizedMessages();

    render(
      <LaunchesView
        locale={DEFAULT_LOCALE}
        messages={messages}
        outcome={{ data: listResponse, kind: "ok" }}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Fixture upcoming launches" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Fixture snapshot" })).toBeVisible();
    expect(screen.getByText("Fixture vehicle label")).toBeVisible();
    expect(screen.getByText("Fixture Go Launch")).toBeVisible();
    expect(screen.getByText("Go for Launch")).toBeVisible();
    expect(screen.getByText(/Fixture source precision Minute MIN/)).toBeVisible();
    expect(screen.getByText("Fixture Rocket Block 1")).toBeVisible();
    expect(screen.getByText(source.attribution_text)).toBeVisible();
    expect(screen.getByText(/provider\.http_rate_limited/)).toBeVisible();
    expect(screen.getByRole("link", { name: messages.list.sourceDocumentation })).toHaveAttribute(
      "href",
      source.official_documentation_url,
    );
    expect(screen.getByRole("link", { name: "Fixture Go Launch" })).toHaveAttribute(
      "href",
      `/now/launches/${launch.launch_id}`,
    );
  });

  it("localizes detail chrome while preserving provider mission text and destinations", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:29:00Z"));
    const messages = localizedMessages();

    render(
      <LaunchDetailView
        locale={DEFAULT_LOCALE}
        messages={messages}
        outcome={{ data: detailResponse, kind: "ok" }}
      />,
    );

    expect(screen.getByText("Fixture launch center")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: launch.name })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Fixture launch facts" })).toBeVisible();
    expect(screen.getByText("Fixture provider label")).toBeVisible();
    expect(screen.getAllByText("Fixture Space Agency").length).toBeGreaterThan(0);
    expect(screen.getByText(/Fixture provider precision Minute MIN/)).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Fixture Mission One" })).toBeVisible();
    expect(
      screen.getByText("A deterministic mission description for localization certification."),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fixture source actions" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Fixture official page" })).toHaveAttribute(
      "href",
      launch.official_page_url,
    );
    expect(screen.getByRole("link", { name: messages.detail.officialWebcast })).toHaveAttribute(
      "href",
      launch.official_webcast_url,
    );
    expect(screen.getByRole("heading", { name: "Fixture provenance" })).toBeVisible();
    expect(screen.getByText(source.attribution_text)).toBeVisible();
    expect(screen.getByText("provider.http_rate_limited")).toBeVisible();
  });

  it("localizes countdown grammar while keeping the target instant as data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:29:00Z"));
    const messages = {
      ...enMessages.spaceNow.launches.countdown,
      label: "Fixture countdown:",
      units: {
        day: "{value}D",
        hour: "{value}H",
        minute: "{value}M",
        second: "{value}S",
      },
    };

    const { container } = render(
      <LaunchCountdown
        locale={DEFAULT_LOCALE}
        messages={messages}
        targetUtc={launch.timing.net_utc}
      />,
    );

    expect(container).toHaveTextContent("Fixture countdown: 1M 0S");
    expect(within(container).queryByText(launch.timing.net_utc)).not.toBeInTheDocument();
  });
});
