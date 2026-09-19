import type { Metadata } from "next";
import Link from "next/link";

import { loadNowLaunch } from "../../../../lib/server/space-now";
import { LaunchDetailView } from "./launch-detail-view";

type LaunchPageProps = Readonly<{
  params: Promise<Readonly<{ launchId: string }>>;
}>;

export async function generateMetadata({ params }: LaunchPageProps): Promise<Metadata> {
  const { launchId } = await params;
  const outcome = await loadNowLaunch(launchId);
  if (outcome.kind === "not-found") return { title: "Launch not found" };
  if (outcome.kind !== "ok" || outcome.data.launch === null) {
    return { title: "Launch temporarily unavailable" };
  }
  return {
    title: outcome.data.launch.name,
    description: `${outcome.data.launch.name}: source status, schedule precision, mission, vehicle, site, freshness, and official launch links.`,
  };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LaunchPage({ params }: LaunchPageProps) {
  const { launchId } = await params;
  const outcome = await loadNowLaunch(launchId);
  if (outcome.kind === "not-found") {
    return (
      <section className="max-w-2xl space-y-5" role="status">
        <h1 className="text-3xl font-semibold">Launch not found in the current snapshot</h1>
        <p className="leading-7 text-[var(--muted)]">
          Lumina keeps a bounded upcoming-launch snapshot. This identifier is not present in that
          current validated cache.
        </p>
        <Link
          className="inline-flex min-h-11 items-center text-[var(--link)] underline"
          href="/now/launches"
        >
          Back to Launch Center
        </Link>
      </section>
    );
  }
  return <LaunchDetailView outcome={outcome} />;
}
