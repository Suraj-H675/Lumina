import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSTELLATION_CONTEXT_ARTIFACT_BYTES,
  CONSTELLATION_CONTEXT_ARTIFACT_SHA256,
  CONSTELLATION_CONTEXT_PART_COUNT,
  CONSTELLATION_CONTEXT_URL,
  CONSTELLATION_CONTEXT_VERTEX_COUNT,
  IAUContextRejected,
  NAMED_ANCHOR_CONTEXT_ARTIFACT_BYTES,
  NAMED_ANCHOR_CONTEXT_ARTIFACT_SHA256,
  NAMED_ANCHOR_CONTEXT_ROW_COUNT,
  NAMED_ANCHOR_CONTEXT_URL,
  loadConstellationContext,
  loadNamedAnchorContext,
  parseConstellationContextArtifact,
  parseNamedAnchorContextArtifact,
  resetIauContextCachesForTests,
  resolveTargetConstellation,
} from "../src/lib/observation/iau-context";

const namedArtifactPath = resolve("public/data/iau-named-gaia-bright-anchors-v1.json");
const constellationArtifactPath = resolve("public/data/iau-constellation-context-v1.json");

function responseFor(bytes: Uint8Array): Response {
  return {
    ok: true,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  } as Response;
}

beforeEach(() => resetIauContextCachesForTests());

describe("IAU named-anchor artifact", () => {
  it("accepts the exact pinned artifact without coordinate duplication", async () => {
    const bytes = await readFile(namedArtifactPath);
    const context = parseNamedAnchorContextArtifact(bytes);

    expect(bytes.byteLength).toBe(NAMED_ANCHOR_CONTEXT_ARTIFACT_BYTES);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      NAMED_ANCHOR_CONTEXT_ARTIFACT_SHA256,
    );
    expect(context.rows).toHaveLength(NAMED_ANCHOR_CONTEXT_ROW_COUNT);
    expect(new Set(context.rows.map((row) => row.iauName)).size).toBe(
      NAMED_ANCHOR_CONTEXT_ROW_COUNT,
    );
    expect(context.rows.every((row) => row.gaiaSourceId.length > 0)).toBe(true);
    expect(context.rows.some((row) => Object.hasOwn(row, "rightAscensionDegrees"))).toBe(false);
  });

  it.each([
    [
      "unknown column",
      (document: Record<string, unknown>) => {
        const anchors = document.anchors as Array<Record<string, unknown>>;
        anchors[0]!.unexpected = true;
      },
    ],
    [
      "ambiguous neighbours",
      (document: Record<string, unknown>) => {
        const anchors = document.anchors as Array<Record<string, unknown>>;
        anchors[0]!.gaia_crossmatch_neighbour_count = 2;
      },
    ],
    [
      "duplicate Gaia mapping",
      (document: Record<string, unknown>) => {
        const anchors = document.anchors as Array<Record<string, unknown>>;
        anchors[1]!.gaia_source_id = anchors[0]!.gaia_source_id;
      },
    ],
  ])("rejects %s as a whole artifact", async (_name, change) => {
    const document = JSON.parse(await readFile(namedArtifactPath, "utf8")) as Record<
      string,
      unknown
    >;
    change(document);
    const bytes = new TextEncoder().encode(JSON.stringify(document));

    expect(() => parseNamedAnchorContextArtifact(bytes)).toThrow(IAUContextRejected);
  });
});

describe("IAU constellation artifact", () => {
  it("accepts all 88 official regions and the two Serpens parts", async () => {
    const bytes = await readFile(constellationArtifactPath);
    const context = parseConstellationContextArtifact(bytes);
    const serpens = context.constellations.find((item) => item.abbreviation === "Ser");

    expect(bytes.byteLength).toBe(CONSTELLATION_CONTEXT_ARTIFACT_BYTES);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      CONSTELLATION_CONTEXT_ARTIFACT_SHA256,
    );
    expect(context.constellations).toHaveLength(88);
    expect(new Set(context.constellations.map((item) => item.abbreviation)).size).toBe(88);
    expect(context.constellations.flatMap((item) => item.boundaryParts)).toHaveLength(
      CONSTELLATION_CONTEXT_PART_COUNT,
    );
    expect(
      context.constellations.flatMap((item) => item.boundaryParts).flatMap((part) => part.vertices),
    ).toHaveLength(CONSTELLATION_CONTEXT_VERTEX_COUNT);
    expect(serpens?.boundaryParts.map((part) => part.sourceFile)).toEqual(["ser1.txt", "ser2.txt"]);
    expect(
      context.targetMemberships.map((item) => [item.targetSlug, item.constellationAbbreviation]),
    ).toEqual([
      ["51-pegasi", "Peg"],
      ["hd-209458", "Peg"],
      ["k2-18", "Leo"],
      ["kepler-186", "Cyg"],
      ["kepler-452", "Cyg"],
    ]);
  });

  it.each([
    [
      "unknown region",
      (document: Record<string, unknown>) => {
        const constellations = document.constellations as Array<Record<string, unknown>>;
        constellations[0]!.abbreviation = "Nope";
      },
    ],
    [
      "malformed vertex",
      (document: Record<string, unknown>) => {
        const constellations = document.constellations as Array<Record<string, unknown>>;
        const parts = constellations[0]!.boundary_parts as Array<Record<string, unknown>>;
        const vertices = parts[0]!.vertices as Array<Record<string, unknown>>;
        vertices.pop();
      },
    ],
    [
      "unknown target region",
      (document: Record<string, unknown>) => {
        const memberships = document.target_memberships as Array<Record<string, unknown>>;
        memberships[0]!.constellation_abbreviation = "Nope";
      },
    ],
  ])("rejects %s as a whole artifact", async (_name, change) => {
    const document = JSON.parse(await readFile(constellationArtifactPath, "utf8")) as Record<
      string,
      unknown
    >;
    change(document);
    const bytes = new TextEncoder().encode(JSON.stringify(document));

    expect(() => parseConstellationContextArtifact(bytes)).toThrow(IAUContextRejected);
  });
});

describe("IAU context loaders and target membership", () => {
  it("loads each immutable same-origin asset once without observer coordinates", async () => {
    const namedBytes = await readFile(namedArtifactPath);
    const constellationBytes = await readFile(constellationArtifactPath);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === NAMED_ANCHOR_CONTEXT_URL) return responseFor(namedBytes);
      if (String(input) === CONSTELLATION_CONTEXT_URL) return responseFor(constellationBytes);
      throw new Error("Unexpected test request");
    }) as unknown as typeof fetch;

    const [namedFirst, namedSecond, constellationFirst, constellationSecond] = await Promise.all([
      loadNamedAnchorContext(fetcher),
      loadNamedAnchorContext(fetcher),
      loadConstellationContext(fetcher),
      loadConstellationContext(fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(namedFirst).toBe(namedSecond);
    expect(constellationFirst).toBe(constellationSecond);
    expect(fetcher).toHaveBeenCalledWith(NAMED_ANCHOR_CONTEXT_URL, {
      cache: "force-cache",
      credentials: "same-origin",
    });
    expect(fetcher).toHaveBeenCalledWith(CONSTELLATION_CONTEXT_URL, {
      cache: "force-cache",
      credentials: "same-origin",
    });
    expect(NAMED_ANCHOR_CONTEXT_URL).not.toMatch(/[?&](lat|latitude|lon|longitude)=/i);
    expect(CONSTELLATION_CONTEXT_URL).not.toMatch(/[?&](lat|latitude|lon|longitude)=/i);
  });

  it("rejects a hash-mismatched response and does not cache failure", async () => {
    const bytes = await readFile(namedArtifactPath);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseFor(Uint8Array.from(bytes, (byte, index) => (index === 0 ? byte ^ 1 : byte))),
      )
      .mockResolvedValueOnce(responseFor(bytes));

    await expect(loadNamedAnchorContext(fetcher)).rejects.toThrow(IAUContextRejected);
    await expect(loadNamedAnchorContext(fetcher)).resolves.toMatchObject({
      rows: { length: NAMED_ANCHOR_CONTEXT_ROW_COUNT },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("accepts only an exact current-target coordinate/source identity", async () => {
    const context = parseConstellationContextArtifact(await readFile(constellationArtifactPath));
    const membership = context.targetMemberships.find((item) => item.targetSlug === "k2-18");
    expect(membership).toBeDefined();
    if (membership === undefined) return;

    const coordinate = {
      epoch: 2016,
      rightAscensionDegrees: membership.rightAscensionDegrees,
      declinationDegrees: membership.declinationDegrees,
      source: {
        provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
        dataset: {
          code: "gaia-source-astrometry",
          name: "Gaia DR3 astrometry",
          release_version: "dr3",
        },
        source_record_id: `gaia-source-record-${membership.gaiaSourceId}`,
      },
    };

    expect(resolveTargetConstellation(context, "k2-18", coordinate)).toBe(membership);
    expect(resolveTargetConstellation(context, "unknown-target", coordinate)).toBeNull();
    expect(
      resolveTargetConstellation(context, "k2-18", {
        ...coordinate,
        rightAscensionDegrees: coordinate.rightAscensionDegrees + 1,
      }),
    ).toBeNull();
  });
});
