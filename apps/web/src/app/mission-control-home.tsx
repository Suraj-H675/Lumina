import type { LaunchItemResponse } from "@lumina/api-client";
import Link from "next/link";

import { ContinueLearningCard } from "../components/continue-learning-card";
import type { ReviewedDiscovery } from "../lib/discoveries/content";
import type { MissionControlMessages } from "../lib/i18n/messages/types";
import { loadLearningContent } from "../lib/learning/content";
import type { NowLaunchesOutcome } from "../lib/server/space-now";

export function MissionControlHome({
  discoveries,
  launchOutcome,
  messages,
}: Readonly<{
  discoveries: ReadonlyArray<ReviewedDiscovery>;
  launchOutcome: NowLaunchesOutcome;
  messages: MissionControlMessages;
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
          {messages.eyebrow}
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl"
          id="mission-control-title"
        >
          {messages.title}
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">{messages.intro}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/now/launches"
          >
            {messages.openLaunchCenter}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/now/satellites"
          >
            {messages.findSatellitePasses}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/explore"
          >
            {messages.exploreCatalogue}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/status"
          >
            {messages.checkSourceStatus}
          </Link>
        </div>
      </section>
      <CurrentMissionEvent
        launch={currentLaunch}
        messages={messages.currentMissionEvent}
        outcome={launchOutcome}
      />
      <MissionBoard
        launches={activeLaunches}
        messages={messages.missionBoard}
        outcome={launchOutcome}
      />
      <ReviewedDiscoveryCard discovery={latestDiscovery} messages={messages.reviewedDiscovery} />
      <ContinueLearningCard
        content={content}
        messages={messages.continueLearning}
        path={content.path}
      />

      <section
        aria-labelledby="about-heading"
        className="max-w-3xl space-y-4 border-t border-[var(--border)] pt-8"
        id="about"
      >
        <h2
          className="text-2xl font-semibold tracking-tight text-[var(--foreground)]"
          id="about-heading"
        >
          {messages.aboutTitle}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.aboutBody}</p>
      </section>
    </article>
  );
}

function CurrentMissionEvent({
  launch,
  messages,
  outcome,
}: Readonly<{
  launch: LaunchItemResponse | null;
  messages: MissionControlMessages["currentMissionEvent"];
  outcome: NowLaunchesOutcome;
}>) {
  if (launch === null) {
    return (
      <section
        aria-labelledby="current-event-heading"
        className="space-y-4 border border-[var(--border)] p-5"
        role="status"
      >
        <h2 className="text-2xl font-semibold" id="current-event-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {outcome.kind === "ok" && outcome.data.unavailable_reason === "provider_disabled"
            ? messages.providerDisabled
            : messages.unavailable}
        </p>
        <Link
          className="inline-flex min-h-11 items-center text-[var(--link)] underline"
          href="/now/launches"
        >
          {messages.openLaunchCenter}
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
          {messages.title} · {availability}
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
          {launch.timing.precision_id <= 2
            ? `${messages.scheduledNetLabel}: `
            : `${messages.scheduleReferenceLabel}: `}
          {launch.timing.precision_id <= 2 ? (
            <time dateTime={launch.timing.net_utc}>{launch.timing.net_utc}</time>
          ) : (
            launch.timing.net_utc.slice(0, 10)
          )}
        </p>
        <p className="text-sm leading-6 text-[var(--muted)]">
          {messages.sourcePrecisionLabel}: {launch.timing.precision_name}.{" "}
          {launch.timing.countdown_eligible
            ? messages.countdownEligibleExplanation
            : messages.countdownIneligibleExplanation}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <HomeFact
          label={messages.missionLabel}
          value={launch.mission?.name ?? messages.missingValue}
        />
        <HomeFact
          label={messages.vehicleLabel}
          value={launch.vehicle?.full_name ?? messages.missingValue}
        />
        <HomeFact
          label={messages.launchProviderLabel}
          value={launch.agency?.name ?? messages.missingValue}
        />
        <HomeFact
          label={messages.siteLabel}
          value={launch.site?.pad_name ?? messages.missingValue}
        />
      </dl>
      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
        href={`/now/launches/${launch.launch_id}`}
      >
        {messages.inspectLaunch}
      </Link>
    </section>
  );
}
function MissionBoard({
  launches,
  messages,
  outcome,
}: Readonly<{
  launches: ReadonlyArray<LaunchItemResponse>;
  messages: MissionControlMessages["missionBoard"];
  outcome: NowLaunchesOutcome;
}>) {
  return (
    <section aria-labelledby="mission-board-heading" className="space-y-5">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold" id="mission-board-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      </div>
      {launches.length === 0 ? (
        <p className="border border-[var(--border)] p-5 text-[var(--muted)]" role="status">
          {outcome.kind === "ok" && outcome.data.availability !== "unavailable"
            ? messages.emptyCurrent
            : messages.unavailable}
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
                {launch.vehicle?.full_name ?? messages.vehicleMissing} ·{" "}
                {launch.site?.location_name ?? launch.site?.pad_name ?? messages.siteMissing}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function ReviewedDiscoveryCard({
  discovery,
  messages,
}: Readonly<{
  discovery: ReviewedDiscovery | null;
  messages: MissionControlMessages["reviewedDiscovery"];
}>) {
  if (discovery === null) return null;
  return (
    <section
      aria-labelledby="reviewed-discovery-heading"
      className="space-y-5 border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
          {messages.eyebrow} · {discovery.content_type}
        </p>
        <h2 className="text-2xl font-semibold" id="reviewed-discovery-heading">
          {discovery.title}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {messages.publishedLabel} {discovery.publication_date}
        </p>
      </div>
      <p className="leading-7 text-[var(--muted)]">{discovery.summary}</p>
      <div className="space-y-2 border-t border-[var(--border)] pt-4">
        <h3 className="font-semibold">{messages.whyItMattersTitle}</h3>
        <p className="leading-7 text-[var(--muted)]">{discovery.why_it_matters}</p>
      </div>
      <p className="text-sm leading-6 text-[var(--muted)]">
        {messages.confirmationStateLabel}:{" "}
        {discovery.independent_confirmation_state.replaceAll("-", " ")}.
      </p>
      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
        href="/discoveries"
      >
        {messages.seeAll}
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
