import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const DEFAULT_SECONDS = 8;
const DEFAULT_WARMUP_SECONDS = 2;
const MAX_SECONDS = 60;
const MAX_WARMUP_SECONDS = 15;
const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|lavapipe|softpipe|swrast|software rasterizer|software rendering|microsoft basic render|\bswr\b/iu;
const HARDWARE_RENDERER_PATTERN =
  /\b(nvidia|geforce|quadro|rtx|gtx|amd|radeon|intel|iris|apple|adreno|mali|powervr|qualcomm|arm)\b/iu;
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXkAAAAASUVORK5CYII=",
  "base64",
);
const DSS_ROOT_TILE = "https://cdn.worldwidetelescope.org/wwtweb/dss.aspx?q=0,0,0";
const FRAME_PROBE_KEY = "__luminaWwtFrameProbe";

let receivedSignal = null;

function usage() {
  return `Usage: pnpm --filter @lumina/web perf:wwt-hardware -- [options]

Measures WWT draw-bearing animation-frame cadence on the browser/GPU running the benchmark.
This is an operator-run Phase 8D evidence tool, not a CI benchmark or a GPU-completion profiler.

Options:
  --url <url>                 Required deep-sky URL for an already-running Lumina instance.
  --seconds <number>          Measurement duration in seconds (default: ${DEFAULT_SECONDS}, max: ${MAX_SECONDS}).
  --warmup-seconds <number>   Interactive warm-up before collection (default: ${DEFAULT_WARMUP_SECONDS}, max: ${MAX_WARMUP_SECONDS}).
  --min-cadence-hz <number>   Optional operator-supplied acceptance floor. No project default is frozen.
  --headless                  Run Chromium headless. Never representative-hardware evidence.
  --allow-software            Permit software/unknown renderers for plumbing checks only.
  --stub-network              Stub WWT imagery for plumbing checks. Never representative-hardware evidence.
  --help                      Show this help.

The target must expose Lumina's reviewed web-app manifest and the /explore/deep-sky route. Representative-
hardware evidence additionally requires headed Chromium, real WWT network access, and a renderer positively
identified through WEBGL_debug_renderer_info as a known hardware family. The reported cadence counts animation
callbacks in which the WWT canvas issues WebGL clear/draw commands; it does not claim GPU-complete frame timing.
A pass/fail result exists only when --min-cadence-hz is supplied.
`;
}

function requiredArgument(argv, index, label) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${label} requires a value`);
  }
  return value;
}

function boundedNumber(raw, label, { allowZero = false, maximum = Number.POSITIVE_INFINITY } = {}) {
  const value = Number(raw);
  const validMinimum = allowZero ? value >= 0 : value > 0;
  if (!Number.isFinite(value) || !validMinimum || value > maximum) {
    const minimumText = allowZero ? "non-negative" : "positive";
    const maximumText = Number.isFinite(maximum) ? ` no greater than ${maximum}` : "";
    throw new Error(`${label} must be a ${minimumText} number${maximumText}`);
  }
  return value;
}

function parseHttpUrl(raw, label) {
  let value;
  try {
    value = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (value.protocol !== "http:" && value.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }
  if (value.username !== "" || value.password !== "") {
    throw new Error(`${label} must not contain credentials`);
  }
  return value.toString();
}

export function parseArgs(argv) {
  const options = {
    allowSoftware: false,
    headless: false,
    minCadenceHz: null,
    seconds: DEFAULT_SECONDS,
    stubNetwork: false,
    url: null,
    warmupSeconds: DEFAULT_WARMUP_SECONDS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--":
        break;
      case "--allow-software":
        options.allowSoftware = true;
        break;
      case "--headless":
        options.headless = true;
        break;
      case "--help":
        process.stdout.write(usage());
        process.exit(0);
        break;
      case "--min-cadence-hz":
        options.minCadenceHz = boundedNumber(
          requiredArgument(argv, ++index, "--min-cadence-hz"),
          "--min-cadence-hz",
        );
        break;
      case "--seconds":
        options.seconds = boundedNumber(requiredArgument(argv, ++index, "--seconds"), "--seconds", {
          maximum: MAX_SECONDS,
        });
        break;
      case "--stub-network":
        options.stubNetwork = true;
        break;
      case "--url":
        options.url = parseHttpUrl(requiredArgument(argv, ++index, "--url"), "--url");
        break;
      case "--warmup-seconds":
        options.warmupSeconds = boundedNumber(
          requiredArgument(argv, ++index, "--warmup-seconds"),
          "--warmup-seconds",
          { allowZero: true, maximum: MAX_WARMUP_SECONDS },
        );
        break;
      default:
        throw new Error(`Unknown argument: ${argument ?? "<missing>"}`);
    }
  }
  if (options.url === null) {
    throw new Error(
      "--url is required; start the intended Lumina build explicitly before measuring it",
    );
  }
  if (new URL(options.url).pathname !== "/explore/deep-sky") {
    throw new Error("--url must target Lumina's /explore/deep-sky route");
  }
  return options;
}

export function classifyRenderer(renderer) {
  const value = typeof renderer.renderer === "string" ? renderer.renderer.trim() : "";
  const vendor = typeof renderer.vendor === "string" ? renderer.vendor.trim() : "";
  if (renderer.debugRendererAvailable !== true) {
    return { kind: "unknown", reason: "WEBGL_debug_renderer_info is unavailable" };
  }
  if (value.length === 0) {
    return { kind: "unknown", reason: "Unmasked WebGL renderer is empty" };
  }
  if (SOFTWARE_RENDERER_PATTERN.test(value)) {
    return { kind: "software", reason: `Software renderer detected: ${value}` };
  }
  if (!HARDWARE_RENDERER_PATTERN.test(`${value} ${vendor}`)) {
    return { kind: "unknown", reason: `Renderer is not a recognized hardware family: ${value}` };
  }
  return { kind: "hardware", reason: `Recognized hardware renderer detected: ${value}` };
}

export function assertLuminaUrl(actualUrl, benchmarkUrl, expectedPath, label) {
  const actual = new URL(actualUrl);
  const requested = new URL(benchmarkUrl);
  if (actual.origin !== requested.origin) {
    throw new Error(
      `Lumina target identity check failed: ${label} redirected to a different origin`,
    );
  }
  if (actual.pathname !== expectedPath) {
    throw new Error(
      `Lumina target identity check failed: ${label} resolved to unexpected path ${actual.pathname}`,
    );
  }
  return actual.toString();
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1));
  return ordered[index];
}

export function summarizeFrames(timestamps) {
  if (timestamps.length < 3)
    throw new Error("Too few WWT draw-bearing animation frames were observed");
  if (timestamps.some((value) => !Number.isFinite(value))) {
    throw new Error("WWT frame timestamps must be finite");
  }
  const deltas = [];
  for (let index = 1; index < timestamps.length; index += 1) {
    const delta = timestamps[index] - timestamps[index - 1];
    if (!(delta > 0)) throw new Error("WWT frame timestamps must be strictly increasing");
    deltas.push(delta);
  }
  const elapsed = timestamps.at(-1) - timestamps[0];
  return {
    cadenceHz: ((timestamps.length - 1) * 1000) / elapsed,
    drawBearingFrameCount: timestamps.length,
    frameIntervalMs: {
      max: Math.max(...deltas),
      p50: percentile(deltas, 0.5),
      p95: percentile(deltas, 0.95),
      p99: percentile(deltas, 0.99),
    },
    over33msRatio: deltas.filter((delta) => delta > 33.333).length / deltas.length,
  };
}

export function assessEvidence({
  cadenceHz,
  headless,
  minCadenceHz,
  rendererKind,
  stubNetwork,
  targetVerified,
}) {
  const representativeHardwareEligible =
    rendererKind === "hardware" && !headless && !stubNetwork && targetVerified;
  const passedCadenceFloor =
    representativeHardwareEligible && minCadenceHz !== null ? cadenceHz >= minCadenceHz : null;
  const status = !representativeHardwareEligible
    ? "non_representative_plumbing"
    : minCadenceHz === null
      ? "representative_measurement_no_floor"
      : passedCadenceFloor
        ? "passed_operator_floor"
        : "failed_operator_floor";
  return { passedCadenceFloor, representativeHardwareEligible, status };
}

async function verifyLuminaTarget(page, benchmarkUrl) {
  const manifestUrl = new URL("/manifest.webmanifest", benchmarkUrl).toString();
  const response = await page.request.get(manifestUrl, { timeout: 5_000 });
  try {
    const verifiedManifestUrl = assertLuminaUrl(
      response.url(),
      benchmarkUrl,
      "/manifest.webmanifest",
      "manifest",
    );
    if (!response.ok()) {
      throw new Error(
        `Lumina target identity check failed: manifest returned HTTP ${response.status()}`,
      );
    }
    const manifest = await response.json();
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      manifest.name !== "Lumina" ||
      manifest.short_name !== "Lumina" ||
      manifest.scope !== "/" ||
      manifest.start_url !== "/"
    ) {
      throw new Error("Lumina target identity check failed: reviewed manifest marker is absent");
    }
    return {
      manifestUrl: verifiedManifestUrl,
      name: manifest.name,
      scope: manifest.scope,
      shortName: manifest.short_name,
      startUrl: manifest.start_url,
    };
  } finally {
    await response.dispose();
  }
}

async function rendererInfo(page) {
  return page.locator("#lumina-wwt-atlas canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (gl === null) throw new Error("Active WWT canvas does not expose WebGL");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      debugRendererAvailable: debug !== null,
      renderer:
        debug === null
          ? String(gl.getParameter(gl.RENDERER))
          : String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)),
      vendor:
        debug === null
          ? String(gl.getParameter(gl.VENDOR))
          : String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)),
      version: String(gl.getParameter(gl.VERSION)),
    };
  });
}

async function installFrameProbe(page) {
  await page.addInitScript((probeKey) => {
    const target = globalThis;
    const state = {
      collecting: false,
      currentRafTimestamp: null,
      drawCalls: 0,
      frameTimestamps: [],
    };
    Object.defineProperty(target, probeKey, {
      configurable: false,
      enumerable: false,
      value: state,
      writable: false,
    });

    const originalRequestAnimationFrame = target.requestAnimationFrame.bind(target);
    target.requestAnimationFrame = (callback) =>
      originalRequestAnimationFrame((timestamp) => {
        const previous = state.currentRafTimestamp;
        state.currentRafTimestamp = timestamp;
        try {
          callback(timestamp);
        } finally {
          state.currentRafTimestamp = previous;
        }
      });

    const recordDraw = (context) => {
      if (!state.collecting || state.currentRafTimestamp === null) return;
      const canvas = context?.canvas;
      if (!(canvas instanceof HTMLCanvasElement) || canvas.closest("#lumina-wwt-atlas") === null) {
        return;
      }
      state.drawCalls += 1;
      if (state.frameTimestamps.at(-1) !== state.currentRafTimestamp) {
        state.frameTimestamps.push(state.currentRafTimestamp);
      }
    };

    const wrapMethod = (prototype, methodName) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      if (descriptor === undefined || typeof descriptor.value !== "function") return;
      const original = descriptor.value;
      Object.defineProperty(prototype, methodName, {
        ...descriptor,
        value: function (...args) {
          recordDraw(this);
          return Reflect.apply(original, this, args);
        },
      });
    };

    for (const constructor of [target.WebGLRenderingContext, target.WebGL2RenderingContext]) {
      if (typeof constructor !== "function") continue;
      for (const method of [
        "clear",
        "drawArrays",
        "drawElements",
        "drawArraysInstanced",
        "drawElementsInstanced",
        "drawRangeElements",
      ]) {
        wrapMethod(constructor.prototype, method);
      }
    }
  }, FRAME_PROBE_KEY);
}

async function setFrameCollection(page, collecting) {
  return page.evaluate(
    ({ collect, probeKey }) => {
      const state = globalThis[probeKey];
      if (
        typeof state !== "object" ||
        state === null ||
        !Array.isArray(state.frameTimestamps) ||
        typeof state.drawCalls !== "number"
      ) {
        throw new Error("WWT frame probe is unavailable");
      }
      if (collect) {
        state.frameTimestamps.length = 0;
        state.drawCalls = 0;
        state.collecting = true;
        return null;
      }
      state.collecting = false;
      return {
        drawCalls: state.drawCalls,
        frameTimestamps: [...state.frameTimestamps],
      };
    },
    { collect: collecting, probeKey: FRAME_PROBE_KEY },
  );
}

async function exerciseControls(page, seconds) {
  if (seconds <= 0) return;
  const controls = ["Zoom in", "Pan right", "Pan down", "Zoom out", "Pan left", "Pan up"];
  const deadline = Date.now() + seconds * 1000;
  let interaction = 0;
  while (Date.now() < deadline) {
    await page.getByRole("button", { name: controls[interaction % controls.length] }).click();
    interaction += 1;
    await page.waitForTimeout(125);
  }
}

async function browserEnvironment(page) {
  return page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    viewport: { height: window.innerHeight, width: window.innerWidth },
  }));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let browser = null;
  let cleanupInFlight = null;

  const cleanup = async () => {
    if (cleanupInFlight !== null) return cleanupInFlight;
    cleanupInFlight = (async () => {
      const operations = [];
      if (browser !== null) operations.push(browser.close());
      const settlements = await Promise.allSettled(operations);
      const failures = settlements
        .filter((item) => item.status === "rejected")
        .map((item) => formatError(item.reason));
      browser = null;
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((message) => new Error(message)),
          "Benchmark cleanup failed",
        );
      }
    })();
    try {
      await cleanupInFlight;
    } finally {
      cleanupInFlight = null;
    }
  };

  const handleSignal = (signal) => {
    receivedSignal ??= signal;
    void cleanup().catch((error) => {
      process.stderr.write(`Cleanup after ${signal} failed: ${formatError(error)}\n`);
    });
  };
  const onSigint = () => handleSignal("SIGINT");
  const onSigterm = () => handleSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  let primaryError = null;
  try {
    const benchmarkUrl = options.url;

    browser = await chromium.launch({ headless: options.headless });
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await installFrameProbe(page);
    const targetIdentity = await verifyLuminaTarget(page, benchmarkUrl);

    if (options.stubNetwork) {
      await page.route("https://cdn.worldwidetelescope.org/**", async (route) => {
        if (route.request().url() === DSS_ROOT_TILE) {
          await route.fulfill({ body: ONE_PIXEL_PNG, contentType: "image/png", status: 200 });
        } else {
          await route.abort("failed");
        }
      });
      await page.route("https://www.worldwidetelescope.org/**", (route) => route.abort("failed"));
      await page.route("https://web.wwtassets.org/**", (route) => route.abort("failed"));
    }

    await page.goto(benchmarkUrl, { waitUntil: "load" });
    assertLuminaUrl(page.url(), benchmarkUrl, "/explore/deep-sky", "benchmark page");
    await page.getByRole("button", { name: "Open interactive atlas" }).click();
    await page.getByText("Interactive atlas ready.").waitFor({ timeout: 20_000 });
    assertLuminaUrl(page.url(), benchmarkUrl, "/explore/deep-sky", "benchmark page");
    const renderer = await rendererInfo(page);
    const rendererClassification = classifyRenderer(renderer);
    if (rendererClassification.kind !== "hardware" && !options.allowSoftware) {
      throw new Error(
        `Renderer is not eligible for representative-hardware evidence: ${rendererClassification.reason}. ` +
          "Use --allow-software only for non-representative plumbing checks.",
      );
    }

    await exerciseControls(page, options.warmupSeconds);
    assertLuminaUrl(page.url(), benchmarkUrl, "/explore/deep-sky", "benchmark page");
    await setFrameCollection(page, true);
    await exerciseControls(page, options.seconds);
    const captured = await setFrameCollection(page, false);
    assertLuminaUrl(page.url(), benchmarkUrl, "/explore/deep-sky", "benchmark page");
    if (captured === null) throw new Error("WWT frame probe did not return a measurement");
    const summary = summarizeFrames(captured.frameTimestamps);
    const assessment = assessEvidence({
      cadenceHz: summary.cadenceHz,
      headless: options.headless,
      minCadenceHz: options.minCadenceHz,
      rendererKind: rendererClassification.kind,
      stubNetwork: options.stubNetwork,
      targetVerified: true,
    });
    if (options.minCadenceHz !== null && !assessment.representativeHardwareEligible) {
      throw new Error("--min-cadence-hz is only valid for representative-hardware runs");
    }

    const output = {
      assessment,
      drawCalls: captured.drawCalls,
      durationSeconds: options.seconds,
      environment: await browserEnvironment(page),
      instrumentation: "wwt-webgl-draw-bearing-raf-v1",
      minCadenceHz: options.minCadenceHz,
      renderer,
      rendererClassification,
      source: "operator-url",
      stubNetwork: options.stubNetwork,
      targetIdentity,
      warmupSeconds: options.warmupSeconds,
      ...summary,
    };
    process.stdout.write(`PHASE8D_WWT_RENDER_CADENCE=${JSON.stringify(output)}\n`);

    if (assessment.passedCadenceFloor === false) {
      throw new Error(
        `Measured ${summary.cadenceHz.toFixed(2)} Hz WWT draw-bearing cadence, below operator-supplied ${options.minCadenceHz} Hz floor`,
      );
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    try {
      await cleanup();
    } catch (cleanupError) {
      if (primaryError === null) throw cleanupError;
      process.stderr.write(`Cleanup also failed: ${formatError(cleanupError)}\n`);
    }
  }
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = receivedSignal === "SIGINT" ? 130 : receivedSignal === "SIGTERM" ? 143 : 1;
  });
}
