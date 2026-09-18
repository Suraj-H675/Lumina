import type { RadialVelocityCalculationResponse } from "@lumina/api-client";

import {
  RADIAL_VELOCITY_DEFINITION,
  RADIAL_VELOCITY_SOURCES,
  type RadialVelocityState,
} from "../lib/simulations/radial-velocity";

type RadialVelocityNoScriptProps = Readonly<{
  initialState: RadialVelocityState;
  initialStateInvalid: boolean;
  initialCalculation: RadialVelocityCalculationResponse | null;
}>;

function numeric(value: number, unit = ""): string {
  const formatted =
    Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)
      ? value.toExponential(6)
      : value.toLocaleString("en", { maximumSignificantDigits: 8 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList() {
  return (
    <ul>
      {RADIAL_VELOCITY_DEFINITION.references.map((sourceId) => {
        const source = RADIAL_VELOCITY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function ResultTable({ result }: Readonly<{ result: RadialVelocityCalculationResponse }>) {
  return (
    <table>
      <caption>Canonical Radial Velocity result from Lumina&apos;s astronomy API.</caption>
      <tbody>
        <tr>
          <th scope="row">RV semi-amplitude</th>
          <td>{numeric(result.semi_amplitude_m_s, "m/s")}</td>
        </tr>
        <tr>
          <th scope="row">Inclination projection</th>
          <td>{numeric(result.inclination_projection)}</td>
        </tr>
        <tr>
          <th scope="row">Projected companion mass Mp sin(i)</th>
          <td>{numeric(result.projected_planet_mass_kg, "kg")}</td>
        </tr>
        <tr>
          <th scope="row">Spectroscopic mass function</th>
          <td>{numeric(result.mass_function_kg, "kg")}</td>
        </tr>
        <tr>
          <th scope="row">Exact edge-on minimum companion mass</th>
          <td>{numeric(result.edge_on_minimum_mass_kg, "kg")}</td>
        </tr>
        <tr>
          <th scope="row">RV samples</th>
          <td>{result.curve.length}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function RadialVelocityNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: RadialVelocityNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Radial Velocity Lab</p>
          <h1>Radial Velocity Lab</h1>
          <p>
            Explore deterministic Keplerian stellar reflex velocity and the inclination–mass
            degeneracy. Lumina&apos;s Python astronomy domain solves the orbit and mass function;
            this page does not recreate those equations in the browser.
          </p>
        </header>
        {initialStateInvalid ? (
          <aside role="alert">
            <h2>Shared radial-velocity state rejected</h2>
            <p>The malformed or unsupported shared state was replaced with the reviewed default.</p>
          </aside>
        ) : null}
        <section aria-labelledby="rv-noscript-state">
          <h2 id="rv-noscript-state">Current input state</h2>
          <dl>
            <div>
              <dt>Stellar mass</dt>
              <dd>{numeric(initialState.stellar_mass_kg, "kg")}</dd>
            </div>
            <div>
              <dt>Companion mass</dt>
              <dd>{numeric(initialState.planet_mass_kg, "kg")}</dd>
            </div>
            <div>
              <dt>Orbital period</dt>
              <dd>{numeric(initialState.orbital_period_s, "s")}</dd>
            </div>
            <div>
              <dt>Eccentricity</dt>
              <dd>{numeric(initialState.eccentricity)}</dd>
            </div>
            <div>
              <dt>Inclination</dt>
              <dd>{numeric(initialState.inclination_deg, "deg")}</dd>
            </div>
            <div>
              <dt>Star&apos;s argument of periastron</dt>
              <dd>{numeric(initialState.stellar_argument_of_periastron_deg, "deg")}</dd>
            </div>
            <div>
              <dt>Mean anomaly at epoch</dt>
              <dd>{numeric(initialState.mean_anomaly_at_epoch_deg, "deg")}</dd>
            </div>
          </dl>
        </section>
        {initialCalculation === null ? (
          <section role="alert">
            <h2>Calculation unavailable</h2>
            <p>No substitute or browser-generated RV curve was fabricated.</p>
          </section>
        ) : (
          <section aria-labelledby="rv-noscript-result">
            <h2 id="rv-noscript-result">Canonical result</h2>
            <p>Model {initialCalculation.model_version}</p>
            <ResultTable result={initialCalculation} />
          </section>
        )}
        <section aria-labelledby="rv-noscript-model">
          <h2 id="rv-noscript-model">Model, assumptions, limitations, and provenance</h2>
          <p>{RADIAL_VELOCITY_DEFINITION.sampling_policy}</p>
          <p>{RADIAL_VELOCITY_DEFINITION.default_preset}</p>
          <h3>Minimum-mass interpretation</h3>
          <p>
            Lumina reports both the conventional projected quantity Mp sin(i) and the exact edge-on
            minimum mass implied by the spectroscopic mass function. They are not treated as
            algebraically identical when the companion mass matters in the denominator.
          </p>
          <h3>Equations</h3>
          <dl>
            {Object.entries(RADIAL_VELOCITY_DEFINITION.equations).map(([name, equation]) => (
              <div key={name}>
                <dt>{name.replaceAll("_", " ")}</dt>
                <dd>{equation}</dd>
              </div>
            ))}
          </dl>
          <h3>Assumptions</h3>
          <ul>
            {RADIAL_VELOCITY_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Limitations</h3>
          <ul>
            {RADIAL_VELOCITY_DEFINITION.limitations.map((item) => (
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
