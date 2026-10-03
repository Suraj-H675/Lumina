import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ObservationWorkspaceNav } from "../src/components/observation-workspace-nav";
import { enMessages } from "../src/lib/i18n/messages/en";

describe("observation workspace navigation", () => {
  it("keeps the three existing observing jobs visible and marks the current route", () => {
    render(
      <ObservationWorkspaceNav current="tonight" messages={enMessages.observationWorkspace} />,
    );

    expect(screen.getByRole("navigation", { name: "Observing workflows" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Plan one target/i })).toHaveAttribute(
      "href",
      "/observe",
    );
    expect(screen.getByRole("link", { name: /Plan from a Collection/i })).toHaveAttribute(
      "href",
      "/tonight",
    );
    expect(screen.getByRole("link", { name: /Identify an image/i })).toHaveAttribute(
      "href",
      "/identify",
    );
    expect(screen.getByRole("link", { name: /Plan from a Collection/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Plan one target/i })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
