import type { BlackHoleRelativityCalculationResponse } from "@nova-lumina/api-client";

import { formatLocaleScientificNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { BlackHoleRelativityMessages } from "../lib/i18n/messages/types";
import {
  BLACK_HOLE_RELATIVITY_DEFINITION,
  BLACK_HOLE_RELATIVITY_SOURCES,
  type BlackHoleRelativityState,
} from "../lib/simulations/black-hole-relativity";
import styles from "./lab-calculation-instrument.module.css";

type BlackHoleRelativityNoScriptProps = Readonly<{
  initialState: BlackHoleRelativityState;
  initialStateInvalid: boolean;
  initialCalculation: BlackHoleRelativityCalculationResponse | null;
  locale: PublishedLocale;
  messages: BlackHoleRelativityMessages;
}>;

function numeric(value: number, locale: PublishedLocale, unit = ""): string {
  const formatted = formatLocaleScientificNumber(value, locale, 6, 8);
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList({ messages }: Readonly<{ messages: BlackHoleRelativityMessages["model"] }>) {
  return (
    <ul>
      {BLACK_HOLE_RELATIVITY_DEFINITION.references.map((sourceId) => {
        const source = BLACK_HOLE_RELATIVITY_SOURCES.find((candidate) => candidate.id === sourceId);
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

export function BlackHoleRelativityNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: BlackHoleRelativityNoScriptProps) {
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
          <section aria-labelledby="black-hole-nojs-invalid" className={styles.noScriptSection}>
            <h2 id="black-hole-nojs-invalid">{messages.invalidState.title}</h2>
            <div className={styles.noScriptBody}>
              <p>{messages.invalidState.description}</p>
            </div>
          </section>
        ) : null}
        <section aria-labelledby="black-hole-nojs-input" className={styles.noScriptSection}>
          <h2 id="black-hole-nojs-input">{messages.noScript.requestedStateTitle}</h2>
          <div className={styles.noScriptBody}>
            <p>
              {messages.noScript.stateLabels.mass}:{" "}
              {numeric(initialState.mass_nominal_solar, locale)}{" "}
              {messages.noScript.stateLabels.massUnit}
            </p>
            <p>
              {messages.noScript.stateLabels.staticObserverRadius}:{" "}
              {numeric(initialState.static_observer_radius_rs, locale)} Rₛ
            </p>
            <p>{messages.noScript.controlDisclosure}</p>
          </div>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="black-hole-nojs-unavailable" className={styles.noScriptSection}>
            <h2 id="black-hole-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <div className={styles.noScriptBody}>
              <p>{messages.noScript.unavailableDescription}</p>
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="black-hole-nojs-result" className={styles.noScriptSection}>
              <h2 id="black-hole-nojs-result">{messages.noScript.result.title}</h2>
              <div className={styles.noScriptBody}>
                <p>
                  {messages.noScript.result.modelVersion}: {initialCalculation.model_version}
                </p>
                <p>
                  {messages.noScript.result.gravitationalParameter}:{" "}
                  {numeric(initialCalculation.gravitational_parameter_m3_s2, locale, "m³/s²")}
                </p>
                <p>
                  {messages.noScript.result.schwarzschildRadius}:{" "}
                  {numeric(initialCalculation.schwarzschild_radius_m, locale, "m")}
                </p>
                <p>
                  {messages.noScript.result.selectedObserverRadius}:{" "}
                  {numeric(initialCalculation.static_observer_areal_radius_m, locale, "m")}
                </p>
                <table>
                  <caption>{messages.noScript.tableCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{messages.noScript.tableHeaders.landmark}</th>
                      <th scope="col">{messages.noScript.tableHeaders.radiusRs}</th>
                      <th scope="col">{messages.noScript.tableHeaders.radiusM}</th>
                      <th scope="col">{messages.noScript.tableHeaders.meaning}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialCalculation.landmarks.map((row) => (
                      <tr key={row.id}>
                        <td>{row.label}</td>
                        <td>{numeric(row.radius_rs, locale)}</td>
                        <td>{numeric(row.radius_m, locale)}</td>
                        <td>{row.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section aria-labelledby="black-hole-nojs-clock" className={styles.noScriptSection}>
              <h2 id="black-hole-nojs-clock">{messages.noScript.clock.title}</h2>
              <div className={styles.noScriptBody}>
                <p>
                  {messages.noScript.clock.properTimeRate}:{" "}
                  {numeric(initialCalculation.proper_time_rate_vs_infinity, locale)}
                </p>
                <p>
                  {messages.noScript.clock.frequencyRatio}:{" "}
                  {numeric(initialCalculation.frequency_ratio_at_infinity, locale)}
                </p>
                <p>
                  {messages.noScript.clock.farAwayInterval}:{" "}
                  {numeric(initialCalculation.far_away_interval_per_local_interval, locale)}
                </p>
                <p>
                  {messages.noScript.clock.redshift}:{" "}
                  {numeric(initialCalculation.gravitational_redshift_z, locale)}
                </p>
                <p>{initialCalculation.observer_note}</p>
                <p>{initialCalculation.model_note}</p>
              </div>
            </section>
          </>
        )}
        <section aria-labelledby="black-hole-nojs-model" className={styles.noScriptSection}>
          <h2 id="black-hole-nojs-model">{messages.model.title}</h2>
          <div className={styles.noScriptBody}>
            <h3>{messages.model.assumptions}</h3>
            <ul>
              {BLACK_HOLE_RELATIVITY_DEFINITION.assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>{messages.model.limitations}</h3>
            <ul>
              {BLACK_HOLE_RELATIVITY_DEFINITION.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>{messages.model.equations}</h3>
            <ul>
              {BLACK_HOLE_RELATIVITY_DEFINITION.equations.map((equation) => (
                <li key={equation.id}>
                  <strong>{equation.id}:</strong> <code>{equation.expression}</code> —{" "}
                  {equation.meaning}
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
