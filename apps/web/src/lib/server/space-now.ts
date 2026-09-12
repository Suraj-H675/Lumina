import "server-only";

import {
  apodEndpoint,
  nearEarthEndpoint,
  requestEndpoint,
  type ApodResponse,
  type ApiTransportResult,
  type NearEarthResponse,
  type TransportOptions,
} from "@lumina/api-client";

import { resolveWebApiOrigin } from "./api-origin";

export type NowApodOutcome =
  Readonly<{ data: ApodResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type NowNearEarthOutcome =
  Readonly<{ data: NearEarthResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type NowApodLoaderOptions = TransportOptions &
  Readonly<{
    environment?: string;
    origin?: string;
  }>;

function transportOptions(options: NowApodLoaderOptions): TransportOptions {
  return {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
}

export async function loadNowApod(options: NowApodLoaderOptions = {}): Promise<NowApodOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result: ApiTransportResult<ApodResponse> = await requestEndpoint(
    configured.origin,
    apodEndpoint,
    transportOptions(options),
  );
  return result.kind === "ok" ? { data: result.data, kind: "ok" } : { kind: "unavailable" };
}

export async function loadNowNearEarth(
  options: NowApodLoaderOptions = {},
): Promise<NowNearEarthOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result: ApiTransportResult<NearEarthResponse> = await requestEndpoint(
    configured.origin,
    nearEarthEndpoint,
    transportOptions(options),
  );
  return result.kind === "ok" ? { data: result.data, kind: "ok" } : { kind: "unavailable" };
}
