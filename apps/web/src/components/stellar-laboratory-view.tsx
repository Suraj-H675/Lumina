"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  requestEndpoint,
  type StellarLaboratoryCalculationResponse,
} from "@nova-lumina/api-client";

import { formatLocaleScientificNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { StellarLaboratoryMessages } from "../lib/i18n/messages/types";
import {
  DEFAULT_STELLAR_LABORATORY_STATE,
  STELLAR_LABORATORY_DEFINITION,
  STELLAR_LABORATORY_INPUT_RANGE,
  STELLAR_LABORATORY_MODEL_VERSION,
  STELLAR_LABORATORY_SOURCES,
  decodeStellarLaboratoryState,
  encodeStellarLaboratoryState,
  stellarLaboratoryRequestEndpoint,
  validateStellarLaboratoryCalculationResult,
  validateStellarLaboratoryState,
  type StellarLaboratoryState,
} from "../lib/simulations/stellar-laboratory";
import styles from "./lab-calculation-instrument.module.css";

type StellarLaboratoryViewProps = Readonly<{
  initialState: StellarLaboratoryState;
  initialStateInvalid: boolean;
  initialCalculation: StellarLaboratoryCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: StellarLaboratoryMessages;
}>;

type RequestState = "idle" | "loading" | "unavailable";

function replaceBrowserState(state: StellarLaboratoryState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/stellar-laboratory";
  url.searchParams.set("state", encodeStellarLaboratoryState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: StellarLaboratoryState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_STELLAR_LABORATORY_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeStellarLaboratoryState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_STELLAR_LABORATORY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

function format(value: number, locale: PublishedLocale, digits = 6): string {
  return formatLocaleScientificNumber(value, locale, digits);
}

function SourceList({ messages }: Readonly<{ messages: StellarLaboratoryMessages["model"] }>) {
  return (
    <ul className={styles.sourceList}>
      {STELLAR_LABORATORY_DEFINITION.references.map((sourceId) => {
        const source = STELLAR_LABORATORY_SOURCES.find((candidate) => candidate.id === sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.sourceUnavailable, { sourceId })}</>
            ) : (
              <>
                <a href={source.url} rel="noreferrer">
                  {source.title}
                </a>{" "}
                ({source.organization_or_authors}; {source.id})
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ResultSummary({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: StellarLaboratoryMessages["result"];
  result: StellarLaboratoryCalculationResponse;
}>) {
  const rows = [
    [messages.labels.initialMass, `${format(result.inputs.initial_mass_msun, locale)} M☉`],
    [messages.labels.typicalLuminosity, `${format(result.luminosity_lsun, locale)} L☉`],
    [messages.labels.typicalRadius, `${format(result.radius_rsun, locale)} R☉`],
    [messages.labels.typicalTemperature, `${format(result.effective_temperature_k, locale)} K`],
    [
      messages.labels.nearestColourAnchor,
      `${result.nearest_spectral_type_anchor}; B−V ${format(result.approximate_b_minus_v_mag, locale)}`,
    ],
    [
      messages.labels.colourAnchorMass,
      `${format(result.colour_anchor_mass_msun, locale)} M☉ (${messages.sourceTableAnchor})`,
    ],
    [
      messages.labels.approximateLifetime,
      `${format(result.main_sequence_lifetime_years, locale)} ${messages.yearsUnit}`,
    ],
    [messages.labels.expectedRemnant, result.expected_remnant],
  ] as const;
  return (
    <dl className={styles.summaryGrid}>
      {rows.map(([label, value]) => (
        <div className={styles.summaryCell} key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Lifecycle({
  messages,
  result,
}: Readonly<{
  messages: StellarLaboratoryMessages["result"];
  result: StellarLaboratoryCalculationResponse;
}>) {
  return (
    <section aria-labelledby="stellar-lifecycle-heading" className={styles.lifecycle}>
      <div className={styles.lifecycleHeader}>
        <h3 id="stellar-lifecycle-heading">{messages.lifecycleTitle}</h3>
        <p>{messages.lifecycleDescription}</p>
      </div>
      <div>
        <ol className={styles.lifecycleList}>
          {result.evolutionary_path.map((stage) => (
            <li key={stage}>{stage}</li>
          ))}
        </ol>
        <p className={styles.caption}>{result.remnant_boundary_note}</p>
      </div>
    </section>
  );
}

export function StellarLaboratoryView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: StellarLaboratoryViewProps) {
  const [state, setState] = useState(initialState);
  const [draftMass, setDraftMass] = useState(String(initialState.initial_mass_msun));
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const recalculate = useCallback(
    async (nextState: StellarLaboratoryState, commit: boolean) => {
      if (apiOrigin === null) {
        setRequestState("unavailable");
        setMessage(messages.failures.serviceUnavailable);
        return;
      }
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const generation = ++generationRef.current;
      setRequestState("loading");
      setMessage("");
      try {
        const response = await requestEndpoint(
          apiOrigin,
          stellarLaboratoryRequestEndpoint(nextState),
          { signal: controller.signal },
        );
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(messages.failures.rejected);
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage(messages.failures.serviceUnavailable);
          return;
        }
        const validated = validateStellarLaboratoryCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage(messages.failures.resultMismatch);
          return;
        }
        setCalculation(validated);
        if (commit) {
          setState(nextState);
          setDraftMass(String(nextState.initial_mass_msun));
          replaceBrowserState(nextState);
        }
        setInvalidNotice(false);
        setRequestState("idle");
        setMessage("");
      } catch {
        if (generation !== generationRef.current) return;
        setRequestState("unavailable");
        setMessage(messages.failures.serviceUnavailable);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [apiOrigin, messages.failures],
  );

  useEffect(() => {
    const handlePopState = () => {
      const next = stateFromBrowser();
      setDraftMass(String(next.state.initial_mass_msun));
      setInvalidNotice(next.invalid);
      void recalculate(next.state, true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      requestRef.current?.abort();
    };
  }, [recalculate]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftMass.trim().length === 0) {
      setMessage(messages.failures.invalidInput);
      return;
    }
    const next = validateStellarLaboratoryState({
      version: 1,
      model_version: STELLAR_LABORATORY_MODEL_VERSION,
      initial_mass_msun: Number(draftMass),
    });
    if (next === null) {
      setMessage(messages.failures.invalidInput);
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    const next = DEFAULT_STELLAR_LABORATORY_STATE;
    setDraftMass(String(next.initial_mass_msun));
    setMessage("");
    void recalculate(next, true);
  }

  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.header.eyebrow}</p>
          <h1 className={styles.title}>{messages.header.title}</h1>
        </div>
        <p className={styles.intro}>{messages.header.intro}</p>
      </header>

      {invalidNotice ? (
        <aside className={styles.alert} role="alert">
          {messages.invalidState.inline}
        </aside>
      ) : null}

      <section aria-labelledby="stellar-input-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>01 · Initial mass</p>
          <h2 className={styles.sectionTitle} id="stellar-input-heading">
            {messages.controls.title}
          </h2>
          <p className={styles.sectionDescription}>
            {formatMessageTemplate(messages.controls.description, {
              minimum: format(STELLAR_LABORATORY_INPUT_RANGE.min, locale),
              maximum: format(STELLAR_LABORATORY_INPUT_RANGE.max, locale),
            })}
          </p>
        </div>
        <div className={styles.sectionBody}>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.singleInputGrid}>
              <label className={styles.field} htmlFor="stellar-initial-mass">
                <span className={styles.fieldLabel}>
                  <span>{messages.controls.fieldLabel}</span>
                  <span className={styles.unit}>M☉</span>
                </span>
                <input
                  className={styles.input}
                  disabled={requestState === "loading"}
                  id="stellar-initial-mass"
                  inputMode="decimal"
                  max={STELLAR_LABORATORY_INPUT_RANGE.max}
                  min={STELLAR_LABORATORY_INPUT_RANGE.min}
                  onChange={(event) => {
                    setDraftMass(event.target.value);
                    setMessage("");
                  }}
                  step="any"
                  type="number"
                  value={draftMass}
                />
              </label>
              <div className={styles.actions}>
                <button
                  className={styles.primaryButton}
                  disabled={requestState === "loading"}
                  type="submit"
                >
                  {requestState === "loading"
                    ? messages.actions.calculating
                    : messages.actions.calculate}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={requestState === "loading"}
                  onClick={resetDefault}
                  type="button"
                >
                  {messages.actions.reset}
                </button>
              </div>
            </div>
          </form>
          {message ? (
            <p
              className={styles.message}
              role={requestState === "unavailable" ? "alert" : "status"}
            >
              {message}
            </p>
          ) : null}
        </div>
      </section>

      {calculation === null ? (
        <section className={styles.unavailable} role="alert">
          <h2>{messages.result.unavailableTitle}</h2>
          <p>{messages.result.unavailableDescription}</p>
        </section>
      ) : (
        <section aria-labelledby="stellar-result-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionIndex}>02 · Stellar outcome</p>
            <h2 className={styles.sectionTitle} id="stellar-result-heading">
              {messages.result.title}
            </h2>
            <p className={styles.sectionDescription}>
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>
          <div className={styles.resultStack}>
            <ResultSummary locale={locale} messages={messages.result} result={calculation} />
            <Lifecycle messages={messages.result} result={calculation} />
            <p className={styles.resultNote}>{calculation.metallicity_scope}</p>
          </div>
        </section>
      )}

      <section aria-labelledby="stellar-model-heading" className={styles.modelSection}>
        <h2 id="stellar-model-heading">{messages.model.title}</h2>
        <div className={styles.modelBody}>
          <p>{STELLAR_LABORATORY_DEFINITION.default_preset}</p>
          <p>{STELLAR_LABORATORY_DEFINITION.sampling_policy}</p>
          <details className={styles.modelDetails}>
            <summary>{messages.model.equations}</summary>
            <div className={styles.modelDetailsBody}>
              <dl className={styles.equationList}>
                {Object.entries(STELLAR_LABORATORY_DEFINITION.equations).map(([name, equation]) => (
                  <div key={name}>
                    <dt>{name.replaceAll("_", " ")}</dt>
                    <dd>{equation}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
          <details className={styles.modelDetails} open>
            <summary>{messages.model.assumptionsAndLimitations}</summary>
            <div className={styles.modelDetailsBody}>
              <div className={styles.modelColumns}>
                <div>
                  <h3>{messages.model.assumptions}</h3>
                  <ul>
                    {STELLAR_LABORATORY_DEFINITION.assumptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>{messages.model.limitations}</h3>
                  <ul>
                    {STELLAR_LABORATORY_DEFINITION.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </details>
          <div>
            <h3>{messages.model.reviewedSources}</h3>
            <SourceList messages={messages.model} />
          </div>
          <p className={styles.currentState}>
            {formatMessageTemplate(messages.model.currentState, {
              mass: format(state.initial_mass_msun, locale),
            })}
          </p>
        </div>
      </section>
    </article>
  );
}
