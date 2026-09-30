import type { ImpactSimulatorCalculationResponse } from "@nova-lumina/api-client";

import { formatLocaleScientificNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ImpactSimulatorMessages } from "../lib/i18n/messages/types";
import {
  IMPACT_SIMULATOR_DEFINITION,
  IMPACT_SIMULATOR_SOURCES,
  type ImpactSimulatorState,
} from "../lib/simulations/impact-simulator";
import styles from "./lab-calculation-instrument.module.css";

type ImpactSimulatorNoScriptProps = Readonly<{
  initialState: ImpactSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: ImpactSimulatorCalculationResponse | null;
  locale: PublishedLocale;
  messages: ImpactSimulatorMessages;
}>;

function numeric(value: number, locale: PublishedLocale, unit = ""): string {
  const formatted = formatLocaleScientificNumber(value, locale, 5, 7);
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
      <article className={styles.noScriptPage}>
        <header className={styles.noScriptHero}>
          <div>
            <p className={styles.eyebrow}>{messages.noScript.eyebrow}</p>
            <h1 className={styles.title}>{messages.header.title}</h1>
          </div>
          <p className={styles.intro}>{messages.noScript.intro}</p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="impact-nojs-invalid" className={styles.noScriptSection}>
            <h2 id="impact-nojs-invalid">{messages.invalidState.title}</h2>
            <div className={styles.noScriptBody}>
              <p>{messages.invalidState.description}</p>
            </div>
          </section>
        ) : null}
        <section aria-labelledby="impact-nojs-input" className={styles.noScriptSection}>
          <h2 id="impact-nojs-input">{messages.noScript.requestedTitle}</h2>
          <div className={styles.noScriptBody}>
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
          </div>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="impact-nojs-unavailable" className={styles.noScriptSection}>
            <h2 id="impact-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <div className={styles.noScriptBody}>
              <p>{messages.noScript.unavailableDescription}</p>
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="impact-nojs-result" className={styles.noScriptSection}>
              <h2 id="impact-nojs-result">{messages.noScript.result.title}</h2>
              <div className={styles.noScriptBody}>
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
                  {numeric(
                    initialCalculation.best_estimate_crater.transient_diameter_m,
                    locale,
                    "m",
                  )}
                </p>
                <p>
                  {messages.noScript.result.bestFinalCrater}:{" "}
                  {numeric(initialCalculation.best_estimate_crater.final_diameter_m, locale, "m")}
                </p>
              </div>
            </section>
            <section aria-labelledby="impact-nojs-sensitivity" className={styles.noScriptSection}>
              <h2 id="impact-nojs-sensitivity">{messages.noScript.sensitivityTitle}</h2>
              <div className={styles.noScriptBody}>
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
              </div>
            </section>
            <section aria-labelledby="impact-nojs-ejecta" className={styles.noScriptSection}>
              <h2 id="impact-nojs-ejecta">{messages.noScript.ejectaTitle}</h2>
              <div className={styles.noScriptBody}>
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
              </div>
            </section>
          </>
        )}
        <section aria-labelledby="impact-nojs-model" className={styles.noScriptSection}>
          <h2 id="impact-nojs-model">{messages.model.title}</h2>
          <div className={styles.noScriptBody}>
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
          </div>
        </section>
      </article>
    </noscript>
  );
}
