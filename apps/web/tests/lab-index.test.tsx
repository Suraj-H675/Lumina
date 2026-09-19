import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import LabPage from "../src/app/lab/page";
import { SiteNav } from "../src/components/site-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/lab/telescope-builder",
}));

describe("Lab section navigation", () => {
  it("lists implemented labs including the current Phase 7 surfaces", () => {
    const markup = renderToStaticMarkup(<LabPage />);

    expect(markup).toContain('href="/lab/scale-explorer"');
    expect(markup).toContain('href="/lab/seasons-simulator"');
    expect(markup).toContain('href="/lab/telescope-builder"');
    expect(markup).toContain('href="/lab/hr-diagram-explorer"');
    expect(markup).toContain('href="/lab/planetary-system-builder"');
    expect(markup).toContain('href="/lab/rocket-mission-designer"');
    expect(markup).toContain('href="/lab/impact-simulator"');
    expect(markup).toContain('href="/lab/black-hole-relativity"');
    expect(markup).toContain('href="/lab/relativity-visualizations"');
    expect(markup).toContain("H-R Diagram Explorer");
    expect(markup).toContain("Rocket / Mission Designer");
    expect(markup).toContain("Impact Simulator");
    expect(markup).toContain("Black-Hole / Relativity Lab");
    expect(markup).toContain("Relativity Visualizations");
    expect(markup).not.toContain("Coming soon");
  });

  it("points the primary Lab item at the section index and marks deep links active", () => {
    render(<SiteNav />);

    const labLink = screen.getByRole("link", { name: "Lab" });
    expect(labLink).toHaveAttribute("href", "/lab");
    expect(labLink).toHaveAttribute("aria-current", "page");
  });
});
