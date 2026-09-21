import type { ImpactSimulatorCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ImpactSimulatorMessages } from "../lib/i18n/messages/types";
import {
  IMPACT_SIMULATOR_DEFINITION,
  IMPACT_SIMULATOR_SOURCES,
  type ImpactSimulatorState,
} from "../lib/simulations/impact-simulator";

type ImpactSimulatorNoScriptProps = Readonly<{
  initialState: ImpactSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: ImpactSimulatorCalculationResponse | null;
  locale: PublishedLocale;
  messages: ImpactSimulatorMessages;
}>;

function numeric(value: number, locale: PublishedLocale, unit = ""): string {
  let formatted: string;
  if (value === 0) {
    formatted = formatLocaleNumber(0, locale, { useGrouping: false });
  } else if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(5).split("e");
    formatted = `${formatLocaleFixedNumber(Number(mantissa), 5, locale)}e${exponent}`;
  } else {
    formatted = formatLocaleNumber(value, locale, { maximumSignificantDigits: 7 });
  }
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList({ messages }: Readonly<{ messages: ImpactSimulatorMessages["model"] }>) {
  return (
    <ul>
      {IMPACT_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = IMPACT_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.sourceUnavailable, { sourceId })}</>
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
  locale,
  messages,
}: ImpactSimulatorNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.noScript.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="impact-nojs-invalid">
            <h2 id="impact-nojs-invalid">{messages.invalidState.title}</h2>
            <p>{messages.invalidState.description}</p>
          </section>
        ) : null}
        <section aria-labelledby="impact-nojs-input">
          <h2 id="impact-nojs-input">{messages.noScript.requestedTitle}</h2>
          <p>
            {messages.noScript.stateLabels.diameter}:{" "}
            {numeric(initialState.diameter_m, locale, "m")}
          </p>
          <p>
            {messages.noScript.stateLabels.density}:{" "}
            {numeric(initialState.impactor_density_kg_m3, locale, "kg/m³")}
          </p>
          <p>
            {messages.noScript.stateLabels.speed}:{" "}
            {numeric(initialState.speed_km_s, locale, "km/s")}
          </p>
          <p>
            {messages.noScript.stateLabels.angle}:{" "}
            {numeric(initialState.impact_angle_deg, locale, messages.noScript.angleUnit)}
          </p>
          <p>
            {messages.noScript.stateLabels.target}: {initialState.target_material}
          </p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="impact-nojs-unavailable">
            <h2 id="impact-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <p>{messages.noScript.unavailableDescription}</p>
          </section>
        ) : (
          <>
            <section aria-labelledby="impact-nojs-result">
              <h2 id="impact-nojs-result">{messages.noScript.result.title}</h2>
              <p>
                {messages.noScript.result.modelVersion}: {initialCalculation.model_version}
              </p>
              <p>
                {messages.noScript.result.impactorMass}:{" "}
                {numeric(initialCalculation.impactor_mass_kg, locale, "kg")}
              </p>
              <p>
                {messages.noScript.result.kineticEnergy}:{" "}
                {numeric(initialCalculation.kinetic_energy_j, locale, "J")}
              </p>
              <p>
                {messages.noScript.result.tntContext}:{" "}
                {numeric(initialCalculation.tnt_equivalent_megatons, locale, "Mt TNT")}
              </p>
              <p>{messages.noScript.result.tntDescription}</p>
              <p>
                {messages.noScript.result.bestTransientCrater}:{" "}
                {numeric(initialCalculation.best_estimate_crater.transient_diameter_m, locale, "m")}
              </p>
              <p>
                {messages.noScript.result.bestFinalCrater}:{" "}
                {numeric(initialCalculation.best_estimate_crater.final_diameter_m, locale, "m")}
              </p>
            </section>
            <section aria-labelledby="impact-nojs-sensitivity">
              <h2 id="impact-nojs-sensitivity">{messages.noScript.sensitivityTitle}</h2>
              <p>{initialCalculation.uncertainty_note}</p>
              <table>
                <caption>{messages.noScript.sensitivityCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{messages.sensitivity.headers.scalingCoefficient}</th>
                    <th scope="col">{messages.sensitivity.headers.transientDiameter}</th>
                    <th scope="col">{messages.sensitivity.headers.finalDiameter}</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.coefficient_sensitivity.map((row) => (
                    <tr key={row.scaling_coefficient}>
                      <td>{numeric(row.scaling_coefficient, locale)}</td>
                      <td>{numeric(row.transient_diameter_m, locale)}</td>
                      <td>{numeric(row.final_diameter_m, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section aria-labelledby="impact-nojs-ejecta">
              <h2 id="impact-nojs-ejecta">{messages.noScript.ejectaTitle}</h2>
              <table>
                <caption>{messages.noScript.ejectaCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{messages.ejecta.table.headers.thickness}</th>
                    <th scope="col">{messages.ejecta.table.headers.radius}</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.ejecta_thickness_radii.map((row) => (
                    <tr key={row.thickness_m}>
                      <td>{numeric(row.thickness_m, locale)}</td>
                      <td>{numeric(row.radius_m, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>{initialCalculation.model_note}</p>
            </section>
          </>
        )}
        <section aria-labelledby="impact-nojs-model">
          <h2 id="impact-nojs-model">{messages.model.title}</h2>
          <h3>{messages.model.assumptions}</h3>
          <ul>
            {IMPACT_SIMULATOR_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{messages.model.limitations}</h3>
          <ul>
            {IMPACT_SIMULATOR_DEFINITION.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{messages.model.equations}</h3>
          <ul>
            {IMPACT_SIMULATOR_DEFINITION.equations.map((equation) => (
              <li key={equation.id}>
                <strong>{equation.id}:</strong> <code>{equation.expression}</code>
                {equation.source_equation ? ` — ${equation.source_equation}` : ""}
              </li>
            ))}
          </ul>
          <h3>{messages.model.reviewedSources}</h3>
          <SourceList messages={messages.model} />
        </section>
      </article>
    </noscript>
  );
}
