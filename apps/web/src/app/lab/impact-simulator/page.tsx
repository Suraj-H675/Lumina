import type { Metadata } from "next";

import { ImpactSimulatorEnhanced } from "../../../components/impact-simulator-enhanced";
import { ImpactSimulatorNoScript } from "../../../components/impact-simulator-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadImpactSimulatorCalculation } from "../../../lib/server/impact-simulator";
import {
  DEFAULT_IMPACT_SIMULATOR_STATE,
  decodeImpactSimulatorState,
  type ImpactSimulatorState,
} from "../../../lib/simulations/impact-simulator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/impact-simulator" },
  title: "Impact Simulator",
  description:
    "Explore a deterministic large solid-rock Earth-impact teaching model with Python-owned kinetic energy, crater scaling sensitivity, and lower-bound ejecta thickness radii.",
};

type ImpactSimulatorPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: ImpactSimulatorState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_IMPACT_SIMULATOR_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeImpactSimulatorState(encoded);
  return decoded === null
    ? { state: DEFAULT_IMPACT_SIMULATOR_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function ImpactSimulatorPage({ searchParams }: ImpactSimulatorPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadImpactSimulatorCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <ImpactSimulatorNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <ImpactSimulatorEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
