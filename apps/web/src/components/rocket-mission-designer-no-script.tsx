import type { RocketMissionDesignerCalculationResponse } from "@lumina/api-client";

import {
  ROCKET_MISSION_DESIGNER_DEFINITION,
  ROCKET_MISSION_DESIGNER_SOURCES,
  type RocketMissionDesignerState,
} from "../lib/simulations/rocket-mission-designer";

type RocketMissionDesignerNoScriptProps = Readonly<{
  initialState: RocketMissionDesignerState;
  initialStateInvalid: boolean;
  initialCalculation: RocketMissionDesignerCalculationResponse | null;
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
      {ROCKET_MISSION_DESIGNER_DEFINITION.references.map((sourceId) => {
        const source = ROCKET_MISSION_DESIGNER_SOURCES.find(
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

export function RocketMissionDesignerNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: RocketMissionDesignerNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Rocket / Mission Designer</p>
          <h1>Rocket / Mission Designer</h1>
          <p>
            Explore a source-backed ideal staged-rocket teaching model. Lumina&apos;s Python
            astronomy domain owns stage bookkeeping, ideal delta-v, surface-gravity TWR references,
            payload sensitivity, and velocity-reference comparisons.
          </p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="rocket-nojs-invalid">
            <h2 id="rocket-nojs-invalid">Shared rocket state rejected</h2>
            <p>The reviewed synthetic two-stage teaching preset is shown instead.</p>
          </section>
        ) : null}
        <section aria-labelledby="rocket-nojs-input">
          <h2 id="rocket-nojs-input">Requested teaching vehicle</h2>
          <p>Surface-gravity reference body: {initialState.gravity_body}</p>
          <p>Velocity reference: {initialState.delta_v_reference_id}</p>
          <p>Payload: {numeric(initialState.payload_mass_kg, "kg")}</p>
          <table>
            <caption>Submitted stages in ignition order.</caption>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Dry mass kg</th>
                <th scope="col">Propellant kg</th>
                <th scope="col">Isp s</th>
                <th scope="col">Thrust N</th>
              </tr>
            </thead>
            <tbody>
              {initialState.stages.map((stage, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{numeric(stage.dry_mass_kg)}</td>
                  <td>{numeric(stage.propellant_mass_kg)}</td>
                  <td>{numeric(stage.specific_impulse_s)}</td>
                  <td>{numeric(stage.thrust_n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="rocket-nojs-unavailable">
            <h2 id="rocket-nojs-unavailable">No canonical result available</h2>
            <p>
              No browser-generated delta-v, staging, TWR, payload trade-off, or mission comparison
              is substituted.
            </p>
          </section>
        ) : (
          <>
            <section aria-labelledby="rocket-nojs-result">
              <h2 id="rocket-nojs-result">Canonical ideal staged result</h2>
              <p>Model version: {initialCalculation.model_version}</p>
              <p>
                Total ideal delta-v: {numeric(initialCalculation.total_ideal_delta_v_m_s, "m/s")}
              </p>
              <p>
                Selected surface gravity:{" "}
                {numeric(initialCalculation.selected_surface_gravity_m_s2, "m/s²")}
              </p>
              <table>
                <caption>Python-returned stage results.</caption>
                <thead>
                  <tr>
                    <th scope="col">Stage</th>
                    <th scope="col">Ignition mass kg</th>
                    <th scope="col">Burnout mass kg</th>
                    <th scope="col">Ideal Δv m/s</th>
                    <th scope="col">Surface-reference TWR</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.stages.map((stage) => (
                    <tr key={stage.index}>
                      <td>{stage.index}</td>
                      <td>{numeric(stage.ignition_mass_kg)}</td>
                      <td>{numeric(stage.burnout_before_jettison_mass_kg)}</td>
                      <td>{numeric(stage.ideal_delta_v_m_s)}</td>
                      <td>{numeric(stage.surface_gravity_thrust_to_weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Launch mass: {numeric(initialCalculation.mass_fractions.launch_mass_kg, "kg")};
                propellant fraction:{" "}
                {numeric(initialCalculation.mass_fractions.propellant_fraction_of_launch_mass)};
                payload fraction:{" "}
                {numeric(initialCalculation.mass_fractions.payload_fraction_of_launch_mass)}.
              </p>
            </section>
            <section aria-labelledby="rocket-nojs-payload">
              <h2 id="rocket-nojs-payload">Fixed payload sensitivity</h2>
              <p>
                These returned points keep the submitted stages fixed. They are not an optimizer or
                design recommendation.
              </p>
              <table>
                <caption>Python-returned payload trade-off points.</caption>
                <thead>
                  <tr>
                    <th scope="col">Payload multiplier</th>
                    <th scope="col">Payload kg</th>
                    <th scope="col">Total ideal Δv m/s</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.payload_tradeoff.map((point) => (
                    <tr key={point.payload_multiplier}>
                      <td>{numeric(point.payload_multiplier)}</td>
                      <td>{numeric(point.payload_mass_kg)}</td>
                      <td>{numeric(point.total_ideal_delta_v_m_s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section aria-labelledby="rocket-nojs-reference">
              <h2 id="rocket-nojs-reference">Educational velocity reference</h2>
              <p>{initialCalculation.reference_comparison.label}</p>
              <p>
                Reference value:{" "}
                {numeric(initialCalculation.reference_comparison.reference_value_m_s, "m/s")}
              </p>
              <p>
                Ideal delta-v difference:{" "}
                {numeric(
                  initialCalculation.reference_comparison.ideal_delta_v_difference_m_s,
                  "m/s",
                )}
              </p>
              <p>{initialCalculation.reference_comparison.interpretation}</p>
              <p>{initialCalculation.model_note}</p>
            </section>
          </>
        )}
        <section aria-labelledby="rocket-nojs-model">
          <h2 id="rocket-nojs-model">Model contract and provenance</h2>
          <p>{ROCKET_MISSION_DESIGNER_DEFINITION.default_preset}</p>
          <h3>Limitations</h3>
          <ul>
            {ROCKET_MISSION_DESIGNER_DEFINITION.limitations.map((item) => (
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
