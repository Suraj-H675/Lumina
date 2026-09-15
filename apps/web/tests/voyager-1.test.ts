import { describe, expect, it } from "vitest";

import {
  VOYAGER_ARTIFACT,
  VOYAGER_MILESTONES,
  VOYAGER_RAW_SNAPSHOT,
  VOYAGER_SAMPLES,
  VOYAGER_SOURCES,
  voyagerSampleYear,
} from "../src/lib/visualizations/voyager-1";

describe("Phase 5B Voyager 1 reviewed artifact", () => {
  it("loads eight NASA milestones and fifty ordered annual Horizons vectors", () => {
    expect(VOYAGER_ARTIFACT.model_version).toBe("voyager-1-trajectory-v1");
    expect(VOYAGER_MILESTONES).toHaveLength(8);
    expect(VOYAGER_SAMPLES).toHaveLength(50);
    expect(voyagerSampleYear(VOYAGER_SAMPLES[0]!)).toBe(1977);
    expect(voyagerSampleYear(VOYAGER_SAMPLES.at(-1)!)).toBe(2026);
    expect(
      VOYAGER_SAMPLES.every(
        (sample, index) => index === 0 || sample.jd_tdb > VOYAGER_SAMPLES[index - 1]!.jd_tdb,
      ),
    ).toBe(true);
  });

  it("keeps NASA launch history distinct from the Horizons vector availability start", () => {
    expect(VOYAGER_MILESTONES[0]).toMatchObject({ date: "1977-09-05", title: "Launch" });
    expect(VOYAGER_RAW_SNAPSHOT.start_tdb).toBe("1977-09-06T00:00:00");
    expect(VOYAGER_RAW_SNAPSHOT.target_id).toBe("-31");
    expect(VOYAGER_RAW_SNAPSHOT.center).toBe("Sun (10)");
  });

  it("pins the Horizons snapshot and approved official source hosts", () => {
    expect(VOYAGER_RAW_SNAPSHOT.sha256).toBe(
      "827e0323d9a64632fc7dedf5d9d905adf2690adf7270d4e7251ea03ef7042d1f",
    );
    expect(VOYAGER_SOURCES.map((source) => new URL(source.url).hostname)).toEqual([
      "science.nasa.gov",
      "ssd-api.jpl.nasa.gov",
    ]);
    expect(VOYAGER_SAMPLES.at(-1)!.radius_au).toBeGreaterThan(170);
  });
});
