import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import GlobalError from "../src/app/global-error";
import ScaleExplorerError from "../src/app/lab/scale-explorer/route-error";
import TelescopeBuilderError from "../src/app/lab/telescope-builder/route-error";
import LearningError from "../src/app/learn/route-error";
import LearningLoading from "../src/app/learn/route-loading";
import ObjectRouteError from "../src/app/objects/[slug]/route-error";
import NotFound from "../src/app/route-not-found";
import { MissionControlHome } from "../src/app/mission-control-home";
import { loadReviewedDiscoveries } from "../src/lib/discoveries/content";
import RouteError from "../src/app/route-error";
import { SiteShell } from "../src/components/site-shell";
import { enMessages } from "../src/lib/i18n/messages/en";
import { EN_SHELL_PROPS } from "./i18n-test-fixture";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../src/app");
const rootLoadingPath = resolve(appDirectory, "loading.tsx");
const learnLoadingPath = resolve(appDirectory, "(en)/learn/loading.tsx");

function renderHome() {
  return render(
    <SiteShell {...EN_SHELL_PROPS}>
      <MissionControlHome
        discoveries={loadReviewedDiscoveries().entries}
        launchOutcome={{ kind: "unavailable" }}
        messages={enMessages.missionControl}
      />
    </SiteShell>,
  );
}

describe("Nova-Lumina Mission Control home", () => {
  it("renders Mission Control while keeping unavailable data honest", () => {
    renderHome();

    expect(screen.getByRole("heading", { level: 1, name: "Mission Control" })).toBeVisible();
    expect(screen.getByText(/Unavailable data stays visibly unavailable/i)).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Current mission event" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: /Hubble and Webb probe/i })).toBeVisible();
  });

  it("does not invent a live mission claim when the provider snapshot is unavailable", () => {
    renderHome();

    expect(screen.getByText(/No validated Launch Library 2 snapshot is available/i)).toBeVisible();
    expect(document.body.textContent ?? "").not.toMatch(/exact countdown/i);
  });

  it("links to the current source-status surface", () => {
    renderHome();

    expect(screen.getByRole("link", { name: "Check source status" })).toHaveAttribute(
      "href",
      "/status",
    );
  });

  it("keeps current-launch source and freshness context beside the focal event", () => {
    render(
      <SiteShell {...EN_SHELL_PROPS}>
        <MissionControlHome
          discoveries={loadReviewedDiscoveries().entries}
          launchOutcome={{
            kind: "ok",
            data: {
              active_mission_launch_ids: [],
              availability: "fresh",
              freshness: {
                cache_state: "fresh",
                fresh_until: "2026-09-15T00:20:00Z",
                last_refresh_failure_code: null,
                retrieved_at: "2026-09-15T00:05:00Z",
                snapshot_latest_updated_utc: "2026-09-15T00:02:00Z",
                stale_until: "2026-09-15T00:35:00Z",
              },
              launches: [
                {
                  agency: { id: 1, name: "Fixture Agency" },
                  launch_id: "fixture-launch",
                  mission: null,
                  name: "Fixture Launch",
                  official_page_url: null,
                  official_webcast_url: null,
                  site: null,
                  slug: "fixture-launch",
                  status: { abbreviation: "Go", id: 1, name: "Go for Launch" },
                  timing: {
                    calendar_eligible: true,
                    countdown_eligible: true,
                    net_utc: "2026-09-20T12:30:00Z",
                    precision_abbreviation: "MIN",
                    precision_id: 1,
                    precision_name: "Minute",
                    provider_updated_at: "2026-09-15T00:02:00Z",
                    window_end_utc: null,
                    window_start_utc: null,
                  },
                  vehicle: null,
                  webcast_live: false,
                },
              ],
              returned_launch_count: 1,
              source: {
                attribution_text: "Fixture launch attribution.",
                name: "Fixture Launch Source",
                official_documentation_url: "https://example.com/docs",
                terms_url: "https://example.com/terms",
              },
              total_launch_count: 1,
              unavailable_reason: null,
            },
          }}
          messages={enMessages.missionControl}
        />
      </SiteShell>,
    );

    expect(screen.getByText(/Source: Fixture Launch Source/)).toBeVisible();
    expect(screen.getByText(/Retrieved:/)).toHaveTextContent("2026-09-15T00:05:00Z");
    expect(screen.getByText(/Latest source update:/)).toHaveTextContent("2026-09-15T00:02:00Z");
  });

  it("has one top-level heading and semantic landmarks", () => {
    renderHome();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Explore the catalogue" })[0]).toHaveAttribute(
      "href",
      "/explore",
    );
  });

  it("provides a skip link that targets main content", () => {
    renderHome();

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  it("passes an axe smoke check for the rendered home shell", async () => {
    const { container } = renderHome();

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});

describe("Nova-Lumina route boundaries", () => {
  it("uses route-specific loading boundaries without requiring a root loading boundary", () => {
    expect(existsSync(rootLoadingPath)).toBe(false);
    expect(existsSync(learnLoadingPath)).toBe(true);

    const { rerender } = render(<LearningLoading message={enMessages.learn.routeState.loading} />);
    expect(screen.getByRole("status")).toHaveTextContent(/learning path is loading/i);

    rerender(<NotFound messages={enMessages.routeBoundaries.notFound} />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    expect(screen.getByRole("link", { name: /return to nova-lumina home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("renders route and global errors without leaking raw error details", () => {
    const reset = vi.fn();
    const rawError = new Error("private diagnostic detail");
    const { unmount } = render(
      <RouteError
        error={rawError}
        messages={enMessages.routeBoundaries.routeError}
        reset={reset}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/could not load/i);
    expect(screen.queryByText(/private diagnostic detail/i)).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(reset).toHaveBeenCalledOnce();

    unmount();
    const globalDocument = new DOMParser().parseFromString(
      renderToStaticMarkup(<GlobalError error={rawError} reset={reset} />),
      "text/html",
    );
    expect(globalDocument.title).toBe("Something went wrong — Nova-Lumina");
    expect(globalDocument.querySelector("h1")?.textContent).toBe("Something went wrong");
    expect(globalDocument.querySelector('[role="alert"]')).not.toBeNull();
    expect(globalDocument.body.textContent).not.toMatch(/private diagnostic detail/i);
  });

  it("injects specialized route-boundary messages without exposing diagnostic details", () => {
    const reset = vi.fn();
    const rawError = new Error("private route diagnostic");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { rerender } = render(
      <LearningError
        error={rawError}
        messages={{
          description: "Fixture learning recovery",
          retry: "Fixture learning retry",
          title: "Fixture learning error",
        }}
        reset={reset}
      />,
    );
    expect(screen.getByRole("heading", { name: "Fixture learning error" })).toBeVisible();
    expect(screen.getByText("Fixture learning recovery")).toBeVisible();
    expect(screen.queryByText(/private route diagnostic/i)).not.toBeInTheDocument();

    rerender(
      <ObjectRouteError
        error={rawError}
        messages={{
          description: "Fixture object recovery",
          retry: "Fixture object retry",
          title: "Fixture object error",
        }}
        reset={reset}
      />,
    );
    expect(screen.getByRole("heading", { name: "Fixture object error" })).toBeVisible();
    expect(screen.getByText("Fixture object recovery")).toBeVisible();
    expect(screen.queryByText(/private route diagnostic/i)).not.toBeInTheDocument();

    rerender(
      <ScaleExplorerError
        error={rawError}
        messages={{
          description: "Fixture scale recovery",
          retry: "Fixture scale retry",
          title: "Fixture scale error",
        }}
        reset={reset}
      />,
    );
    expect(screen.getByRole("heading", { name: "Fixture scale error" })).toBeVisible();

    rerender(
      <TelescopeBuilderError
        error={rawError}
        messages={{
          description: "Fixture telescope recovery",
          retry: "Fixture telescope retry",
          title: "Fixture telescope error",
        }}
        reset={reset}
      />,
    );
    expect(screen.getByRole("heading", { name: "Fixture telescope error" })).toBeVisible();
    expect(screen.queryByText(/private route diagnostic/i)).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});
