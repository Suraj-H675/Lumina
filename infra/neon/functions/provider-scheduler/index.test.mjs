import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "./index.mjs";

const PATH_TOKEN = "a".repeat(64);
const DOWNSTREAM_TOKEN = "b".repeat(64);
const SCHEDULED_BODY = JSON.stringify({
  data: { scheduled_at: "2026-09-27T18:00:00Z" },
});

function request(path, { invocation = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (invocation) headers["x-neon-trigger-invocation-id"] = "fixture-invocation";
  return new Request(`https://scheduler.example${path}`, {
    method: "POST",
    headers,
    body: SCHEDULED_BODY,
  });
}

function runtime(fetchImpl = async () => new Response("{}", { status: 500 })) {
  return {
    env: {
      LUMINA_NEON_TRIGGER_PATH_TOKEN: PATH_TOKEN,
      LUMINA_PROVIDER_TRIGGER_TOKEN: DOWNSTREAM_TOKEN,
    },
    fetchImpl,
  };
}

test("rejects non-trigger requests before downstream access", async () => {
  let called = false;
  const response = await handleRequest(
    request(`/${PATH_TOKEN}/noaa-swpc`, { invocation: false }),
    runtime(async () => {
      called = true;
      return new Response();
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("rejects wrong private path and unknown providers", async () => {
  assert.equal(
    (await handleRequest(request(`/${"c".repeat(64)}/noaa-swpc`), runtime())).status,
    404,
  );
  assert.equal(
    (await handleRequest(request(`/${PATH_TOKEN}/unknown-provider`), runtime())).status,
    404,
  );
});

test("invokes only the fixed Lumina sync endpoint with private authorization", async () => {
  let observed;
  const response = await handleRequest(
    request(`/${PATH_TOKEN}/noaa-swpc`),
    runtime(async (url, init) => {
      observed = { url, init };
      return Response.json({ provider_code: "noaa-swpc", outcome: "success" });
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(observed.url, "https://nova-lumina.vercel.app/api/v1/providers/internal-sync");
  assert.equal(observed.init.method, "POST");
  assert.equal(observed.init.headers.Authorization, `Bearer ${DOWNSTREAM_TOKEN}`);
  assert.equal(observed.init.headers["X-Lumina-Provider-Code"], "noaa-swpc");
  assert.deepEqual(await response.json(), {
    provider_code: "noaa-swpc",
    outcome: "success",
    scheduled_at: "2026-09-27T18:00:00Z",
  });
});

test("surfaces handled failure outcomes as scheduler failures", async () => {
  const response = await handleRequest(
    request(`/${PATH_TOKEN}/noaa-swpc`),
    runtime(async () => Response.json({ provider_code: "noaa-swpc", outcome: "upstream_failure" })),
  );

  assert.equal(response.status, 502);
  assert.equal((await response.json()).outcome, "upstream_failure");
});
