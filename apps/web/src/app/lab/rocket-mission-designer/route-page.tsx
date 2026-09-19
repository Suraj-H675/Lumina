import type { Metadata } from "next";

import { RocketMissionDesignerEnhanced } from "../../../components/rocket-mission-designer-enhanced";
import { RocketMissionDesignerNoScript } from "../../../components/rocket-mission-designer-no-script";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadRocketMissionDesignerCalculation } from "../../../lib/server/rocket-mission-designer";
import {
  DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
  decodeRocketMissionDesignerState,
  type RocketMissionDesignerState,
} from "../../../lib/simulations/rocket-mission-designer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/lab/rocket-mission-designer" },
  title: "Rocket / Mission Designer",
  description:
    "Explore a deterministic ideal staged-rocket teaching model with Python-owned delta-v, surface-gravity TWR references, payload sensitivity, mass fractions, and carefully bounded velocity-reference comparisons.",
};

type RocketMissionDesignerPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: RocketMissionDesignerState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_ROCKET_MISSION_DESIGNER_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeRocketMissionDesignerState(encoded);
  return decoded === null
    ? { state: DEFAULT_ROCKET_MISSION_DESIGNER_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function RocketMissionDesignerPage({
  searchParams,
}: RocketMissionDesignerPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadRocketMissionDesignerCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <RocketMissionDesignerNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
      <RocketMissionDesignerEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
      />
    </>
  );
}
