import type { Metadata } from "next";

import { loadReviewedDiscoveries } from "../lib/discoveries/content";
import { loadNowLaunches } from "../lib/server/space-now";
import { MissionControlHome } from "./mission-control-home";

export const metadata: Metadata = {
  title: "Mission Control",
  description:
    "Lumina Mission Control combines a cache-backed current launch event, bounded mission board, reviewed discoveries, and authored learning without hiding source freshness or uncertainty.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const launchOutcome = await loadNowLaunches();
  return (
    <MissionControlHome
      discoveries={loadReviewedDiscoveries().entries}
      launchOutcome={launchOutcome}
    />
  );
}
