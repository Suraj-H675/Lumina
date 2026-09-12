import type { SpaceWeatherResponse } from "@lumina/api-client";
import Link from "next/link";
import type { ReactNode } from "react";

import type { NowSpaceWeatherOutcome } from "../../../lib/server/space-now";

export function SpaceWeatherView({ outcome }: Readonly<{ outcome: NowSpaceWeatherOutcome }>) {
  return (
    <article className="max-w-6xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          Space Now
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Space Weather</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          A calm, educational view of separate NOAA space-weather measurements, communication
          scales, forecasts, and notifications. These facts are not an operational warning or a
          local aurora-visibility prediction.
        </p>
      </header>

      {outcome.kind === "ok" ? (
        <SpaceWeatherData response={outcome.data} />
      ) : (
        <UnavailableSpaceWeather />
      )}
    </article>
  );
}

function SpaceWeatherData({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  if (response.availability === "unavailable") {
    return <UnavailableSpaceWeather response={response} />;
  }

  return (
    <div className="space-y-10">
      <section
        aria-live="polite"
        className={
          response.availability === "stale"
            ? "space-y-3 border-l-4 border-[var(--focus)] bg-[var(--surface)] p-5"
            : "space-y-3 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-5"
        }
        role="status"
      >
        <h2 className="text-xl font-semibold">
          {response.availability === "stale"
            ? "Stale Space Weather snapshot"
            : "Fresh Space Weather snapshot"}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          This state describes Lumina&apos;s atomic cache snapshot. The NOAA product timestamps
          below describe the underlying observations, estimates, forecasts, or notifications and are
          not all from the same instant.
        </p>
      </section>

      <CurrentScales response={response} />
      <KpSection response={response} />
      <SolarWindSection response={response} />
      <NotificationsSection response={response} />
      <ImpactsSection response={response} />
      <AuroraSection response={response} />
      <FreshnessDetails response={response} />
      <SourceDetails response={response} />
    </div>
  );
}

function CurrentScales({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  const scales = response.scales;
  return (
    <section aria-labelledby="space-weather-scales-heading" className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold" id="space-weather-scales-heading">
          Current NOAA scales
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          NOAA keeps radio blackouts (R), solar radiation storms (S), and geomagnetic storms (G) as
          separate source-defined categories. Lumina does not add their levels together.
        </p>
      </div>
      {scales === null ? (
        <p className="border border-[var(--border)] p-5 leading-7 text-[var(--muted)]">
          The current NOAA scale record is not available in this validated snapshot.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <ScaleCard label="Radio blackouts" code="R" value={scales.radio_blackout} />
            <ScaleCard label="Solar radiation storms" code="S" value={scales.solar_radiation} />
            <ScaleCard label="Geomagnetic storms" code="G" value={scales.geomagnetic} />
          </div>
          <p className="text-sm leading-7 text-[var(--muted)]">
            NOAA scale record time: <span className="font-medium">{scales.date_text}</span>{" "}
            <span className="font-medium">{scales.time_text}</span>. Lumina preserves this source
            time text without relabelling it as local time.
          </p>
        </>
      )}
    </section>
  );
}

function ScaleCard({
  code,
  label,
  value,
}: Readonly<{
  code: "G" | "R" | "S";
  label: string;
  value: NonNullable<SpaceWeatherResponse["scales"]>["geomagnetic"];
}>) {
  return (
    <article className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-semibold">{label}</h3>
      <p className="text-2xl font-semibold">
        {code}
        {value.level} — {value.text ?? "No source description"}
      </p>
      <p className="text-sm leading-7 text-[var(--muted)]">
        This is the NOAA {code} family level, not a Lumina severity score.
      </p>
    </article>
  );
}

function KpSection({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  const { latest_observed: observed, latest_estimated: estimated, forecast } = response.kp;
  return (
    <section aria-labelledby="space-weather-kp-heading" className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold" id="space-weather-kp-heading">
          Planetary Kp
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Kp is a dimensionless planetary geomagnetic index. Observed, estimated, and predicted rows
          remain separate; Kp is not a local aurora probability and does not replace the NOAA R/S/G
          scales.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <KpSummary label="Latest observed Kp" value={observed} />
        <KpSummary label="Latest estimated Kp" value={estimated} />
      </div>
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Forecast Kp</h3>
        {forecast.length === 0 ? (
          <p className="border border-[var(--border)] p-5 leading-7 text-[var(--muted)]">
            No predicted Kp rows are available in this snapshot.
          </p>
        ) : (
          <div className="overflow-x-auto border border-[var(--border)]" tabIndex={0}>
            <table className="min-w-[32rem] w-full border-collapse text-left text-sm">
              <caption className="sr-only">NOAA predicted planetary Kp rows</caption>
              <thead className="bg-[var(--surface)]">
                <tr>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    NOAA product time
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Kp (dimensionless)
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    NOAA scale field
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((row) => (
                  <tr
                    className="border-t border-[var(--border)]"
                    key={`${row.time_text}-${row.kp}`}
                  >
                    <td className="px-4 py-3 text-[var(--muted)]">{row.time_text}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{row.kp}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {row.noaa_scale ?? "Not reported"}
                    </td>
                    <td className="px-4 py-3 font-medium">Predicted</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function KpSummary({
  label,
  value,
}: Readonly<{
  label: string;
  value: SpaceWeatherResponse["kp"]["latest_observed"];
}>) {
  return (
    <article className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-semibold">{label}</h3>
      {value === null ? (
        <p className="leading-7 text-[var(--muted)]">Not reported in this snapshot.</p>
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Kp</dt>
            <dd className="text-2xl font-semibold">{value.kp}</dd>
          </div>
          <div>
            <dt className="font-medium">Provider status</dt>
            <dd className="text-[var(--muted)]">{value.status}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium">NOAA product time</dt>
            <dd className="text-[var(--muted)]">{value.time_text}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium">NOAA scale field</dt>
            <dd className="text-[var(--muted)]">{value.noaa_scale ?? "Not reported"}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}

function SolarWindSection({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  const solarWind = response.solar_wind;
  return (
    <section aria-labelledby="space-weather-solar-wind-heading" className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold" id="space-weather-solar-wind-heading">
          Solar wind measurements
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          These are SWPC upstream or near-Earth spacecraft measurements, not ground measurements at
          a user&apos;s location. A single speed or magnetic-field value does not guarantee a
          geomagnetic storm or local aurora.
        </p>
      </div>
      {solarWind === null ? (
        <p className="border border-[var(--border)] p-5 leading-7 text-[var(--muted)]">
          Solar-wind measurements are not available in this validated snapshot.
        </p>
      ) : (
        <dl className="grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
          <MeasurementField
            label="Solar-wind proton speed"
            value={withUnit(solarWind.proton_speed_km_s, "km/s")}
            timestamp={solarWind.speed_time_utc}
          />
          <MeasurementField
            label="Interplanetary magnetic-field magnitude (Bt)"
            value={withUnit(solarWind.bt_nt, "nT")}
            timestamp={solarWind.field_time_utc}
          />
          <MeasurementField
            label="GSM north/south magnetic-field component (Bz)"
            value={withUnit(solarWind.bz_gsm_nt, "nT")}
            timestamp={solarWind.field_time_utc}
          />
        </dl>
      )}
    </section>
  );
}

function MeasurementField({
  label,
  timestamp,
  value,
}: Readonly<{ label: string; timestamp: string | null; value: string }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
      <dd className="mt-1 text-sm text-[var(--muted)]">
        Source observation time: {timestamp === null ? "Not recorded" : timestamp}
      </dd>
    </div>
  );
}

function NotificationsSection({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  return (
    <section aria-labelledby="space-weather-notifications-heading" className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold" id="space-weather-notifications-heading">
          Latest SWPC notifications
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          These are recent provider-issued notification records. Lumina does not infer an active
          alert, warning, watch, cancellation, or severity class from message prose.
        </p>
      </div>
      {response.latest_notifications.length === 0 ? (
        <p className="border border-[var(--border)] p-5 leading-7 text-[var(--muted)]">
          No notification records are present in this snapshot.
        </p>
      ) : (
        <ol className="space-y-4">
          {response.latest_notifications.map((notification, index) => (
            <li
              className="space-y-2 border border-[var(--border)] bg-[var(--surface)] p-5"
              key={`${notification.issue_time_text}-${notification.product_id}-${index}`}
            >
              <h3 className="font-semibold">{notification.product_id}</h3>
              <p className="text-sm text-[var(--muted)]">
                Provider issue time: {notification.issue_time_text}
              </p>
              <p className="whitespace-pre-line break-words leading-7">{notification.message}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ImpactsSection({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  return (
    <section aria-labelledby="space-weather-impacts-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="space-weather-impacts-heading">
        NOAA impact context
      </h2>
      <p className="leading-7 text-[var(--muted)]">
        NOAA describes different possible effects for each scale family. This context is educational
        and is not operational advice for aviation, power systems, spacecraft, or radiation safety.
      </p>
      <ul className="grid gap-4 md:grid-cols-3">
        {response.impacts.map((impact) => (
          <li className="border border-[var(--border)] p-5" key={impact.family}>
            <h3 className="font-semibold">{impact.family} family</h3>
            <p className="mt-2 leading-7 text-[var(--muted)]">{impact.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AuroraSection({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  return (
    <section aria-labelledby="space-weather-aurora-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="space-weather-aurora-heading">
        Aurora forecast context
      </h2>
      <p className="leading-7 text-[var(--muted)]">{response.aurora.explanation}</p>
      <a
        className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline underline-offset-4"
        href={response.aurora.official_url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {response.aurora.label}
      </a>
    </section>
  );
}

function FreshnessDetails({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  const freshness = response.freshness;
  return (
    <section aria-labelledby="space-weather-freshness-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="space-weather-freshness-heading">
        Lumina retrieval state
      </h2>
      <dl className="grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Cache state</dt>
          <dd className="text-[var(--muted)]">{freshness.cache_state}</dd>
        </div>
        <TimestampField label="Snapshot retrieved at (UTC)" value={freshness.retrieved_at} />
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

function SourceDetails({ response }: Readonly<{ response: SpaceWeatherResponse }>) {
  return (
    <section aria-labelledby="space-weather-source-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="space-weather-source-heading">
        Source and limitations
      </h2>
      <div className="space-y-4 border border-[var(--border)] p-5">
        <p className="leading-7 text-[var(--muted)]">{response.source.attribution_text}</p>
        <p>
          <ExternalLink href={response.source.official_documentation_url}>
            {response.source.name} official documentation
          </ExternalLink>
        </p>
        <p className="text-sm leading-7 text-[var(--muted)]">
          Lumina is educational/informational. Consult NOAA/SWPC directly for operational guidance;
          this page is not an emergency warning replacement or a safety system.
        </p>
      </div>
      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/now">
        Return to Space Now
      </Link>
    </section>
  );
}

function UnavailableSpaceWeather({ response }: Readonly<{ response?: SpaceWeatherResponse }>) {
  const reason = response?.unavailable_reason;
  const detail =
    reason === "provider_disabled"
      ? "The Space Weather provider is disabled."
      : reason === "no_cached_content"
        ? "No validated Space Weather snapshot is available yet."
        : reason === "cached_content_expired"
          ? "The cached Space Weather snapshot has expired."
          : "Space Weather data could not be loaded from Lumina right now.";

  return (
    <section aria-labelledby="space-weather-unavailable-heading" className="space-y-6">
      <div
        aria-live="polite"
        className="space-y-3 border-l-4 border-[var(--border-strong)] bg-[var(--surface)] p-5"
        role="status"
      >
        <h2 className="text-2xl font-semibold" id="space-weather-unavailable-heading">
          Space Weather data is currently unavailable.
        </h2>
        <p className="leading-7 text-[var(--muted)]">{detail}</p>
      </div>
      {response === undefined ? null : (
        <>
          <FreshnessDetails response={response} />
          <SourceDetails response={response} />
        </>
      )}
      {response === undefined ? (
        <Link
          className="inline-flex min-h-11 items-center text-[var(--link)] underline"
          href="/now"
        >
          Return to Space Now
        </Link>
      ) : null}
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

function ExternalLink({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <a
      className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function withUnit(value: number | null, unit: string): string {
  return value === null ? "Not reported" : `${value} ${unit}`;
}
