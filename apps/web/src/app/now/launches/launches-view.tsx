import type { LaunchItemResponse, LaunchListResponse } from "@lumina/api-client";
import Link from "next/link";

import type { NowLaunchesOutcome } from "../../../lib/server/space-now";
import { LaunchCountdown } from "./launch-countdown";

export function LaunchesView({ outcome }: Readonly<{ outcome: NowLaunchesOutcome }>) {
  if (outcome.kind !== "ok") return <TransportUnavailable />;
  const response = outcome.data;
  return (
    <article className="max-w-5xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          Space Now · Launch Center
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Upcoming launches</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          A bounded Launch Library 2 snapshot. Status, NET precision, launch window, source update
          time, and Lumina retrieval freshness stay separate so placeholder schedules never look
          more exact than the source says they are.
        </p>
      </header>

      {response.availability === "unavailable" ? (
        <Unavailable response={response} />
      ) : (
        <>
          <FreshnessBanner response={response} />
          <section aria-labelledby="launch-list-heading" className="space-y-5">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold" id="launch-list-heading">
                Current bounded snapshot
              </h2>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Showing {response.returned_launch_count} of {response.total_launch_count} normalized
                launch records retained by this Lumina projection.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {response.launches.map((launch) => (
                <LaunchCard key={launch.launch_id} launch={launch} />
              ))}
            </div>
          </section>
          <SourceDetails response={response} />
        </>
      )}

      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/now">
        Back to Space Now
      </Link>
    </article>
  );
}

function LaunchCard({ launch }: Readonly<{ launch: LaunchItemResponse }>) {
  return (
    <article className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-[var(--accent)]">{launch.status.abbreviation}</span>
          <span className="text-[var(--muted)]">{launch.status.name}</span>
        </div>
        <h3 className="text-xl font-semibold leading-7">
          <Link
            className="text-[var(--link)] underline underline-offset-4"
            href={`/now/launches/${launch.launch_id}`}
          >
            {launch.name}
          </Link>
        </h3>
      </div>
      <Schedule launch={launch} />
      {launch.timing.countdown_eligible ? (
        <LaunchCountdown targetUtc={launch.timing.net_utc} />
      ) : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact label="Vehicle" value={launch.vehicle?.full_name ?? "Not provided"} />
        <Fact label="Launch provider" value={launch.agency?.name ?? "Not provided"} />
        <Fact label="Mission" value={launch.mission?.name ?? "Not provided"} />
        <Fact label="Site" value={launch.site?.pad_name ?? "Not provided"} />
      </dl>
      <p className="text-sm text-[var(--muted)]">
        Provider record updated{" "}
        <time dateTime={launch.timing.provider_updated_at}>
          {launch.timing.provider_updated_at}
        </time>
      </p>
    </article>
  );
}

function Schedule({ launch }: Readonly<{ launch: LaunchItemResponse }>) {
  const exact = launch.timing.precision_id <= 2;
  return (
    <div className="space-y-2 border-l-4 border-[var(--border-strong)] pl-4">
      <p className="font-medium">
        {exact ? "Scheduled NET" : "Schedule reference"}:{" "}
        {exact ? (
          <time dateTime={launch.timing.net_utc}>{launch.timing.net_utc}</time>
        ) : (
          launch.timing.net_utc.slice(0, 10)
        )}
      </p>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Source precision: {launch.timing.precision_name} ({launch.timing.precision_abbreviation}).
        {launch.timing.countdown_eligible
          ? " This Go record is precise enough for an exact countdown."
          : " Lumina does not show an exact countdown for this status/precision combination."}
      </p>
      {launch.timing.window_start_utc === null || launch.timing.window_end_utc === null ? null : (
        <p className="text-sm text-[var(--muted)]">
          Window: {launch.timing.window_start_utc} → {launch.timing.window_end_utc}
        </p>
      )}
    </div>
  );
}

function FreshnessBanner({ response }: Readonly<{ response: LaunchListResponse }>) {
  return (
    <section
      aria-live="polite"
      className="space-y-2 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-4"
      role="status"
    >
      <p className="font-semibold">
        {response.availability === "stale" ? "Stale launch snapshot" : "Fresh launch snapshot"}
      </p>
      <p className="leading-7 text-[var(--muted)]">
        Lumina retrieved this cache at {response.freshness.retrieved_at ?? "an unrecorded time"}.
        The newest LL2 record update represented is{" "}
        {response.freshness.snapshot_latest_updated_utc ?? "not recorded"}.
      </p>
      {response.freshness.last_refresh_failure_code === null ? null : (
        <p className="text-sm text-[var(--muted)]">
          Last safe refresh failure: {response.freshness.last_refresh_failure_code}
        </p>
      )}
    </section>
  );
}

function SourceDetails({ response }: Readonly<{ response: LaunchListResponse }>) {
  return (
    <section
      aria-labelledby="launch-source-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <h2 className="text-xl font-semibold" id="launch-source-heading">
        Source and limitations
      </h2>
      <p className="leading-7 text-[var(--muted)]">{response.source.attribution_text}</p>
      <p className="flex flex-wrap gap-x-5 gap-y-2">
        <External href={response.source.official_documentation_url}>Launch Library 2</External>
        <External href={response.source.terms_url}>Provider information</External>
      </p>
    </section>
  );
}

function Unavailable({ response }: Readonly<{ response: LaunchListResponse }>) {
  const reason = response.unavailable_reason;
  const detail =
    reason === "provider_disabled"
      ? "The Launch Library provider is disabled."
      : reason === "cached_content_expired"
        ? "The last validated launch snapshot has expired."
        : "No validated launch snapshot is available yet.";
  return (
    <section
      aria-labelledby="launch-unavailable-heading"
      className="space-y-3 border-l-4 border-[var(--border-strong)] bg-[var(--surface)] p-5"
      role="status"
    >
      <h2 className="text-2xl font-semibold" id="launch-unavailable-heading">
        Launch Center is currently unavailable
      </h2>
      <p className="leading-7 text-[var(--muted)]">{detail}</p>
      <p className="text-sm text-[var(--muted)]">
        No live provider request is made from this page.
      </p>
    </section>
  );
}

function TransportUnavailable() {
  return (
    <section
      aria-labelledby="launch-transport-heading"
      className="max-w-2xl space-y-4"
      role="status"
    >
      <h1 className="text-3xl font-semibold" id="launch-transport-heading">
        Launch Center is temporarily unavailable
      </h1>
      <p className="leading-7 text-[var(--muted)]">
        Lumina could not read its API within the bounded request window, so it is showing no launch
        claims.
      </p>
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">{value}</dd>
    </div>
  );
}

function External({ children, href }: Readonly<{ children: string; href: string }>) {
  return (
    <a
      className="inline-flex min-h-11 items-center text-[var(--link)] underline"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
