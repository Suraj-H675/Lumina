import { timingSafeEqual } from "node:crypto";

const LUMINA_SYNC_URL = "https://nova-lumina.vercel.app/api/v1/providers/internal-sync";
const PROVIDERS = new Set([
  "celestrak-gp",
  "launch-library-2",
  "nasa-apod",
  "nasa-exoplanet-archive",
  "nasa-neows",
  "noaa-swpc",
  "zooniverse-panoptes",
]);
const HANDLED_OUTCOMES = new Set([
  "already_running",
  "circuit_open",
  "disabled",
  "not_due",
  "stale_fallback",
  "success",
]);
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const MAX_TRIGGER_BODY_BYTES = 4096;
const MAX_LUMINA_RESPONSE_BYTES = 4096;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sameToken(left, right) {
  if (!TOKEN_PATTERN.test(left) || !TOKEN_PATTERN.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "ascii"), Buffer.from(right, "ascii"));
}

async function boundedText(response, maximumBytes) {
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > maximumBytes) {
    throw new Error("bounded response exceeded");
  }
  return body;
}

function validScheduledAt(value) {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

export async function handleRequest(request, { env = process.env, fetchImpl = fetch } = {}) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!request.headers.get("x-neon-trigger-invocation-id")) {
    return json(403, { error: "trigger_required" });
  }

  const pathToken = env.LUMINA_NEON_TRIGGER_PATH_TOKEN ?? "";
  const downstreamToken = env.LUMINA_PROVIDER_TRIGGER_TOKEN ?? "";
  if (!TOKEN_PATTERN.test(pathToken) || !TOKEN_PATTERN.test(downstreamToken)) {
    return json(503, { error: "scheduler_not_configured" });
  }

  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  if (
    segments.length !== 2 ||
    !sameToken(segments[0] ?? "", pathToken) ||
    !PROVIDERS.has(segments[1] ?? "")
  ) {
    return json(404, { error: "not_found" });
  }
  const provider = segments[1];

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_TRIGGER_BODY_BYTES)
  ) {
    return json(413, { error: "body_too_large" });
  }
  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, "utf8") > MAX_TRIGGER_BODY_BYTES) {
    return json(413, { error: "body_too_large" });
  }

  let triggerPayload;
  try {
    triggerPayload = JSON.parse(bodyText);
  } catch {
    return json(400, { error: "invalid_trigger_payload" });
  }
  if (!validScheduledAt(triggerPayload?.data?.scheduled_at)) {
    return json(400, { error: "invalid_trigger_payload" });
  }

  try {
    const response = await fetchImpl(LUMINA_SYNC_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${downstreamToken}`,
        "User-Agent": "Nova-Lumina Neon provider scheduler",
        "X-Lumina-Provider-Code": provider,
      },
      signal: AbortSignal.timeout(100_000),
    });
    const responseText = await boundedText(response, MAX_LUMINA_RESPONSE_BYTES);
    if (!response.ok) throw new Error("downstream request failed");

    const payload = JSON.parse(responseText);
    if (payload?.provider_code !== provider || typeof payload?.outcome !== "string") {
      throw new Error("downstream response invalid");
    }
    const status = HANDLED_OUTCOMES.has(payload.outcome) ? 200 : 502;
    return json(status, {
      provider_code: provider,
      outcome: payload.outcome,
      scheduled_at: triggerPayload.data.scheduled_at,
    });
  } catch {
    console.error("Nova-Lumina provider scheduler invocation failed", {
      provider_code: provider,
    });
    return json(502, { error: "provider_sync_failed", provider_code: provider });
  }
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
};
