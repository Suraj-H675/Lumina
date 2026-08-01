import "server-only";

import {
  liveEndpoint,
  metaEndpoint,
  readyEndpoint,
  requestEndpoint,
  type ApiTransportResult,
  type LiveResponse,
  type MetaResponse,
  type ReadyResponse,
  type TransportOptions,
} from "@lumina/api-client";

import { resolveWebApiOrigin } from "./api-origin";

type SafeMetaDetails = Pick<MetaResponse, "api_version" | "application_version">;

export type FoundationStatus = Readonly<{
  kind: "available-unconfirmed" | "not-ready" | "ready" | "unavailable";
  meta: SafeMetaDetails | null;
}>;

export type FoundationStatusOptions = TransportOptions &
  Readonly<{
    environment?: string;
    origin?: string;
  }>;

function isConfirmedLive(result: ApiTransportResult<LiveResponse>): boolean {
  return result.kind === "ok" && result.data.status === "live";
}

function isConfirmedReady(result: ApiTransportResult<ReadyResponse>): boolean {
  return result.kind === "ok" && result.data.status === "ready";
}

function provesAvailability(result: ApiTransportResult<unknown>): boolean {
  return result.kind !== "unavailable";
}

export async function loadFoundationStatus(
  options: FoundationStatusOptions = {},
): Promise<FoundationStatus> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable", meta: null };

  const transportOptions: TransportOptions = {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
  const [live, ready, meta] = await Promise.all([
    requestEndpoint(configured.origin, liveEndpoint, transportOptions),
    requestEndpoint(configured.origin, readyEndpoint, transportOptions),
    requestEndpoint(configured.origin, metaEndpoint, transportOptions),
  ]);
  const metaDetails: SafeMetaDetails | null =
    meta.kind === "ok"
      ? { api_version: meta.data.api_version, application_version: meta.data.application_version }
      : null;

  if (isConfirmedLive(live) && isConfirmedReady(ready)) {
    return { kind: "ready", meta: metaDetails };
  }
  if (ready.kind === "http-error" && ready.status === 503) {
    return { kind: "not-ready", meta: metaDetails };
  }
  if ([live, ready, meta].some(provesAvailability)) {
    return { kind: "available-unconfirmed", meta: metaDetails };
  }
  return { kind: "unavailable", meta: null };
}
