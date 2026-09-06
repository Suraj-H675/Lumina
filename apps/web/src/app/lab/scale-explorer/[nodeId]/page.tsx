import type { Metadata } from "next";

import { ScaleExplorerEnhanced } from "../../../../components/scale-explorer-enhanced";
import { ScaleExplorerNoScript } from "../../../../components/scale-explorer-no-script";
import {
  SCALE_EXPLORER_NODE_IDS,
  SCALE_EXPLORER_MODEL_VERSION,
  type ScaleNodeId,
} from "../../../../lib/simulations/scale-explorer";

export const metadata: Metadata = {
  alternates: {
    canonical: "/lab/scale-explorer",
  },
  title: "Scale Explorer",
  description:
    "Move through a curated logarithmic scale of astronomical characteristic sizes, with sources and model limits included.",
};

export const dynamicParams = false;

export function generateStaticParams(): Array<{ nodeId: string }> {
  return SCALE_EXPLORER_NODE_IDS.map((nodeId) => ({ nodeId }));
}

type ScaleExplorerNodePageProps = Readonly<{
  params: Promise<{ nodeId: string }>;
}>;

export default async function ScaleExplorerNodePage({ params }: ScaleExplorerNodePageProps) {
  const { nodeId } = await params;
  if (!SCALE_EXPLORER_NODE_IDS.includes(nodeId as ScaleNodeId)) {
    return null;
  }
  const initialState = {
    model_version: SCALE_EXPLORER_MODEL_VERSION,
    node_id: nodeId as ScaleNodeId,
    version: 1 as const,
  };
  return (
    <>
      <ScaleExplorerNoScript initialState={initialState} initialStateInvalid={false} />
      <ScaleExplorerEnhanced initialState={initialState} initialStateInvalid={false} />
    </>
  );
}
