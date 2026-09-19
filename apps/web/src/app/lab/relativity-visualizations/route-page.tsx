import type { Metadata } from "next";

import { RelativityVisualizationsEnhanced } from "../../../components/relativity-visualizations-enhanced";
import { RelativityVisualizationsNoScript } from "../../../components/relativity-visualizations-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadRelativityVisualizationsCalculation } from "../../../lib/server/relativity-visualizations";
import {
  DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
  decodeRelativityVisualizationsState,
  type RelativityVisualizationsState,
} from "../../../lib/simulations/relativity-visualizations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/relativity-visualizations" },
  title: "Relativity Visualizations",
  description:
    "Explore Python-owned one-dimensional special-relativity time dilation, length contraction, simultaneity, and reviewed light-cone teaching geometry.",
};

type RelativityVisualizationsPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: RelativityVisualizationsState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_RELATIVITY_VISUALIZATIONS_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeRelativityVisualizationsState(encoded);
  return decoded === null
    ? { state: DEFAULT_RELATIVITY_VISUALIZATIONS_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function RelativityVisualizationsPage({
  searchParams,
}: RelativityVisualizationsPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadRelativityVisualizationsCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <RelativityVisualizationsNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <RelativityVisualizationsEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
