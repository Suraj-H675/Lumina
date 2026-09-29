import "server-only";

import { requestEndpoint, type ApiEndpoint, type TransportOptions } from "@nova-lumina/api-client";

import { resolveWebApiOrigin } from "./api-origin";

export type SimulationCalculationOutcome<Response> =
  Readonly<{ data: Response; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type SimulationLoaderOptions = TransportOptions &
  Readonly<{
    environment?: string;
    origin?: string;
  }>;

function transportOptions(options: SimulationLoaderOptions): TransportOptions {
  return {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
}

export async function loadSimulationCalculation<State, Response>(
  state: State,
  options: SimulationLoaderOptions,
  endpointForState: (state: State) => ApiEndpoint<Response>,
  validateResult: (state: State, result: unknown) => Response | null,
): Promise<SimulationCalculationOutcome<Response>> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result = await requestEndpoint(
    configured.origin,
    endpointForState(state),
    transportOptions(options),
  );
  if (result.kind !== "ok") return { kind: "unavailable" };

  const validated = validateResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
