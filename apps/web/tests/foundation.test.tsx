import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GlobalError from "../src/app/global-error";
import LearningLoading from "../src/app/learn/route-loading";
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

describe("Lumina Mission Control home", () => {
  it("renders Mission Control while keeping the construction state honest", () => {
    renderHome();

    expect(screen.getByRole("heading", { level: 1, name: "Mission Control" })).toBeVisible();
    expect(screen.getByText(/Lumina is still under construction/i)).toBeVisible();
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

describe("Lumina route boundaries", () => {
  it("uses route-specific loading boundaries without requiring a root loading boundary", () => {
    expect(existsSync(rootLoadingPath)).toBe(false);
    expect(existsSync(learnLoadingPath)).toBe(true);

    const { rerender } = render(<LearningLoading />);
    expect(screen.getByRole("status")).toHaveTextContent(/learning path is loading/i);

    rerender(<NotFound messages={enMessages.routeBoundaries.notFound} />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: /return to the lumina foundation home page/i }),
    ).toHaveAttribute("href", "/");
  });

  it("renders route and global errors without leaking raw error details", () => {
    const reset = vi.fn();
    const rawError = new Error("private diagnostic detail");
    const { rerender } = render(
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

    rerender(<GlobalError error={rawError} reset={reset} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeVisible();
    expect(screen.queryByText(/private diagnostic detail/i)).not.toBeInTheDocument();
  });
});
