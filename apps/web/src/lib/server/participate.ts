import "server-only";

import {
  participateEndpoint,
  requestEndpoint,
  type ApiTransportResult,
  type ParticipateResponse,
  type TransportOptions,
} from "@lumina/api-client";

import { resolveWebApiOrigin } from "./api-origin";

export type ParticipateOutcome =
  Readonly<{ data: ParticipateResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type ParticipateLoaderOptions = TransportOptions &
  Readonly<{
    environment?: string;
    origin?: string;
  }>;

export async function loadParticipate(
  options: ParticipateLoaderOptions = {},
): Promise<ParticipateOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result: ApiTransportResult<ParticipateResponse> = await requestEndpoint(
    configured.origin,
    participateEndpoint,
    {
      ...(options.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: options.fetchImplementation }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    },
  );
  return result.kind === "ok" ? { data: result.data, kind: "ok" } : { kind: "unavailable" };
}
