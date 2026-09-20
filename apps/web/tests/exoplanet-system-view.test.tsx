import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ExoplanetSystemExplorer } from "../src/app/explore/exoplanet-systems/exoplanet-system-explorer";
import { createExoplanetSystemsMetadata } from "../src/app/explore/exoplanet-systems/route-page";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { ExoplanetSystemsMessages } from "../src/lib/i18n/messages/types";

function renderExplorer(
  messages: ExoplanetSystemsMessages["explorer"] = enMessages.explore.exoplanetSystems.explorer,
) {
  return render(<ExoplanetSystemExplorer locale={DEFAULT_LOCALE} messages={messages} />);
}

describe("Phase 5B Exoplanet System Explorer", () => {
  it("defaults to the five-planet Kepler-186 layout with honest model wording", async () => {
    const { container } = renderExplorer();
    expect(
      screen.getByRole("heading", { level: 2, name: /Five known host systems/i }),
    ).toBeVisible();
    expect(screen.getByText(/not the planet's current distance/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Kepler-186, 5 confirmed planets/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("region", { name: /Kepler-186 orbital reference layout/i }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Kepler-186 f" })).toBeVisible();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("preserves split parameter references for HD 209458 b", async () => {
    renderExplorer();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /HD 209458, 1 confirmed planet/i }));

    const detail = screen.getByRole("region", { name: "HD 209458 b" });
    expect(within(detail).getByText("0.04707 AU", { exact: true })).toBeVisible();
    expect(within(detail).getByText("3.52474859 days", { exact: true })).toBeVisible();
    expect(within(detail).getByRole("link", { name: /Bonomo et al\. 2017/i })).toBeVisible();
    expect(within(detail).getByRole("link", { name: /Stassun et al\. 2017/i })).toBeVisible();
    expect(within(detail).getByText(/may come from different publications/i)).toBeVisible();
  });

  it("switches scale modes and keeps canonical host identity linked", async () => {
    renderExplorer();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Linear semi-major axis" }));
    expect(screen.getByRole("button", { name: "Linear semi-major axis" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const layout = screen.getByRole("region", { name: /Kepler-186 orbital reference layout/i });
    expect(within(layout).getByRole("button", { name: "Kepler-186 f" })).toBeVisible();
    expect(within(layout).getByText(/0\.432 AU · 41\.30% of shared linear track/i)).toBeVisible();
    expect(within(layout).getByRole("link", { name: /Open canonical host star/i })).toHaveAttribute(
      "href",
      "/objects/kepler-186",
    );
  });

  it("localizes explorer chrome without rewriting archive or planet data", async () => {
    const messages: ExoplanetSystemsMessages["explorer"] = {
      ...enMessages.explore.exoplanetSystems.explorer,
      host: {
        ...enMessages.explore.exoplanetSystems.explorer.host,
        hostname: "Fixture hostname: {hostname}",
      },
      modelEyebrow: "Fixture model {modelVersion}",
      parameter: {
        ...enMessages.explore.exoplanetSystems.explorer.parameter,
        reference: "Fixture reference: {reference} ↗",
      },
      title: "Fixture systems on one shared {unit} scale",
    };
    renderExplorer(messages);
    const user = userEvent.setup();

    expect(
      screen.getByRole("heading", { name: "Fixture systems on one shared AU scale" }),
    ).toBeVisible();
    expect(screen.getByText("Fixture model exoplanet-system-layout-v1")).toBeVisible();
    expect(screen.getByText("Fixture hostname: Kepler-186")).toBeVisible();
    expect(screen.getByRole("button", { name: "Kepler-186 f" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /HD 209458, 1 confirmed planet/i }));
    const detail = screen.getByRole("region", { name: "HD 209458 b" });
    expect(within(detail).getByText("0.04707 AU", { exact: true })).toBeVisible();
    expect(within(detail).getByText("3.52474859 days", { exact: true })).toBeVisible();
    expect(
      within(detail).getByRole("link", { name: "Fixture reference: Bonomo et al. 2017 ↗" }),
    ).toHaveAttribute("href", "https://ui.adsabs.harvard.edu/abs/2017A&A...602A.107B/abstract");
    expect(
      within(detail).getByRole("link", { name: "Fixture reference: Stassun et al. 2017 ↗" }),
    ).toHaveAttribute("href", "https://ui.adsabs.harvard.edu/abs/2017AJ....153..136S/abstract");
  });

  it("creates localized metadata without changing the canonical route", () => {
    const messages: ExoplanetSystemsMessages = {
      ...enMessages.explore.exoplanetSystems,
      metadataDescription: "Fixture metadata from {provider}.",
      metadataTitle: "Fixture exoplanet title",
    };

    expect(createExoplanetSystemsMetadata(messages)).toEqual({
      alternates: { canonical: "/explore/exoplanet-systems" },
      description: "Fixture metadata from NASA Exoplanet Archive.",
      title: "Fixture exoplanet title",
    });
  });
});
