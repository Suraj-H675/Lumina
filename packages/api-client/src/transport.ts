import type { ApiEndpoint } from "./contract";
import { validateExactGenerated } from "./contract";

export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export const MAX_RESPONSE_BYTES = 61_440;

export type ApiOriginResult =
  Readonly<{ origin: string; valid: true }> | Readonly<{ valid: false }>;

export type ApiTransportResult<T> =
  | Readonly<{ data: T; kind: "ok"; status: number }>
  | Readonly<{ kind: "http-error"; status: number }>
  | Readonly<{ kind: "malformed-response" }>
  | Readonly<{ kind: "unavailable"; reason: "timeout" | "transport" }>;

export type TransportOptions = Readonly<{
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}>;

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function hasLiteralRootPathOnly(value: string): boolean {
  const schemeAuthority = /^[a-z][a-z0-9+.-]*:\/\//iu.exec(value);
  if (schemeAuthority === null) return false;
  const authorityAndSuffix = value.slice(schemeAuthority[0].length);
  const suffixIndex = authorityAndSuffix.search(/[/?#\\]/u);
  if (suffixIndex === -1) return true;
  return authorityAndSuffix.slice(suffixIndex) === "/";
}

export function normalizeApiOrigin(value: string): ApiOriginResult {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    containsControlCharacter(value) ||
    !hasLiteralRootPathOnly(value)
  ) {
    return { valid: false };
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return { valid: false };
    }
    return { origin: url.origin, valid: true };
  } catch {
    return { valid: false };
  }
}

function isJsonMediaType(value: string | null): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => {
    // Cancellation is best effort; no body content is inspected or surfaced.
  });
}

function declaredBodyIsBounded(response: Response): boolean {
  const declared = response.headers.get("content-length");
  if (declared === null) {
    return true;
  }
  if (!/^(0|[1-9][0-9]*)$/u.test(declared)) {
    return false;
  }
  const length = Number(declared);
  return Number.isSafeInteger(length) && length <= MAX_RESPONSE_BYTES;
}

async function readBoundedText(response: Response, controller: AbortController): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("missing response body");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteCount = 0;
  let text = "";
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      byteCount += chunk.value.byteLength;
      if (byteCount > MAX_RESPONSE_BYTES) {
        throw new Error("response body exceeds limit");
      }
      text += decoder.decode(chunk.value, { stream: true });
      chunk = await reader.read();
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    controller.abort();
    void reader.cancel().catch(() => {
      // The original malformed/timeout classification remains authoritative.
    });
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function requestEndpoint<T>(
  origin: string,
  endpoint: ApiEndpoint<T>,
  options: TransportOptions = {},
): Promise<ApiTransportResult<T>> {
  const normalized = normalizeApiOrigin(origin);
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!normalized.valid || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) {
    return { kind: "unavailable", reason: "transport" };
  }

  const controller = new AbortController();
  const timeoutState = { expired: false };
  const timer = setTimeout(() => {
    timeoutState.expired = true;
    controller.abort();
  }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await (options.fetchImplementation ?? fetch)(
        new URL(endpoint.path, `${normalized.origin}/`),
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          method: endpoint.method,
          redirect: "error",
          signal: controller.signal,
        },
      );
    } catch {
      return { kind: "unavailable", reason: timeoutState.expired ? "timeout" : "transport" };
    }

    if (!response.ok) {
      discardBody(response);
      return { kind: "http-error", status: response.status };
    }
    if (
      !isJsonMediaType(response.headers.get("content-type")) ||
      !declaredBodyIsBounded(response)
    ) {
      controller.abort();
      discardBody(response);
      return { kind: "malformed-response" };
    }

    try {
      const raw: unknown = JSON.parse(await readBoundedText(response, controller));
      const parsed = validateExactGenerated(endpoint.validator, raw);
      return parsed.valid
        ? { data: parsed.data, kind: "ok", status: response.status }
        : { kind: "malformed-response" };
    } catch {
      return timeoutState.expired
        ? { kind: "unavailable", reason: "timeout" }
        : { kind: "malformed-response" };
    }
  } finally {
    clearTimeout(timer);
  }
}
