import type { TransitMethodCalculationResponse } from "@lumina/api-client";

import {
  TRANSIT_DEFINITION,
  TRANSIT_SOURCES,
  type TransitMethodState,
} from "../lib/simulations/transit-method";

type TransitMethodNoScriptProps = Readonly<{
  initialState: TransitMethodState;
  initialStateInvalid: boolean;
  initialCalculation: TransitMethodCalculationResponse | null;
}>;

function numeric(value: number | null, unit = ""): string {
  if (value === null) return "Not applicable";
  const formatted =
    Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)
      ? value.toExponential(6)
      : value.toLocaleString("en", { maximumSignificantDigits: 8 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList() {
  return (
    <ul>
      {TRANSIT_DEFINITION.references.map((sourceId) => {
        const source = TRANSIT_SOURCES.find((candidate) => candidate.id === sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>Unavailable source record: {sourceId}</>
            ) : (
              <a href={source.url} rel="noreferrer">
                {source.title} — {source.organization_or_authors}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ResultTable({ result }: Readonly<{ result: TransitMethodCalculationResponse }>) {
  return (
    <table>
      <caption>Canonical Transit Method result from Lumina&apos;s astronomy API.</caption>
      <tbody>
        <tr>
          <th scope="row">Alignment classification</th>
          <td>{result.classification}</td>
        </tr>
        <tr>
          <th scope="row">Radius ratio</th>
          <td>{numeric(result.radius_ratio)}</td>
        </tr>
        <tr>
          <th scope="row">Scaled semi-major axis</th>
          <td>{numeric(result.scaled_semi_major_axis)}</td>
        </tr>
        <tr>
          <th scope="row">Impact parameter</th>
          <td>{numeric(result.impact_parameter)}</td>
        </tr>
        <tr>
          <th scope="row">Central depth approximation</th>
          <td>{numeric(result.central_depth_approximation_fraction)}</td>
        </tr>
        <tr>
          <th scope="row">Maximum uniform-source depth</th>
          <td>{numeric(result.maximum_depth_fraction)}</td>
        </tr>
        <tr>
          <th scope="row">Maximum depth</th>
          <td>{numeric(result.maximum_depth_ppm, "ppm")}</td>
        </tr>
        <tr>
          <th scope="row">First-to-fourth contact duration</th>
          <td>{numeric(result.total_duration_s, "s")}</td>
        </tr>
        <tr>
          <th scope="row">Second-to-third contact duration</th>
          <td>{numeric(result.full_duration_s, "s")}</td>
        </tr>
        <tr>
          <th scope="row">Light-curve samples</th>
          <td>{result.light_curve.length}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function TransitMethodNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: TransitMethodNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Transit Method Lab</p>
          <h1>Transit Method Lab</h1>
          <p>
            Explore a deterministic circular-orbit, uniformly bright stellar-disk transit model.
            Lumina&apos;s Python astronomy domain calculates the geometry and light curve; this page
            does not recreate the transit equations in the browser.
          </p>
        </header>
        {initialStateInvalid ? (
          <aside role="alert">
            <h2>Shared transit state rejected</h2>
            <p>The malformed or unsupported shared state was replaced with the reviewed default.</p>
          </aside>
        ) : null}
        <section aria-labelledby="transit-noscript-state">
          <h2 id="transit-noscript-state">Current input state</h2>
          <dl>
            <div>
              <dt>Stellar radius</dt>
              <dd>{numeric(initialState.stellar_radius_m, "m")}</dd>
            </div>
            <div>
              <dt>Planet radius</dt>
              <dd>{numeric(initialState.planet_radius_m, "m")}</dd>
            </div>
            <div>
              <dt>Semi-major axis</dt>
              <dd>{numeric(initialState.semi_major_axis_m, "m")}</dd>
            </div>
            <div>
              <dt>Orbital period</dt>
              <dd>{numeric(initialState.orbital_period_s, "s")}</dd>
            </div>
            <div>
              <dt>Inclination</dt>
              <dd>{numeric(initialState.inclination_deg, "deg")}</dd>
            </div>
          </dl>
        </section>
        {initialCalculation === null ? (
          <section role="alert">
            <h2>Calculation unavailable</h2>
            <p>No substitute or browser-generated light curve was fabricated.</p>
          </section>
        ) : (
          <section aria-labelledby="transit-noscript-result">
            <h2 id="transit-noscript-result">Canonical result</h2>
            <p>Model {initialCalculation.model_version}</p>
            <ResultTable result={initialCalculation} />
          </section>
        )}
        <section aria-labelledby="transit-noscript-model">
          <h2 id="transit-noscript-model">Model, assumptions, limitations, and provenance</h2>
          <p>{TRANSIT_DEFINITION.sampling_policy}</p>
          <p>{TRANSIT_DEFINITION.default_preset}</p>
          <h3>Equations</h3>
          <dl>
            {Object.entries(TRANSIT_DEFINITION.equations).map(([name, equation]) => (
              <div key={name}>
                <dt>{name.replaceAll("_", " ")}</dt>
                <dd>{equation}</dd>
              </div>
            ))}
          </dl>
          <h3>Assumptions</h3>
          <ul>
            {TRANSIT_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Limitations</h3>
          <ul>
            {TRANSIT_DEFINITION.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Reviewed sources</h3>
          <SourceList />
        </section>
      </article>
    </noscript>
  );
}
