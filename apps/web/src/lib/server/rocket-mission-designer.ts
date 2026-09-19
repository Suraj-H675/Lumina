import "server-only";

import {
  requestEndpoint,
  type RocketMissionDesignerCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  rocketMissionDesignerRequestEndpoint,
  validateRocketMissionDesignerCalculationResult,
  type RocketMissionDesignerState,
} from "../simulations/rocket-mission-designer";
import { resolveWebApiOrigin } from "./api-origin";

export type RocketMissionDesignerCalculationOutcome =
  | Readonly<{ data: RocketMissionDesignerCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type RocketMissionDesignerLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadRocketMissionDesignerCalculation(
  state: RocketMissionDesignerState,
  options: RocketMissionDesignerLoaderOptions = {},
): Promise<RocketMissionDesignerCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(
    configured.origin,
    rocketMissionDesignerRequestEndpoint(state),
    {
      ...(options.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: options.fetchImplementation }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    },
  );
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateRocketMissionDesignerCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
