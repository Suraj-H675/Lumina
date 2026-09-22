import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExactRequestedUrl,
  assertNotAborted,
  evaluateZoomProof,
  parseArgs,
  resolveOutputPath,
  summarizeRouteObservations,
} from "./measure-browser-zoom.mjs";

test("parses a root operator URL and repository-relative output", () => {
  assert.deepEqual(
    parseArgs([
      "--url",
      "http://127.0.0.1:3000/",
      "--output",
      "data/audits/phase-8d-browser-zoom-v1.json",
    ]),
    {
      output: "data/audits/phase-8d-browser-zoom-v1.json",
      url: "http://127.0.0.1:3000/",
    },
  );
  assert.throws(() => parseArgs([]), /--url is required/u);
  assert.throws(() => parseArgs(["--url", "http://127.0.0.1:3000/explore"]), /root Lumina URL/u);
  assert.match(
    resolveOutputPath("data/audits/phase-8d-browser-zoom-v1.json"),
    /\/Lumina\/data\/audits\/phase-8d-browser-zoom-v1\.json$/u,
  );
});

test("proves native 200% zoom from Chromium settings and viewport metrics", () => {
  const proof = evaluateZoomProof({
    baseline: { dpr: 1, innerWidth: 1280, outerWidth: 1288 },
    settingsAfter: 2,
    settingsBefore: 1,
    zoomed: { dpr: 2, innerWidth: 640, outerWidth: 1288, visualScale: 1 },
  });
  assert.equal(proof.realBrowserZoomConfirmed, true);
  assert.equal(proof.dprRatio, 2);
  assert.equal(proof.innerWidthRatio, 0.5);
});

test("rejects CSS-like or pinch-like scaling as browser zoom proof", () => {
  assert.equal(
    evaluateZoomProof({
      baseline: { dpr: 1, innerWidth: 1280, outerWidth: 1288 },
      settingsAfter: 1,
      settingsBefore: 1,
      zoomed: { dpr: 1, innerWidth: 640, outerWidth: 1288, visualScale: 1 },
    }).realBrowserZoomConfirmed,
    false,
  );
  assert.equal(
    evaluateZoomProof({
      baseline: { dpr: 1, innerWidth: 1280, outerWidth: 1288 },
      settingsAfter: 2,
      settingsBefore: 1,
      zoomed: { dpr: 2, innerWidth: 640, outerWidth: 1288, visualScale: 2 },
    }).realBrowserZoomConfirmed,
    false,
  );
});

test("binds query-bearing route observations to the exact requested URL state", () => {
  assert.doesNotThrow(() =>
    assertExactRequestedUrl(
      "http://127.0.0.1:3000/observe?object=k2-18&date=2026-08-27",
      "http://127.0.0.1:3000/observe?object=k2-18&date=2026-08-27",
    ),
  );
  assert.throws(
    () =>
      assertExactRequestedUrl(
        "http://127.0.0.1:3000/observe?date=2026-08-27&object=k2-18",
        "http://127.0.0.1:3000/observe?object=k2-18&date=2026-08-27",
      ),
    /exact requested Lumina URL state/u,
  );
  assert.throws(
    () =>
      assertExactRequestedUrl(
        "http://127.0.0.1:3000/observe?object=k2-18",
        "http://127.0.0.1:3000/observe?object=k2-18&date=2026-08-27",
      ),
    /exact requested Lumina URL state/u,
  );
});

test("fails evidence generation after an interrupt signal", () => {
  assert.doesNotThrow(() => assertNotAborted(false, null));
  assert.throws(() => assertNotAborted(true, "SIGTERM"), /SIGTERM/u);
});

test("summarizes route observations without turning them into compliance claims", () => {
  assert.deepEqual(
    summarizeRouteObservations([
      {
        documentHorizontalOverflow: false,
        h1Text: "Explore",
        h1Visible: true,
        path: "/explore",
      },
      {
        documentHorizontalOverflow: false,
        h1Text: "Identify",
        h1Visible: true,
        path: "/identify",
      },
    ]),
    {
      allHeadingsVisible: true,
      noDocumentHorizontalOverflow: true,
      sampledRouteCount: 2,
      sampledRoutes: ["/explore", "/identify"],
    },
  );
});
