import type { Metadata } from "next";

import { loadNowLaunches } from "../../../lib/server/space-now";
import { LaunchesView } from "./launches-view";

export const metadata: Metadata = {
  title: "Launch Center",
  description:
    "Upcoming space launches from Launch Library 2 with explicit source status, schedule precision, windows, freshness, and official links.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LaunchesPage() {
  return <LaunchesView outcome={await loadNowLaunches()} />;
}
