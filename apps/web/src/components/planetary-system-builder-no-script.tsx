import type { PlanetarySystemBuilderCalculationResponse } from "@lumina/api-client";

import {
  PLANETARY_SYSTEM_BUILDER_DEFINITION,
  PLANETARY_SYSTEM_BUILDER_SOURCES,
  type PlanetarySystemBuilderState,
} from "../lib/simulations/planetary-system-builder";

type PlanetarySystemBuilderNoScriptProps = Readonly<{
  initialState: PlanetarySystemBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: PlanetarySystemBuilderCalculationResponse | null;
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
      {PLANETARY_SYSTEM_BUILDER_DEFINITION.references.map((sourceId) => {
        const source = PLANETARY_SYSTEM_BUILDER_SOURCES.find(
          (candidate) => candidate.id === sourceId,
        );
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

export function PlanetarySystemBuilderNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: PlanetarySystemBuilderNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Planetary System Builder</p>
          <h1>Planetary System Builder</h1>
          <p>
            Build a circular, coplanar, non-interacting teaching system. Lumina&apos;s Python
            astronomy domain owns every Keplerian period, reference habitable-zone boundary, and
            pairwise mutual-Hill diagnostic.
          </p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="builder-nojs-invalid">
            <h2 id="builder-nojs-invalid">Shared planetary-system state rejected</h2>
            <p>The reviewed illustrative three-planet preset is shown instead.</p>
          </section>
        ) : null}
        <section aria-labelledby="builder-nojs-input">
          <h2 id="builder-nojs-input">Requested teaching system</h2>
          <p>Stellar mass: {numeric(initialState.stellar_mass_msun, "M☉")}</p>
          <p>Stellar luminosity: {numeric(initialState.stellar_luminosity_lsun, "L☉")}</p>
          <p>Effective temperature: {numeric(initialState.stellar_effective_temperature_k, "K")}</p>
          <ol>
            {initialState.planets.map((planet, index) => (
              <li key={`${index}-${planet.semi_major_axis_au}`}>
                Planet {index + 1}: {numeric(planet.mass_mearth, "M⊕")} at{" "}
                {numeric(planet.semi_major_axis_au, "AU")}
              </li>
            ))}
          </ol>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="builder-nojs-unavailable">
            <h2 id="builder-nojs-unavailable">No canonical result available</h2>
            <p>No browser-generated periods, HZ boundaries, or Hill diagnostics are substituted.</p>
          </section>
        ) : (
          <section aria-labelledby="builder-nojs-result">
            <h2 id="builder-nojs-result">Canonical system result</h2>
            <p>Model version: {initialCalculation.model_version}</p>
            <p>
              Modeled reference HZ: {numeric(initialCalculation.habitable_zone.inner_edge_au, "AU")}{" "}
              to {numeric(initialCalculation.habitable_zone.outer_edge_au, "AU")}.
            </p>
            <p>{initialCalculation.habitable_zone.habitability_note}</p>
            <table>
              <caption>Returned planet periods and reference-HZ placement.</caption>
              <thead>
                <tr>
                  <th scope="col">Planet</th>
                  <th scope="col">Mass M⊕</th>
                  <th scope="col">Semimajor axis AU</th>
                  <th scope="col">Period days</th>
                  <th scope="col">Reference-HZ placement</th>
                </tr>
              </thead>
              <tbody>
                {initialCalculation.planets.map((planet) => (
                  <tr key={planet.index}>
                    <td>{planet.index}</td>
                    <td>{numeric(planet.mass_mearth)}</td>
                    <td>{numeric(planet.semi_major_axis_au)}</td>
                    <td>{numeric(planet.orbital_period_days)}</td>
                    <td>{planet.habitable_zone_relation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {initialCalculation.adjacent_pairs.length === 0 ? (
              <p>A single-planet system has no adjacent-pair mutual-Hill diagnostic.</p>
            ) : (
              <table>
                <caption>Returned adjacent-pair mutual-Hill spacing diagnostics.</caption>
                <thead>
                  <tr>
                    <th scope="col">Pair</th>
                    <th scope="col">Separation Δ</th>
                    <th scope="col">Assessment</th>
                    <th scope="col">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.adjacent_pairs.map((pair) => (
                    <tr key={`${pair.inner_index}-${pair.outer_index}`}>
                      <td>
                        {pair.inner_index}–{pair.outer_index}
                      </td>
                      <td>{numeric(pair.separation_mutual_hill)}</td>
                      <td>{pair.spacing_assessment}</td>
                      <td>{pair.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p>{initialCalculation.stellar_consistency_note}</p>
            <p>{initialCalculation.stability_note}</p>
          </section>
        )}
        <section aria-labelledby="builder-nojs-model">
          <h2 id="builder-nojs-model">Model contract and provenance</h2>
          <p>{PLANETARY_SYSTEM_BUILDER_DEFINITION.sampling_policy}</p>
          <h3>Limitations</h3>
          <ul>
            {PLANETARY_SYSTEM_BUILDER_DEFINITION.limitations.map((item) => (
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
