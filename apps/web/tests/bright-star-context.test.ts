import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BRIGHT_STAR_CONTEXT_COLUMNS,
  BRIGHT_STAR_CONTEXT_ROW_COUNT,
  BRIGHT_STAR_CONTEXT_URL,
  BrightStarContextRejected,
  loadBrightStarContext,
  parseBrightStarContextArtifact,
  resetBrightStarContextCacheForTests,
} from "../src/lib/observation/bright-star-context";

const HEADER = BRIGHT_STAR_CONTEXT_COLUMNS.join(",");
const ROW_ONE = '10,1636148068921376768,"Gaia DR3 10",2016.0,0.25,-45.5,1.5,false';
const ROW_TWO = "20,1636148068921376768,Gaia DR3 20,2016.0,359.75,90,5.5,false";

function artifact(...rows: Array<string>): Uint8Array {
  return new TextEncoder().encode(`${[HEADER, ...rows].join("\n")}\n`);
}

function responseFor(bytes: Uint8Array): Response {
  return {
    ok: true,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  } as Response;
}

beforeEach(() => resetBrightStarContextCacheForTests());

describe("bright-star context canonical artifact", () => {
  it("strictly parses the real pinned same-origin bytes", async () => {
    const bytes = await readFile(resolve("public/data/gaia-dr3-bright-sky-context-v1.csv"));
    const stars = parseBrightStarContextArtifact(bytes);

    expect(stars).toHaveLength(BRIGHT_STAR_CONTEXT_ROW_COUNT);
    expect(new Set(stars.map((star) => star.sourceId)).size).toBe(BRIGHT_STAR_CONTEXT_ROW_COUNT);
    expect(Math.min(...stars.map((star) => star.gMagnitude))).toBe(1.731607);
    expect(Math.max(...stars.map((star) => star.gMagnitude))).toBe(5.499884);
    expect(stars.every((star) => star.gMagnitude <= 5.5)).toBe(true);
  });

  it("loads once with a location-free same-origin request and reuses the result", async () => {
    const bytes = await readFile(resolve("public/data/gaia-dr3-bright-sky-context-v1.csv"));
    const fetcher = vi.fn(async () => responseFor(bytes)) as unknown as typeof fetch;

    const first = loadBrightStarContext(fetcher);
    const second = loadBrightStarContext(fetcher);
    const [firstStars, secondStars] = await Promise.all([first, second]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(firstStars).toBe(secondStars);
    expect(fetcher).toHaveBeenCalledWith(BRIGHT_STAR_CONTEXT_URL, {
      cache: "force-cache",
      credentials: "same-origin",
    });
    expect(BRIGHT_STAR_CONTEXT_URL).not.toMatch(/[?&](lat|latitude|lon|longitude)=/i);
  });
});

describe("bright-star context client parser", () => {
  it("accepts the closed valid schema and correct CSV quoting", () => {
    expect(parseBrightStarContextArtifact(artifact(ROW_ONE, ROW_TWO), 2)).toEqual([
      {
        sourceId: "10",
        rightAscensionDegrees: 0.25,
        declinationDegrees: -45.5,
        gMagnitude: 1.5,
      },
      {
        sourceId: "20",
        rightAscensionDegrees: 359.75,
        declinationDegrees: 90,
        gMagnitude: 5.5,
      },
    ]);
  });

  it.each([
    ["bad header", artifact(ROW_ONE, ROW_TWO).map((byte, index) => (index === 0 ? 0x78 : byte))],
    [
      "missing column",
      new TextEncoder().encode(
        `${BRIGHT_STAR_CONTEXT_COLUMNS.slice(0, -1).join(",")}\n${ROW_ONE}\n${ROW_TWO}\n`,
      ),
    ],
    ["extra column", new TextEncoder().encode(`${HEADER},extra\n${ROW_ONE}\n${ROW_TWO}\n`)],
    ["bad decimal", artifact(ROW_ONE.replace(",0.25,", ",bad,"), ROW_TWO)],
    ["NaN", artifact(ROW_ONE.replace(",0.25,", ",NaN,"), ROW_TWO)],
    ["Infinity", artifact(ROW_ONE.replace(",0.25,", ",Infinity,"), ROW_TWO)],
    ["RA range", artifact(ROW_ONE.replace(",0.25,", ",360,"), ROW_TWO)],
    ["Dec range", artifact(ROW_ONE.replace(",-45.5,", ",90.1,"), ROW_TWO)],
    ["G range", artifact(ROW_ONE.replace(",1.5,false", ",5.5001,false"), ROW_TWO)],
    ["duplicate", artifact(ROW_ONE, ROW_ONE)],
    ["boolean", artifact(ROW_ONE.replace(",false", ",true"), ROW_TWO)],
    ["ordering", artifact(ROW_TWO, ROW_ONE)],
    ["solution", artifact(ROW_ONE.replace("1636148068921376768", "1"), ROW_TWO)],
    ["epoch", artifact(ROW_ONE.replace("2016.0", "2015.5"), ROW_TWO)],
    ["truncated row", artifact(ROW_ONE.slice(0, ROW_ONE.lastIndexOf(",")), ROW_TWO)],
    ["truncated artifact", artifact(ROW_ONE)],
    ["CRLF", new TextEncoder().encode(`${HEADER}\r\n${ROW_ONE}\r\n${ROW_TWO}\r\n`)],
    ["invalid UTF-8", Uint8Array.from([0xff, 0x0a])],
  ])("rejects %s without returning partial rows", (_name, bytes) => {
    expect(() => parseBrightStarContextArtifact(bytes, 2)).toThrow(BrightStarContextRejected);
  });
});
