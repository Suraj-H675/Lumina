import type { SpectroscopyCalculationResponse } from "@nova-lumina/api-client";

import {
  formatLocaleNumber,
  formatLocaleScientificNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SpectroscopyLabMessages } from "../lib/i18n/messages/types";
import {
  SPECTROSCOPY_DEFINITION,
  SPECTROSCOPY_SOURCES,
  type SpectroscopyState,
} from "../lib/simulations/spectroscopy-lab";
import styles from "./lab-calculation-instrument.module.css";

type SpectroscopyLabNoScriptProps = Readonly<{
  initialState: SpectroscopyState;
  initialStateInvalid: boolean;
  initialCalculation: SpectroscopyCalculationResponse | null;
  locale: PublishedLocale;
  messages: SpectroscopyLabMessages;
}>;

function numeric(value: number, locale: PublishedLocale, unit = ""): string {
  const formatted = formatLocaleScientificNumber(value, locale, 5, 7);
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList({ messages }: Readonly<{ messages: SpectroscopyLabMessages["model"] }>) {
  return (
    <ul>
      {SPECTROSCOPY_DEFINITION.references.map((sourceId) => {
        const source = SPECTROSCOPY_SOURCES.find((candidate) => candidate.id === sourceId);
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

export function SpectroscopyLabNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: SpectroscopyLabNoScriptProps) {
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
          <section aria-labelledby="spectroscopy-nojs-invalid" className={styles.noScriptSection}>
            <h2 id="spectroscopy-nojs-invalid">{messages.invalidState.title}</h2>
            <div className={styles.noScriptBody}>
              <p>{messages.invalidState.description}</p>
            </div>
          </section>
        ) : null}
        <section aria-labelledby="spectroscopy-nojs-input" className={styles.noScriptSection}>
          <h2 id="spectroscopy-nojs-input">{messages.noScript.requestedModelTitle}</h2>
          <div className={styles.noScriptBody}>
            <p>
              {messages.noScript.stateLabels.mode}: {initialState.mode}
            </p>
            <p>
              {messages.noScript.stateLabels.temperature}:{" "}
              {numeric(initialState.temperature_k, locale, "K")}
            </p>
            <p>
              {messages.noScript.stateLabels.selectedSpecies}:{" "}
              {initialState.selected_elements.length === 0
                ? messages.none
                : initialState.selected_elements.join(", ")}
            </p>
            <p>
              {messages.noScript.stateLabels.radialVelocity}:{" "}
              {numeric(initialState.radial_velocity_km_s, locale, "km/s")}
            </p>
            <p>
              {messages.noScript.stateLabels.resolvingPower}:{" "}
              {numeric(initialState.resolving_power, locale)}
            </p>
            <p>
              {formatMessageTemplate(messages.noScript.displayNoiseTemplate, {
                sigma: numeric(initialState.noise_sigma, locale),
                seed: formatLocaleNumber(initialState.noise_seed, locale, { useGrouping: false }),
              })}
            </p>
          </div>
        </section>
        {initialCalculation === null ? (
          <section
            aria-labelledby="spectroscopy-nojs-unavailable"
            className={styles.noScriptSection}
          >
            <h2 id="spectroscopy-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <div className={styles.noScriptBody}>
              <p>{messages.noScript.unavailableDescription}</p>
            </div>
          </section>
        ) : (
          <section aria-labelledby="spectroscopy-nojs-result" className={styles.noScriptSection}>
            <h2 id="spectroscopy-nojs-result">{messages.result.title}</h2>
            <div className={styles.noScriptBody}>
              <p>
                {messages.result.modelVersion}: {initialCalculation.model_version}
              </p>
              <p>
                {messages.result.wienPeak}: {numeric(initialCalculation.wien_peak_nm, locale, "nm")}
              </p>
              <p>
                {formatMessageTemplate(messages.result.noScriptReturnedSamples, {
                  count: formatLocaleNumber(initialCalculation.wavelength_nm.length, locale),
                  minimum: numeric(initialCalculation.wavelength_nm[0] ?? 0, locale),
                  maximum: numeric(initialCalculation.wavelength_nm.at(-1) ?? 0, locale),
                })}
              </p>
              <p>{initialCalculation.identification_explanation}</p>
              {initialCalculation.representative_lines.length > 0 ? (
                <table>
                  <caption>{messages.noScript.lineCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{messages.result.lines.headers.species}</th>
                      <th scope="col">{messages.result.lines.headers.feature}</th>
                      <th scope="col">{messages.result.lines.headers.rest}</th>
                      <th scope="col">{messages.result.lines.headers.shifted}</th>
                      <th scope="col">{messages.result.lines.headers.fwhm}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialCalculation.representative_lines.map((line) => (
                      <tr key={`${line.element}-${line.label}`}>
                        <td>{line.element}</td>
                        <td>{line.label}</td>
                        <td>{numeric(line.rest_wavelength_vacuum_nm, locale)}</td>
                        <td>{numeric(line.shifted_wavelength_vacuum_nm, locale)}</td>
                        <td>{numeric(line.illustrative_fwhm_nm, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p>{initialCalculation.continuum_note}</p>
              <p>{initialCalculation.line_strength_note}</p>
              <p>{initialCalculation.resolution_note}</p>
              <p>{initialCalculation.noise_note}</p>
            </div>
          </section>
        )}
        <section aria-labelledby="spectroscopy-nojs-model" className={styles.noScriptSection}>
          <h2 id="spectroscopy-nojs-model">{messages.model.title}</h2>
          <div className={styles.noScriptBody}>
            <p>{SPECTROSCOPY_DEFINITION.sampling_policy}</p>
            <h3>{messages.model.limitations}</h3>
            <ul>
              {SPECTROSCOPY_DEFINITION.limitations.map((item) => (
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
