import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";

import OfflinePage from "../src/app/offline/route-page";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { OfflineMessages } from "../src/lib/i18n/messages/types";

function renderOffline(messages: OfflineMessages["landing"] = enMessages.offline.landing) {
  return render(<OfflinePage messages={messages} />);
}

describe("Lumina offline fallback page", () => {
  it("explains the bounded visited-content model without implying live data is available", () => {
    renderOffline();

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
    const { container } = renderOffline();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("localizes the fallback wrapper without changing its storage destination", () => {
    const messages = {
      ...enMessages.offline.landing,
      manageStorage: "Localized storage action",
      title: "Localized offline title",
    } satisfies OfflineMessages["landing"];

    renderOffline(messages);

    expect(
      screen.getByRole("heading", { level: 1, name: "Localized offline title" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Localized storage action" })).toHaveAttribute(
      "href",
      "/offline/storage",
    );
  });
});
