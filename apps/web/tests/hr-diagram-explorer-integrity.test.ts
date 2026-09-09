// @vitest-environment node

import { describe, expect, it } from "vitest";

import { verifyHRDiagramBrowserArtifact } from "../src/lib/simulations/hr-diagram-explorer";

describe("H-R Diagram Explorer browser artifact integrity", () => {
  it("matches the reviewed digest for the imported star records", async () => {
    await expect(verifyHRDiagramBrowserArtifact()).resolves.toBe(true);
  });
});
