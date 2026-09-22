import assert from "node:assert/strict";
import test from "node:test";

import {
  assessEvidence,
  assertLuminaUrl,
  classifyRenderer,
  parseArgs,
  summarizeFrames,
} from "./measure-wwt-hardware.mjs";

test("renderer classification fails closed for unknown and common Linux software renderers", () => {
  assert.equal(
    classifyRenderer({ debugRendererAvailable: false, renderer: "ANGLE (NVIDIA)" }).kind,
    "unknown",
  );
  assert.equal(classifyRenderer({ debugRendererAvailable: true, renderer: "" }).kind, "unknown");
  for (const renderer of [
    "Google SwiftShader",
    "llvmpipe (LLVM 18.1.8, 256 bits)",
    "Mesa lavapipe",
    "softpipe",
    "swrast",
    "SWR",
    "Microsoft Basic Render Driver",
  ]) {
    assert.equal(classifyRenderer({ debugRendererAvailable: true, renderer }).kind, "software");
  }
  assert.equal(
    classifyRenderer({
      debugRendererAvailable: true,
      renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU)",
      vendor: "Google Inc. (NVIDIA)",
    }).kind,
    "hardware",
  );
  assert.equal(
    classifyRenderer({
      debugRendererAvailable: true,
      renderer: "ANGLE (Mystery, Vulkan 1.3.0)",
      vendor: "Mystery Vendor",
    }).kind,
    "unknown",
  );
});

test("frame summary uses only strictly increasing WWT draw-bearing frame timestamps", () => {
  const summary = summarizeFrames([0, 16, 32, 48]);
  assert.equal(summary.drawBearingFrameCount, 4);
  assert.equal(summary.cadenceHz, 62.5);
  assert.equal(summary.frameIntervalMs.p50, 16);
  assert.equal(summary.frameIntervalMs.p95, 16);
  assert.throws(() => summarizeFrames([0, 16, 16]), /strictly increasing/u);
  assert.throws(() => summarizeFrames([0, Number.NaN, 32]), /finite/u);
});

test("representative evidence is separated from pass or fail semantics", () => {
  assert.deepEqual(
    assessEvidence({
      cadenceHz: 58,
      headless: false,
      minCadenceHz: null,
      rendererKind: "hardware",
      stubNetwork: false,
      targetVerified: true,
    }),
    {
      passedCadenceFloor: null,
      representativeHardwareEligible: true,
      status: "representative_measurement_no_floor",
    },
  );
  assert.equal(
    assessEvidence({
      cadenceHz: 58,
      headless: false,
      minCadenceHz: 55,
      rendererKind: "hardware",
      stubNetwork: false,
      targetVerified: true,
    }).status,
    "passed_operator_floor",
  );
  assert.equal(
    assessEvidence({
      cadenceHz: 58,
      headless: false,
      minCadenceHz: 60,
      rendererKind: "hardware",
      stubNetwork: false,
      targetVerified: true,
    }).status,
    "failed_operator_floor",
  );
  assert.equal(
    assessEvidence({
      cadenceHz: 120,
      headless: true,
      minCadenceHz: null,
      rendererKind: "hardware",
      stubNetwork: false,
      targetVerified: true,
    }).status,
    "non_representative_plumbing",
  );
  assert.equal(
    assessEvidence({
      cadenceHz: 120,
      headless: false,
      minCadenceHz: null,
      rendererKind: "hardware",
      stubNetwork: false,
      targetVerified: false,
    }).representativeHardwareEligible,
    false,
  );
});

test("argument parsing bounds duration and rejects non-http operator URLs", () => {
  const parsed = parseArgs([
    "--seconds",
    "12",
    "--warmup-seconds",
    "0",
    "--min-cadence-hz",
    "50",
    "--url",
    "http://127.0.0.1:3000/explore/deep-sky?object=messier-31",
  ]);
  assert.equal(parsed.seconds, 12);
  assert.equal(parsed.warmupSeconds, 0);
  assert.equal(parsed.minCadenceHz, 50);
  assert.match(parsed.url, /^http:\/\/127\.0\.0\.1:3000\//u);
  assert.throws(() => parseArgs(["--seconds", "61"]), /no greater than 60/u);
  assert.throws(() => parseArgs(["--warmup-seconds", "16"]), /no greater than 15/u);
  assert.throws(() => parseArgs(["--url", "ftp://example.test"]), /http or https/u);
  assert.throws(
    () => parseArgs(["--url", "https://user:secret@example.test"]),
    /must not contain credentials/u,
  );
  assert.throws(() => parseArgs([]), /--url is required/u);
  assert.throws(
    () => parseArgs(["--url", "https://example.test/not-deep-sky"]),
    /\/explore\/deep-sky route/u,
  );
});

test("target identity stays bound to the requested origin and reviewed paths", () => {
  const benchmarkUrl = "http://127.0.0.1:3000/explore/deep-sky?object=messier-31";
  assert.equal(
    assertLuminaUrl(
      "http://127.0.0.1:3000/manifest.webmanifest",
      benchmarkUrl,
      "/manifest.webmanifest",
      "manifest",
    ),
    "http://127.0.0.1:3000/manifest.webmanifest",
  );
  assert.equal(
    assertLuminaUrl(
      "http://127.0.0.1:3000/explore/deep-sky?object=messier-31",
      benchmarkUrl,
      "/explore/deep-sky",
      "benchmark page",
    ),
    benchmarkUrl,
  );
  assert.throws(
    () =>
      assertLuminaUrl(
        "https://example.test/manifest.webmanifest",
        benchmarkUrl,
        "/manifest.webmanifest",
        "manifest",
      ),
    /different origin/u,
  );
  assert.throws(
    () =>
      assertLuminaUrl(
        "http://127.0.0.1:3000/not-deep-sky",
        benchmarkUrl,
        "/explore/deep-sky",
        "benchmark page",
      ),
    /unexpected path/u,
  );
});
