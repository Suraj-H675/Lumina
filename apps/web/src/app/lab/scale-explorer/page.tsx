import type { Metadata } from "next";

import { ScaleExplorerEnhanced } from "../../../components/scale-explorer-enhanced";
import { ScaleExplorerNoScript } from "../../../components/scale-explorer-no-script";
import { DEFAULT_SCALE_EXPLORER_STATE } from "../../../lib/simulations/scale-explorer";

export const metadata: Metadata = {
  alternates: {
    canonical: "/lab/scale-explorer",
  },
  title: "Scale Explorer",
  description:
    "Move through a curated logarithmic scale of astronomical characteristic sizes, with sources and model limits included.",
};

export default function ScaleExplorerPage() {
  return (
    <>
      <ScaleExplorerNoScript
        initialState={DEFAULT_SCALE_EXPLORER_STATE}
        initialStateInvalid={false}
      />
      <ScaleExplorerEnhanced
        initialState={DEFAULT_SCALE_EXPLORER_STATE}
        initialStateInvalid={false}
      />
    </>
  );
}
