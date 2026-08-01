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

function sendJson(response, status, body) {
  const content = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
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
  if (!apiPaths.has(path)) {
    recordViolation("unexpected-path");
    unexpectedRequest = true;
  }
  if (request.method !== "GET") {
    recordViolation("unexpected-method");
    unexpectedRequest = true;
  }
  if (target.search !== "") {
    recordViolation("unexpected-query");
    unexpectedRequest = true;
  }
  if (unexpectedRequest) {
    sendFailure(response, 500);
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
