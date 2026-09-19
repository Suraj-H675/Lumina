import type { ImpactSimulatorCalculationResponse } from "@lumina/api-client";

import {
  IMPACT_SIMULATOR_DEFINITION,
  IMPACT_SIMULATOR_SOURCES,
  type ImpactSimulatorState,
} from "../lib/simulations/impact-simulator";

type ImpactSimulatorNoScriptProps = Readonly<{
  initialState: ImpactSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: ImpactSimulatorCalculationResponse | null;
}>;

function numeric(value: number, unit = ""): string {
  const formatted =
    Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)
      ? value.toExponential(5)
      : value.toLocaleString("en", { maximumSignificantDigits: 7 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList() {
  return (
    <ul>
      {IMPACT_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = IMPACT_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
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

export function ImpactSimulatorNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: ImpactSimulatorNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Impact Simulator</p>
          <h1>Impact Simulator</h1>
          <p>
            Explore a source-backed large solid-rock Earth-impact teaching model. Lumina&apos;s
            Python astronomy domain owns all energy, crater-scaling, coefficient-sensitivity, and
            ejecta-thickness calculations.
          </p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="impact-nojs-invalid">
            <h2 id="impact-nojs-invalid">Shared impact state rejected</h2>
            <p>The reviewed synthetic large-impactor preset is shown instead.</p>
          </section>
        ) : null}
        <section aria-labelledby="impact-nojs-input">
          <h2 id="impact-nojs-input">Requested synthetic impact</h2>
          <p>Diameter: {numeric(initialState.diameter_m, "m")}</p>
          <p>Impactor density: {numeric(initialState.impactor_density_kg_m3, "kg/m³")}</p>
          <p>Speed: {numeric(initialState.speed_km_s, "km/s")}</p>
          <p>Angle above local horizontal: {numeric(initialState.impact_angle_deg, "degrees")}</p>
          <p>Target material: {initialState.target_material}</p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="impact-nojs-unavailable">
            <h2 id="impact-nojs-unavailable">No canonical result available</h2>
            <p>
              No browser-generated energy, crater diameter, coefficient sensitivity, or ejecta range
              is substituted.
            </p>
          </section>
        ) : (
          <>
            <section aria-labelledby="impact-nojs-result">
              <h2 id="impact-nojs-result">Canonical educational result</h2>
              <p>Model version: {initialCalculation.model_version}</p>
              <p>Impactor mass: {numeric(initialCalculation.impactor_mass_kg, "kg")}</p>
              <p>Kinetic energy: {numeric(initialCalculation.kinetic_energy_j, "J")}</p>
              <p>
                TNT-equivalent energy context:{" "}
                {numeric(initialCalculation.tnt_equivalent_megatons, "Mt TNT")}
              </p>
              <p>
                TNT equivalence is descriptive unit context only, not an equivalent blast-damage
                footprint.
              </p>
              <p>
                Best transient crater:{" "}
                {numeric(initialCalculation.best_estimate_crater.transient_diameter_m, "m")}
              </p>
              <p>
                Best final crater:{" "}
                {numeric(initialCalculation.best_estimate_crater.final_diameter_m, "m")}
              </p>
            </section>
            <section aria-labelledby="impact-nojs-sensitivity">
              <h2 id="impact-nojs-sensitivity">Crater coefficient sensitivity</h2>
              <p>{initialCalculation.uncertainty_note}</p>
              <table>
                <caption>Python-returned low, best, and high coefficient sensitivity.</caption>
                <thead>
                  <tr>
                    <th scope="col">Scaling coefficient</th>
                    <th scope="col">Transient diameter m</th>
                    <th scope="col">Final diameter m</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.coefficient_sensitivity.map((row) => (
                    <tr key={row.scaling_coefficient}>
                      <td>{numeric(row.scaling_coefficient)}</td>
                      <td>{numeric(row.transient_diameter_m)}</td>
                      <td>{numeric(row.final_diameter_m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section aria-labelledby="impact-nojs-ejecta">
              <h2 id="impact-nojs-ejecta">Lower-bound ejecta thickness radii</h2>
              <table>
                <caption>Location-free Python-returned lower-bound deposit radii.</caption>
                <thead>
                  <tr>
                    <th scope="col">Deposit thickness m</th>
                    <th scope="col">Radius m</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.ejecta_thickness_radii.map((row) => (
                    <tr key={row.thickness_m}>
                      <td>{numeric(row.thickness_m)}</td>
                      <td>{numeric(row.radius_m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>{initialCalculation.model_note}</p>
            </section>
          </>
        )}
        <section aria-labelledby="impact-nojs-model">
          <h2 id="impact-nojs-model">Model contract and provenance</h2>
          <h3>Assumptions</h3>
          <ul>
            {IMPACT_SIMULATOR_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Limitations</h3>
          <ul>
            {IMPACT_SIMULATOR_DEFINITION.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Reviewed model equations</h3>
          <ul>
            {IMPACT_SIMULATOR_DEFINITION.equations.map((equation) => (
              <li key={equation.id}>
                <strong>{equation.id}:</strong> <code>{equation.expression}</code>
                {equation.source_equation ? ` — ${equation.source_equation}` : ""}
              </li>
            ))}
          </ul>
          <h3>Reviewed sources</h3>
          <SourceList />
        </section>
      </article>
    </noscript>
  );
}
