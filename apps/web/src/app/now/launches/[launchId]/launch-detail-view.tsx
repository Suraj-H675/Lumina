import type { LaunchDetailResponse, LaunchItemResponse } from "@lumina/api-client";
import Link from "next/link";

import type { NowLaunchDetailOutcome } from "../../../../lib/server/space-now";
import { LaunchCountdown } from "../launch-countdown";

export function LaunchDetailView({ outcome }: Readonly<{ outcome: NowLaunchDetailOutcome }>) {
  if (outcome.kind !== "ok") return <TransportUnavailable />;
  if (outcome.data.availability === "unavailable" || outcome.data.launch === null) {
    return <Unavailable response={outcome.data} />;
  }
  const launch = outcome.data.launch;
  return (
    <article className="max-w-4xl space-y-10">
      <header className="space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          Space Now · Launch Center
        </p>
        <div className="space-y-2">
          <p className="font-semibold text-[var(--accent)]">
            {launch.status.abbreviation} · {launch.status.name}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{launch.name}</h1>
        </div>
        <Schedule launch={launch} />
        {launch.timing.countdown_eligible ? (
          <LaunchCountdown targetUtc={launch.timing.net_utc} />
        ) : null}
      </header>

      <section aria-labelledby="launch-facts-heading" className="space-y-4">
        <h2 className="text-2xl font-semibold" id="launch-facts-heading">
          Launch facts
        </h2>
        <dl className="grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
          <Fact label="Launch provider" value={launch.agency?.name ?? "Not provided by source"} />
          <Fact label="Vehicle" value={launch.vehicle?.full_name ?? "Not provided by source"} />
          <Fact
            label="Vehicle variant"
            value={launch.vehicle?.variant ?? "Not provided by source"}
          />
          <Fact label="Launch pad" value={launch.site?.pad_name ?? "Not provided by source"} />
          <Fact label="Location" value={launch.site?.location_name ?? "Not provided by source"} />
          <Fact label="Country" value={launch.site?.country_name ?? "Not provided by source"} />
        </dl>
      </section>

      {launch.mission === null ? null : (
        <section
          aria-labelledby="mission-heading"
          className="space-y-4 border border-[var(--border)] p-5 sm:p-7"
        >
          <h2 className="text-2xl font-semibold" id="mission-heading">
            {launch.mission.name}
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact label="Mission type" value={launch.mission.mission_type ?? "Not provided"} />
            <Fact
              label="Destination / body"
              value={launch.mission.destination_body ?? "Not provided"}
            />
            <Fact label="Orbit" value={launch.mission.orbit_name ?? "Not provided"} />
            <Fact
              label="Mission agencies"
              value={launch.mission.agency_names.join(", ") || "Not provided"}
            />
          </dl>
          {launch.mission.description === null ? null : (
            <p className="leading-8 text-[var(--muted)]">{launch.mission.description}</p>
          )}
        </section>
      )}

      <section aria-labelledby="launch-actions-heading" className="space-y-4">
        <h2 className="text-xl font-semibold" id="launch-actions-heading">
          Source actions
        </h2>
        <div className="flex flex-wrap gap-3">
          {launch.official_page_url === null ? null : (
            <External href={launch.official_page_url}>Official launch page</External>
          )}
          {launch.official_webcast_url === null ? null : (
            <External href={launch.official_webcast_url}>
              {launch.webcast_live ? "Official live webcast" : "Official webcast"}
            </External>
          )}
          {launch.timing.calendar_eligible ? (
            <a
              className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline"
              href={`/now/launches/${launch.launch_id}/calendar`}
            >
              Add to calendar
            </a>
          ) : null}
        </div>
        {!launch.timing.calendar_eligible ? (
          <p className="text-sm leading-6 text-[var(--muted)]">
            Calendar export is withheld because the provider schedule is coarser than hour
            precision.
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="launch-provenance-heading"
        className="space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-xl font-semibold" id="launch-provenance-heading">
          Freshness and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">{outcome.data.source.attribution_text}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="LL2 record updated" value={launch.timing.provider_updated_at} />
          <Fact
            label="Lumina retrieved"
            value={outcome.data.freshness.retrieved_at ?? "Not recorded"}
          />
          <Fact label="Cache state" value={outcome.data.freshness.cache_state} />
          <Fact
            label="Last refresh failure"
            value={outcome.data.freshness.last_refresh_failure_code ?? "None recorded"}
          />
        </dl>
        <External href={outcome.data.source.official_documentation_url}>
          Launch Library 2 source
        </External>
      </section>

      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline"
        href="/now/launches"
      >
        Back to Launch Center
      </Link>
    </article>
  );
}

function Schedule({ launch }: Readonly<{ launch: LaunchItemResponse }>) {
  const exact = launch.timing.precision_id <= 2;
  return (
    <div className="space-y-2 border-l-4 border-[var(--border-strong)] pl-4">
      <p className="text-lg font-medium">
        {exact ? "Scheduled NET: " : "Schedule reference: "}
        {exact ? (
          <time dateTime={launch.timing.net_utc}>{launch.timing.net_utc}</time>
        ) : (
          launch.timing.net_utc.slice(0, 10)
        )}
      </p>
      <p className="leading-7 text-[var(--muted)]">
        Provider precision: {launch.timing.precision_name} ({launch.timing.precision_abbreviation}).{" "}
        {launch.timing.countdown_eligible
          ? "The source currently marks this Go timing precise enough for Lumina's exact countdown."
          : "No exact countdown is shown for this status/precision combination."}
      </p>
      {launch.timing.window_start_utc === null || launch.timing.window_end_utc === null ? null : (
        <p className="text-sm text-[var(--muted)]">
          Launch window: {launch.timing.window_start_utc} → {launch.timing.window_end_utc}
        </p>
      )}
    </div>
  );
}

function Unavailable({ response }: Readonly<{ response: LaunchDetailResponse }>) {
  return (
    <section className="max-w-2xl space-y-5" role="status">
      <h1 className="text-3xl font-semibold">Launch detail is currently unavailable</h1>
      <p className="leading-7 text-[var(--muted)]">
        {response.unavailable_reason === "provider_disabled"
          ? "The launch provider is disabled."
          : response.unavailable_reason === "cached_content_expired"
            ? "The last validated launch snapshot has expired."
            : "No validated launch snapshot is available yet."}
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

function TransportUnavailable() {
  return (
    <section className="max-w-2xl space-y-5" role="status">
      <h1 className="text-3xl font-semibold">Launch detail is temporarily unavailable</h1>
      <p className="leading-7 text-[var(--muted)]">
        Lumina could not read its API safely, so it is showing no launch claims.
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
