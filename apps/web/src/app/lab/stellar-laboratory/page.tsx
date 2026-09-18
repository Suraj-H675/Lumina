import type { Metadata } from "next";

import { StellarLaboratoryEnhanced } from "../../../components/stellar-laboratory-enhanced";
import { StellarLaboratoryNoScript } from "../../../components/stellar-laboratory-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadStellarLaboratoryCalculation } from "../../../lib/server/stellar-laboratory";
import {
  DEFAULT_STELLAR_LABORATORY_STATE,
  decodeStellarLaboratoryState,
  type StellarLaboratoryState,
} from "../../../lib/simulations/stellar-laboratory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/stellar-laboratory" },
  title: "Stellar Laboratory",
  description:
    "Explore a source-backed approximate main-sequence mapping from stellar mass to typical luminosity, radius, temperature, lifetime, colour anchor, and broad remnant outcome.",
};

type StellarLaboratoryPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: StellarLaboratoryState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_STELLAR_LABORATORY_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeStellarLaboratoryState(encoded);
  return decoded === null
    ? { state: DEFAULT_STELLAR_LABORATORY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function StellarLaboratoryPage({ searchParams }: StellarLaboratoryPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadStellarLaboratoryCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <StellarLaboratoryNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <StellarLaboratoryEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
