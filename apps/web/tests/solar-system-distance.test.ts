import { describe, expect, it } from "vitest";
import {
  SOLAR_SYSTEM_ARTIFACT,
  SOLAR_SYSTEM_BODIES,
  SOLAR_SYSTEM_PLANETS,
  SOLAR_SYSTEM_SOURCES,
  solarSystemBodyById,
  solarSystemPosition,
} from "../src/lib/visualizations/solar-system-distance";

describe("Phase 5B Solar System reviewed distance artifact", () => {
  it("loads the exact nine-body closed model with NASA sources", () => {
    expect(SOLAR_SYSTEM_ARTIFACT.model_version).toBe("solar-system-distance-v1");
    expect(SOLAR_SYSTEM_BODIES.map((body) => body.id)).toEqual([
      "sun",
      "mercury",
      "venus",
      "earth",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
    ]);
    expect(SOLAR_SYSTEM_PLANETS).toHaveLength(8);
    expect(SOLAR_SYSTEM_SOURCES).toHaveLength(2);
    for (const source of SOLAR_SYSTEM_SOURCES) {
      expect(source.url).toMatch(/^https:\/\/science\.nasa\.gov\//u);
    }
  });

  it("keeps Sun outside the logarithmic transform and preserves reviewed endpoint positions", () => {
    const sun = solarSystemBodyById("sun");
    const mercury = solarSystemBodyById("mercury");
    const neptune = solarSystemBodyById("neptune");
    expect(sun).not.toBeNull();
    expect(mercury).not.toBeNull();
    expect(neptune).not.toBeNull();
    if (sun === null || mercury === null || neptune === null) throw new Error("missing fixture");

    expect(solarSystemPosition(sun, "log")).toBeNull();
    expect(solarSystemPosition(sun, "linear")).toBe(0);
    expect(solarSystemPosition(mercury, "log")).toBe(0);
    expect(solarSystemPosition(neptune, "log")).toBe(100);
    expect(solarSystemPosition(neptune, "linear")).toBe(100);
  });

  it("preserves the NASA mean-distance values and keeps body size as a separate model link", () => {
    expect(solarSystemBodyById("earth")).toMatchObject({
      earth_distance_ratio: 1,
      mean_distance_au: 1,
      scale_explorer_node_id: "earth",
    });
    expect(solarSystemBodyById("jupiter")).toMatchObject({
      earth_distance_ratio: 5.2,
      mean_distance_au: 5.2,
      scale_explorer_node_id: "jupiter",
    });
    expect(solarSystemBodyById("pluto")).toBeNull();
  });
});
