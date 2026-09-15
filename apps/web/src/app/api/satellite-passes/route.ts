import {
  MAX_REQUEST_BYTES,
  requestJsonEndpoint,
  satellitePassEndpoint,
  type SatellitePassRequest,
} from "@lumina/api-client";

import { resolveWebApiOrigin } from "../../../lib/server/api-origin";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

function fixedError(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), { headers: JSON_HEADERS, status });
}

function isJsonRequest(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(0|[1-9][0-9]*)$/u.test(declared)) return null;
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > MAX_REQUEST_BYTES) return null;
  }
  const reader = request.body?.getReader();
  if (reader === undefined) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      bytes += chunk.value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) return null;
      text += decoder.decode(chunk.value, { stream: true });
      chunk = await reader.read();
    }
    text += decoder.decode();
    return text;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isJsonRequest(request)) return fixedError(415, "request.content_type_invalid");
  const raw = await readBoundedBody(request);
  if (raw === null) return fixedError(413, "request.body_invalid");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fixedError(400, "request.json_invalid");
  }

  const configured = resolveWebApiOrigin();
  if (!configured.valid) return fixedError(503, "satellites.unavailable");
  const result = await requestJsonEndpoint(
    configured.origin,
    satellitePassEndpoint,
    body as SatellitePassRequest,
  );
  if (result.kind === "ok") {
    return new Response(JSON.stringify(result.data), { headers: JSON_HEADERS, status: 200 });
  }
  if (result.kind === "invalid-request") return fixedError(422, "request.validation_failed");
  if (result.kind === "http-error" && [404, 422, 503].includes(result.status)) {
    return fixedError(result.status, `satellites.backend_${result.status}`);
  }
  return fixedError(503, "satellites.unavailable");
}
