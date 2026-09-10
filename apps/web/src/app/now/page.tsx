import type { Metadata } from "next";

import { loadNowApod } from "../../lib/server/space-now";
import { SpaceNowView } from "./space-now-view";

export const metadata: Metadata = {
  title: "Space Now",
  description:
    "A source-backed Daily Visual from NASA Astronomy Picture of the Day, with clear dates, credit, and retrieval state.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SpaceNowPage() {
  const outcome = await loadNowApod();
  return <SpaceNowView outcome={outcome} />;
}
