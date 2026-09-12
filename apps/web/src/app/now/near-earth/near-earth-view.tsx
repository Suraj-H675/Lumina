import type { NearEarthResponse } from "@lumina/api-client";
import Link from "next/link";

import type { NowNearEarthOutcome } from "../../../lib/server/space-now";

const PHA_EXPLANATION =
  "Potentially hazardous is a technical NASA/JPL classification based on orbital proximity and brightness that identifies objects with potential for close approaches. It does not mean an impact is predicted.";
const UNCERTAINTY_EXPLANATION =
  "Close-approach uncertainty is not provided by the NeoWs feed used in this version.";

export function NearEarthView({ outcome }: Readonly<{ outcome: NowNearEarthOutcome }>) {
  return (
    <article className="max-w-6xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          Space Now
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Near-Earth Objects</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          A bounded view of predicted Earth close approaches from NASA Asteroids NeoWs. A close
          approach is a distance-and-time prediction, not an impact warning.
        </p>
      </header>

      {outcome.kind === "ok" ? <NearEarthData response={outcome.data} /> : <UnavailableNearEarth />}
    </article>
  );
}

function NearEarthData({ response }: Readonly<{ response: NearEarthResponse }>) {
  if (response.availability === "unavailable") {
    return <UnavailableNearEarth response={response} />;
  }

  const window = response.window;
  if (window === null) return <UnavailableNearEarth response={response} />;
  const showingMore = response.total_encounter_count > response.returned_encounter_count;

  return (
    <div className="space-y-8">
      <section
        aria-live="polite"
        className="space-y-3 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-5"
        role="status"
      >
        <h2 className="text-xl font-semibold">
          {response.availability === "stale"
            ? "Stale near-Earth approach snapshot"
            : "Fresh near-Earth approach snapshot"}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {response.availability === "stale"
            ? "This page is showing the last successfully retrieved NeoWs feed window; its retrieval time is listed below."
            : "This page shows the current seven-day NeoWs feed window; its retrieval time is listed below."}
        </p>
      </section>

      <section aria-labelledby="near-earth-window-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="near-earth-window-heading">
          Feed window
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Earth close approaches from{" "}
          <span className="font-medium text-[var(--foreground)]">{window.start_date}</span> through{" "}
          <span className="font-medium text-[var(--foreground)]">{window.end_date}</span>.
        </p>
        <p className="text-sm leading-7 text-[var(--muted)]">
          {response.total_encounter_count === 0
            ? "No Earth close approaches are listed in the current NeoWs feed window."
            : showingMore
              ? `Showing the next ${response.returned_encounter_count} of ${response.total_encounter_count} approaches in this feed window.`
              : `${response.total_encounter_count} approach${response.total_encounter_count === 1 ? "" : "es"} listed in this feed window.`}
        </p>
      </section>

      {response.encounters.length === 0 ? null : (
        <EncounterTable encounters={response.encounters} />
      )}

      <section
        aria-labelledby="near-earth-uncertainty-heading"
        className="space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="near-earth-uncertainty-heading">
          Prediction context
        </h2>
        <p className="leading-7 text-[var(--muted)]">{UNCERTAINTY_EXPLANATION}</p>
        <p className="leading-7 text-[var(--muted)]">{PHA_EXPLANATION}</p>
        <p className="leading-7 text-[var(--muted)]">
          NASA/JPL updates orbit solutions as new observations become available, so predicted
          approach statistics can change.
        </p>
      </section>

      <FreshnessDetails response={response} />
      <SourceDetails response={response} />
    </div>
  );
}

function EncounterTable({ encounters }: Readonly<{ encounters: NearEarthResponse["encounters"] }>) {
  return (
    <section aria-labelledby="near-earth-encounters-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="near-earth-encounters-heading">
        Predicted closest approaches
      </h2>
      <div className="overflow-x-auto border border-[var(--border)]" tabIndex={0}>
        <table className="min-w-[60rem] w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            NASA NeoWs Earth close approaches, ordered by provider approach epoch
          </caption>
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="min-w-44 px-4 py-3 font-semibold" scope="col">
                Object
              </th>
              <th className="min-w-48 px-4 py-3 font-semibold" scope="col">
                NASA NeoWs close-approach time
              </th>
              <th className="min-w-44 px-4 py-3 font-semibold" scope="col">
                Nominal miss distance (km)
              </th>
              <th className="min-w-40 px-4 py-3 font-semibold" scope="col">
                Nominal distance (lunar distances)
              </th>
              <th className="min-w-36 px-4 py-3 font-semibold" scope="col">
                Relative velocity (km/s)
              </th>
              <th className="min-w-48 px-4 py-3 font-semibold" scope="col">
                Estimated diameter range (m)
              </th>
              <th className="min-w-48 px-4 py-3 font-semibold" scope="col">
                Classification
              </th>
              <th className="min-w-32 px-4 py-3 font-semibold" scope="col">
                Absolute magnitude H
              </th>
            </tr>
          </thead>
          <tbody>
            {encounters.map((encounter) => (
              <tr
                className="border-t border-[var(--border)] align-top"
                key={encounter.encounter_id}
              >
                <th className="px-4 py-4 font-medium" scope="row">
                  <span className="block">{encounter.name}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    NEO {encounter.neo_reference_id}
                  </span>
                </th>
                <td className="px-4 py-4 text-[var(--muted)]">{encounter.approach_time_text}</td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNumber(encounter.nominal_distance_km)}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNumber(encounter.nominal_distance_lunar)}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNumber(encounter.relative_velocity_km_s)}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNumber(encounter.estimated_diameter_min_m)}–
                  {formatNumber(encounter.estimated_diameter_max_m)}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  Potentially hazardous asteroid:{" "}
                  {encounter.is_potentially_hazardous_asteroid ? "Yes" : "No"}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNumber(encounter.absolute_magnitude_h)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm leading-7 text-[var(--muted)]">
        Nominal distance is the source-published close-approach distance. Relative velocity is
        relative to Earth at the predicted approach; it is not an impact velocity.
      </p>
    </section>
  );
}

function FreshnessDetails({ response }: Readonly<{ response: NearEarthResponse }>) {
  const freshness = response.freshness;
  return (
    <section aria-labelledby="near-earth-freshness-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="near-earth-freshness-heading">
        Lumina retrieval state
      </h2>
      <dl className="grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Cache state</dt>
          <dd className="text-[var(--muted)]">{freshness.cache_state}</dd>
        </div>
        <TimestampField label="Retrieved at (UTC)" value={freshness.retrieved_at} />
        <TimestampField label="Fresh until (UTC)" value={freshness.fresh_until} />
        <TimestampField label="Stale grace ends (UTC)" value={freshness.stale_until} />
        <div>
          <dt className="font-medium">Last safe refresh failure</dt>
          <dd className="text-[var(--muted)]">
            {freshness.last_refresh_failure_code ?? "None recorded"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function SourceDetails({ response }: Readonly<{ response: NearEarthResponse }>) {
  const source = response.source;
  return (
    <section aria-labelledby="near-earth-source-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="near-earth-source-heading">
        Source and attribution
      </h2>
      <div className="space-y-4 border border-[var(--border)] p-5">
        <p className="leading-7 text-[var(--muted)]">{source.attribution_text}</p>
        <p>
          <a
            className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
            href={source.official_documentation_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {source.name} official documentation
          </a>
        </p>
      </div>
    </section>
  );
}

function UnavailableNearEarth({ response }: Readonly<{ response?: NearEarthResponse }>) {
  const reason = response?.unavailable_reason;
  const detail =
    reason === "provider_disabled"
      ? "The Near-Earth Objects provider is disabled."
      : reason === "no_cached_content"
        ? "No validated Near-Earth Objects snapshot is available yet."
        : reason === "cached_content_expired"
          ? "The cached Near-Earth Objects snapshot has expired."
          : "Near-Earth approach data could not be loaded from Lumina right now.";

  return (
    <section aria-labelledby="near-earth-unavailable-heading" className="space-y-6">
      <div
        aria-live="polite"
        className="space-y-3 border-l-4 border-[var(--border-strong)] bg-[var(--surface)] p-5"
        role="status"
      >
        <h2 className="text-2xl font-semibold" id="near-earth-unavailable-heading">
          Near-Earth approach data is currently unavailable.
        </h2>
        <p className="leading-7 text-[var(--muted)]">{detail}</p>
      </div>
      {response === undefined ? null : (
        <>
          <FreshnessDetails response={response} />
          <SourceDetails response={response} />
        </>
      )}
      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/now">
        Return to Space Now
      </Link>
    </section>
  );
}

function TimestampField({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">
        {value === null ? "Not recorded" : <time dateTime={value}>{value}</time>}
      </dd>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}
