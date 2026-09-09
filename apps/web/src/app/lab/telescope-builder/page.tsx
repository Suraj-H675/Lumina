import type { Metadata } from "next";

import { TelescopeBuilderEnhanced } from "../../../components/telescope-builder-enhanced";
import { TelescopeBuilderNoScript } from "../../../components/telescope-builder-no-script";
import {
  DEFAULT_TELESCOPE_BUILDER_STATE,
  decodeTelescopeBuilderState,
  type TelescopeBuilderState,
} from "../../../lib/simulations/telescope-builder";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadTelescopeBuilderCalculation } from "../../../lib/server/telescope-builder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: "/lab/telescope-builder",
  },
  title: "Telescope Builder",
  description:
    "Explore idealized visual-observing telescope, eyepiece, focal modifier, magnification, field, and exit-pupil geometry.",
};

type TelescopeBuilderPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{
  state: TelescopeBuilderState;
  invalid: boolean;
}> {
  const rawState = searchParams.state;
  if (rawState === undefined) return { state: DEFAULT_TELESCOPE_BUILDER_STATE, invalid: false };
  const encoded = Array.isArray(rawState) || rawState.length === 0 ? null : rawState;
  const decoded = encoded === null ? null : decodeTelescopeBuilderState(encoded);
  return decoded === null
    ? { state: DEFAULT_TELESCOPE_BUILDER_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function TelescopeBuilderPage({ searchParams }: TelescopeBuilderPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadTelescopeBuilderCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const stateInvalid = requested.invalid || calculation.kind === "invalid";
  const initialState = stateInvalid ? DEFAULT_TELESCOPE_BUILDER_STATE : requested.state;
  const initialCalculation = calculation.kind === "ok" && !stateInvalid ? calculation.data : null;

  return (
    <>
      <TelescopeBuilderNoScript
        initialCalculation={initialCalculation}
        initialState={initialState}
        initialStateInvalid={stateInvalid}
      />
      <TelescopeBuilderEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={initialState}
        initialStateInvalid={stateInvalid}
      />
    </>
  );
}
