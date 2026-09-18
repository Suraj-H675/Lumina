import type { Metadata } from "next";

import { RadialVelocityEnhanced } from "../../../components/radial-velocity-enhanced";
import { RadialVelocityNoScript } from "../../../components/radial-velocity-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadRadialVelocityCalculation } from "../../../lib/server/radial-velocity";
import {
  DEFAULT_RADIAL_VELOCITY_STATE,
  decodeRadialVelocityState,
  type RadialVelocityState,
} from "../../../lib/simulations/radial-velocity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/radial-velocity" },
  title: "Radial Velocity Lab",
  description:
    "Explore deterministic Keplerian stellar reflex velocity, inclination degeneracy, and exact spectroscopic mass-function limits.",
};

type RadialVelocityPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: RadialVelocityState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_RADIAL_VELOCITY_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeRadialVelocityState(encoded);
  return decoded === null
    ? { state: DEFAULT_RADIAL_VELOCITY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function RadialVelocityPage({ searchParams }: RadialVelocityPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadRadialVelocityCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <RadialVelocityNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <RadialVelocityEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
