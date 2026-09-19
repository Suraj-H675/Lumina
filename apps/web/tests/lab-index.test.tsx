import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import LabPage from "../src/app/lab/route-page";
import { SiteNav } from "../src/components/site-nav";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { LabIndexMessages } from "../src/lib/i18n/messages/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/lab/telescope-builder",
}));

describe("Lab section navigation", () => {
  it("lists implemented labs including the current Phase 7 surfaces", () => {
    const markup = renderToStaticMarkup(<LabPage messages={enMessages.labIndex} />);

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

  it("localizes the Lab wrapper without rewriting authored lab records", () => {
    const messages = {
      ...enMessages.labIndex,
      navigationLabel: "Localized lab navigation",
      openLab: "Localized lab action",
      title: "Localized Lab title",
    } satisfies LabIndexMessages;

    render(<LabPage messages={messages} />);

    expect(screen.getByRole("heading", { level: 1, name: "Localized Lab title" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Localized lab navigation" })).toBeVisible();
    expect(screen.getAllByText("Localized lab action")).toHaveLength(15);
    expect(screen.getByText("H-R Diagram Explorer", { exact: true })).toBeVisible();
    expect(
      screen.getByText(
        "Explore a curated Gaia DR3 stellar sample across physical H-R and Gaia colour–magnitude views.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /H-R Diagram Explorer/ })).toHaveAttribute(
      "href",
      "/lab/hr-diagram-explorer",
    );
  });

  it("points the primary Lab item at the section index and marks deep links active", () => {
    render(<SiteNav messages={enMessages.shell.navigation} />);

    const labLink = screen.getByRole("link", { name: "Lab" });
    expect(labLink).toHaveAttribute("href", "/lab");
    expect(labLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Participate" })).toHaveAttribute(
      "href",
      "/participate",
    );
  });
});
