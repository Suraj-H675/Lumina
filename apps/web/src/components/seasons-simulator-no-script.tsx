import {
  SEASONS_CONSTANTS,
  SEASONS_DEFINITION,
  SEASONS_PRESETS,
  SEASONS_SOURCES,
  type SeasonsState,
} from "../lib/simulations/seasons-simulator";
import type { SeasonsCalculationResponse } from "@lumina/api-client";

type SeasonsSimulatorNoScriptProps = Readonly<{
  initialState: SeasonsState;
  initialStateInvalid: boolean;
  initialCalculation: SeasonsCalculationResponse | null;
}>;

function formatAngle(value: number): string {
  return `${value.toFixed(1)}°`;
}

function formatDayLength(value: number | null): string {
  return value === null ? "not defined (horizon all day)" : `${value.toFixed(1)} h`;
}

function formatFlux(value: number): string {
  return `${((value - 1) * 100).toFixed(1)}% relative to semi-major-axis flux`;
}

function sourceForId(id: string) {
  return SEASONS_SOURCES.find((source) => source.id === id);
}

function SourceReferences({ sourceIds }: Readonly<{ sourceIds: ReadonlyArray<string> }>) {
  return (
    <ul>
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>Unavailable source record: {sourceId}</>
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
}: Readonly<{
  label: string;
  geometry: SeasonsCalculationResponse["selected"];
}>) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{formatAngle(geometry.latitude_deg)}</td>
      <td>{formatAngle(geometry.noon_sun_altitude_deg)}</td>
      <td>{formatAngle(geometry.illumination_incidence_deg)}</td>
      <td>{formatDayLength(geometry.day_length_hours)}</td>
      <td>{geometry.polar_state}</td>
    </tr>
  );
}

/** Server-rendered semantic alternative that remains useful when JavaScript is disabled. */
export function SeasonsSimulatorNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: SeasonsSimulatorNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 3B / Vertical 2</p>
          <h1>Seasons Simulator</h1>
          <p>
            Explore an idealized geometric seasons model without JavaScript. The canonical model
            calculation is evaluated on the server through Lumina&apos;s read-only astronomy API.
          </p>
        </header>

        {initialStateInvalid ? (
          <aside aria-label="The shared Seasons Simulator state was not valid" role="alert">
            <h2 id="no-script-invalid-seasons-state-heading">
              The shared Seasons Simulator state was not valid
            </h2>
            <p>
              The requested version, field set, value range, or serialized form was rejected. The
              displayed state is the separately labelled default reset state.
            </p>
          </aside>
        ) : null}

        {initialCalculation === null ? (
          <section aria-labelledby="no-script-unavailable-heading" role="alert">
            <h2 id="no-script-unavailable-heading">Calculation unavailable</h2>
            <p>
              The Seasons calculation service was unavailable for this request. No unrelated or
              fabricated scientific result was substituted.
            </p>
          </section>
        ) : (
          <>
            <section aria-labelledby="no-script-state-heading">
              <h2 id="no-script-state-heading">Current model state</h2>
              <dl>
                <div>
                  <dt>Axial tilt</dt>
                  <dd>{formatAngle(initialState.axial_tilt_deg)}</dd>
                </div>
                <div>
                  <dt>Orbital position</dt>
                  <dd>{formatAngle(initialState.orbital_position_deg)} seasonal angle</dd>
                </div>
                <div>
                  <dt>Latitude</dt>
                  <dd>{formatAngle(initialState.latitude_deg)}</dd>
                </div>
                <div>
                  <dt>Eccentricity preset</dt>
                  <dd>{initialState.eccentricity_preset}</dd>
                </div>
              </dl>
              <p>
                Phase convention: 0° March equinox, 90° June solstice, 180° September equinox, 270°
                December solstice. Orbital position is not a calendar date or elapsed time.
              </p>
            </section>

            <section aria-labelledby="no-script-results-heading">
              <h2 id="no-script-results-heading">Text and data result</h2>
              <p>
                Solar declination: {formatAngle(initialCalculation.solar_declination_deg)}. The
                comparison latitude is exactly{" "}
                {formatAngle(initialCalculation.comparison_latitude_deg)}.
              </p>
              <div
                aria-label="Seasons solar geometry comparison table"
                role="region"
                style={{ overflowX: "auto" }}
                tabIndex={0}
              >
                <table>
                  <caption>
                    Noon solar geometry and Geometric day-length approximation. Incidence is
                    measured from the outward local surface normal.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Location</th>
                      <th scope="col">Latitude</th>
                      <th scope="col">Noon Sun altitude</th>
                      <th scope="col">Noon incidence angle from surface normal</th>
                      <th scope="col">Day length</th>
                      <th scope="col">Polar state</th>
                    </tr>
                  </thead>
                  <tbody>
                    <GeometryRows
                      label="Selected latitude"
                      geometry={initialCalculation.selected}
                    />
                    <GeometryRows
                      label="Equal-and-opposite latitude"
                      geometry={initialCalculation.opposite_hemisphere}
                    />
                  </tbody>
                </table>
              </div>
              <p>
                Normalized Earth-Sun distance:{" "}
                {initialCalculation.distance_over_semimajor_axis.toFixed(4)} a. Relative
                inverse-square solar flux: {formatFlux(initialCalculation.relative_solar_flux)}.
                This distance quantity is not surface irradiance, absorbed energy, temperature,
                climate, or weather.
              </p>
            </section>
          </>
        )}

        <section aria-labelledby="no-script-model-heading">
          <h2 id="no-script-model-heading">Model, assumptions, and limitations</h2>
          <p>
            <strong>Model version:</strong> {SEASONS_DEFINITION.model_version}; schema version{" "}
            {SEASONS_DEFINITION.share_schema_version}. This is an idealized geometric seasons model,
            not a date-specific solar ephemeris.
          </p>
          <p>
            <strong>Solar declination:</strong>{" "}
            {SEASONS_DEFINITION.calculation_module.equations.solar_declination}
          </p>
          <p>
            <strong>Local-noon geometry:</strong>{" "}
            {SEASONS_DEFINITION.calculation_module.equations.noon_zenith}; noon altitude = 90° −
            zenith; noon incidence angle from the surface normal equals the noon zenith angle.
          </p>
          <p>
            <strong>Day length:</strong>{" "}
            {SEASONS_DEFINITION.calculation_module.equations.ordinary_day_length}. It is a geometric
            centre-of-Sun approximation with zero atmospheric refraction, no solar-disc correction,
            no topographic horizon, and no equation-of-time or civil-time correction. Real observed
            sunrise and sunset differ.
          </p>
          <p>
            Axial tilt drives the opposite-hemisphere changes in Sun height, incidence, and
            daylight. Eccentricity changes only normalized distance and inverse-square flux context
            at a fixed orbital angle; it does not change the tilt geometry. The exaggerated preset
            is hypothetical. The model does not predict weather, climate, or temperature.
          </p>
          <p>
            <strong>Frozen constants:</strong>{" "}
            {Object.entries(SEASONS_CONSTANTS)
              .map(([key, value]) => `${key}=${value}`)
              .join("; ")}
            . Presets:{" "}
            {Object.entries(SEASONS_PRESETS)
              .map(([key, value]) => `${key} (e=${value})`)
              .join(", ")}
            .
          </p>
          <h3>References and provenance</h3>
          <SourceReferences sourceIds={SEASONS_DEFINITION.references} />
        </section>
      </article>
    </noscript>
  );
}
