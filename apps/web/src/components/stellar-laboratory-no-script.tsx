import type { StellarLaboratoryCalculationResponse } from "@nova-lumina/api-client";

import { formatLocaleScientificNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { StellarLaboratoryMessages } from "../lib/i18n/messages/types";
import {
  STELLAR_LABORATORY_DEFINITION,
  STELLAR_LABORATORY_SOURCES,
  type StellarLaboratoryState,
} from "../lib/simulations/stellar-laboratory";
import styles from "./lab-calculation-instrument.module.css";

type StellarLaboratoryNoScriptProps = Readonly<{
  initialState: StellarLaboratoryState;
  initialStateInvalid: boolean;
  initialCalculation: StellarLaboratoryCalculationResponse | null;
  locale: PublishedLocale;
  messages: StellarLaboratoryMessages;
}>;

function numeric(value: number, locale: PublishedLocale, unit = ""): string {
  const formatted = formatLocaleScientificNumber(value, locale, 5, 7);
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList({ messages }: Readonly<{ messages: StellarLaboratoryMessages["model"] }>) {
  return (
    <ul>
      {STELLAR_LABORATORY_DEFINITION.references.map((sourceId) => {
        const source = STELLAR_LABORATORY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function ResultTable({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: StellarLaboratoryMessages["noScript"];
  result: StellarLaboratoryCalculationResponse;
}>) {
  const rows = [
    [messages.resultLabels.initialMass, numeric(result.inputs.initial_mass_msun, locale, "M☉")],
    [messages.resultLabels.typicalLuminosity, numeric(result.luminosity_lsun, locale, "L☉")],
    [messages.resultLabels.typicalRadius, numeric(result.radius_rsun, locale, "R☉")],
    [
      messages.resultLabels.typicalTemperature,
      numeric(result.effective_temperature_k, locale, "K"),
    ],
    [
      messages.resultLabels.nearestColourAnchor,
      `${result.nearest_spectral_type_anchor}; B−V ${numeric(result.approximate_b_minus_v_mag, locale)}`,
    ],
    [
      messages.resultLabels.approximateLifetime,
      numeric(result.main_sequence_lifetime_years, locale, messages.resultLabels.yearsUnit),
    ],
    [messages.resultLabels.expectedRemnant, result.expected_remnant],
  ] as const;
  return (
    <table>
      <caption>{messages.resultCaption}</caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StellarLaboratoryNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: StellarLaboratoryNoScriptProps) {
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
          <section aria-labelledby="stellar-nojs-invalid" className={styles.noScriptSection}>
            <h2 id="stellar-nojs-invalid">{messages.invalidState.title}</h2>
            <div className={styles.noScriptBody}>
              <p>{messages.invalidState.description}</p>
            </div>
          </section>
        ) : null}
        <section aria-labelledby="stellar-nojs-input" className={styles.noScriptSection}>
          <h2 id="stellar-nojs-input">{messages.noScript.requestedMassTitle}</h2>
          <div className={styles.noScriptBody}>
            <p>{numeric(initialState.initial_mass_msun, locale, "M☉")}</p>
          </div>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="stellar-nojs-unavailable" className={styles.noScriptSection}>
            <h2 id="stellar-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <div className={styles.noScriptBody}>
              <p>{messages.noScript.unavailableDescription}</p>
            </div>
          </section>
        ) : (
          <section aria-labelledby="stellar-nojs-result" className={styles.noScriptSection}>
            <h2 id="stellar-nojs-result">{messages.noScript.resultTitle}</h2>
            <div className={styles.noScriptBody}>
              <p>
                {messages.noScript.modelVersion}: {initialCalculation.model_version}
              </p>
              <ResultTable
                locale={locale}
                messages={messages.noScript}
                result={initialCalculation}
              />
              <h3>{messages.noScript.lifecycleTitle}</h3>
              <ol>
                {initialCalculation.evolutionary_path.map((stage) => (
                  <li key={stage}>{stage}</li>
                ))}
              </ol>
              <p>{initialCalculation.metallicity_scope}</p>
              <p>{initialCalculation.remnant_boundary_note}</p>
            </div>
          </section>
        )}
        <section aria-labelledby="stellar-nojs-model" className={styles.noScriptSection}>
          <h2 id="stellar-nojs-model">{messages.model.title}</h2>
          <div className={styles.noScriptBody}>
            <p>{STELLAR_LABORATORY_DEFINITION.default_preset}</p>
            <p>{STELLAR_LABORATORY_DEFINITION.sampling_policy}</p>
            <h3>{messages.model.limitations}</h3>
            <ul>
              {STELLAR_LABORATORY_DEFINITION.limitations.map((item) => (
                <li key={item}>{item}</li>
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
