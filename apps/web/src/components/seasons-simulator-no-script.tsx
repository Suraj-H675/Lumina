import {
  SEASONS_CONSTANTS,
  SEASONS_DEFINITION,
  SEASONS_PRESETS,
  SEASONS_SOURCES,
  type SeasonsState,
} from "../lib/simulations/seasons-simulator";
import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SeasonsSimulatorMessages } from "../lib/i18n/messages/types";
import type { SeasonsCalculationResponse } from "@lumina/api-client";

type SeasonsSimulatorNoScriptProps = Readonly<{
  initialState: SeasonsState;
  initialStateInvalid: boolean;
  initialCalculation: SeasonsCalculationResponse | null;
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages;
}>;

function formatAngle(value: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber(value, 1, locale)}°`;
}

function formatDayLength(
  value: number | null,
  locale: PublishedLocale,
  messages: SeasonsSimulatorMessages,
): string {
  return value === null
    ? messages.noScript.result.horizonAllDay
    : `${formatLocaleFixedNumber(value, 1, locale)} h`;
}

function formatFlux(value: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber((value - 1) * 100, 1, locale)}% relative to semi-major-axis flux`;
}

function sourceForId(id: string) {
  return SEASONS_SOURCES.find((source) => source.id === id);
}

function SourceReferences({
  messages,
  sourceIds,
}: Readonly<{
  messages: SeasonsSimulatorMessages["model"];
  sourceIds: ReadonlyArray<string>;
}>) {
  return (
    <ul>
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.sourceUnavailable, { sourceId })}</>
            ) : (
              <>
                <a href={source.url} rel="noreferrer">
                  {source.title}
                </a>{" "}
                ({source.organization_or_authors}; {source.id})
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function GeometryRows({
  label,
  geometry,
  locale,
  messages,
}: Readonly<{
  label: string;
  geometry: SeasonsCalculationResponse["selected"];
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages;
}>) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{formatAngle(geometry.latitude_deg, locale)}</td>
      <td>{formatAngle(geometry.noon_sun_altitude_deg, locale)}</td>
      <td>{formatAngle(geometry.illumination_incidence_deg, locale)}</td>
      <td>{formatDayLength(geometry.day_length_hours, locale, messages)}</td>
      <td>{geometry.polar_state}</td>
    </tr>
  );
}

/** Server-rendered semantic alternative that remains useful when JavaScript is disabled. */
export function SeasonsSimulatorNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: SeasonsSimulatorNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.noScript.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>

        {initialStateInvalid ? (
          <aside aria-label={messages.invalidState.title} role="alert">
            <h2 id="no-script-invalid-seasons-state-heading">{messages.invalidState.title}</h2>
            <p>{messages.noScript.invalidDescription}</p>
          </aside>
        ) : null}

        {initialCalculation === null ? (
          <section aria-labelledby="no-script-unavailable-heading" role="alert">
            <h2 id="no-script-unavailable-heading">{messages.noScript.unavailableTitle}</h2>
            <p>{messages.noScript.unavailableDescription}</p>
          </section>
        ) : (
          <>
            <section aria-labelledby="no-script-state-heading">
              <h2 id="no-script-state-heading">{messages.noScript.currentState.title}</h2>
              <dl>
                <div>
                  <dt>{messages.noScript.currentState.tilt}</dt>
                  <dd>{formatAngle(initialState.axial_tilt_deg, locale)}</dd>
                </div>
                <div>
                  <dt>{messages.noScript.currentState.orbitalPosition}</dt>
                  <dd>
                    {formatMessageTemplate(messages.noScript.currentState.orbitalPositionValue, {
                      angle: formatAngle(initialState.orbital_position_deg, locale),
                    })}
                  </dd>
                </div>
                <div>
                  <dt>{messages.noScript.currentState.latitude}</dt>
                  <dd>{formatAngle(initialState.latitude_deg, locale)}</dd>
                </div>
                <div>
                  <dt>{messages.noScript.currentState.eccentricityPreset}</dt>
                  <dd>{initialState.eccentricity_preset}</dd>
                </div>
              </dl>
              <p>{messages.noScript.currentState.phaseConvention}</p>
            </section>

            <section aria-labelledby="no-script-results-heading">
              <h2 id="no-script-results-heading">{messages.noScript.result.title}</h2>
              <p>
                {formatMessageTemplate(messages.noScript.result.comparisonSummary, {
                  comparisonLatitude: formatAngle(
                    initialCalculation.comparison_latitude_deg,
                    locale,
                  ),
                  declination: formatAngle(initialCalculation.solar_declination_deg, locale),
                })}
              </p>
              <div
                aria-label={messages.table.ariaLabel}
                role="region"
                style={{ overflowX: "auto" }}
                tabIndex={0}
              >
                <table>
                  <caption>{messages.noScript.result.tableCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{messages.noScript.result.tableHeaders.location}</th>
                      <th scope="col">{messages.noScript.result.tableHeaders.latitude}</th>
                      <th scope="col">{messages.noScript.result.tableHeaders.noonAltitude}</th>
                      <th scope="col">{messages.noScript.result.tableHeaders.incidence}</th>
                      <th scope="col">{messages.noScript.result.tableHeaders.dayLength}</th>
                      <th scope="col">{messages.noScript.result.tableHeaders.polarState}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <GeometryRows
                      label={messages.table.selectedLatitude}
                      geometry={initialCalculation.selected}
                      locale={locale}
                      messages={messages}
                    />
                    <GeometryRows
                      label={messages.table.oppositeLatitude}
                      geometry={initialCalculation.opposite_hemisphere}
                      locale={locale}
                      messages={messages}
                    />
                  </tbody>
                </table>
              </div>
              <p>
                {formatMessageTemplate(messages.noScript.result.distanceSummary, {
                  distance: formatLocaleFixedNumber(
                    initialCalculation.distance_over_semimajor_axis,
                    4,
                    locale,
                  ),
                  flux: formatFlux(initialCalculation.relative_solar_flux, locale),
                })}
              </p>
            </section>
          </>
        )}

        <section aria-labelledby="no-script-model-heading">
          <h2 id="no-script-model-heading">{messages.noScript.model.title}</h2>
          <p>
            <strong>{messages.noScript.model.modelVersionLabel}</strong>{" "}
            {formatMessageTemplate(messages.noScript.model.modelVersionSummary, {
              modelVersion: SEASONS_DEFINITION.model_version,
              schemaVersion: formatLocaleNumber(SEASONS_DEFINITION.share_schema_version, locale),
            })}
          </p>
          <p>
            <strong>{messages.noScript.model.solarDeclination}</strong>{" "}
            {SEASONS_DEFINITION.calculation_module.equations.solar_declination}
          </p>
          <p>
            <strong>{messages.noScript.model.localNoonGeometry}</strong>{" "}
            {SEASONS_DEFINITION.calculation_module.equations.noon_zenith}; noon altitude = 90° −
            zenith; noon incidence angle from the surface normal equals the noon zenith angle.
          </p>
          <p>
            <strong>{messages.noScript.model.dayLength}</strong>{" "}
            {SEASONS_DEFINITION.calculation_module.equations.ordinary_day_length}. It is a geometric
            centre-of-Sun approximation with zero atmospheric refraction, no solar-disc correction,
            no topographic horizon, and no equation-of-time or civil-time correction. Real observed
            sunrise and sunset differ.
          </p>
          <p>{messages.noScript.model.modelSummary}</p>
          <p>
            <strong>{messages.noScript.model.frozenConstants}</strong>{" "}
            {Object.entries(SEASONS_CONSTANTS)
              .map(([key, value]) => `${key}=${value}`)
              .join("; ")}
            . Presets:{" "}
            {Object.entries(SEASONS_PRESETS)
              .map(([key, value]) => `${key} (e=${value})`)
              .join(", ")}
            .
          </p>
          <h3>{messages.noScript.model.references}</h3>
          <SourceReferences messages={messages.model} sourceIds={SEASONS_DEFINITION.references} />
        </section>
      </article>
    </noscript>
  );
}
