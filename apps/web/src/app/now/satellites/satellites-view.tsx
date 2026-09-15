import type { SatelliteItemResponse, SatelliteListResponse } from "@lumina/api-client";
import Link from "next/link";

import type { NowSatellitesOutcome } from "../../../lib/server/space-now";
import { SatellitePassFinder } from "./satellite-pass-finder";

export function SatellitesView({ outcome }: Readonly<{ outcome: NowSatellitesOutcome }>) {
  if (outcome.kind !== "ok") return <TransportUnavailable />;
  const response = outcome.data;
  return (
    <article className="max-w-6xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          Space Now · Satellites
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Satellite passes</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Selected CelesTrak STATIONS and VISUAL general-perturbations elements, propagated locally
          with SGP4. These are model predictions, not real-time tracking or guaranteed optical
          visibility.
        </p>
      </header>

      {response.availability === "unavailable" ? (
        <Unavailable response={response} />
      ) : (
        <>
          <Freshness response={response} />
          <SatellitePassFinder satellites={response.satellites} />
          <SatelliteList response={response} />
          <SourceDetails response={response} />
        </>
      )}

      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/now">
        Back to Space Now
      </Link>
    </article>
  );
}

function Freshness({ response }: Readonly<{ response: SatelliteListResponse }>) {
  return (
    <section
      aria-live="polite"
      className="space-y-2 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-4"
      role="status"
    >
      <p className="font-semibold">
        {response.availability === "stale" ? "Stale element snapshot" : "Fresh element snapshot"}
      </p>
      <p className="leading-7 text-[var(--muted)]">
        Lumina retrieved this selected-group cache at{" "}
        {response.freshness.retrieved_at ?? "an unrecorded time"}. The newest element epoch
        represented is {response.freshness.snapshot_latest_epoch_utc ?? "not recorded"}.
      </p>
      {response.freshness.last_refresh_failure_code === null ? null : (
        <p className="text-sm text-[var(--muted)]">
          Last safe refresh failure: {response.freshness.last_refresh_failure_code}
        </p>
      )}
    </section>
  );
}

function SatelliteList({ response }: Readonly<{ response: SatelliteListResponse }>) {
  return (
    <section aria-labelledby="satellite-list-heading" className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold" id="satellite-list-heading">
          Selected satellites
        </h2>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Showing {response.returned_satellite_count} of {response.total_satellite_count} normalized
          records from the fixed STATIONS and VISUAL groups.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {response.satellites.map((satellite) => (
          <SatelliteCard key={satellite.catalog_number} satellite={satellite} />
        ))}
      </div>
    </section>
  );
}

function SatelliteCard({ satellite }: Readonly<{ satellite: SatelliteItemResponse }>) {
  return (
    <article className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-5">
      <div>
        <h3 className="text-lg font-semibold">{satellite.name}</h3>
        <p className="text-sm text-[var(--muted)]">NORAD {satellite.catalog_number}</p>
      </div>
      <dl className="space-y-2 text-sm">
        <Fact label="Groups" value={satellite.groups.join(", ")} />
        <Fact label="Element epoch" value={satellite.element_epoch_utc} />
        <Fact label="Element age" value={`${satellite.element_age_hours.toFixed(1)} h`} />
        <Fact
          label="Pass runtime"
          value={satellite.pass_prediction_runtime_supported ? "Supported" : "Not supported"}
        />
      </dl>
      {satellite.stale_element_warning ? (
        <p className="border-l-4 border-[var(--focus)] pl-3 text-sm leading-6 text-[var(--muted)]">
          Element age exceeds Lumina&apos;s 24-hour warning threshold.
        </p>
      ) : null}
    </article>
  );
}

function SourceDetails({ response }: Readonly<{ response: SatelliteListResponse }>) {
  return (
    <section
      aria-labelledby="satellite-source-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <h2 className="text-xl font-semibold" id="satellite-source-heading">
        Source, model, and limitations
      </h2>
      <p className="max-w-3xl leading-7 text-[var(--muted)]">{response.source.attribution_text}</p>
      <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
        Lumina warns when elements are more than 24 hours from the requested start and refuses pass
        calculations when the 24-hour prediction window would extend more than 72 hours from the
        element epoch. These are conservative Lumina product limits, not universal SGP4 validity
        claims.
      </p>
      <div className="flex flex-wrap gap-4">
        <External href={response.source.official_documentation_url}>
          CelesTrak GP documentation
        </External>
        <External href={response.source.terms_url}>CelesTrak usage policy</External>
      </div>
    </section>
  );
}

function Unavailable({ response }: Readonly<{ response: SatelliteListResponse }>) {
  const detail =
    response.unavailable_reason === "provider_disabled"
      ? "The CelesTrak provider is disabled."
      : response.unavailable_reason === "cached_content_expired"
        ? "The last validated element snapshot has expired."
        : "No validated selected-group element snapshot is available yet.";
  return (
    <section className="space-y-3 border-l-4 border-[var(--border-strong)] p-5" role="status">
      <h2 className="text-2xl font-semibold">Satellite data is currently unavailable</h2>
      <p className="leading-7 text-[var(--muted)]">{detail}</p>
      <p className="text-sm text-[var(--muted)]">
        This page never fetches CelesTrak from the browser.
      </p>
    </section>
  );
}

function TransportUnavailable() {
  return (
    <section className="max-w-2xl space-y-4" role="status">
      <h1 className="text-3xl font-semibold">Satellite data is temporarily unavailable</h1>
      <p className="leading-7 text-[var(--muted)]">
        Lumina could not safely read its API, so it is showing no satellite claims.
      </p>
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="break-words text-[var(--muted)]">{value}</dd>
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
