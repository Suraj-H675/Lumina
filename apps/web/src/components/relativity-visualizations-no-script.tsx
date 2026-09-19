import type { RelativityVisualizationsCalculationResponse } from "@lumina/api-client";

import {
  RELATIVITY_LIGHT_CONE,
  RELATIVITY_VISUALIZATIONS_DEFINITION,
  RELATIVITY_VISUALIZATIONS_SOURCES,
  type RelativityVisualizationsState,
} from "../lib/simulations/relativity-visualizations";

type RelativityVisualizationsNoScriptProps = Readonly<{
  initialState: RelativityVisualizationsState;
  initialStateInvalid: boolean;
  initialCalculation: RelativityVisualizationsCalculationResponse | null;
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
      {RELATIVITY_VISUALIZATIONS_DEFINITION.references.map((sourceId) => {
        const source = RELATIVITY_VISUALIZATIONS_SOURCES.find(
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

export function RelativityVisualizationsNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: RelativityVisualizationsNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Special Relativity</p>
          <h1>Relativity Visualizations</h1>
          <p>
            Explore a one-dimensional inertial-frame special-relativity teaching model.
            Lumina&apos;s Python astronomy domain owns the Lorentz factor, time-dilation,
            length-contraction, and relativity-of-simultaneity calculations.
          </p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="relativity-nojs-invalid">
            <h2 id="relativity-nojs-invalid">Shared relativity state rejected</h2>
            <p>The reviewed synthetic inertial-frame preset is shown instead.</p>
          </section>
        ) : null}
        <section aria-labelledby="relativity-nojs-input">
          <h2 id="relativity-nojs-input">Requested teaching state</h2>
          <p>Relative speed: {numeric(initialState.relative_speed_fraction_c)} c</p>
          <p>Proper time: {numeric(initialState.proper_time_s, "s")}</p>
          <p>Proper length: {numeric(initialState.proper_length_m, "m")}</p>
          <p>
            Simultaneous-event +x separation in S:{" "}
            {numeric(initialState.simultaneous_event_separation_m, "m")}
          </p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="relativity-nojs-unavailable">
            <h2 id="relativity-nojs-unavailable">No canonical result available</h2>
            <p>
              No browser-generated Lorentz factor, time-dilation, length-contraction, or
              simultaneity value is substituted.
            </p>
          </section>
        ) : (
          <>
            <section aria-labelledby="relativity-nojs-result">
              <h2 id="relativity-nojs-result">Canonical special-relativity result</h2>
              <p>Model version: {initialCalculation.model_version}</p>
              <p>Relative speed: {numeric(initialCalculation.relative_speed_m_s, "m/s")}</p>
              <p>Lorentz factor γ: {numeric(initialCalculation.lorentz_factor)}</p>
            </section>
            <section aria-labelledby="relativity-nojs-time">
              <h2 id="relativity-nojs-time">Time dilation</h2>
              <p>Dilated interval: {numeric(initialCalculation.dilated_time_s, "s")}</p>
              <p>{initialCalculation.time_dilation_note}</p>
            </section>
            <section aria-labelledby="relativity-nojs-length">
              <h2 id="relativity-nojs-length">Length contraction</h2>
              <p>Moving-frame length: {numeric(initialCalculation.contracted_length_m, "m")}</p>
              <p>{initialCalculation.length_contraction_note}</p>
            </section>
            <section aria-labelledby="relativity-nojs-simultaneity">
              <h2 id="relativity-nojs-simultaneity">Relativity of simultaneity</h2>
              <p>
                Signed B-minus-A time offset in S&apos;:{" "}
                {numeric(initialCalculation.simultaneity_offset_s, "s")}
              </p>
              <p>{initialCalculation.simultaneity_interpretation}</p>
            </section>
          </>
        )}
        <section aria-labelledby="relativity-nojs-light-cone">
          <h2 id="relativity-nojs-light-cone">Light cones</h2>
          <p>{RELATIVITY_LIGHT_CONE.note}</p>
          <p>Coordinate convention: {RELATIVITY_LIGHT_CONE.coordinate_system}</p>
          <ul>
            {RELATIVITY_LIGHT_CONE.segments.map((segment) => (
              <li key={segment.id}>
                {segment.id}: ({segment.x0}, {segment.ct0}) → ({segment.x1}, {segment.ct1})
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="relativity-nojs-gravity">
          <h2 id="relativity-nojs-gravity">Gravitational redshift is a separate model</h2>
          <p>
            <a href="/lab/black-hole-relativity">
              Open the certified Schwarzschild Black-Hole / Relativity Lab
            </a>{" "}
            for the static-clock gravitational-redshift lesson.
          </p>
        </section>
        <section aria-labelledby="relativity-nojs-model">
          <h2 id="relativity-nojs-model">Model contract and provenance</h2>
          <h3>Assumptions</h3>
          <ul>
            {RELATIVITY_VISUALIZATIONS_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Limitations</h3>
          <ul>
            {RELATIVITY_VISUALIZATIONS_DEFINITION.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Reviewed model equations</h3>
          <ul>
            {RELATIVITY_VISUALIZATIONS_DEFINITION.equations.map((equation) => (
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
