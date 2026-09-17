import type { OrbitSandboxCalculationResponse } from "@lumina/api-client";

import {
  ORBIT_DEFINITION,
  ORBIT_SOURCES,
  type OrbitSandboxState,
} from "../lib/simulations/orbit-sandbox";

type OrbitSandboxNoScriptProps = Readonly<{
  initialState: OrbitSandboxState;
  initialStateInvalid: boolean;
  initialCalculation: OrbitSandboxCalculationResponse | null;
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
      {ORBIT_DEFINITION.references.map((sourceId) => {
        const source = ORBIT_SOURCES.find((candidate) => candidate.id === sourceId);
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

function ResultTable({ result }: Readonly<{ result: OrbitSandboxCalculationResponse }>) {
  return (
    <table>
      <caption>Canonical Newtonian two-body result from Lumina&apos;s astronomy API.</caption>
      <tbody>
        <tr>
          <th scope="row">Classification</th>
          <td>{result.classification}</td>
        </tr>
        <tr>
          <th scope="row">Eccentricity</th>
          <td>{numeric(result.eccentricity)}</td>
        </tr>
        <tr>
          <th scope="row">Specific orbital energy</th>
          <td>{numeric(result.specific_orbital_energy_j_per_kg, "J/kg")}</td>
        </tr>
        <tr>
          <th scope="row">Specific angular momentum</th>
          <td>{numeric(result.specific_angular_momentum_m2_per_s, "m²/s")}</td>
        </tr>
        <tr>
          <th scope="row">Semi-major axis</th>
          <td>{numeric(result.semi_major_axis_m, "m")}</td>
        </tr>
        <tr>
          <th scope="row">Period</th>
          <td>{numeric(result.period_s, "s")}</td>
        </tr>
        <tr>
          <th scope="row">Periapsis</th>
          <td>{numeric(result.periapsis_m, "m")}</td>
        </tr>
        <tr>
          <th scope="row">Apoapsis</th>
          <td>{numeric(result.apoapsis_m, "m")}</td>
        </tr>
        <tr>
          <th scope="row">Collision time in requested window</th>
          <td>{numeric(result.collision_time_s, "s")}</td>
        </tr>
        <tr>
          <th scope="row">Trajectory samples</th>
          <td>{result.trajectory.length}</td>
        </tr>
        <tr>
          <th scope="row">Max specific-energy drift</th>
          <td>{numeric(result.max_specific_energy_drift_fraction)}</td>
        </tr>
        <tr>
          <th scope="row">Max angular-momentum drift</th>
          <td>{numeric(result.max_specific_angular_momentum_drift_fraction)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function OrbitSandboxNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: OrbitSandboxNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Orbit Sandbox</p>
          <h1>Orbit Sandbox</h1>
          <p>
            Explore a deterministic planar Newtonian two-body model. The canonical orbital elements
            and trajectory are calculated by Lumina&apos;s server-side astronomy domain, not by this
            page.
          </p>
        </header>
        {initialStateInvalid ? (
          <aside role="alert">
            <h2>Shared orbit state rejected</h2>
            <p>The malformed or unsupported shared state was replaced with the reviewed default.</p>
          </aside>
        ) : null}
        <section aria-labelledby="orbit-noscript-state">
          <h2 id="orbit-noscript-state">Current input state</h2>
          <dl>
            <div>
              <dt>Central mass</dt>
              <dd>{numeric(initialState.central_mass_kg, "kg")}</dd>
            </div>
            <div>
              <dt>Central collision radius</dt>
              <dd>{numeric(initialState.central_radius_m, "m")}</dd>
            </div>
            <div>
              <dt>Secondary mass</dt>
              <dd>{numeric(initialState.orbiting_body_mass_kg, "kg")}</dd>
            </div>
            <div>
              <dt>Initial position</dt>
              <dd>
                ({numeric(initialState.position_x_m, "m")},{" "}
                {numeric(initialState.position_y_m, "m")})
              </dd>
            </div>
            <div>
              <dt>Initial velocity</dt>
              <dd>
                ({numeric(initialState.velocity_x_m_s, "m/s")},{" "}
                {numeric(initialState.velocity_y_m_s, "m/s")})
              </dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{numeric(initialState.duration_s, "s")}</dd>
            </div>
            <div>
              <dt>Time step</dt>
              <dd>{numeric(initialState.time_step_s, "s")}</dd>
            </div>
          </dl>
        </section>
        {initialCalculation === null ? (
          <section role="alert">
            <h2>Calculation unavailable</h2>
            <p>No substitute or browser-generated orbit was fabricated.</p>
          </section>
        ) : (
          <section aria-labelledby="orbit-noscript-result">
            <h2 id="orbit-noscript-result">Canonical result</h2>
            <p>Model {initialCalculation.model_version}</p>
            <ResultTable result={initialCalculation} />
          </section>
        )}
        <section aria-labelledby="orbit-noscript-model">
          <h2 id="orbit-noscript-model">Model, assumptions, limitations, and provenance</h2>
          <p>{ORBIT_DEFINITION.calculation_module.valid_domain}</p>
          <p>{ORBIT_DEFINITION.calculation_module.numerical_policy}</p>
          <h3>Equations</h3>
          <dl>
            {Object.entries(ORBIT_DEFINITION.calculation_module.equations).map(
              ([name, equation]) => (
                <div key={name}>
                  <dt>{name.replaceAll("_", " ")}</dt>
                  <dd>{equation}</dd>
                </div>
              ),
            )}
          </dl>
          <h3>Assumptions</h3>
          <ul>
            {ORBIT_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Limitations</h3>
          <ul>
            {ORBIT_DEFINITION.limitations.map((item) => (
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
