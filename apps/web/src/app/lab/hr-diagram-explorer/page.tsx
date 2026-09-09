import type { Metadata } from "next";

import { HRDiagramExplorerEnhancedLoader } from "../../../components/hr-diagram-explorer-enhanced-loader";
import { HRDiagramExplorerNoScript } from "../../../components/hr-diagram-explorer-no-script";
import {
  DEFAULT_HR_DIAGRAM_STATE,
  decodeHRDiagramState,
  type HRDiagramState,
} from "../../../lib/simulations/hr-diagram-explorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: "/lab/hr-diagram-explorer",
  },
  title: "H-R Diagram Explorer",
  description:
    "Explore a curated Gaia DR3 stellar sample across physical H-R and Gaia colour–magnitude views.",
};

type HRDiagramExplorerPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{
  state: HRDiagramState;
  invalid: boolean;
}> {
  const rawState = searchParams.state;
  if (rawState === undefined) return { state: DEFAULT_HR_DIAGRAM_STATE, invalid: false };
  const encoded = Array.isArray(rawState) || rawState.length === 0 ? null : rawState;
  const decoded = encoded === null ? null : decodeHRDiagramState(encoded);
  return decoded === null
    ? { state: DEFAULT_HR_DIAGRAM_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function HRDiagramExplorerPage({ searchParams }: HRDiagramExplorerPageProps) {
  const requested = stateFromSearchParams(await searchParams);

  return (
    <>
      <HRDiagramExplorerNoScript
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <HRDiagramExplorerEnhancedLoader
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
