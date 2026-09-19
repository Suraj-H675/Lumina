import type { BlackHoleRelativityCalculationResponse } from "@lumina/api-client";

import {
  BLACK_HOLE_RELATIVITY_DEFINITION,
  BLACK_HOLE_RELATIVITY_SOURCES,
  type BlackHoleRelativityState,
} from "../lib/simulations/black-hole-relativity";

type BlackHoleRelativityNoScriptProps = Readonly<{
  initialState: BlackHoleRelativityState;
  initialStateInvalid: boolean;
  initialCalculation: BlackHoleRelativityCalculationResponse | null;
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
      {BLACK_HOLE_RELATIVITY_DEFINITION.references.map((sourceId) => {
        const source = BLACK_HOLE_RELATIVITY_SOURCES.find((candidate) => candidate.id === sourceId);
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

export function BlackHoleRelativityNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: BlackHoleRelativityNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Black-Hole / Relativity Lab</p>
          <h1>Black-Hole / Relativity Lab</h1>
          <p>
            Explore a source-backed Schwarzschild landmark and static-clock teaching model.
            Lumina&apos;s Python astronomy domain owns all horizon, photon-sphere, ISCO, clock-rate,
            and gravitational-redshift calculations.
          </p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="black-hole-nojs-invalid">
            <h2 id="black-hole-nojs-invalid">Shared relativity state rejected</h2>
            <p>The reviewed synthetic Schwarzschild preset is shown instead.</p>
          </section>
        ) : null}
        <section aria-labelledby="black-hole-nojs-input">
          <h2 id="black-hole-nojs-input">Requested teaching state</h2>
          <p>
            Nominal-solar GM scale: {numeric(initialState.mass_nominal_solar)} nominal solar masses
          </p>
          <p>Static observer areal radius: {numeric(initialState.static_observer_radius_rs)} Rₛ</p>
          <p>
            The mass control is the IAU nominal-solar gravitational-parameter ratio, not a measured
            mass in kilograms. The selected observer is an accelerated hoverer, not a freely falling
            or orbiting observer.
          </p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="black-hole-nojs-unavailable">
            <h2 id="black-hole-nojs-unavailable">No canonical result available</h2>
            <p>
              No browser-generated horizon, photon-sphere, ISCO, clock-rate, or redshift value is
              substituted.
            </p>
          </section>
        ) : (
          <>
            <section aria-labelledby="black-hole-nojs-result">
              <h2 id="black-hole-nojs-result">Canonical Schwarzschild result</h2>
              <p>Model version: {initialCalculation.model_version}</p>
              <p>
                Gravitational parameter:{" "}
                {numeric(initialCalculation.gravitational_parameter_m3_s2, "m³/s²")}
              </p>
              <p>
                Schwarzschild/event-horizon areal radius:{" "}
                {numeric(initialCalculation.schwarzschild_radius_m, "m")}
              </p>
              <p>
                Selected static-observer areal radius:{" "}
                {numeric(initialCalculation.static_observer_areal_radius_m, "m")}
              </p>
              <table>
                <caption>Python-returned Schwarzschild landmarks.</caption>
                <thead>
                  <tr>
                    <th scope="col">Landmark</th>
                    <th scope="col">Radius Rₛ</th>
                    <th scope="col">Radius m</th>
                    <th scope="col">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.landmarks.map((row) => (
                    <tr key={row.id}>
                      <td>{row.label}</td>
                      <td>{numeric(row.radius_rs)}</td>
                      <td>{numeric(row.radius_m)}</td>
                      <td>{row.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section aria-labelledby="black-hole-nojs-clock">
              <h2 id="black-hole-nojs-clock">Static clock and redshift</h2>
              <p>
                Local proper-time rate / asymptotic time:{" "}
                {numeric(initialCalculation.proper_time_rate_vs_infinity)}
              </p>
              <p>
                Frequency at infinity / local emitted frequency:{" "}
                {numeric(initialCalculation.frequency_ratio_at_infinity)}
              </p>
              <p>
                Far-away interval per local interval:{" "}
                {numeric(initialCalculation.far_away_interval_per_local_interval)}
              </p>
              <p>
                Gravitational redshift z: {numeric(initialCalculation.gravitational_redshift_z)}
              </p>
              <p>{initialCalculation.observer_note}</p>
              <p>{initialCalculation.model_note}</p>
            </section>
          </>
        )}
        <section aria-labelledby="black-hole-nojs-model">
          <h2 id="black-hole-nojs-model">Model contract and provenance</h2>
          <h3>Assumptions</h3>
          <ul>
            {BLACK_HOLE_RELATIVITY_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Limitations</h3>
          <ul>
            {BLACK_HOLE_RELATIVITY_DEFINITION.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Reviewed model equations</h3>
          <ul>
            {BLACK_HOLE_RELATIVITY_DEFINITION.equations.map((equation) => (
              <li key={equation.id}>
                <strong>{equation.id}:</strong> <code>{equation.expression}</code> —{" "}
                {equation.meaning}
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
