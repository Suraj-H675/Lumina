import type { LaunchItemResponse } from "@lumina/api-client";
import Link from "next/link";

import { ContinueLearningCard } from "../components/continue-learning-card";
import type { ReviewedDiscovery } from "../lib/discoveries/content";
import { loadLearningContent } from "../lib/learning/content";
import type { NowLaunchesOutcome } from "../lib/server/space-now";

export function MissionControlHome({
  discoveries,
  launchOutcome,
}: Readonly<{
  discoveries: ReadonlyArray<ReviewedDiscovery>;
  launchOutcome: NowLaunchesOutcome;
}>) {
  const content = loadLearningContent();
  const currentLaunch =
    launchOutcome.kind === "ok" &&
    launchOutcome.data.availability !== "unavailable" &&
    launchOutcome.data.launches.length > 0
      ? (launchOutcome.data.launches[0] ?? null)
      : null;
  const activeLaunches =
    launchOutcome.kind === "ok" && launchOutcome.data.availability !== "unavailable"
      ? launchOutcome.data.active_mission_launch_ids
          .map((launchId) =>
            launchOutcome.data.launches.find((launch) => launch.launch_id === launchId),
          )
          .filter((launch): launch is LaunchItemResponse => launch !== undefined)
      : [];
  const latestDiscovery = discoveries[0] ?? null;

  return (
    <article className="space-y-12">
      <section aria-labelledby="mission-control-title" className="max-w-3xl space-y-6">
        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
          Mission Control
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl"
          id="mission-control-title"
        >
          Mission Control
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">
          A small live-and-reviewed home for what is happening in space now: one source-labelled
          launch event, a bounded upcoming mission board, reviewed discoveries, and your authored
          learning progress. Lumina is still under construction, so unavailable data stays visibly
          unavailable rather than being replaced with guesses.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/now/launches"
          >
            Open Launch Center
          </Link>
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/now/satellites"
          >
            Find satellite passes
          </Link>
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/explore"
          >
            Explore the catalogue
          </Link>
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/status"
          >
            Check source status
          </Link>
        </div>
      </section>
      <CurrentMissionEvent launch={currentLaunch} outcome={launchOutcome} />
      <MissionBoard launches={activeLaunches} outcome={launchOutcome} />
      <ReviewedDiscoveryCard discovery={latestDiscovery} />
      <ContinueLearningCard content={content} path={content.path} />

      <section
        aria-labelledby="about-heading"
        className="max-w-3xl space-y-4 border-t border-[var(--border)] pt-8"
        id="about"
      >
        <h2
          className="text-2xl font-semibold tracking-tight text-[var(--foreground)]"
          id="about-heading"
        >
          About Lumina
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Lumina connects visual exploration, authored learning, deterministic simulations, real-sky
          observation, and provenance-first current space data. Each capability is added only when
          its source, assumptions, freshness, and limitations can be shown honestly.
        </p>
      </section>
    </article>
  );
}

function CurrentMissionEvent({
  launch,
  outcome,
}: Readonly<{ launch: LaunchItemResponse | null; outcome: NowLaunchesOutcome }>) {
  if (launch === null) {
    return (
      <section
        aria-labelledby="current-event-heading"
        className="space-y-4 border border-[var(--border)] p-5"
        role="status"
      >
        <h2 className="text-2xl font-semibold" id="current-event-heading">
          Current mission event
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {outcome.kind === "ok" && outcome.data.unavailable_reason === "provider_disabled"
            ? "The launch provider is disabled, so Mission Control is making no current-launch claim."
            : "No validated Launch Library 2 snapshot is available to Mission Control right now."}
        </p>
        <Link
          className="inline-flex min-h-11 items-center text-[var(--link)] underline"
          href="/now/launches"
        >
          Open Launch Center
        </Link>
      </section>
    );
  }
  const availability = outcome.kind === "ok" ? outcome.data.availability : "unavailable";
  return (
    <section
      aria-labelledby="current-event-heading"
      className="space-y-5 border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
          Current mission event · {availability}
        </p>
        <h2 className="text-2xl font-semibold" id="current-event-heading">
          {launch.name}
        </h2>
        <p className="font-medium">
          {launch.status.abbreviation} · {launch.status.name}
        </p>
      </div>
      <div className="space-y-2 border-l-4 border-[var(--border-strong)] pl-4">
        <p>
          {launch.timing.precision_id <= 2 ? "Scheduled NET: " : "Schedule reference: "}
          {launch.timing.precision_id <= 2 ? (
            <time dateTime={launch.timing.net_utc}>{launch.timing.net_utc}</time>
          ) : (
            launch.timing.net_utc.slice(0, 10)
          )}
        </p>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Source precision: {launch.timing.precision_name}.{" "}
          {launch.timing.countdown_eligible
            ? "The detailed Launch Center may show an exact countdown because this record is Go and precise to the minute or second."
            : "Mission Control does not turn this source status and precision into an exact countdown."}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <HomeFact label="Mission" value={launch.mission?.name ?? "Not provided by source"} />
        <HomeFact label="Vehicle" value={launch.vehicle?.full_name ?? "Not provided by source"} />
        <HomeFact label="Launch provider" value={launch.agency?.name ?? "Not provided by source"} />
        <HomeFact label="Site" value={launch.site?.pad_name ?? "Not provided by source"} />
      </dl>
      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
        href={`/now/launches/${launch.launch_id}`}
      >
        Inspect this launch and its provenance
      </Link>
    </section>
  );
}
function MissionBoard({
  launches,
  outcome,
}: Readonly<{ launches: ReadonlyArray<LaunchItemResponse>; outcome: NowLaunchesOutcome }>) {
  return (
    <section aria-labelledby="mission-board-heading" className="space-y-5">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold" id="mission-board-heading">
          Upcoming mission board
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Mission-bearing, nonterminal records from the same bounded Launch Library 2 snapshot. This
          is not a catalogue of every active spacecraft mission.
        </p>
      </div>
      {launches.length === 0 ? (
        <p className="border border-[var(--border)] p-5 text-[var(--muted)]" role="status">
          {outcome.kind === "ok" && outcome.data.availability !== "unavailable"
            ? "No mission-bearing records are available in the current public launch slice."
            : "The mission board is unavailable until Lumina has a validated launch snapshot."}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {launches.map((launch) => (
            <article className="space-y-3 border border-[var(--border)] p-5" key={launch.launch_id}>
              <p className="text-sm font-semibold text-[var(--accent)]">
                {launch.status.abbreviation} · {launch.timing.precision_name}
              </p>
              <h3 className="text-lg font-semibold">
                <Link
                  className="text-[var(--link)] underline underline-offset-4"
                  href={`/now/launches/${launch.launch_id}`}
                >
                  {launch.mission?.name ?? launch.name}
                </Link>
              </h3>
              <p className="text-sm leading-6 text-[var(--muted)]">
                {launch.vehicle?.full_name ?? "Vehicle not provided"} ·{" "}
                {launch.site?.location_name ?? launch.site?.pad_name ?? "Site not provided"}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function ReviewedDiscoveryCard({ discovery }: Readonly<{ discovery: ReviewedDiscovery | null }>) {
  if (discovery === null) return null;
  return (
    <section
      aria-labelledby="reviewed-discovery-heading"
      className="space-y-5 border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
          Reviewed discovery · {discovery.content_type}
        </p>
        <h2 className="text-2xl font-semibold" id="reviewed-discovery-heading">
          {discovery.title}
        </h2>
        <p className="text-sm text-[var(--muted)]">Published {discovery.publication_date}</p>
      </div>
      <p className="leading-7 text-[var(--muted)]">{discovery.summary}</p>
      <div className="space-y-2 border-t border-[var(--border)] pt-4">
        <h3 className="font-semibold">Why it matters</h3>
        <p className="leading-7 text-[var(--muted)]">{discovery.why_it_matters}</p>
      </div>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Confirmation state: {discovery.independent_confirmation_state.replaceAll("-", " ")}.
      </p>
      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
        href="/discoveries"
      >
        See all reviewed discoveries and sources
      </Link>
    </section>
  );
}

function HomeFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">{value}</dd>
    </div>
  );
}
