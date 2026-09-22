import { readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { chromium } from "@playwright/test";

import { assertLuminaUrl, classifyRenderer } from "./measure-wwt-hardware.mjs";

const DEFAULT_CYCLES = 3;
const DEFAULT_DEEP_SKY_LAYER = "visible-dss2";
const DEFAULT_SETTLE_MS = 2_000;
const MAX_CYCLES = 8;
const MAX_SETTLE_MS = 10_000;
const PROCESS_EXIT_TIMEOUT_MS = 5_000;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const execFileAsync = promisify(execFile);

export function resolveOutputPath(rawPath) {
  return isAbsolute(rawPath) ? rawPath : resolve(REPOSITORY_ROOT, rawPath);
}

let receivedSignal = null;

function usage() {
  return `Usage: pnpm --filter @lumina/web perf:wwt-gpu-memory -- [options]

Profiles Linux DRM memory counters for Chromium's GPU process across repeated WWT
activate/use/route-leave cycles on representative headed hardware.

Options:
  --url <url>          Required /explore/deep-sky URL for an already-running Lumina instance.
  --cycles <number>    Number of activate/leave cycles (default: ${DEFAULT_CYCLES}, max: ${MAX_CYCLES}).
  --settle-ms <number> Wait after activation and route leave before each sample
                       (default: ${DEFAULT_SETTLE_MS}, max: ${MAX_SETTLE_MS}).
  --output <path>      Optional JSON evidence output path. The same evidence is always printed.
  --help               Show this help.

This is observational Phase 8D evidence. It reads per-client Linux DRM fdinfo
counters such as resident/active/total memory. It does not define a universal
GPU-memory budget, prove whole-engine disposal, or treat RSS/JS heap as GPU memory.
`;
}

function requiredArgument(argv, index, label) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${label} requires a value`);
  }
  return value;
}

function boundedInteger(raw, label, maximum) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be a positive integer no greater than ${maximum}`);
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
  const options = { cycles: DEFAULT_CYCLES, output: null, settleMs: DEFAULT_SETTLE_MS, url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--":
        break;
      case "--cycles":
        options.cycles = boundedInteger(
          requiredArgument(argv, ++index, "--cycles"),
          "--cycles",
          MAX_CYCLES,
        );
        break;
      case "--help":
        process.stdout.write(usage());
        process.exit(0);
        break;
      case "--output":
        options.output = requiredArgument(argv, ++index, "--output");
        break;
      case "--settle-ms":
        options.settleMs = boundedInteger(
          requiredArgument(argv, ++index, "--settle-ms"),
          "--settle-ms",
          MAX_SETTLE_MS,
        );
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
      "--url is required; start the intended Lumina build explicitly before profiling",
    );
  }
  if (new URL(options.url).pathname !== "/explore/deep-sky") {
    throw new Error("--url must target Lumina's /explore/deep-sky route");
  }
  const targetUrl = new URL(options.url);
  if (
    targetUrl.searchParams.get("object") === null ||
    targetUrl.searchParams.get("layer") === null
  ) {
    throw new Error("--url must include explicit object and layer parameters");
  }
  const allowedSearchParams = new Set(["object", "layer"]);
  if ([...targetUrl.searchParams.keys()].some((key) => !allowedSearchParams.has(key))) {
    throw new Error("--url contains unsupported deep-sky query parameters");
  }
  return options;
}

export function assertRequestedUrlState(actualRaw, requestedRaw) {
  const actual = new URL(actualRaw);
  const requested = new URL(requestedRaw);
  if (actual.origin !== requested.origin || actual.pathname !== requested.pathname) {
    throw new Error("Profile page origin/path does not match the requested Lumina URL");
  }
  const normalized = (url) =>
    [...url.searchParams.entries()]
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey
          ? leftValue.localeCompare(rightValue)
          : leftKey.localeCompare(rightKey),
      )
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
  if (normalized(actual) !== normalized(requested)) {
    throw new Error("Profile page query state does not match the requested Lumina URL");
  }
}

export function requestedDeepSkyHrefs(requestedRaw) {
  const requested = new URL(requestedRaw);
  const object = requested.searchParams.get("object");
  const layer = requested.searchParams.get("layer");
  if (object === null || layer === null) {
    throw new Error("Requested deep-sky URL must include object and layer parameters");
  }
  const objectHref = `/explore/deep-sky?${new URLSearchParams({
    layer: DEFAULT_DEEP_SKY_LAYER,
    object,
  }).toString()}`;
  const targetHref = `/explore/deep-sky?${new URLSearchParams({ layer, object }).toString()}`;
  return layer === DEFAULT_DEEP_SKY_LAYER
    ? ["/explore/deep-sky", objectHref]
    : ["/explore/deep-sky", objectHref, targetHref];
}

export function parseDrmFdinfo(text) {
  const result = { clientId: null, countersKiB: {}, driver: null, pdev: null };
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key === "drm-driver") result.driver = value;
    else if (key === "drm-client-id") result.clientId = value;
    else if (key === "drm-pdev") result.pdev = value;
    else {
      const usageMatch = /^drm-(total|shared|active|resident|purgeable)-(.+)$/u.exec(key);
      const memoryMatch = /^drm-memory-(.+)$/u.exec(key);
      if (usageMatch === null && memoryMatch === null) continue;
      const amount = /^(\d+(?:\.\d+)?)(?:\s+(B|KiB|MiB))?$/u.exec(value);
      if (amount === null) {
        throw new Error(`Malformed DRM memory counter: ${key}`);
      }
      const numeric = Number(amount[1]);
      const unit = amount[2] ?? "B";
      const kib = unit === "MiB" ? numeric * 1024 : unit === "KiB" ? numeric : numeric / 1024;
      const counter =
        usageMatch === null ? `memory-${memoryMatch[1]}` : `${usageMatch[1]}-${usageMatch[2]}`;
      result.countersKiB[counter] = kib;
    }
  }
  return result.clientId === null || result.driver === null ? null : result;
}

export function summarizeDrmFdinfo(samples, { allowEmpty = false } = {}) {
  const clients = new Map();
  for (const sample of samples) {
    if (sample === null) continue;
    const id = `${sample.driver}|${sample.pdev ?? "unknown"}|${sample.clientId}`;
    const current = clients.get(id) ?? {
      clientId: sample.clientId,
      countersKiB: {},
      driver: sample.driver,
      pdev: sample.pdev,
    };
    for (const [key, value] of Object.entries(sample.countersKiB)) {
      current.countersKiB[key] = Math.max(current.countersKiB[key] ?? 0, value);
    }
    clients.set(id, current);
  }
  const allClients = [...clients.values()];
  const counterBearingClients = allClients.filter(
    (client) => Object.keys(client.countersKiB).length > 0,
  );
  if (counterBearingClients.length === 0) {
    if (!allowEmpty) {
      throw new Error("Chromium GPU process exposed no Linux DRM memory counters");
    }
  }
  if (allClients.length === 0) {
    throw new Error("Chromium GPU process exposed no Linux DRM memory counters");
  }
  const devices = new Map();
  for (const client of allClients) {
    const key = `${client.driver}|${client.pdev ?? "unknown"}`;
    devices.set(key, { driver: client.driver, pdev: client.pdev });
  }
  if (devices.size !== 1) {
    throw new Error("Chromium GPU process exposed memory counters for multiple DRM devices");
  }
  return {
    clients: allClients.sort((left, right) => left.clientId.localeCompare(right.clientId)),
    device: [...devices.values()][0],
  };
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

export function findBrowserAndGpuProcesses(entries, userDataDir) {
  const browser = findDedicatedBrowser(entries, userDataDir);
  if (browser === null) return null;

  const descendants = new Set([browser.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      if (descendants.has(entry.ppid) && !descendants.has(entry.pid)) {
        descendants.add(entry.pid);
        changed = true;
      }
    }
  }

  const gpuProcesses = entries.filter(
    (entry) => descendants.has(entry.pid) && optionValue(entry.argv, "--type") === "gpu-process",
  );
  if (gpuProcesses.length === 0) return null;
  if (gpuProcesses.length !== 1) {
    throw new Error("Dedicated Chromium profile matched multiple GPU processes");
  }
  const gpu = gpuProcesses[0];
  return {
    browser: { pid: browser.pid, startTimeTicks: browser.startTimeTicks },
    gpu: {
      pid: gpu.pid,
      renderNode: optionValue(gpu.argv, "--render-node-override"),
      startTimeTicks: gpu.startTimeTicks,
    },
  };
}

function findDedicatedBrowser(entries, userDataDir) {
  const browsers = entries.filter(
    (entry) =>
      optionValue(entry.argv, "--user-data-dir") === userDataDir &&
      optionValue(entry.argv, "--type") === null,
  );
  if (browsers.length === 0) return null;
  if (browsers.length !== 1) {
    throw new Error("Dedicated Chromium profile matched multiple browser processes");
  }
  return browsers[0];
}

export function assertSameProcessIdentity(expected, actual) {
  if (actual === null)
    throw new Error("Dedicated Chromium browser/GPU process identity disappeared");
  for (const role of ["browser", "gpu"]) {
    if (
      expected[role].pid !== actual[role].pid ||
      expected[role].startTimeTicks !== actual[role].startTimeTicks
    ) {
      throw new Error(`Dedicated Chromium ${role} process identity changed during profiling`);
    }
  }
  if (expected.gpu.renderNode !== actual.gpu.renderNode) {
    throw new Error("Dedicated Chromium GPU render-node identity changed during profiling");
  }
}

export async function resolveRenderNodeIdentity(renderNode) {
  if (renderNode === null || !/^\/dev\/dri\/renderD\d+$/u.test(renderNode)) {
    throw new Error("Chromium GPU process does not expose a usable --render-node-override");
  }
  const devicePath = await realpath(`/sys/class/drm/${basename(renderNode)}/device`);
  const driverPath = await realpath(join(devicePath, "driver"));
  const vendorId = (await readFile(join(devicePath, "vendor"), "utf8")).trim().toLowerCase();
  return {
    driver: basename(driverPath),
    pdev: basename(devicePath),
    renderNode,
    vendorId,
  };
}

export function assertRendererBoundToDrm(renderer, binding, drmDevice) {
  if (binding.driver !== drmDevice.driver || binding.pdev !== drmDevice.pdev) {
    throw new Error("Chromium render node does not match the sampled DRM device");
  }
  const rendererText = `${renderer.renderer} ${renderer.vendor}`.toLowerCase();
  const supportedFamilies = [
    {
      drivers: new Set(["i915", "xe"]),
      rendererPattern: /intel/u,
      vendorId: "0x8086",
    },
    {
      drivers: new Set(["amdgpu"]),
      rendererPattern: /amd|radeon/u,
      vendorId: "0x1002",
    },
    {
      drivers: new Set(["nvidia", "nvidia-drm"]),
      rendererPattern: /nvidia|geforce|quadro|rtx|gtx/u,
      vendorId: "0x10de",
    },
  ];
  const family = supportedFamilies.find(
    (candidate) => candidate.vendorId === binding.vendorId && candidate.drivers.has(binding.driver),
  );
  if (family === undefined || !family.rendererPattern.test(rendererText)) {
    throw new Error("WebGL renderer identity does not match the bound Chromium DRM render node");
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function procEntries() {
  const names = await readdir("/proc");
  const entries = [];
  for (const name of names) {
    if (!/^\d+$/u.test(name)) continue;
    try {
      const [cmdlineRaw, status, stat] = await Promise.all([
        readFile(`/proc/${name}/cmdline`),
        readFile(`/proc/${name}/status`, "utf8"),
        readFile(`/proc/${name}/stat`, "utf8"),
      ]);
      const ppidMatch = /^PPid:\s+(\d+)$/mu.exec(status);
      if (ppidMatch === null) continue;
      const commandEnd = stat.lastIndexOf(")");
      if (commandEnd < 0) continue;
      const statFields = stat
        .slice(commandEnd + 1)
        .trim()
        .split(/\s+/u);
      const startTimeTicks = statFields[19];
      if (startTimeTicks === undefined || !/^\d+$/u.test(startTimeTicks)) continue;
      entries.push({
        argv: cmdlineRaw.toString("utf8").split("\0").filter(Boolean),
        pid: Number(name),
        ppid: Number(ppidMatch[1]),
        startTimeTicks,
      });
    } catch {
      // Processes can disappear while /proc is being sampled.
    }
  }
  return entries;
}

async function waitForGpuProcess(userDataDir) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const found = findBrowserAndGpuProcesses(await procEntries(), userDataDir);
    if (found !== null) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Could not identify Chromium's GPU process for the dedicated profiling session");
}

async function waitForBrowserProcess(userDataDir) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const found = findDedicatedBrowser(await procEntries(), userDataDir);
    if (found !== null) return { pid: found.pid, startTimeTicks: found.startTimeTicks };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Could not identify Chromium's browser process for the dedicated profiling session",
  );
}

async function currentProcessIdentity(userDataDir) {
  return findBrowserAndGpuProcesses(await procEntries(), userDataDir);
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

async function readExpectedProcessStartTime(pid) {
  try {
    return startTimeFromStat(await readFile(`/proc/${pid}/stat`, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function expectedProcessLiveness(expected) {
  const result = {};
  for (const role of Object.keys(expected)) {
    const actualStartTime = await readExpectedProcessStartTime(expected[role].pid);
    if (actualStartTime === null) {
      result[role] = false;
      continue;
    }
    if (actualStartTime !== expected[role].startTimeTicks) {
      throw new Error(`Dedicated Chromium ${role} PID was reused during cleanup`);
    }
    result[role] = true;
  }
  return result;
}

async function signalExpectedProcess(expectedProcess, signalName) {
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
    if command_end < 0:
        raise RuntimeError("invalid /proc stat")
    fields = stat[command_end + 1:].strip().split()
    actual_start = fields[19]
    if actual_start != expected_start:
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
    ["-c", python, String(expectedProcess.pid), expectedProcess.startTimeTicks, signalName],
    { cwd: REPOSITORY_ROOT },
  );
  const result = stdout.trim();
  if (result === "identity-changed") {
    throw new Error("Dedicated Chromium PID was reused before cleanup signalling");
  }
  if (result !== "gone" && result !== "signalled") {
    throw new Error(`Unexpected pidfd cleanup result: ${result || "<empty>"}`);
  }
  return result;
}

async function readGpuDrmSnapshot(userDataDir, expectedProcesses, { allowEmpty = false } = {}) {
  const before = await currentProcessIdentity(userDataDir);
  assertSameProcessIdentity(expectedProcesses, before);
  const fdinfoDir = `/proc/${expectedProcesses.gpu.pid}/fdinfo`;
  const names = await readdir(fdinfoDir);
  const parsed = [];
  for (const name of names) {
    try {
      parsed.push(parseDrmFdinfo(await readFile(join(fdinfoDir, name), "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        // File descriptors may close between directory listing and read.
        continue;
      }
      throw error;
    }
  }
  const snapshot = summarizeDrmFdinfo(parsed, { allowEmpty });
  const after = await currentProcessIdentity(userDataDir);
  assertSameProcessIdentity(expectedProcesses, after);
  return snapshot;
}

function assertSameDrmDevice(expected, actual) {
  for (const field of ["driver", "pdev"]) {
    if (expected.device[field] !== actual.device[field]) {
      throw new Error(`Chromium DRM device ${field} changed during profiling`);
    }
  }
}

async function verifyLuminaTarget(page, benchmarkUrl) {
  const manifestUrl = new URL("/manifest.webmanifest", benchmarkUrl).toString();
  const response = await page.request.get(manifestUrl, { timeout: 5_000 });
  try {
    assertLuminaUrl(response.url(), benchmarkUrl, "/manifest.webmanifest", "manifest");
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

async function clickExactHref(page, href) {
  const clicked = await page.locator("a").evaluateAll((anchors, target) => {
    const match = anchors.find((anchor) => anchor.getAttribute("href") === target);
    if (match === undefined) return false;
    match.click();
    return true;
  }, href);
  if (!clicked)
    throw new Error(`Lumina page does not expose the expected client-side link: ${href}`);
}

async function waitForRelativeHref(page, requestedUrl, href) {
  const expected = new URL(href, requestedUrl);
  await page.waitForURL(
    (actual) =>
      actual.origin === expected.origin &&
      actual.pathname === expected.pathname &&
      actual.search === expected.search,
  );
}

async function navigateToRequestedDeepSky(page, requestedUrl) {
  for (const href of requestedDeepSkyHrefs(requestedUrl)) {
    await clickExactHref(page, href);
    await waitForRelativeHref(page, requestedUrl, href);
  }
  assertRequestedUrlState(page.url(), requestedUrl);
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

function measurementCommand(options) {
  return [
    "pnpm --filter @lumina/web perf:wwt-gpu-memory --",
    `--url '${options.url}'`,
    `--cycles ${options.cycles}`,
    `--settle-ms ${options.settleMs}`,
  ].join(" ");
}

async function waitForProcessExit(expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const liveness = await expectedProcessLiveness(expected);
    if (!liveness.browser && !liveness.gpu) return liveness;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return expectedProcessLiveness(expected);
}

export function assertNotAborted(abortRequested, signal) {
  if (abortRequested) throw new Error(`Profiling interrupted by ${signal ?? "signal"}`);
}

function evidenceClients(snapshot) {
  return snapshot.clients.map((client) => ({
    client_id: client.clientId,
    counters_kib: client.countersKiB,
  }));
}

function postLeaveResidentSummary(cycles) {
  const clientIds = new Set();
  for (const cycle of cycles) {
    for (const client of cycle.postLeave.clients) clientIds.add(client.clientId);
  }

  const summary = {};
  for (const clientId of [...clientIds].sort()) {
    const seriesKiB = cycles.map((cycle) => {
      const client = cycle.postLeave.clients.find((item) => item.clientId === clientId);
      const value = client?.countersKiB["resident-system0"];
      return typeof value === "number" ? value : null;
    });
    const numeric = seriesKiB.filter((value) => typeof value === "number");
    const firstKiB = numeric[0] ?? null;
    const finalKiB = numeric.at(-1) ?? null;
    const maxKiB = numeric.length === 0 ? null : Math.max(...numeric);
    summary[clientId] = {
      final_is_max: finalKiB !== null && maxKiB !== null && finalKiB === maxKiB,
      final_kib: finalKiB,
      first_kib: firstKiB,
      max_kib: maxKiB,
      series_kib: seriesKiB,
    };
  }
  return summary;
}

export function buildEvidenceArtifact({
  baseline,
  buildCommit,
  cycles,
  dirtyPaths,
  measurementCommand,
  observedAt,
  renderer,
  rendererClassification,
  renderNodeIdentity,
  settleMs,
  targetIdentity,
}) {
  const measurements = cycles.map((cycle) => ({
    active_clients: evidenceClients(cycle.active),
    cycle: cycle.cycle,
    post_leave_clients: evidenceClients(cycle.postLeave),
  }));
  return {
    artifact_version: 1,
    evidence_id: "phase-8d-retained-gpu-memory-v1",
    phase: "8D",
    observed_at: observedAt,
    build_commit: buildCommit,
    working_tree_dirty_paths: dirtyPaths,
    measurement_command: measurementCommand,
    assessment: {
      representative_hardware_eligible: true,
      status: "representative_memory_measurement_no_floor",
      conclusion: "observational_only",
    },
    instrumentation: "linux-drm-fdinfo-v2",
    source: "operator-url",
    cycles: cycles.length,
    settle_ms: settleMs,
    renderer: {
      classification: rendererClassification.kind,
      debug_renderer_available: renderer.debugRendererAvailable,
      renderer: renderer.renderer,
      vendor: renderer.vendor,
      version: renderer.version,
    },
    drm: {
      driver: baseline.device.driver,
      pdev: baseline.device.pdev,
      render_node: renderNodeIdentity.renderNode,
      render_node_vendor_id: renderNodeIdentity.vendorId,
      renderer_binding_verified: true,
      units: "KiB",
    },
    target_identity: {
      manifest_url: targetIdentity.manifestUrl,
      name: targetIdentity.name,
      short_name: targetIdentity.shortName,
      scope: targetIdentity.scope,
      start_url: targetIdentity.startUrl,
    },
    baseline_clients: evidenceClients(baseline),
    measurements,
    derived_observation: {
      note: "DRM clients are preserved independently. No cross-client physical-memory total is computed.",
      post_leave_resident_by_client: postLeaveResidentSummary(cycles),
    },
    claim_boundaries: [
      "This evidence does not define or apply a universal GPU-memory pass threshold.",
      "Observed DRM allocations do not prove whole-engine GPU disposal, zero retention, or absence of all retained resources.",
      "Linux DRM fdinfo reports the tested Chromium GPU process's driver-accounted DRM-client allocations and does not attribute every allocation to Lumina or WWT.",
      "Renderer binding verifies Chromium's render node, PCI device, driver, vendor family, and WebGL renderer family; it does not attribute individual allocations to the WWT canvas.",
      "This measurement applies only to the recorded browser, DRM client/device, renderer, operating environment, route, and cycle procedure.",
    ],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform !== "linux") {
    throw new Error("This profiler requires Linux /proc DRM fdinfo");
  }

  const userDataDir = join(tmpdir(), `lumina-phase8d-gpu-memory-${process.pid}`);
  let browserIdentity = null;
  let context = null;
  let processes = null;
  let primaryError = null;
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
              setTimeout(() => reject(new Error("Timed out closing Chromium context")), 5_000),
            ),
          ]);
        } catch (error) {
          closeError = error;
        } finally {
          context = null;
        }
      }

      const cleanupProcesses =
        processes ?? (browserIdentity === null ? null : { browser: browserIdentity });
      if (cleanupProcesses !== null) {
        let liveness = await waitForProcessExit(cleanupProcesses, 1_000);
        if (Object.values(liveness).some(Boolean)) {
          for (const role of Object.keys(cleanupProcesses)) {
            if (liveness[role]) {
              await signalExpectedProcess(cleanupProcesses[role], "SIGTERM");
            }
          }
          liveness = await waitForProcessExit(cleanupProcesses, PROCESS_EXIT_TIMEOUT_MS);
        }
        if (Object.values(liveness).some(Boolean)) {
          for (const role of Object.keys(cleanupProcesses)) {
            if (liveness[role]) {
              await signalExpectedProcess(cleanupProcesses[role], "SIGKILL");
            }
          }
          liveness = await waitForProcessExit(cleanupProcesses, PROCESS_EXIT_TIMEOUT_MS);
        }
        if (Object.values(liveness).some(Boolean)) {
          throw new Error("Verified Chromium profiling process remained alive after cleanup");
        }
      }
      await rm(userDataDir, { force: true, recursive: true });
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
  };
  const onSigint = () => handleSignal("SIGINT");
  const onSigterm = () => handleSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { height: 900, width: 1280 },
    });
    assertNotAborted(abortRequested, receivedSignal);
    browserIdentity = await waitForBrowserProcess(userDataDir);
    processes = await waitForGpuProcess(userDataDir);
    if (
      processes.browser.pid !== browserIdentity.pid ||
      processes.browser.startTimeTicks !== browserIdentity.startTimeTicks
    ) {
      throw new Error("Dedicated Chromium browser identity changed while waiting for GPU process");
    }
    const page = context.pages()[0] ?? (await context.newPage());
    const targetIdentity = await verifyLuminaTarget(page, options.url);
    const provenance = await gitProvenance();

    await page.goto(new URL("/explore", options.url).toString(), { waitUntil: "load" });
    await page.getByRole("heading", { level: 1, name: /Explore real objects/i }).waitFor();
    const renderNodeIdentity = await resolveRenderNodeIdentity(processes.gpu.renderNode);
    const baseline = await readGpuDrmSnapshot(userDataDir, processes, { allowEmpty: true });
    assertSameDrmDevice({ device: renderNodeIdentity }, baseline);

    const cycles = [];
    let renderer = null;
    let rendererClassification = null;

    for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
      assertNotAborted(abortRequested, receivedSignal);
      await navigateToRequestedDeepSky(page, options.url);
      assertLuminaUrl(page.url(), options.url, "/explore/deep-sky", "profile page");
      await page.getByRole("button", { name: "Open interactive atlas" }).click();
      await page.getByText("Interactive atlas ready.").waitFor({ timeout: 20_000 });
      await page.locator("#lumina-wwt-atlas canvas").waitFor({ state: "visible" });

      if (renderer === null) {
        renderer = await rendererInfo(page);
        rendererClassification = classifyRenderer(renderer);
        if (rendererClassification.kind !== "hardware") {
          throw new Error(
            `Renderer is not eligible for representative-hardware evidence: ${rendererClassification.reason}`,
          );
        }
        assertRendererBoundToDrm(renderer, renderNodeIdentity, baseline.device);
      }

      await page.waitForTimeout(options.settleMs);
      assertNotAborted(abortRequested, receivedSignal);
      const active = await readGpuDrmSnapshot(userDataDir, processes);
      assertSameDrmDevice(baseline, active);

      await page.getByRole("link", { name: /Explore catalogue/i }).click();
      await page.waitForURL(/\/explore$/u);
      await page.getByRole("heading", { level: 1, name: /Explore real objects/i }).waitFor();
      await page.waitForTimeout(options.settleMs);
      assertNotAborted(abortRequested, receivedSignal);
      const postLeave = await readGpuDrmSnapshot(userDataDir, processes);
      assertSameDrmDevice(baseline, postLeave);

      cycles.push({
        active,
        cycle,
        postLeave,
      });
    }

    assertNotAborted(abortRequested, receivedSignal);
    const output = buildEvidenceArtifact({
      baseline,
      buildCommit: provenance.buildCommit,
      cycles,
      dirtyPaths: provenance.dirtyPaths,
      measurementCommand: measurementCommand(options),
      observedAt: new Date().toISOString(),
      renderer,
      rendererClassification,
      renderNodeIdentity,
      settleMs: options.settleMs,
      targetIdentity,
    });
    assertNotAborted(abortRequested, receivedSignal);
    if (options.output !== null) {
      await writeFile(
        resolveOutputPath(options.output),
        `${JSON.stringify(output, null, 2)}\n`,
        "utf8",
      );
    }
    assertNotAborted(abortRequested, receivedSignal);
    process.stdout.write(`PHASE8D_WWT_GPU_MEMORY=${JSON.stringify(output)}\n`);
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
