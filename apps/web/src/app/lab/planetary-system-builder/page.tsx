import type { Metadata } from "next";

import { PlanetarySystemBuilderEnhanced } from "../../../components/planetary-system-builder-enhanced";
import { PlanetarySystemBuilderNoScript } from "../../../components/planetary-system-builder-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadPlanetarySystemBuilderCalculation } from "../../../lib/server/planetary-system-builder";
import {
  DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
  decodePlanetarySystemBuilderState,
  type PlanetarySystemBuilderState,
} from "../../../lib/simulations/planetary-system-builder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/planetary-system-builder" },
  title: "Planetary System Builder",
  description:
    "Build a deterministic circular non-interacting planetary system and inspect source-backed Keplerian periods, a conservative reference habitable-zone band, and limited pairwise mutual-Hill spacing diagnostics.",
};

type PlanetarySystemBuilderPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: PlanetarySystemBuilderState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodePlanetarySystemBuilderState(encoded);
  return decoded === null
    ? { state: DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function PlanetarySystemBuilderPage({
  searchParams,
}: PlanetarySystemBuilderPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadPlanetarySystemBuilderCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <PlanetarySystemBuilderNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <PlanetarySystemBuilderEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
