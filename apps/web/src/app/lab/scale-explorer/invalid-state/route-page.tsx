import type { Metadata } from "next";

import { ScaleExplorerEnhanced } from "../../../../components/scale-explorer-enhanced";
import { ScaleExplorerNoScript } from "../../../../components/scale-explorer-no-script";
import { DEFAULT_SCALE_EXPLORER_STATE } from "../../../../lib/simulations/scale-explorer";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Invalid Scale Explorer state",
  description: "A safe fallback for an invalid Scale Explorer share state.",
};

export default function InvalidScaleExplorerStatePage() {
  return (
    <>
      <ScaleExplorerNoScript
        initialState={DEFAULT_SCALE_EXPLORER_STATE}
        initialStateInvalid={true}
      />
      <ScaleExplorerEnhanced
        initialState={DEFAULT_SCALE_EXPLORER_STATE}
        initialStateInvalid={true}
      />
    </>
  );
}
