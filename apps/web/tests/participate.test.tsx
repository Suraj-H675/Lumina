import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ParticipateResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { ParticipateView } from "../src/components/participate-view";
import { loadParticipate } from "../src/lib/server/participate";
import { PARTICIPATE_FRESH_RESPONSE } from "./participate-fixture";

function staleResponse(): ParticipateResponse {
  return {
    ...PARTICIPATE_FRESH_RESPONSE,
    projects: PARTICIPATE_FRESH_RESPONSE.projects.map((project) => ({
      ...project,
      status_stale: true,
    })),
    freshness: {
      ...PARTICIPATE_FRESH_RESPONSE.freshness,
      availability: "stale",
      cache_state: "stale",
      last_refresh_failure_code: "provider.transport_unavailable",
    },
  };
}

function unavailableResponse(): ParticipateResponse {
  return {
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
}

describe("Participate", () => {
  it("renders reviewed projects, explicit status, and external-handoff boundaries", () => {
    render(<ParticipateView response={PARTICIPATE_FRESH_RESPONSE} />);

    expect(screen.getByRole("heading", { level: 1, name: "Participate" })).toBeVisible();
    expect(screen.getByText("Fresh project-status snapshot")).toBeVisible();
    expect(screen.getByText("6 of 6 projects shown")).toBeVisible();
    expect(screen.getAllByText("Currently public and live")).toHaveLength(6);

    const galaxy = screen.getByRole("link", { name: "Open Galaxy Zoo on Zooniverse" });
    expect(galaxy).toHaveAttribute(
      "href",
      "https://www.zooniverse.org/projects/zookeeper/galaxy-zoo",
    );
    expect(galaxy).toHaveAttribute("target", "_blank");
    expect(galaxy).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(galaxy).toHaveAccessibleDescription(
      expect.stringContaining("You are leaving Lumina for Zooniverse"),
    );
    expect(
      screen.getByText(/does not send location, age, identity, challenge completion/i),
    ).toBeVisible();
  });

  it("combines bounded local filters and resets without network-derived search", async () => {
    const user = userEvent.setup();
    render(<ParticipateView response={PARTICIPATE_FRESH_RESPONSE} />);

    await user.selectOptions(screen.getByLabelText("Training time"), "about_10_min");
    expect(screen.getByText("2 of 6 projects shown")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Galaxy Zoo" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Planet Hunters TESS" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Active Asteroids" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Skill focus"), "visual_classification");
    expect(screen.getByText("1 of 6 projects shown")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Galaxy Zoo" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Planet Hunters TESS" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("6 of 6 projects shown")).toBeVisible();
    expect(screen.getByLabelText("Training time")).toHaveValue("all");
    expect(screen.getByLabelText("Device")).toHaveValue("all");
    expect(screen.getByLabelText("Skill focus")).toHaveValue("all");
  });

  it("shows a truthful empty-filter result instead of broadening automatically", async () => {
    const user = userEvent.setup();
    render(<ParticipateView response={PARTICIPATE_FRESH_RESPONSE} />);

    await user.selectOptions(screen.getByLabelText("Training time"), "about_15_min");
    await user.selectOptions(screen.getByLabelText("Device"), "tablet_explicit");

    expect(screen.getByText("0 of 6 projects shown")).toBeVisible();
    expect(
      screen.getByText("No reviewed project matches all three filters. Reset or broaden a filter."),
    ).toBeVisible();
  });

  it("keeps solar, planisphere, and night-observing safety attached to the activities", async () => {
    const user = userEvent.setup();
    render(<ParticipateView response={PARTICIPATE_FRESH_RESPONSE} />);

    await user.click(screen.getByText("Pinhole projector"));
    expect(screen.getByText("Never look at the Sun through the pinhole.")).toBeVisible();
    expect(
      screen.getByText("Never look directly at the Sun as part of this activity."),
    ).toBeVisible();

    await user.click(screen.getByText("Simple spectroscope"));
    expect(screen.getByText("Never point the spectroscope at the Sun.")).toBeVisible();
    expect(
      screen.getByText(/Never look at the Sun directly or through this spectroscope/),
    ).toBeVisible();

    await user.click(screen.getByText("Paper planisphere"));
    expect(
      screen.getByText(/There is no universal planisphere: the chart depends on latitude/),
    ).toBeVisible();
    expect(screen.getByText(/poor fit very near the equator/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open latitude-specific planisphere generator" }),
    ).toHaveAttribute("href", "https://in-the-sky.org/planisphere/index.php");

    await user.click(screen.getByText("Meteor counts"));
    expect(screen.getByText(/Scout unfamiliar observing terrain in daylight/)).toBeVisible();
    expect(
      screen.getByText(/Do not walk around while looking up or while dark-adapted/),
    ).toBeVisible();
  });

  it("distinguishes stale and unavailable project status without hiding reviewed content", () => {
    const { rerender } = render(<ParticipateView response={staleResponse()} />);

    expect(screen.getByText("Project status may be stale")).toBeVisible();
    expect(screen.getAllByText(/Currently public and live — status may be stale/)).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "Galaxy Zoo" })).toBeVisible();

    rerender(<ParticipateView response={unavailableResponse()} />);
    const unavailableLabels = screen.getAllByText("Current project status unavailable");
    expect(unavailableLabels).toHaveLength(7);
    expect(unavailableLabels[0]).toBeVisible();
    expect(screen.getByRole("heading", { name: "Galaxy Zoo" })).toBeVisible();
    expect(screen.getByText("Twelve evergreen monthly challenges")).toBeVisible();
    expect(screen.getByText("Hands-on activities")).toBeVisible();
  });

  it.each([
    ["fresh", PARTICIPATE_FRESH_RESPONSE],
    ["stale", staleResponse()],
    ["unavailable", unavailableResponse()],
  ] as const)("passes axe for the %s state", async (_name, response) => {
    const { container } = render(<ParticipateView response={response} />);
    expect((await axe(container)).violations).toHaveLength(0);
  });
});

describe("Participate server loader", () => {
  it("requests only Lumina's public Participate projection", async () => {
    const requests: string[] = [];
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input) => {
      requests.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify(PARTICIPATE_FRESH_RESPONSE), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    });

    await expect(
      loadParticipate({
        environment: "production",
        fetchImplementation,
        origin: "https://lumina-api.example.test",
      }),
    ).resolves.toEqual({ data: PARTICIPATE_FRESH_RESPONSE, kind: "ok" });
    expect(requests).toEqual(["https://lumina-api.example.test/api/v1/participate"]);
    expect(requests[0]).not.toContain("zooniverse.org");
    expect(requests[0]).not.toContain("location");
    expect(requests[0]).not.toContain("user");
  });

  it("fails closed without a production API origin or on malformed API data", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    await expect(
      loadParticipate({ environment: "production", fetchImplementation }),
    ).resolves.toEqual({ kind: "unavailable" });
    expect(fetchImplementation).not.toHaveBeenCalled();

    fetchImplementation.mockResolvedValue(
      new Response(JSON.stringify({ invented: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    await expect(
      loadParticipate({
        environment: "production",
        fetchImplementation,
        origin: "https://lumina-api.example.test",
      }),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});
