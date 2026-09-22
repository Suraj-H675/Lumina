import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { chromium } from "@playwright/test";

import { assertLuminaUrl } from "./measure-wwt-hardware.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const execFileAsync = promisify(execFile);
const TARGET_ZOOM = 2;
const PROCESS_EXIT_TIMEOUT_MS = 5_000;
let receivedSignal = null;
const SAMPLES = [
  { journey: "explore-navigation", path: "/explore" },
  { journey: "observe-journal-local-data", path: "/observe?object=k2-18&date=2026-08-27" },
  { journey: "observe-journal-local-data", path: "/journal" },
  { journey: "identify-async-file-flow", path: "/identify" },
  {
    journey: "deep-sky-canvas-fallback",
    path: "/explore/deep-sky?layer=visible-dss2&object=messier-31",
  },
  { journey: "hr-diagram-chart-table", path: "/lab/hr-diagram-explorer" },
  { journey: "offline-storage", path: "/offline/storage" },
  { journey: "offline-storage", path: "/learn/your-first-night-sky/start-with-the-sky" },
];

function usage() {
  return `Usage: pnpm --filter @lumina/web audit:browser-zoom -- [options]

Collects supporting Phase 8D evidence using Chromium's native browser default
page-zoom setting at exactly 200%. This is not CSS zoom, pinch zoom, device-scale
emulation, or a substitute for the required manual accessibility review.

Options:
  --url <url>       Required root URL for an already-running Lumina instance.
  --output <path>   Optional JSON artifact output path; relative paths resolve
                    from the repository root.
  --help            Show this help.
`;
}

function requiredArgument(argv, index, label) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${label} requires a value`);
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
  if (value.pathname !== "/" || value.search !== "" || value.hash !== "") {
    throw new Error(`${label} must be a root Lumina URL without query or fragment state`);
  }
  return value.toString();
}

export function parseArgs(argv) {
  const options = { output: null, url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--":
        break;
      case "--help":
        process.stdout.write(usage());
        process.exit(0);
        break;
      case "--output":
        options.output = requiredArgument(argv, ++index, "--output");
        break;
      case "--url":
        options.url = parseHttpUrl(requiredArgument(argv, ++index, "--url"), "--url");
        break;
      default:
        throw new Error(`Unknown argument: ${argument ?? "<missing>"}`);
    }
  }
  if (options.url === null) {
    throw new Error(
      "--url is required; start the intended Lumina build explicitly before auditing",
    );
  }
  return options;
}

export function resolveOutputPath(rawPath) {
  return isAbsolute(rawPath) ? rawPath : resolve(REPOSITORY_ROOT, rawPath);
}

function normalizedArgv(argv) {
  if (argv.length === 1 && argv[0].includes(" --")) {
    return argv[0].split(/\s+/u).filter(Boolean);
  }
  return argv;
}

function optionValue(argv, option) {
  const normalized = normalizedArgv(argv);
  const inline = normalized.find((argument) => argument.startsWith(`${option}=`));
  if (inline !== undefined) return inline.slice(option.length + 1);
  const index = normalized.indexOf(option);
  return index >= 0 ? (normalized[index + 1] ?? null) : null;
}

function startTimeFromStat(stat) {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 0) throw new Error("Linux /proc stat has no command terminator");
  const fields = stat
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/u);
  const value = fields[19];
  if (value === undefined || !/^\d+$/u.test(value)) {
    throw new Error("Linux /proc stat has no valid process start time");
  }
  return value;
}

async function procEntries() {
  const entries = [];
  for (const name of await readdir("/proc")) {
    if (!/^\d+$/u.test(name)) continue;
    try {
      const [cmdlineRaw, status, stat] = await Promise.all([
        readFile(`/proc/${name}/cmdline`),
        readFile(`/proc/${name}/status`, "utf8"),
        readFile(`/proc/${name}/stat`, "utf8"),
      ]);
      const ppidMatch = /^PPid:\s+(\d+)$/mu.exec(status);
      if (ppidMatch === null) continue;
      entries.push({
        argv: cmdlineRaw.toString("utf8").split("\0").filter(Boolean),
        pid: Number(name),
        ppid: Number(ppidMatch[1]),
        startTimeTicks: startTimeFromStat(stat),
      });
    } catch {
      // Processes may disappear while /proc is sampled.
    }
  }
  return entries;
}

function findDedicatedBrowser(entries, userDataDir) {
  const browsers = entries.filter(
    (entry) =>
      optionValue(entry.argv, "--user-data-dir") === userDataDir &&
      optionValue(entry.argv, "--type") === null,
  );
  if (browsers.length === 0) return null;
  if (browsers.length !== 1) {
    throw new Error("Dedicated Chromium zoom profile matched multiple browser processes");
  }
  return { pid: browsers[0].pid, startTimeTicks: browsers[0].startTimeTicks };
}

async function waitForBrowserProcess(userDataDir) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const found = findDedicatedBrowser(await procEntries(), userDataDir);
    if (found !== null) return found;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("Could not identify Chromium's browser process for the dedicated zoom profile");
}

async function readExpectedProcessStartTime(pid) {
  try {
    return startTimeFromStat(await readFile(`/proc/${pid}/stat`, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function expectedProcessAlive(expected) {
  const actualStartTime = await readExpectedProcessStartTime(expected.pid);
  if (actualStartTime === null) return false;
  if (actualStartTime !== expected.startTimeTicks) {
    throw new Error("Dedicated Chromium zoom PID was reused during cleanup");
  }
  return true;
}

async function signalExpectedProcess(expected, signalName) {
  const python = `
import os
import signal
import sys

pid = int(sys.argv[1])
expected_start = sys.argv[2]
signal_value = getattr(signal, sys.argv[3])

try:
    pidfd = os.pidfd_open(pid)
except ProcessLookupError:
    print("gone")
    raise SystemExit(0)

try:
    try:
        stat = open(f"/proc/{pid}/stat", encoding="utf-8").read()
    except FileNotFoundError:
        print("gone")
        raise SystemExit(0)
    command_end = stat.rfind(")")
    fields = stat[command_end + 1:].strip().split()
    if command_end < 0 or len(fields) <= 19:
        raise RuntimeError("invalid /proc stat")
    if fields[19] != expected_start:
        print("identity-changed")
        raise SystemExit(0)
    try:
        signal.pidfd_send_signal(pidfd, signal_value)
    except ProcessLookupError:
        print("gone")
    else:
        print("signalled")
finally:
    os.close(pidfd)
`;
  const { stdout } = await execFileAsync(
    "python3",
    ["-c", python, String(expected.pid), expected.startTimeTicks, signalName],
    { cwd: REPOSITORY_ROOT },
  );
  const result = stdout.trim();
  if (result === "identity-changed") {
    throw new Error("Dedicated Chromium zoom PID was reused before cleanup signalling");
  }
  if (result !== "gone" && result !== "signalled") {
    throw new Error(`Unexpected pidfd cleanup result: ${result || "<empty>"}`);
  }
}

async function waitForProcessExit(expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await expectedProcessAlive(expected))) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  return !(await expectedProcessAlive(expected));
}

export function assertExactRequestedUrl(actualRaw, requestedRaw) {
  const actual = new URL(actualRaw);
  const requested = new URL(requestedRaw);
  if (
    actual.origin !== requested.origin ||
    actual.pathname !== requested.pathname ||
    actual.search !== requested.search ||
    actual.hash !== requested.hash
  ) {
    throw new Error("Zoom route does not match the exact requested Lumina URL state");
  }
}

export function assertNotAborted(abortRequested, signal) {
  if (abortRequested) throw new Error(`Browser zoom audit interrupted by ${signal ?? "signal"}`);
}

export function evaluateZoomProof({ baseline, settingsAfter, settingsBefore, zoomed }) {
  const dprRatio = zoomed.dpr / baseline.dpr;
  const innerWidthRatio = zoomed.innerWidth / baseline.innerWidth;
  const outerWidthRatio = zoomed.outerWidth / baseline.outerWidth;
  const realBrowserZoomConfirmed =
    Math.abs(settingsBefore - 1) < 0.001 &&
    Math.abs(settingsAfter - TARGET_ZOOM) < 0.001 &&
    dprRatio >= 1.95 &&
    dprRatio <= 2.05 &&
    innerWidthRatio >= 0.48 &&
    innerWidthRatio <= 0.52 &&
    outerWidthRatio >= 0.95 &&
    outerWidthRatio <= 1.05 &&
    Math.abs(zoomed.visualScale - 1) < 0.001;
  return {
    dprRatio,
    innerWidthRatio,
    outerWidthRatio,
    realBrowserZoomConfirmed,
  };
}

export function summarizeRouteObservations(observations) {
  return {
    allHeadingsVisible: observations.every((item) => item.h1Visible && item.h1Text !== ""),
    noDocumentHorizontalOverflow: observations.every((item) => !item.documentHorizontalOverflow),
    sampledRouteCount: observations.length,
    sampledRoutes: observations.map((item) => item.path),
  };
}

function measurementCommand(options) {
  const parts = ["pnpm --filter @lumina/web audit:browser-zoom --", `--url '${options.url}'`];
  if (options.output !== null) parts.push(`--output '${options.output}'`);
  return parts.join(" ");
}

async function verifyLuminaTarget(page, rootUrl) {
  const manifestUrl = new URL("/manifest.webmanifest", rootUrl).toString();
  const response = await page.request.get(manifestUrl, { timeout: 5_000 });
  try {
    assertLuminaUrl(response.url(), rootUrl, "/manifest.webmanifest", "manifest");
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
      manifestUrl: response.url(),
      name: manifest.name,
      scope: manifest.scope,
      shortName: manifest.short_name,
      startUrl: manifest.start_url,
    };
  } finally {
    await response.dispose();
  }
}

async function browserMetrics(page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    dpr: window.devicePixelRatio,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    outerHeight: window.outerHeight,
    outerWidth: window.outerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    visualScale: window.visualViewport?.scale ?? 1,
  }));
}

async function defaultZoom(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        if (typeof chrome?.settingsPrivate?.getDefaultZoom !== "function") {
          reject(new Error("Chromium settingsPrivate.getDefaultZoom is unavailable"));
          return;
        }
        chrome.settingsPrivate.getDefaultZoom(resolve);
      }),
  );
}

async function setDefaultZoom(page, value) {
  return page.evaluate(
    (zoom) =>
      new Promise((resolve, reject) => {
        if (typeof chrome?.settingsPrivate?.setDefaultZoom !== "function") {
          reject(new Error("Chromium settingsPrivate.setDefaultZoom is unavailable"));
          return;
        }
        chrome.settingsPrivate.setDefaultZoom(zoom, resolve);
      }),
    value,
  );
}

async function routeObservation(page, rootUrl, sample) {
  const requested = new URL(sample.path, rootUrl).toString();
  await page.goto(requested, { waitUntil: "load" });
  assertExactRequestedUrl(page.url(), requested);
  const heading = page.locator("h1").first();
  await heading.waitFor({ state: "visible", timeout: 10_000 });
  const metrics = await browserMetrics(page);
  const focusable = page.locator(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  const verifiedActualUrl = page.url();
  assertExactRequestedUrl(verifiedActualUrl, requested);
  return {
    ...metrics,
    documentHorizontalOverflow: metrics.scrollWidth > metrics.clientWidth + 1,
    focusableCount: await focusable.count(),
    h1Text: (await heading.textContent())?.trim() ?? "",
    h1Visible: await heading.isVisible(),
    journey: sample.journey,
    path: sample.path,
    verifiedActualUrl,
  };
}

async function gitProvenance() {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY_ROOT }),
    execFileAsync("git", ["status", "--short"], { cwd: REPOSITORY_ROOT }),
  ]);
  return {
    buildCommit: commit.trim(),
    dirtyPaths: status
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3)),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let userDataDir = null;
  let profileOwned = false;
  let context = null;
  let browserIdentity = null;
  let cleanupInFlight = null;
  let abortRequested = false;

  const cleanup = async () => {
    if (cleanupInFlight !== null) return cleanupInFlight;
    cleanupInFlight = (async () => {
      let closeError = null;
      if (context !== null) {
        try {
          await Promise.race([
            context.close(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timed out closing Chromium zoom context")), 5_000),
            ),
          ]);
        } catch (error) {
          closeError = error;
        } finally {
          context = null;
        }
      }

      if (browserIdentity === null && userDataDir !== null) {
        browserIdentity = findDedicatedBrowser(await procEntries(), userDataDir);
      }
      if (browserIdentity !== null && (await expectedProcessAlive(browserIdentity))) {
        await signalExpectedProcess(browserIdentity, "SIGTERM");
        if (!(await waitForProcessExit(browserIdentity, PROCESS_EXIT_TIMEOUT_MS))) {
          await signalExpectedProcess(browserIdentity, "SIGKILL");
          await waitForProcessExit(browserIdentity, PROCESS_EXIT_TIMEOUT_MS);
        }
        if (await expectedProcessAlive(browserIdentity)) {
          throw new Error("Verified Chromium zoom process remained alive after cleanup");
        }
      }

      if (profileOwned && userDataDir !== null) {
        await rm(userDataDir, { force: true, recursive: true });
        profileOwned = false;
      }
      if (closeError !== null) throw closeError;
    })();
    try {
      await cleanupInFlight;
    } finally {
      cleanupInFlight = null;
    }
  };

  const handleSignal = (signal) => {
    receivedSignal ??= signal;
    abortRequested = true;
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    void cleanup().catch((error) => {
      process.stderr.write(`Cleanup after ${signal} failed: ${String(error)}\n`);
    });
  };
  const onSigint = () => handleSignal("SIGINT");
  const onSigterm = () => handleSignal("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  let primaryError = null;
  try {
    userDataDir = await mkdtemp(join(tmpdir(), "lumina-phase8d-browser-zoom-"));
    profileOwned = true;
    assertNotAborted(abortRequested, receivedSignal);
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { height: 900, width: 1280 },
    });
    browserIdentity = await waitForBrowserProcess(userDataDir);
    assertNotAborted(abortRequested, receivedSignal);
    const page = context.pages()[0] ?? (await context.newPage());
    const targetIdentity = await verifyLuminaTarget(page, options.url);
    const provenance = await gitProvenance();

    await page.goto(new URL("/explore", options.url).toString(), { waitUntil: "networkidle" });
    assertNotAborted(abortRequested, receivedSignal);
    const baseline = await browserMetrics(page);

    await page.goto("chrome://settings/appearance");
    const settingsBefore = Number(await defaultZoom(page));
    const setResult = await setDefaultZoom(page, TARGET_ZOOM);
    const settingsAfter = Number(await defaultZoom(page));
    if (setResult !== true) {
      throw new Error("Chromium rejected the native 200% default zoom setting");
    }

    await page.goto(new URL("/explore", options.url).toString(), { waitUntil: "networkidle" });
    assertNotAborted(abortRequested, receivedSignal);
    const zoomed = await browserMetrics(page);
    const zoomProof = evaluateZoomProof({ baseline, settingsAfter, settingsBefore, zoomed });
    if (!zoomProof.realBrowserZoomConfirmed) {
      throw new Error("Chromium metrics did not prove native 200% browser page zoom");
    }

    const observations = [];
    for (const sample of SAMPLES) {
      assertNotAborted(abortRequested, receivedSignal);
      observations.push(await routeObservation(page, options.url, sample));
    }
    const routeSummary = summarizeRouteObservations(observations);
    const environment = await page.evaluate(() => ({
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    }));

    const output = {
      artifact_version: 1,
      evidence_id: "phase-8d-real-browser-zoom-v1",
      phase: "8D",
      observed_at: new Date().toISOString(),
      build_commit: provenance.buildCommit,
      working_tree_dirty_paths: provenance.dirtyPaths,
      measurement_command: measurementCommand(options),
      assessment: {
        manual_review_still_required: true,
        real_browser_zoom_confirmed: true,
        status: "supporting_real_browser_zoom_automation_manual_review_pending",
      },
      instrumentation: "chromium-settings-private-default-zoom-v1",
      browser_zoom: {
        baseline,
        native_settings_api: "chrome.settingsPrivate.setDefaultZoom",
        settings_after: settingsAfter,
        settings_before: settingsBefore,
        target_factor: TARGET_ZOOM,
        zoom_proof: zoomProof,
        zoomed,
      },
      environment,
      route_observations: observations,
      route_summary: routeSummary,
      source: "headed-chromium-native-default-page-zoom",
      target_identity: targetIdentity,
      claim_boundaries: [
        "This uses Chromium's native default page-zoom setting, not CSS zoom, pinch zoom, or device-scale emulation.",
        "Automated real-browser evidence does not replace the manual 200% zoom check required by docs/16_TESTING_QUALITY.md.",
        "The sampled routes and one Chromium/Linux environment do not certify all routes, browsers, operating systems, or WCAG 2.2 AA conformance.",
      ],
    };
    assertNotAborted(abortRequested, receivedSignal);
    if (options.output !== null) {
      await writeFile(
        resolveOutputPath(options.output),
        `${JSON.stringify(output, null, 2)}\n`,
        "utf8",
      );
    }
    assertNotAborted(abortRequested, receivedSignal);
    process.stdout.write(`PHASE8D_BROWSER_ZOOM=${JSON.stringify(output)}\n`);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      if (primaryError === null) throw cleanupError;
      process.stderr.write(
        `Cleanup also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`,
      );
    } finally {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
    }
  }
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
