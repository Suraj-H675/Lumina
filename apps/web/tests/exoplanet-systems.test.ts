import { describe, expect, it } from "vitest";

import {
  EXOPLANET_RAW_SNAPSHOT,
  EXOPLANET_SYSTEMS,
  EXOPLANET_SYSTEM_ARTIFACT,
  exoplanetPosition,
  exoplanetSystemBySlug,
} from "../src/lib/visualizations/exoplanet-systems";

describe("Phase 5B exoplanet-system reviewed artifact", () => {
  it("loads the exact five host systems and ten pinned confirmed planets", () => {
    expect(EXOPLANET_SYSTEM_ARTIFACT.model_version).toBe("exoplanet-system-layout-v1");
    expect(
      EXOPLANET_SYSTEMS.map((system) => [system.display_name, system.archive_planet_count]),
    ).toEqual([
      ["51 Pegasi", 1],
      ["HD 209458", 1],
      ["K2-18", 2],
      ["Kepler-186", 5],
      ["Kepler-452", 1],
    ]);
    expect(EXOPLANET_SYSTEMS.flatMap((system) => system.planets)).toHaveLength(10);
    expect(EXOPLANET_RAW_SNAPSHOT.sha256).toBe(
      "74a1dde951b63b630653c94c36880cfd9b015faa2c600315f5e06fa22596c9db",
    );
  });

  it("keeps 51 Peg archive naming distinct from Lumina display identity", () => {
    expect(exoplanetSystemBySlug("51-pegasi")).toMatchObject({
      archive_hostname: "51 Peg",
      display_name: "51 Pegasi",
      host_slug: "51-pegasi",
    });
  });

  it("preserves parameter-level provenance and shared scale positions", () => {
    const hd = exoplanetSystemBySlug("hd-209458");
    expect(hd).not.toBeNull();
    if (hd === null) throw new Error("missing fixture");
    const planet = hd.planets[0]!;
    expect(planet.semimajor_axis_reference.text).toBe("Bonomo et al. 2017");
    expect(planet.orbital_period_reference.text).toBe("Stassun et al. 2017");
    expect(exoplanetPosition(planet, "linear")).toBeCloseTo(4.5, 12);
    expect(exoplanetPosition(planet, "log")).toBeGreaterThan(0);
    expect(planet.semimajor_axis_reference.url).toMatch(/^https:\/\/ui\.adsabs\.harvard\.edu\//u);
  });
});
