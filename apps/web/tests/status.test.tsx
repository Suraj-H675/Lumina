import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { StatusView } from "../src/app/status/status-view";
import { resolveWebApiOrigin } from "../src/lib/server/api-origin";
import { loadFoundationStatus, type FoundationStatus } from "../src/lib/server/foundation-status";
import { SiteShell } from "../src/components/site-shell";

const origin = "http://127.0.0.1:8765";

type HarnessCoordination = Readonly<{
  apiOrigin: string;
  token: string;
}>;

async function waitForValue<Value>(
  probe: () => Promise<Value | undefined>,
  failureMessage: string,
  timeoutMs = 5_000,
): Promise<Value> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(failureMessage);
}

async function readHarnessCoordination(path: string): Promise<HarnessCoordination | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<HarnessCoordination>;
    if (typeof parsed.apiOrigin !== "string" || typeof parsed.token !== "string") {
      return undefined;
    }
    return { apiOrigin: parsed.apiOrigin, token: parsed.token };
  } catch {
    return undefined;
  }
}

async function harnessControl(coordination: HarnessCoordination, path: string): Promise<Response> {
  return fetch(`${coordination.apiOrigin}${path}`, {
    headers: { Authorization: `Bearer ${coordination.token}` },
    method: "POST",
  });
}

function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Harness process did not settle.")), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Harness process failed to start."));
    });
  });
}

function apiResponse(path: string, readyStatus = 200): Response {
  if (path === "/health/live") return Response.json({ status: "live" });
  if (path === "/health/ready") {
    return readyStatus === 200
      ? Response.json({ status: "ready" })
      : Response.json({ error: { message: "private database detail" } }, { status: readyStatus });
  }
  if (path === "/api/v1/meta") {
    return Response.json({
      api_version: "v1",
      application_name: "Lumina",
      application_version: "0.0.0",
      build_commit: null,
      feature_flags: {},
    });
  }
  return new Response(null, { status: 404 });
}

function requestPath(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.pathname;
  return new URL(typeof input === "string" ? input : input.url).pathname;
}

function controlledFetch(readyStatus = 200): typeof fetch {
  return vi.fn<typeof fetch>().mockImplementation((input) => {
    const path = requestPath(input);
    return Promise.resolve(apiResponse(path, readyStatus));
  });
}

function renderStatus(status: FoundationStatus) {
  return render(
    <SiteShell>
      <StatusView status={status} />
    </SiteShell>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("server-only API origin", () => {
  it("uses a normalized explicit origin and a development-only default", () => {
    expect(resolveWebApiOrigin("https://API.EXAMPLE.TEST/", "production")).toEqual({
      origin: "https://api.example.test",
      valid: true,
    });
    expect(resolveWebApiOrigin(undefined, "development")).toEqual({
      origin: "http://127.0.0.1:8000",
      valid: true,
    });
  });

  it("fails closed for missing production or invalid configuration", () => {
    expect(resolveWebApiOrigin(undefined, "production")).toEqual({ valid: false });
    expect(resolveWebApiOrigin("https://user:secret@example.test", "production")).toEqual({
      valid: false,
    });
  });
});

describe("status stub harness shutdown", () => {
  it("uses the production Next.js server for E2E", async () => {
    const harnessSource = await readFile(
      join(process.cwd(), "tests/e2e/support/status-stub-harness.mjs"),
      "utf8",
    );

    expect(harnessSource).toMatch(/spawn\("pnpm", \["exec", "next", "start"/);
    expect(harnessSource).not.toContain('"next", "dev"');
  });

  it(
    "records traffic after an earlier clean assertion and fails only after final cleanup",
    { timeout: 15_000 },
    async () => {
      const temporaryDirectory = await mkdtemp(join(tmpdir(), "lumina-stub-shutdown-test-"));
      let harness: ChildProcess | undefined;

      try {
        const coordinationFile = join(temporaryDirectory, "coordination.json");
        const harnessPath = join(process.cwd(), "tests/e2e/support/status-stub-harness.mjs");
        harness = spawn(process.execPath, [harnessPath], {
          env: {
            ...process.env,
            LUMINA_E2E_COORDINATION_FILE: coordinationFile,
            LUMINA_E2E_SHUTDOWN_FIXTURE: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let standardOutput = "";
        let standardError = "";
        harness.stdout?.on("data", (chunk: Buffer) => {
          standardOutput += chunk.toString();
        });
        harness.stderr?.on("data", (chunk: Buffer) => {
          standardError += chunk.toString();
        });

        const coordination = await waitForValue(
          () => readHarnessCoordination(coordinationFile),
          "Harness coordination was not published.",
        );
        expect((await stat(coordinationFile)).mode & 0o077).toBe(0);

        const initiallyClean = await harnessControl(coordination, "/__control/assert-clean");
        expect(initiallyClean.status).toBe(200);
        await initiallyClean.body?.cancel();

        expect(harness.kill("SIGTERM")).toBe(true);
        await waitForValue(async () => {
          try {
            const response = await harnessControl(coordination, "/__control/shutdown-state");
            if (response.status !== 200) {
              await response.body?.cancel();
              return undefined;
            }
            const body = (await response.json()) as {
              child_shutdown_barrier?: unknown;
              phase?: unknown;
            };
            return body.child_shutdown_barrier === true && body.phase === "waiting-for-web-child"
              ? true
              : undefined;
          } catch {
            return undefined;
          }
        }, "Harness child-shutdown barrier was not reached.");

        const lateTraffic = await fetch(`${coordination.apiOrigin}/late-shutdown-request`);
        expect(lateTraffic.status).toBe(500);
        await lateTraffic.body?.cancel();

        const release = await harnessControl(coordination, "/__control/release-child");
        expect(release.status).toBe(200);
        await release.body?.cancel();

        await expect(waitForChildExit(harness, 5_000)).resolves.toEqual({
          code: 1,
          signal: null,
        });
        expect(standardOutput).toBe("");
        expect(standardError).toBe("");

        const coordinationRemoved = await stat(coordinationFile).then(
          () => false,
          () => true,
        );
        expect(coordinationRemoved).toBe(true);
        const listenerClosed = await fetch(coordination.apiOrigin).then(
          () => false,
          () => true,
        );
        expect(listenerClosed).toBe(true);
      } finally {
        if (harness !== undefined && harness.exitCode === null && harness.signalCode === null) {
          harness.kill("SIGTERM");
          try {
            await waitForChildExit(harness, 6_000);
          } catch {
            harness.kill("SIGKILL");
            await waitForChildExit(harness, 2_000).catch(() => undefined);
          }
        }
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );
});

describe("foundation state mapping", () => {
  it("reports ready only after liveness and readiness both succeed", async () => {
    await expect(
      loadFoundationStatus({ fetchImplementation: controlledFetch(), origin }),
    ).resolves.toEqual({
      kind: "ready",
      meta: { api_version: "v1", application_version: "0.0.0" },
    });
  });

  it("reports not-ready only for readiness HTTP 503 while liveness succeeds", async () => {
    await expect(
      loadFoundationStatus({ fetchImplementation: controlledFetch(503), origin }),
    ).resolves.toEqual({
      kind: "not-ready",
      meta: { api_version: "v1", application_version: "0.0.0" },
    });
  });

  it.each([404, 500, 418])(
    "reports available-unconfirmed for readiness HTTP %i",
    async (readinessStatus) => {
      await expect(
        loadFoundationStatus({
          fetchImplementation: controlledFetch(readinessStatus),
          origin,
        }),
      ).resolves.toEqual({
        kind: "available-unconfirmed",
        meta: { api_version: "v1", application_version: "0.0.0" },
      });
    },
  );

  it("reports available-unconfirmed for a malformed readiness 2xx response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestPath(input);
      return Promise.resolve(
        path === "/health/ready" ? Response.json({ status: 42 }) : apiResponse(path),
      );
    });

    await expect(loadFoundationStatus({ fetchImplementation, origin })).resolves.toEqual({
      kind: "available-unconfirmed",
      meta: { api_version: "v1", application_version: "0.0.0" },
    });
  });

  it("reports unavailable when all independent requests fail", async () => {
    const sentinel = "PRIVATE-TRANSPORT-SENTINEL";
    const status = await loadFoundationStatus({
      fetchImplementation: vi.fn<typeof fetch>().mockRejectedValue(new Error(sentinel)),
      origin,
    });

    expect(status).toEqual({ kind: "unavailable", meta: null });
    expect(JSON.stringify(status)).not.toContain(sentinel);
    expect(JSON.stringify(status)).not.toContain(origin);
  });

  it("keeps ready health honest and safe when metadata alone fails", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestPath(input);
      return path === "/api/v1/meta"
        ? Promise.reject(new Error("PRIVATE-META-SENTINEL"))
        : Promise.resolve(apiResponse(path));
    });

    await expect(loadFoundationStatus({ fetchImplementation, origin })).resolves.toEqual({
      kind: "ready",
      meta: null,
    });
  });

  it("reports available-unconfirmed when one bounded health request fails", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestPath(input);
      return path === "/health/ready"
        ? Promise.reject(new Error("PRIVATE-READINESS-SENTINEL"))
        : Promise.resolve(apiResponse(path));
    });

    await expect(loadFoundationStatus({ fetchImplementation, origin })).resolves.toEqual({
      kind: "available-unconfirmed",
      meta: { api_version: "v1", application_version: "0.0.0" },
    });
  });

  it("reports available-unconfirmed when one independent request times out", async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const path = requestPath(input);
      if (path !== "/health/ready") return Promise.resolve(apiResponse(path));
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("private", "AbortError")),
        );
      });
    });
    const status = loadFoundationStatus({ fetchImplementation, origin, timeoutMs: 25 });

    await vi.advanceTimersByTimeAsync(25);

    await expect(status).resolves.toEqual({
      kind: "available-unconfirmed",
      meta: { api_version: "v1", application_version: "0.0.0" },
    });
  });

  it("treats invalid or unset production origins as unavailable without fetching", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    await expect(
      loadFoundationStatus({ environment: "production", fetchImplementation }),
    ).resolves.toEqual({ kind: "unavailable", meta: null });
    await expect(
      loadFoundationStatus({
        environment: "production",
        fetchImplementation,
        origin: "https://user:secret@example.test",
      }),
    ).resolves.toEqual({ kind: "unavailable", meta: null });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe("honest status view", () => {
  it.each<FoundationStatus>([
    { kind: "ready", meta: { api_version: "v1", application_version: "0.0.0" } },
    { kind: "not-ready", meta: null },
    { kind: "available-unconfirmed", meta: null },
    { kind: "unavailable", meta: null },
  ])("renders the $kind state with accessible status text", async (status) => {
    const { container } = renderStatus(status);

    expect(screen.getByRole("heading", { level: 1, name: "Lumina API status" })).toBeVisible();
    expect(screen.getByRole("status")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Return to the Lumina foundation home page" }),
    ).toHaveAttribute("href", "/");
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("makes no catalog, provider, dashboard, or raw-error claims", () => {
    renderStatus({ kind: "unavailable", meta: null });

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/catalog (?:is )?operational|provider (?:is )?operational|dashboard/i);
    expect(text).not.toMatch(/exception|stack trace|postgresql|database url/i);
  });
});
