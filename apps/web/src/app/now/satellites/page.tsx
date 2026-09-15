import type { Metadata } from "next";

import { loadNowSatellites } from "../../../lib/server/space-now";
import { SatellitesView } from "./satellites-view";

export const metadata: Metadata = {
  title: "Satellite Passes",
  description:
    "Selected CelesTrak satellite elements and local SGP4 pass predictions with explicit freshness, element-age, daylight, and illumination context.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SatellitesPage() {
  return <SatellitesView outcome={await loadNowSatellites()} />;
}
