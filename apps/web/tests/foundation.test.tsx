import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GlobalError from "../src/app/global-error";
import Loading from "../src/app/loading";
import NotFound from "../src/app/not-found";
import HomePage from "../src/app/page";
import RouteError from "../src/app/error";
import { SiteShell } from "../src/components/site-shell";

function renderHome() {
  return render(
    <SiteShell>
      <HomePage />
    </SiteShell>,
  );
}

describe("Lumina foundation home", () => {
  it("states honestly that Lumina is under construction", () => {
    renderHome();

    expect(
      screen.getByRole("heading", { level: 1, name: "Lumina is under construction" }),
    ).toBeVisible();
    expect(
      screen.getByText(/does not yet provide catalog content, live data, or observing tools/i),
    ).toBeVisible();
  });

  it("does not present catalog or live-service claims", () => {
    renderHome();

    const pageText = document.body.textContent ?? "";
    expect(pageText).not.toMatch(
      /catalog is available|live data is available|provider status|current mission/i,
    );
    expect(pageText).not.toMatch(/\b\d+[,+]?\s+(objects|missions|catalog entries)\b/i);
  });

  it("has one top-level heading and semantic landmarks", () => {
    renderHome();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(screen.getByRole("link", { name: "About this foundation" })).toHaveAttribute(
      "href",
      "/#about",
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
  it("provides actionable loading and not-found copy", () => {
    const { rerender } = render(<Loading />);

    expect(screen.getByRole("status")).toHaveTextContent(/foundation page is loading/i);

    rerender(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: /return to the lumina foundation home page/i }),
    ).toHaveAttribute("href", "/");
  });

  it("renders route and global errors without leaking raw error details", () => {
    const reset = vi.fn();
    const rawError = new Error("private diagnostic detail");
    const { rerender } = render(<RouteError error={rawError} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/could not load/i);
    expect(screen.queryByText(/private diagnostic detail/i)).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(reset).toHaveBeenCalledOnce();

    rerender(<GlobalError error={rawError} reset={reset} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeVisible();
    expect(screen.queryByText(/private diagnostic detail/i)).not.toBeInTheDocument();
  });
});
