import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";

import OfflinePage from "../src/app/offline/page";

describe("Lumina offline fallback page", () => {
  it("explains the bounded visited-content model without implying live data is available", () => {
    render(<OfflinePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Lumina is offline" })).toBeVisible();
    expect(
      screen.getByText(/pages you visited while online may still be available/i),
    ).toBeVisible();
    expect(
      screen.getByText(
        /live space data, source status, weather, uploads, and jobs need a network/i,
      ),
    ).toBeVisible();
    expect(screen.getByText(/offline copies are not a backup/i)).toBeVisible();
  });

  it("passes an axe smoke check without JavaScript-only controls", async () => {
    const { container } = render(<OfflinePage />);
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
