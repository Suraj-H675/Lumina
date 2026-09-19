import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ParticipateResponse } from "@lumina/api-client";

import { ParticipateNoScript } from "../src/components/participate-no-script";
import { PARTICIPATE_FRESH_RESPONSE } from "./participate-fixture";

describe("ParticipateNoScript", () => {
  it("keeps projects, challenges, activity safety, provenance, and handoff text usable without JavaScript", () => {
    const markup = renderToStaticMarkup(
      <ParticipateNoScript response={PARTICIPATE_FRESH_RESPONSE} />,
    );

    expect(markup).toContain("data-participate-fallback");
    expect(markup).toContain("Galaxy Zoo");
    expect(markup).toContain("Planet Hunters TESS");
    expect(markup).toContain("Cloudspotting on Mars");
    expect(markup).toContain("Month 1: Moon journal");
    expect(markup).toContain("Month 12: Repeat and compare");
    expect(markup).toContain("Never look at the Sun through the pinhole.");
    expect(markup).toContain("Never point the spectroscope at the Sun.");
    expect(markup).toContain("There is no universal planisphere");
    expect(markup).toContain("poor fit very near the equator");
    expect(markup).toContain("Scout unfamiliar observing terrain in daylight");
    expect(markup).toContain("You are leaving Lumina for Zooniverse");
    expect(markup).toContain("NASA Science");
    expect(markup).toContain("in-the-sky.org/planisphere");
    expect(markup).toContain("Filters require JavaScript, so all six reviewed projects are listed");
  });

  it("labels stale and expired provider state without fabricating fresh activity", () => {
    const stale: ParticipateResponse = {
      ...PARTICIPATE_FRESH_RESPONSE,
      projects: PARTICIPATE_FRESH_RESPONSE.projects.map((project) => ({
        ...project,
        status_stale: true,
      })),
      freshness: {
        ...PARTICIPATE_FRESH_RESPONSE.freshness,
        availability: "stale",
        cache_state: "stale",
      },
    };
    const expired: ParticipateResponse = {
      ...PARTICIPATE_FRESH_RESPONSE,
      projects: PARTICIPATE_FRESH_RESPONSE.projects.map((project) => ({
        ...project,
        status: "unavailable",
        status_stale: false,
        source_updated_at: null,
      })),
      freshness: {
        ...PARTICIPATE_FRESH_RESPONSE.freshness,
        availability: "unavailable",
        cache_state: "expired",
      },
    };

    const staleMarkup = renderToStaticMarkup(<ParticipateNoScript response={stale} />);
    const expiredMarkup = renderToStaticMarkup(<ParticipateNoScript response={expired} />);

    expect(staleMarkup).toContain("Project status may be stale");
    expect(staleMarkup).toContain("Currently public and live — status may be stale");
    expect(expiredMarkup).toContain("Current project status unavailable");
    expect(expiredMarkup).not.toContain("Currently public and live");
    expect(expiredMarkup).toContain("Month 1: Moon journal");
    expect(expiredMarkup).toContain("Pinhole projector");
  });
});
