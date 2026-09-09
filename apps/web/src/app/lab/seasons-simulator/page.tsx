import type { Metadata } from "next";

import { SeasonsSimulatorEnhanced } from "../../../components/seasons-simulator-enhanced";
import { SeasonsSimulatorNoScript } from "../../../components/seasons-simulator-no-script";
import {
  DEFAULT_SEASONS_STATE,
  decodeSeasonsState,
  type SeasonsState,
} from "../../../lib/simulations/seasons-simulator";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadSeasonsCalculation } from "../../../lib/server/seasons-simulator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: "/lab/seasons-simulator",
  },
  title: "Seasons Simulator",
  description:
    "Explore an idealized geometric seasons model: axial tilt, orbital phase, latitude, and a separate eccentricity distance context.",
};

type SeasonsSimulatorPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{
  state: SeasonsState;
  invalid: boolean;
}> {
  const rawState = searchParams.state;
  if (rawState === undefined) return { state: DEFAULT_SEASONS_STATE, invalid: false };
  const encoded = Array.isArray(rawState) || rawState.length === 0 ? null : rawState;
  const decoded = encoded === null ? null : decodeSeasonsState(encoded);
  return decoded === null
    ? { state: DEFAULT_SEASONS_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function SeasonsSimulatorPage({ searchParams }: SeasonsSimulatorPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadSeasonsCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <SeasonsSimulatorNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <SeasonsSimulatorEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
