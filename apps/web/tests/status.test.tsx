import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderStatusResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { StatusView } from "../src/app/status/status-view";
import { resolveWebApiOrigin } from "../src/lib/server/api-origin";
import {
  loadFoundationStatus,
  type FoundationStatus,
  type ProviderStatus,
} from "../src/lib/server/foundation-status";
import { SiteShell } from "../src/components/site-shell";

const origin = "http://127.0.0.1:8765";
const unavailableProvider: ProviderStatus = { kind: "unavailable" };
const availableProvider: ProviderStatus = { kind: "available", data: { providers: [] } };
const staleProviderEntry: ProviderStatusResponse = {
  provider_code: "nasa-exoplanet-archive",
  source_name: "NASA Exoplanet Archive",
  official_documentation_url: "https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html",
  terms_or_licence_url: "https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html",
  attribution_text:
    "This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology.",
  adapter_id: "nasa-exoplanet-archive-tap-count",
  adapter_version: "1",
  source_schema_version: "ps-confirmed-count-v1",
  enabled: true,
  circuit_state: "open",
  cache_state: "stale",
  cache_active: true,
  sync_lease_active: false,
  consecutive_failures: 1,
  last_attempt_at: "2026-09-10T12:00:00Z",
  last_success_at: "2026-09-10T00:00:00Z",
  last_failure_at: "2026-09-10T12:00:00Z",
  last_failure_code: "provider.timeout",
  last_http_status: null,
  last_sync_duration_ms: 10,
  next_sync_at: "2026-09-10T13:00:00Z",
  next_probe_at: "2026-09-10T13:00:00Z",
  cache_fetched_at: "2026-09-10T00:00:00Z",
  cache_fresh_until: "2026-09-10T08:00:00Z",
  cache_stale_until: "2026-09-13T08:00:00Z",
  quarantine_exists: false,
  quarantine_observed_at: null,
  quarantine_failure_code: null,
  quarantine_raw_sha256: null,
  metrics: {
    sync_cycles_started: 2,
    sync_successes: 1,
    sync_upstream_failures: 1,
    http_requests: 4,
    http_retries: 2,
    schema_failures: 0,
    quarantines: 0,
    stale_fallbacks: 1,
    circuit_openings: 1,
    disabled_skips: 0,
    circuit_open_skips: 0,
    concurrent_lease_skips: 0,
  },
};

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
  if (path === "/api/v1/providers/status") return Response.json({ providers: [] });
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
    const url = "https://user:secret@example.test"; // trufflehog:ignore
    expect(resolveWebApiOrigin(undefined, "production")).toEqual({ valid: false });
    expect(resolveWebApiOrigin(url, "production")).toEqual({
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
      provider: availableProvider,
    });
  });

  it("reports not-ready only for readiness HTTP 503 while liveness succeeds", async () => {
    await expect(
      loadFoundationStatus({ fetchImplementation: controlledFetch(503), origin }),
    ).resolves.toEqual({
      kind: "not-ready",
      meta: { api_version: "v1", application_version: "0.0.0" },
      provider: availableProvider,
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
        provider: availableProvider,
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
      provider: availableProvider,
    });
  });

  it("reports unavailable when all independent requests fail", async () => {
    const sentinel = "PRIVATE-TRANSPORT-SENTINEL";
    const status = await loadFoundationStatus({
      fetchImplementation: vi.fn<typeof fetch>().mockRejectedValue(new Error(sentinel)),
      origin,
    });

    expect(status).toEqual({ kind: "unavailable", meta: null, provider: unavailableProvider });
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
      provider: availableProvider,
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
      provider: availableProvider,
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
      provider: availableProvider,
    });
  });

  it("treats invalid or unset production origins as unavailable without fetching", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    await expect(
      loadFoundationStatus({ environment: "production", fetchImplementation }),
    ).resolves.toEqual({
      kind: "unavailable",
      meta: null,
      provider: unavailableProvider,
    });
    await expect(
      loadFoundationStatus({
        environment: "production",
        fetchImplementation,
        origin: "https://user:secret@example.test", // trufflehog:ignore
      }),
    ).resolves.toEqual({
      kind: "unavailable",
      meta: null,
      provider: unavailableProvider,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe("honest status view", () => {
  it.each<FoundationStatus>([
    {
      kind: "ready",
      meta: { api_version: "v1", application_version: "0.0.0" },
      provider: unavailableProvider,
    },
    { kind: "not-ready", meta: null, provider: unavailableProvider },
    { kind: "available-unconfirmed", meta: null, provider: unavailableProvider },
    { kind: "unavailable", meta: null, provider: unavailableProvider },
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
    renderStatus({ kind: "unavailable", meta: null, provider: unavailableProvider });

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/catalog (?:is )?operational|provider (?:is )?operational|dashboard/i);
    expect(text).not.toMatch(/exception|stack trace|postgresql|database url/i);
  });

  it("labels stale provider data and exposes machine-readable timestamps", async () => {
    const { container } = renderStatus({
      kind: "ready",
      meta: { api_version: "v1", application_version: "0.0.0" },
      provider: { kind: "available", data: { providers: [staleProviderEntry] } },
    });

    expect(screen.getByRole("heading", { level: 2, name: "Provider status" })).toBeVisible();
    expect(screen.getByText("Stale", { exact: true })).toBeVisible();
    expect(screen.getByText("Open", { exact: true })).toBeVisible();
    expect(screen.getByText("provider.timeout", { exact: true })).toBeVisible();
    expect(
      screen
        .getAllByRole("time")
        .some((element) => element.getAttribute("dateTime") === "2026-09-10T00:00:00Z"),
    ).toBe(true);
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("keeps enabled expired data distinct from disabled historical data", () => {
    renderStatus({
      kind: "ready",
      meta: null,
      provider: {
        kind: "available",
        data: {
          providers: [
            {
              ...staleProviderEntry,
              cache_state: "expired",
              cache_active: false,
            },
          ],
        },
      },
    });

    expect(screen.getByText("Expired", { exact: true })).toBeVisible();
    expect(screen.queryByText(/historical only while disabled/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Official documentation" })).toHaveClass("min-h-11");
    expect(screen.getByRole("link", { name: "Acknowledgment and usage" })).toHaveClass("min-h-11");
  });

  it("keeps provider failure visible when the status API is unavailable", () => {
    renderStatus({ kind: "ready", meta: null, provider: unavailableProvider });

    expect(screen.getByText("Provider status unavailable.")).toBeVisible();
  });
});
