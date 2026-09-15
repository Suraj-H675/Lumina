import "server-only";

import {
  apodEndpoint,
  launchDetailEndpoint,
  launchesEndpoint,
  nearEarthEndpoint,
  satellitesEndpoint,
  spaceWeatherEndpoint,
  requestEndpoint,
  type ApodResponse,
  type ApiTransportResult,
  type LaunchDetailResponse,
  type LaunchListResponse,
  type NearEarthResponse,
  type SatelliteListResponse,
  type SpaceWeatherResponse,
  type TransportOptions,
} from "@lumina/api-client";

import { resolveWebApiOrigin } from "./api-origin";

export type NowApodOutcome =
  Readonly<{ data: ApodResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type NowLaunchesOutcome =
  Readonly<{ data: LaunchListResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type NowLaunchDetailOutcome =
  | Readonly<{ data: LaunchDetailResponse; kind: "ok" }>
  | Readonly<{ kind: "not-found" }>
  | Readonly<{ kind: "unavailable" }>;

export type NowNearEarthOutcome =
  Readonly<{ data: NearEarthResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type NowSatellitesOutcome =
  Readonly<{ data: SatelliteListResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type NowSpaceWeatherOutcome =
  Readonly<{ data: SpaceWeatherResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

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

export async function loadNowLaunches(
  options: NowApodLoaderOptions = {},
): Promise<NowLaunchesOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result: ApiTransportResult<LaunchListResponse> = await requestEndpoint(
    configured.origin,
    launchesEndpoint,
    transportOptions(options),
  );
  return result.kind === "ok" ? { data: result.data, kind: "ok" } : { kind: "unavailable" };
}

export async function loadNowLaunch(
  launchId: string,
  options: NowApodLoaderOptions = {},
): Promise<NowLaunchDetailOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result: ApiTransportResult<LaunchDetailResponse> = await requestEndpoint(
    configured.origin,
    launchDetailEndpoint(launchId),
    transportOptions(options),
  );
  if (result.kind === "ok") return { data: result.data, kind: "ok" };
  if (result.kind === "http-error" && result.status === 404) return { kind: "not-found" };
  return { kind: "unavailable" };
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

export async function loadNowSatellites(
  options: NowApodLoaderOptions = {},
): Promise<NowSatellitesOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result: ApiTransportResult<SatelliteListResponse> = await requestEndpoint(
    configured.origin,
    satellitesEndpoint,
    transportOptions(options),
  );
  return result.kind === "ok" ? { data: result.data, kind: "ok" } : { kind: "unavailable" };
}

export async function loadNowSpaceWeather(
  options: NowApodLoaderOptions = {},
): Promise<NowSpaceWeatherOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result: ApiTransportResult<SpaceWeatherResponse> = await requestEndpoint(
    configured.origin,
    spaceWeatherEndpoint,
    transportOptions(options),
  );
  return result.kind === "ok" ? { data: result.data, kind: "ok" } : { kind: "unavailable" };
}
