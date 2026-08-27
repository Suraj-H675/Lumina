import { randomBytes } from "node:crypto";
import { access, open, unlink } from "node:fs/promises";
import http from "node:http";
import { join } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const coordinationFile = process.env.LUMINA_E2E_COORDINATION_FILE;
if (coordinationFile === undefined || coordinationFile.length === 0) {
  throw new Error("LUMINA_E2E_COORDINATION_FILE is required");
}

const token = randomBytes(32).toString("hex");
const sockets = new Set();
const apiPaths = new Set(["/api/v1/meta", "/health/live", "/health/ready"]);
// Catalogue discovery endpoints carry query strings; matched by prefix below.
const apiPathPrefixes = ["/api/v1/catalog/", "/api/v1/search"];
const controlPaths = new Set([
  "/__control/assert-clean",
  "/__control/clear-violations",
  "/__control/mode",
]);
const shutdownFixture = process.env.LUMINA_E2E_SHUTDOWN_FIXTURE === "1";

class ProductionBuildRequiredError extends Error {}

async function requireProductionBuild() {
  if (shutdownFixture) return;
  try {
    await access(join(process.cwd(), ".next", "BUILD_ID"));
  } catch {
    throw new ProductionBuildRequiredError();
  }
}

if (shutdownFixture) {
  controlPaths.add("/__control/release-child");
  controlPaths.add("/__control/shutdown-state");
}
const maximumViolations = 100;
const violationCounts = new Map();
let violationTotal = 0;
let mode = "disconnect";
let webProcess;
let shutdownPhase = "running";
let childShutdownBarrierReached = false;
let requestedExitCode = 0;
let shutdownPromise;

// ---------------------------------------------------------------------------
// Deterministic catalogue fixture.
//
// Values mirror the reviewed Gaia DR3 seed slice (fingerprint
// 05444b36d44bd800ca9fdefbb45d10fbef2e222729cb65c4c919fd0759c61c2c) so E2E
// assertions stay truthful against accepted data. The BP/RP magnitudes below
// are the published DR3 photometry for the same five accepted source_ids
// (ESA Gaia Archive, gaiadr3.gaia_source); the G values are exactly the ones
// the accepted slice persists. This is test infrastructure: production always
// reads from the real API.
// ---------------------------------------------------------------------------
const CATALOGUE_ENTITIES = [
  {
    id: "26f4b667-ecd9-524d-8121-29508723715a",
    slug: "hd-209458",
    entity_type: "star",
    canonical_name: "HD 209458",
  },
  {
    id: "bbfe8678-81ca-5e70-ac95-c597d7655540",
    slug: "kepler-186",
    entity_type: "star",
    canonical_name: "Kepler-186",
  },
  {
    id: "bfd42670-3013-598e-8eb5-5a1c084dd1a0",
    slug: "kepler-452",
    entity_type: "star",
    canonical_name: "Kepler-452",
  },
  {
    id: "c593bd18-c4bc-5551-8a41-09f1b501f981",
    slug: "51-pegasi",
    entity_type: "star",
    canonical_name: "51 Pegasi",
  },
  {
    id: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
    slug: "k2-18",
    entity_type: "star",
    canonical_name: "K2-18",
  },
];

const GAIA_SOURCE_IDS = new Map([
  ["26f4b667-ecd9-524d-8121-29508723715a", "1779546757669063552"],
  ["bbfe8678-81ca-5e70-ac95-c597d7655540", "2079000330051813504"],
  ["bfd42670-3013-598e-8eb5-5a1c084dd1a0", "2079597124345617280"],
  ["c593bd18-c4bc-5551-8a41-09f1b501f981", "2835207319109249920"],
  ["403d0e71-8d81-5c52-abad-c4666c1b5cd6", "3910747531814692736"],
]);

// Test-only schema-valid fixture for the planner's missing-coordinate state.
// It is deliberately not included in the browse or suggestion slice.
const NO_COORDINATE_FIXTURE = {
  id: "00000000-0000-5000-8000-000000000001",
  slug: "no-coordinate-fixture",
  entity_type: "star",
  canonical_name: "No Coordinate Fixture",
};

const CATALOGUE_MEASUREMENTS = new Map([
  [
    "26f4b667-ecd9-524d-8121-29508723715a",
    [
      { code: "gaia_g_mean_magnitude", value: "7.5212455" },
      { code: "gaia_bp_mean_magnitude", value: "7.7932835" },
      { code: "gaia_rp_mean_magnitude", value: "7.080288" },
      {
        code: "gaia_icrs_right_ascension",
        value: "330.79502626424147",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
      {
        code: "gaia_icrs_declination",
        value: "18.88423938290383",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
    ],
  ],
  [
    "bbfe8678-81ca-5e70-ac95-c597d7655540",
    [
      { code: "gaia_g_mean_magnitude", value: "14.583239" },
      { code: "gaia_bp_mean_magnitude", value: "15.51225" },
      { code: "gaia_rp_mean_magnitude", value: "13.631706" },
      {
        code: "gaia_icrs_right_ascension",
        value: "298.65273637846053",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
      {
        code: "gaia_icrs_declination",
        value: "43.9549878103226",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
    ],
  ],
  [
    "bfd42670-3013-598e-8eb5-5a1c084dd1a0",
    [
      { code: "gaia_g_mean_magnitude", value: "13.392909" },
      { code: "gaia_bp_mean_magnitude", value: "13.772195" },
      { code: "gaia_rp_mean_magnitude", value: "12.851425" },
      {
        code: "gaia_icrs_right_ascension",
        value: "296.0037539639907",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
      {
        code: "gaia_icrs_declination",
        value: "44.2775873685433",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
    ],
  ],
  [
    "c593bd18-c4bc-5551-8a41-09f1b501f981",
    [
      { code: "gaia_g_mean_magnitude", value: "5.283212" },
      { code: "gaia_bp_mean_magnitude", value: "5.6174655" },
      { code: "gaia_rp_mean_magnitude", value: "4.7888722" },
      {
        code: "gaia_icrs_right_ascension",
        value: "344.3675708158258",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
      {
        code: "gaia_icrs_declination",
        value: "20.769104345387106",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
    ],
  ],
  [
    "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
    [
      { code: "gaia_g_mean_magnitude", value: "12.400764" },
      { code: "gaia_bp_mean_magnitude", value: "13.71137" },
      { code: "gaia_rp_mean_magnitude", value: "11.269744" },
      {
        code: "gaia_icrs_right_ascension",
        value: "172.5601297577743",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
      {
        code: "gaia_icrs_declination",
        value: "7.58781312214569",
        unit: "deg",
        dataset: "gaia-source-astrometry",
      },
    ],
  ],
]);

const GAIA_QUANTITY = {
  gaia_bp_mean_magnitude: "Gaia integrated BP mean magnitude (Vega scale)",
  gaia_g_mean_magnitude: "Gaia G-band mean magnitude (Vega scale)",
  gaia_rp_mean_magnitude: "Gaia integrated RP mean magnitude (Vega scale)",
  gaia_icrs_right_ascension: "Gaia ICRS right ascension at reference epoch",
  gaia_icrs_declination: "Gaia ICRS declination at reference epoch",
};

function catalogueSource(entity, datasetCode = "gaia-source") {
  const astrometry = datasetCode === "gaia-source-astrometry";
  return {
    source_record_id: astrometry
      ? `90000000-0000-5000-8000-${GAIA_SOURCE_IDS.get(entity.id).slice(-12)}`
      : `10000000-0000-5000-8000-${entity.canonical_name.length.toString().padStart(12, "0")}`,
    provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
    dataset: {
      code: datasetCode,
      name: astrometry
        ? "Gaia Data Release 3 main source catalogue — reviewed astrometry slice"
        : "Gaia Data Release 3 main source catalogue",
      release_version: "dr3",
    },
  };
}

function catalogueDetail(entity) {
  const entries = CATALOGUE_MEASUREMENTS.get(entity.id) ?? [];
  return {
    id: entity.id,
    entity_type: entity.entity_type,
    canonical_name: entity.canonical_name,
    quantities: entries.map((entry, index) => ({
      quantity: { code: entry.code, name: GAIA_QUANTITY[entry.code] ?? entry.code },
      measurement_count: 1,
      current_selection: {
        measurement: {
          id:
            entry.code === "gaia_g_mean_magnitude"
              ? "22222222-3333-5444-8555-666666666666"
              : `33333333-4444-5555-8666-${String(index).padStart(12, "0")}`,
          value: entry.value,
          unit: {
            code: entry.unit ?? "mag",
            name: entry.unit ?? "magnitude",
            symbol: entry.unit ?? "mag",
          },
          original_value: entry.value,
          original_unit: entry.unit ?? "mag",
          source: catalogueSource(entity, entry.dataset ?? "gaia-source"),
        },
        selection: {
          rule: "single-reviewed-measurement",
          version: "1",
          explanation: "Only reviewed measurement for this quantity in the accepted slice.",
          selected_at: "2026-08-15T08:23:59Z",
        },
      },
    })),
  };
}

function normalizeQuery(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function searchCatalogueFixture(query) {
  const normalized = normalizeQuery(query);
  const hits = [];
  for (const entity of CATALOGUE_ENTITIES) {
    const name = normalizeQuery(entity.canonical_name);
    if (entity.slug === normalized) {
      hits.push({ entity, match_reason: "exact_slug", matched_alias: null });
    } else if (name === normalized) {
      hits.push({ entity, match_reason: "exact_canonical_name", matched_alias: null });
    } else if (name.startsWith(normalized)) {
      hits.push({ entity, match_reason: "canonical_name_prefix", matched_alias: null });
    }
  }
  return hits;
}

function respondCatalogue(request, response, target) {
  const path = target.pathname;
  const query = target.searchParams;

  if (path === "/api/v1/catalog/entities") {
    sendJson(response, 200, {
      items: CATALOGUE_ENTITIES,
      page: { has_more: false, limit: Number(query.get("limit") ?? 20), next_cursor: null },
    });
    return;
  }

  const bySlugMatch = /^\/api\/v1\/catalog\/entities\/by-slug\/([^/]+)$/u.exec(path);
  if (bySlugMatch !== null) {
    const slug = decodeURIComponent(bySlugMatch[1]);
    const entity =
      slug === NO_COORDINATE_FIXTURE.slug
        ? NO_COORDINATE_FIXTURE
        : CATALOGUE_ENTITIES.find((item) => item.slug === slug);
    if (entity === undefined) {
      sendJson(response, 404, {
        error: {
          code: "catalog.entity_not_found",
          message: "No matching object was found.",
          request_id: "e2e-fixture",
        },
      });
      return;
    }
    sendJson(response, 200, entity);
    return;
  }

  const detailMatch = /^\/api\/v1\/catalog\/entities\/([0-9a-f-]{36})$/u.exec(path);
  if (detailMatch !== null) {
    const entity =
      detailMatch[1] === NO_COORDINATE_FIXTURE.id
        ? NO_COORDINATE_FIXTURE
        : CATALOGUE_ENTITIES.find((item) => item.id === detailMatch[1]);
    if (entity === undefined) {
      sendJson(response, 404, {
        error: {
          code: "catalog.entity_not_found",
          message: "No matching object was found.",
          request_id: "e2e-fixture",
        },
      });
      return;
    }
    sendJson(response, 200, catalogueDetail(entity));
    return;
  }

  if (path === "/api/v1/search" || path === "/api/v1/search/suggest") {
    const q = query.get("q") ?? "";
    if (normalizeQuery(q).length < 2) {
      sendJson(response, 422, {
        error: {
          code: "request.validation_failed",
          message: "The request could not be validated.",
          request_id: "e2e-fixture",
        },
      });
      return;
    }
    const items = searchCatalogueFixture(q);
    if (path === "/api/v1/search/suggest") {
      sendJson(response, 200, { items: items.map((item) => item.entity) });
    } else {
      sendJson(response, 200, { items });
    }
    return;
  }

  recordViolation("unexpected-path");
  sendFailure(response, 500);
}

// The discovery suite performs real server-side reads through this stub. It
// runs with fullyParallel workers, while the status suite toggles the stub
// into disconnect mode; a worker's SSR fetch can therefore land in a
// disconnect window and fail flakily. Serial mode pins discovery tests to one
// worker AND makes Playwright await suite completion before the status suite
// starts, so the two suites never interleave their stub modes.

function sendJson(response, status, body) {
  const content = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Length": String(content.byteLength),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(content);
}

function sendFailure(response, status) {
  sendJson(response, status, { error: "stub request rejected" });
}

function recordViolation(category) {
  if (violationTotal >= maximumViolations) return;
  violationTotal += 1;
  violationCounts.set(category, (violationCounts.get(category) ?? 0) + 1);
}

function violationSnapshot() {
  return Object.fromEntries(
    [...violationCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function readControlBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1_024) throw new Error("control request is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function controlBodyIsEmpty(request) {
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1_024) throw new Error("control request is too large");
  }
  return length === 0;
}

const stub = http.createServer(async (request, response) => {
  const target = new URL(request.url ?? "/", "http://stub.invalid");
  const path = target.pathname;
  if (path.startsWith("/__control/")) {
    let invalidControl = false;
    if (!controlPaths.has(path)) {
      recordViolation("unexpected-path");
      invalidControl = true;
    }
    if (target.search !== "") {
      recordViolation("unexpected-query");
      invalidControl = true;
    }
    if (request.method !== "POST") {
      recordViolation("unexpected-method");
      invalidControl = true;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      recordViolation("unauthenticated-control");
      invalidControl = true;
    }
    if (invalidControl) {
      sendFailure(response, 403);
      return;
    }

    if (path === "/__control/assert-clean") {
      try {
        if (!(await controlBodyIsEmpty(request))) {
          recordViolation("malformed-control");
          sendFailure(response, 400);
          return;
        }
      } catch {
        recordViolation("malformed-control");
        sendFailure(response, 400);
        return;
      }
      if (violationTotal === 0) {
        sendJson(response, 200, { clean: true });
      } else {
        sendJson(response, 409, {
          clean: false,
          total: violationTotal,
          violations: violationSnapshot(),
        });
      }
      return;
    }
    if (path === "/__control/clear-violations") {
      try {
        if (!(await controlBodyIsEmpty(request))) {
          recordViolation("malformed-control");
          sendFailure(response, 400);
          return;
        }
      } catch {
        recordViolation("malformed-control");
        sendFailure(response, 400);
        return;
      }
      violationCounts.clear();
      violationTotal = 0;
      sendJson(response, 200, { clean: true });
      return;
    }
    if (path === "/__control/shutdown-state" || path === "/__control/release-child") {
      try {
        if (!(await controlBodyIsEmpty(request))) {
          recordViolation("malformed-control");
          sendFailure(response, 400);
          return;
        }
      } catch {
        recordViolation("malformed-control");
        sendFailure(response, 400);
        return;
      }
      if (path === "/__control/shutdown-state") {
        sendJson(response, 200, {
          child_shutdown_barrier: childShutdownBarrierReached,
          phase: shutdownPhase,
        });
        return;
      }
      if (
        shutdownPhase !== "waiting-for-web-child" ||
        !childShutdownBarrierReached ||
        webProcess === undefined ||
        !webProcess.connected
      ) {
        recordViolation("malformed-control");
        sendFailure(response, 409);
        return;
      }
      webProcess.send({ operation: "release-shutdown" }, (error) => {
        if (error === null || error === undefined) {
          sendJson(response, 200, { released: true });
        } else {
          recordViolation("malformed-control");
          sendFailure(response, 409);
        }
      });
      return;
    }

    try {
      if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json") {
        throw new Error("control request media type is invalid");
      }
      const body = await readControlBody(request);
      if (
        body === null ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        (body.mode !== "disconnect" && body.mode !== "ready")
      ) {
        recordViolation("malformed-control");
        sendFailure(response, 400);
        return;
      }
      mode = body.mode;
      sendJson(response, 200, { mode });
    } catch {
      recordViolation("malformed-control");
      sendFailure(response, 400);
    }
    return;
  }

  let unexpectedRequest = false;
  const isCataloguePath = apiPathPrefixes.some((prefix) => path.startsWith(prefix));
  if (!apiPaths.has(path) && !isCataloguePath) {
    recordViolation("unexpected-path");
    unexpectedRequest = true;
  }
  if (request.method !== "GET") {
    recordViolation("unexpected-method");
    unexpectedRequest = true;
  }
  if (target.search !== "" && !isCataloguePath) {
    recordViolation("unexpected-query");
    unexpectedRequest = true;
  }
  if (unexpectedRequest) {
    sendFailure(response, 500);
    return;
  }
  if (isCataloguePath) {
    // Catalogue fixture responses are deliberately independent of the
    // status-suite mode: the status suite simulates API downtime through the
    // health/meta endpoints only, while the discovery suite needs these reads
    // always available. Keeping them outside the mode gate removes any
    // cross-suite scheduling race between the two specs.
    respondCatalogue(request, response, target);
    return;
  }
  if (mode === "disconnect") {
    request.socket.destroy();
    return;
  }
  if (path === "/health/live") {
    sendJson(response, 200, { status: "live" });
  } else if (path === "/health/ready") {
    sendJson(response, 200, { status: "ready" });
  } else {
    sendJson(response, 200, {
      api_version: "v1",
      application_name: "Lumina",
      application_version: "e2e-fixture",
      build_commit: null,
      feature_flags: {},
    });
  }
});

stub.on("connection", (socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});
stub.on("clientError", (_error, socket) => socket.destroy());

function listen() {
  return new Promise((resolve, reject) => {
    stub.once("error", reject);
    stub.listen(0, "127.0.0.1", () => {
      stub.off("error", reject);
      resolve();
    });
  });
}

async function closeStub() {
  const serverSettlement = new Promise((resolve, reject) => {
    if (!stub.listening) {
      resolve();
      return;
    }
    stub.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
  const trackedSockets = [...sockets];
  const socketSettlements = trackedSockets.map(
    (socket) =>
      new Promise((resolve) => {
        if (!sockets.has(socket)) {
          resolve();
          return;
        }
        socket.once("close", resolve);
        socket.destroy();
      }),
  );
  await Promise.all([serverSettlement, ...socketSettlements]);
  if (sockets.size !== 0) throw new Error("stub sockets did not settle");
}

function processGroupIsRunning(child) {
  if (child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function signalProcessGroup(child, signal) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitForProcessGroupSettlement(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while ((child.exitCode === null && child.signalCode === null) || processGroupIsRunning(child)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

async function stopWebProcess() {
  if (webProcess === undefined) return;
  if (
    webProcess.exitCode === null ||
    webProcess.signalCode === null ||
    processGroupIsRunning(webProcess)
  ) {
    shutdownPhase = "waiting-for-web-child";
    signalProcessGroup(webProcess, "SIGTERM");
    if (await waitForProcessGroupSettlement(webProcess, 2_500)) return;
    signalProcessGroup(webProcess, "SIGKILL");
    if (await waitForProcessGroupSettlement(webProcess, 2_500)) return;
    throw new Error("web process group did not settle");
  }
}

async function performShutdown() {
  let cleanupFailed = false;
  try {
    await stopWebProcess();
  } catch {
    cleanupFailed = true;
  }
  shutdownPhase = "closing-stub";
  try {
    await closeStub();
  } catch {
    cleanupFailed = true;
  }
  shutdownPhase = "evaluating-violations";
  const hasUnresolvedViolations = violationTotal !== 0;
  try {
    await unlink(coordinationFile);
  } catch (error) {
    if (error?.code !== "ENOENT") cleanupFailed = true;
  }
  shutdownPhase = "settled";
  process.exitCode = requestedExitCode !== 0 || cleanupFailed || hasUnresolvedViolations ? 1 : 0;
}

function shutdown(exitCode = 0) {
  if (exitCode !== 0) requestedExitCode = 1;
  shutdownPromise ??= performShutdown();
  return shutdownPromise;
}

function waitForFixtureChildReady(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => settle(new Error("fixture child did not become ready")), 2_500);
    const onExit = () => settle(new Error("fixture child exited before readiness"));
    const onMessage = (message) => {
      if (message?.operation === "fixture-ready") settle();
    };
    const settle = (error) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("message", onMessage);
      if (error === undefined) resolve();
      else reject(error);
    };
    child.once("exit", onExit);
    child.on("message", onMessage);
  });
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
process.once("uncaughtException", () => void shutdown(1));
process.once("unhandledRejection", () => void shutdown(1));

try {
  await requireProductionBuild();
  await listen();
  const address = stub.address();
  if (address === null || typeof address === "string") throw new Error("stub did not bind TCP");
  const apiOrigin = `http://127.0.0.1:${address.port}`;

  const fixtureScript = `
process.once("SIGTERM", () => process.send?.({ operation: "shutdown-barrier" }));
process.on("message", (message) => {
  if (message?.operation === "release-shutdown") process.exit(0);
});
process.send?.({ operation: "fixture-ready" });
setInterval(() => undefined, 1_000);
`;
  webProcess = shutdownFixture
    ? spawn(process.execPath, ["--input-type=module", "--eval", fixtureScript], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      })
    : spawn("pnpm", ["exec", "next", "start", "--hostname", "127.0.0.1"], {
        detached: true,
        env: { ...process.env, LUMINA_WEB_API_ORIGIN: apiOrigin },
        stdio: "inherit",
      });
  webProcess.on("message", (message) => {
    if (message?.operation === "shutdown-barrier") childShutdownBarrierReached = true;
  });
  webProcess.once("exit", (code, signal) => {
    if (shutdownPhase === "running") void shutdown(code === 0 && signal === null ? 0 : 1);
  });
  webProcess.once("error", () => void shutdown(1));
  if (shutdownFixture) await waitForFixtureChildReady(webProcess);

  const handle = await open(coordinationFile, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify({ apiOrigin, token })}\n`, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
} catch (error) {
  if (error instanceof ProductionBuildRequiredError) {
    process.stderr.write("Lumina E2E requires a production build; run pnpm build.\n");
  }
  await shutdown(1);
}
