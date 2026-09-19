import type { Metadata } from "next";

import { OrbitSandboxEnhanced } from "../../../components/orbit-sandbox-enhanced";
import { OrbitSandboxNoScript } from "../../../components/orbit-sandbox-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadOrbitSandboxCalculation } from "../../../lib/server/orbit-sandbox";
import {
  DEFAULT_ORBIT_SANDBOX_STATE,
  decodeOrbitSandboxState,
  type OrbitSandboxState,
} from "../../../lib/simulations/orbit-sandbox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/orbit-sandbox" },
  title: "Orbit Sandbox",
  description:
    "Explore a reviewed deterministic Newtonian two-body model with explicit orbital elements, collision handling, and numerical drift diagnostics.",
};

type OrbitSandboxPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: OrbitSandboxState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_ORBIT_SANDBOX_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeOrbitSandboxState(encoded);
  return decoded === null
    ? { state: DEFAULT_ORBIT_SANDBOX_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function OrbitSandboxPage({ searchParams }: OrbitSandboxPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadOrbitSandboxCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <OrbitSandboxNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <OrbitSandboxEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
