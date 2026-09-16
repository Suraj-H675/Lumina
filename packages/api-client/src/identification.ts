import type {
  IdentificationCreateResponse,
  IdentificationSolutionResponse,
  IdentificationStatusResponse,
} from "./generated/types.gen";
import {
  zGetIdentificationSolutionResponse,
  zIdentificationCreateResponse,
  zIdentificationStatusResponse,
} from "./generated/zod.gen";
import { validateExactGenerated } from "./contract";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  normalizeApiOrigin,
  type ApiTransportResult,
  type TransportOptions,
} from "./transport";

export const IDENTIFICATION_UPLOAD_TIMEOUT_MS = 30_000;
export const IDENTIFICATION_SOLUTION_MAX_RESPONSE_BYTES = 1_048_576;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type UploadOptions = Readonly<{
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

function isJsonMediaType(value: string | null): boolean {
  return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function declaredBodyIsBounded(response: Response, maximumBytes: number): boolean {
  const declared = response.headers.get("content-length");
  if (declared === null) return true;
  if (!/^(0|[1-9][0-9]*)$/u.test(declared)) return false;
  const length = Number(declared);
  return Number.isSafeInteger(length) && length <= maximumBytes;
}

async function readBoundedJson(
  response: Response,
  controller: AbortController,
  maximumBytes: number,
): Promise<unknown> {
  if (
    !isJsonMediaType(response.headers.get("content-type")) ||
    !declaredBodyIsBounded(response, maximumBytes)
  ) {
    throw new Error("response metadata invalid");
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("missing response body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) throw new Error("response too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    controller.abort();
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function timeoutValue(value: number | undefined, maximum: number): number | null {
  const resolved = value ?? maximum;
  return Number.isInteger(resolved) && resolved >= 1 && resolved <= maximum ? resolved : null;
}

async function runTimed<T>(
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
  operation: (signal: AbortSignal, controller: AbortController) => Promise<T>,
): Promise<Readonly<{ value: T }> | Readonly<{ timedOut: boolean }>> {
  const controller = new AbortController();
  let timedOut = false;
  const abortExternal = () => {
    controller.abort();
  };
  externalSignal?.addEventListener("abort", abortExternal, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    try {
      return { value: await operation(controller.signal, controller) };
    } catch {
      return { timedOut };
    }
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortExternal);
  }
}

export async function createIdentificationSubmission(
  origin: string,
  file: Blob,
  filename: string,
  options: UploadOptions = {},
): Promise<ApiTransportResult<IdentificationCreateResponse>> {
  const normalized = normalizeApiOrigin(origin);
  const timeoutMs = timeoutValue(options.timeoutMs, IDENTIFICATION_UPLOAD_TIMEOUT_MS);
  if (
    !normalized.valid ||
    timeoutMs === null ||
    !(file instanceof Blob) ||
    typeof filename !== "string" ||
    filename.length === 0
  ) {
    return { kind: "unavailable", reason: "transport" };
  }
  const body = new FormData();
  body.append("file", file, filename);
  body.append("consent_remote_processing", "false");
  const outcome = await runTimed(timeoutMs, options.signal, async (signal, controller) => {
    const response = await (options.fetchImplementation ?? fetch)(
      new URL("/api/v1/identification/submissions", `${normalized.origin}/`),
      {
        body,
        cache: "no-store",
        headers: { Accept: "application/json" },
        method: "POST",
        redirect: "error",
        signal,
      },
    );
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return { kind: "http-error", status: response.status } as const;
    }
    try {
      const raw = await readBoundedJson(response, controller, MAX_RESPONSE_BYTES);
      const parsed = validateExactGenerated(zIdentificationCreateResponse, raw);
      return parsed.valid
        ? ({ data: parsed.data, kind: "ok", status: response.status } as const)
        : ({ kind: "malformed-response" } as const);
    } catch {
      if (signal.aborted) throw new Error("request aborted");
      return { kind: "malformed-response" } as const;
    }
  });
  return "value" in outcome
    ? outcome.value
    : { kind: "unavailable", reason: outcome.timedOut ? "timeout" : "transport" };
}

export async function getIdentificationSolution(
  origin: string,
  submissionId: string,
  cursor: string | null = null,
  options: TransportOptions = {},
): Promise<ApiTransportResult<IdentificationSolutionResponse>> {
  const normalized = normalizeApiOrigin(origin);
  const timeoutMs = timeoutValue(options.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  if (
    !normalized.valid ||
    timeoutMs === null ||
    !UUID_V4.test(submissionId) ||
    (cursor !== null && (!/^[A-Za-z0-9_-]{1,512}$/u.test(cursor) || cursor.length > 512))
  ) {
    return { kind: "unavailable", reason: "transport" };
  }
  const url = new URL(
    `/api/v1/identification/submissions/${submissionId}/solution`,
    `${normalized.origin}/`,
  );
  if (cursor !== null) url.searchParams.set("cursor", cursor);
  const outcome = await runTimed(timeoutMs, options.signal, async (signal, controller) => {
    const response = await (options.fetchImplementation ?? fetch)(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      method: "GET",
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return { kind: "http-error", status: response.status } as const;
    }
    try {
      const raw = await readBoundedJson(
        response,
        controller,
        IDENTIFICATION_SOLUTION_MAX_RESPONSE_BYTES,
      );
      const parsed = validateExactGenerated(zGetIdentificationSolutionResponse, raw);
      return parsed.valid
        ? ({ data: parsed.data, kind: "ok", status: response.status } as const)
        : ({ kind: "malformed-response" } as const);
    } catch {
      if (signal.aborted) throw new Error("request aborted");
      return { kind: "malformed-response" } as const;
    }
  });
  return "value" in outcome
    ? outcome.value
    : { kind: "unavailable", reason: outcome.timedOut ? "timeout" : "transport" };
}

export async function deleteIdentificationSubmission(
  origin: string,
  submissionId: string,
  options: TransportOptions = {},
): Promise<ApiTransportResult<null>> {
  const normalized = normalizeApiOrigin(origin);
  const timeoutMs = timeoutValue(options.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  if (!normalized.valid || timeoutMs === null || !UUID_V4.test(submissionId)) {
    return { kind: "unavailable", reason: "transport" };
  }
  const outcome = await runTimed(timeoutMs, options.signal, async (signal) => {
    const response = await (options.fetchImplementation ?? fetch)(
      new URL(`/api/v1/identification/submissions/${submissionId}`, `${normalized.origin}/`),
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        method: "DELETE",
        redirect: "error",
        signal,
      },
    );
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return { kind: "http-error", status: response.status } as const;
    }
    if (response.status !== 204) {
      void response.body?.cancel().catch(() => undefined);
      return { kind: "malformed-response" } as const;
    }
    const length = response.headers.get("content-length");
    if (length !== null && length !== "0") {
      void response.body?.cancel().catch(() => undefined);
      return { kind: "malformed-response" } as const;
    }
    return { data: null, kind: "ok", status: 204 } as const;
  });
  return "value" in outcome
    ? outcome.value
    : { kind: "unavailable", reason: outcome.timedOut ? "timeout" : "transport" };
}

export function validateIdentificationStatus(value: unknown): IdentificationStatusResponse | null {
  const parsed = validateExactGenerated(zIdentificationStatusResponse, value);
  return parsed.valid ? parsed.data : null;
}
