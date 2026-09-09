import {
  TELESCOPE_CONSTANTS,
  TELESCOPE_DEFINITION,
  TELESCOPE_PRESETS,
  TELESCOPE_SOURCES,
  TELESCOPE_WARNING_COPY,
  type TelescopeBuilderState,
} from "../lib/simulations/telescope-builder";
import type { TelescopeBuilderCalculationResponse } from "@lumina/api-client";

type TelescopeBuilderNoScriptProps = Readonly<{
  initialState: TelescopeBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: TelescopeBuilderCalculationResponse | null;
}>;

function format(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function sourceForId(id: string) {
  return TELESCOPE_SOURCES.find((source) => source.id === id);
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

function ResultRows({ result }: Readonly<{ result: TelescopeBuilderCalculationResponse }>) {
  return (
    <tbody>
      <tr>
        <th scope="row">Effective focal length</th>
        <td>{format(result.effective_focal_length_mm)} mm</td>
      </tr>
      <tr>
        <th scope="row">Native focal ratio</th>
        <td>f/{format(result.native_focal_ratio)}</td>
      </tr>
      <tr>
        <th scope="row">Effective focal ratio</th>
        <td>f/{format(result.effective_focal_ratio)}</td>
      </tr>
      <tr>
        <th scope="row">Magnification</th>
        <td>{format(result.magnification_x, 1)}×</td>
      </tr>
      <tr>
        <th scope="row">Approximate true field</th>
        <td>{format(result.approx_true_field_deg)}°</td>
      </tr>
      <tr>
        <th scope="row">Exit pupil</th>
        <td>{format(result.exit_pupil_mm)} mm</td>
      </tr>
      <tr>
        <th scope="row">Dawes empirical double-star reference</th>
        <td>{format(result.dawes_limit_arcsec)} arcsec</td>
      </tr>
      <tr>
        <th scope="row">Rayleigh clear-aperture reference</th>
        <td>{format(result.rayleigh_limit_arcsec)} arcsec</td>
      </tr>
      <tr>
        <th scope="row">Ideal collecting-area ratio vs 7 mm reference pupil</th>
        <td>{format(result.ideal_light_gathering_ratio_vs_7mm_pupil, 1)}×</td>
      </tr>
      <tr>
        <th scope="row">Target angular size</th>
        <td>{format(result.target_angular_size_deg)}°</td>
      </tr>
      <tr>
        <th scope="row">Target field fraction</th>
        <td>{format(result.target_field_fraction * 100, 1)}%</td>
      </tr>
      <tr>
        <th scope="row">Target fit</th>
        <td>{result.target_fit}</td>
      </tr>
    </tbody>
  );
}

/** Server-rendered semantic alternative that remains useful when JavaScript is disabled. */
export function TelescopeBuilderNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: TelescopeBuilderNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 3B / Vertical 3</p>
          <h1>Telescope Builder</h1>
          <p>
            Explore an idealized visual-observing telescope and eyepiece geometry model without
            JavaScript. The canonical calculation is evaluated on the server through Lumina&apos;s
            read-only astronomy API.
          </p>
        </header>

        {initialStateInvalid ? (
          <aside aria-label="The shared Telescope Builder state was not valid" role="alert">
            <h2 id="no-script-invalid-telescope-state-heading">
              The shared Telescope Builder state was not valid
            </h2>
            <p>
              The requested version, exact field set, value range, relational constraint, or
              serialized form was rejected. The displayed state is the separately labelled default
              reset state.
            </p>
          </aside>
        ) : null}

        <section aria-labelledby="no-script-telescope-state-heading">
          <h2 id="no-script-telescope-state-heading">Current model state</h2>
          <dl>
            <div>
              <dt>Aperture</dt>
              <dd>{format(initialState.aperture_mm)} mm</dd>
            </div>
            <div>
              <dt>Native telescope focal length</dt>
              <dd>{format(initialState.telescope_focal_length_mm)} mm</dd>
            </div>
            <div>
              <dt>Telescope type</dt>
              <dd>{initialState.telescope_type}</dd>
            </div>
            <div>
              <dt>Eyepiece focal length</dt>
              <dd>{format(initialState.eyepiece_focal_length_mm)} mm</dd>
            </div>
            <div>
              <dt>Eyepiece apparent field</dt>
              <dd>{format(initialState.eyepiece_apparent_field_deg)}°</dd>
            </div>
            <div>
              <dt>Optical modifier</dt>
              <dd>
                {initialState.optical_modifier_kind},{" "}
                {format(initialState.optical_modifier_factor, 2)}×
              </dd>
            </div>
            <div>
              <dt>Target angular extent</dt>
              <dd>{format(initialState.target_angular_size_arcmin, 2)} arcmin</dd>
            </div>
          </dl>
        </section>

        {initialCalculation === null ? (
          <section aria-labelledby="no-script-telescope-unavailable-heading" role="alert">
            <h2 id="no-script-telescope-unavailable-heading">Calculation unavailable</h2>
            <p>
              The Telescope Builder calculation service was unavailable. No fabricated or unrelated
              result was substituted.
            </p>
          </section>
        ) : (
          <section aria-labelledby="no-script-telescope-results-heading">
            <h2 id="no-script-telescope-results-heading">Canonical text and data result</h2>
            <table>
              <caption>
                Canonical idealized visual-observing geometry; all values retain their stated units.
              </caption>
              <ResultRows result={initialCalculation} />
            </table>
            {initialCalculation.warning_codes.length > 0 ? (
              <div role="note">
                <h3>Rules-of-thumb warnings</h3>
                <ul>
                  {initialCalculation.warning_codes.map((warning) => (
                    <li key={warning}>
                      <strong>{warning}:</strong> {TELESCOPE_WARNING_COPY[warning]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>No practical rules-of-thumb warnings for this configuration.</p>
            )}
          </section>
        )}

        <section aria-labelledby="no-script-telescope-model-heading">
          <h2 id="no-script-telescope-model-heading">
            Model, equations, assumptions, and provenance
          </h2>
          <p>
            <strong>Model version:</strong> {TELESCOPE_DEFINITION.model_version}; share schema
            version {TELESCOPE_DEFINITION.share_schema_version}. These are idealized optical
            estimates, not guaranteed views, equipment recommendations, or imaging calculations.
          </p>
          <h3>Equations</h3>
          <dl>
            {Object.entries(TELESCOPE_DEFINITION.calculation_module.equations).map(
              ([name, equation]) => (
                <div key={name}>
                  <dt>{name.replaceAll("_", " ")}</dt>
                  <dd>{equation}</dd>
                </div>
              ),
            )}
          </dl>
          <h3>Validity and assumptions</h3>
          <ul>
            {TELESCOPE_DEFINITION.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
          <p>{TELESCOPE_DEFINITION.telescope_type_disclosure}</p>
          <p>{TELESCOPE_DEFINITION.modifier_semantics}</p>
          <p>{TELESCOPE_DEFINITION.target_fit_definition}</p>
          <h3>Limitations</h3>
          <ul>
            {TELESCOPE_DEFINITION.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <p>
            <strong>Frozen constants:</strong>{" "}
            {Object.entries(TELESCOPE_CONSTANTS)
              .map(([key, value]) => `${key}=${value}`)
              .join("; ")}
            . Default preset: {Object.keys(TELESCOPE_PRESETS).join(", ")}.
          </p>
          <h3>References and provenance</h3>
          <SourceReferences sourceIds={TELESCOPE_DEFINITION.references} />
        </section>
      </article>
    </noscript>
  );
}
