import type { Metadata } from "next";

import { BlackHoleRelativityEnhanced } from "../../../components/black-hole-relativity-enhanced";
import { BlackHoleRelativityNoScript } from "../../../components/black-hole-relativity-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadBlackHoleRelativityCalculation } from "../../../lib/server/black-hole-relativity";
import {
  DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
  decodeBlackHoleRelativityState,
  type BlackHoleRelativityState,
} from "../../../lib/simulations/black-hole-relativity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/black-hole-relativity" },
  title: "Black-Hole / Relativity Lab",
  description:
    "Explore a deterministic Schwarzschild teaching model with Python-owned event-horizon, photon-sphere, ISCO, static-clock, and gravitational-redshift calculations.",
};

type BlackHoleRelativityPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: BlackHoleRelativityState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_BLACK_HOLE_RELATIVITY_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeBlackHoleRelativityState(encoded);
  return decoded === null
    ? { state: DEFAULT_BLACK_HOLE_RELATIVITY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function BlackHoleRelativityPage({
  searchParams,
}: BlackHoleRelativityPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadBlackHoleRelativityCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <BlackHoleRelativityNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <BlackHoleRelativityEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
