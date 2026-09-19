import type { Metadata } from "next";

import { loadNowNearEarth } from "../../../lib/server/space-now";
import { NearEarthView } from "./near-earth-view";

export const metadata: Metadata = {
  title: "Near-Earth Objects",
  description:
    "A source-backed NASA NeoWs view of predicted Earth close approaches, with nominal distances, speeds, estimated diameter ranges, and classification context.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NearEarthPage() {
  const outcome = await loadNowNearEarth();
  return <NearEarthView outcome={outcome} />;
}
