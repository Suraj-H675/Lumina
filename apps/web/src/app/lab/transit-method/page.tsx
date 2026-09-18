import type { Metadata } from "next";

import { TransitMethodEnhanced } from "../../../components/transit-method-enhanced";
import { TransitMethodNoScript } from "../../../components/transit-method-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadTransitMethodCalculation } from "../../../lib/server/transit-method";
import {
  DEFAULT_TRANSIT_METHOD_STATE,
  decodeTransitMethodState,
  type TransitMethodState,
} from "../../../lib/simulations/transit-method";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/transit-method" },
  title: "Transit Method Lab",
  description:
    "Explore a deterministic circular-orbit exoplanet transit model with exact uniform-source overlap, contact durations, and explicit limitations.",
};

type TransitMethodPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: TransitMethodState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_TRANSIT_METHOD_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeTransitMethodState(encoded);
  return decoded === null
    ? { state: DEFAULT_TRANSIT_METHOD_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function TransitMethodPage({ searchParams }: TransitMethodPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadTransitMethodCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <TransitMethodNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <TransitMethodEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
