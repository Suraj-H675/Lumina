"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  requestEndpoint,
  type BlackHoleRelativityCalculationResponse,
} from "@nova-lumina/api-client";

import { formatLocaleScientificNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { BlackHoleRelativityMessages } from "../lib/i18n/messages/types";
import {
  BLACK_HOLE_RELATIVITY_DEFINITION,
  BLACK_HOLE_RELATIVITY_LIMITS,
  BLACK_HOLE_RELATIVITY_MODEL_VERSION,
  BLACK_HOLE_RELATIVITY_SOURCES,
  DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
  blackHoleRelativityRequestEndpoint,
  decodeBlackHoleRelativityState,
  encodeBlackHoleRelativityState,
  validateBlackHoleRelativityCalculationResult,
  validateBlackHoleRelativityState,
  type BlackHoleRelativityState,
} from "../lib/simulations/black-hole-relativity";
import styles from "./lab-calculation-instrument.module.css";

type BlackHoleRelativityViewProps = Readonly<{
  initialState: BlackHoleRelativityState;
  initialStateInvalid: boolean;
  initialCalculation: BlackHoleRelativityCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: BlackHoleRelativityMessages;
}>;

type RequestState = "idle" | "loading" | "unavailable";

function replaceBrowserState(state: BlackHoleRelativityState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/black-hole-relativity";
  url.searchParams.set("state", encodeBlackHoleRelativityState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: BlackHoleRelativityState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_BLACK_HOLE_RELATIVITY_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeBlackHoleRelativityState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_BLACK_HOLE_RELATIVITY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

function format(value: number, locale: PublishedLocale, digits = 6): string {
  return formatLocaleScientificNumber(value, locale, digits);
}

function SourceList({ messages }: Readonly<{ messages: BlackHoleRelativityMessages["model"] }>) {
  return (
    <ul className={styles.sourceList}>
      {BLACK_HOLE_RELATIVITY_DEFINITION.references.map((sourceId) => {
        const source = BLACK_HOLE_RELATIVITY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function LandmarkTable({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: BlackHoleRelativityMessages["landmarks"];
  result: BlackHoleRelativityCalculationResponse;
}>) {
  return (
    <div aria-label={messages.tableAriaLabel} className={styles.tableWrap} tabIndex={0}>
      <table className={styles.table} style={{ minWidth: 760 }}>
        <caption>{messages.caption}</caption>
        <thead>
          <tr>
            {[
              messages.headers.landmark,
              messages.headers.radiusRs,
              messages.headers.radiusM,
              messages.headers.interpretation,
            ].map((heading) => (
              <th key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.landmarks.map((row) => (
            <tr key={row.id}>
              <td>{row.label}</td>
              <td data-numeric="true">{format(row.radius_rs, locale)}</td>
              <td data-numeric="true">{format(row.radius_m, locale)}</td>
              <td>{row.interpretation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReturnedLandmarkSchematic({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: BlackHoleRelativityMessages["landmarks"];
  result: BlackHoleRelativityCalculationResponse;
}>) {
  const rows = [
    ...result.landmarks.map((row) => ({
      id: row.id,
      label: row.label,
      radiusM: row.radius_m,
    })),
    {
      id: "selected_static_observer",
      label: messages.selectedStaticObserver,
      radiusM: result.static_observer_areal_radius_m,
    },
  ];
  const maximum = Math.max(...rows.map((row) => row.radiusM));
  return (
    <figure className={styles.figure}>
      <div aria-label={messages.schematicAriaLabel} className={styles.figureFrame} role="img">
        <div className={styles.figureRows}>
          {rows.map((row) => (
            <div className={styles.figureRow} key={row.id}>
              <div className={styles.figureRowHeader}>
                <span>{row.label}</span>
                <span>{format(row.radiusM, locale)} m</span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barValue}
                  style={{ width: `${Math.max(2, (row.radiusM / maximum) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className={styles.caption}>{messages.schematicCaption}</figcaption>
    </figure>
  );
}

export function BlackHoleRelativityView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: BlackHoleRelativityViewProps) {
  const [state, setState] = useState(initialState);
  const [draftMass, setDraftMass] = useState(String(initialState.mass_nominal_solar));
  const [draftRadius, setDraftRadius] = useState(String(initialState.static_observer_radius_rs));
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const adoptDraft = useCallback((next: BlackHoleRelativityState) => {
    setDraftMass(String(next.mass_nominal_solar));
    setDraftRadius(String(next.static_observer_radius_rs));
  }, []);

  const recalculate = useCallback(
    async (nextState: BlackHoleRelativityState, commit: boolean) => {
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
          blackHoleRelativityRequestEndpoint(nextState),
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
        const validated = validateBlackHoleRelativityCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage(messages.failures.resultMismatch);
          return;
        }
        setCalculation(validated);
        if (commit) {
          setState(nextState);
          adoptDraft(nextState);
          replaceBrowserState(nextState);
        }
        setInvalidNotice(false);
        setRequestState("idle");
      } catch {
        if (generation !== generationRef.current) return;
        setRequestState("unavailable");
        setMessage(messages.failures.serviceUnavailable);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [adoptDraft, apiOrigin, messages.failures],
  );

  useEffect(() => {
    const handlePopState = () => {
      const next = stateFromBrowser();
      adoptDraft(next.state);
      setInvalidNotice(next.invalid);
      void recalculate(next.state, true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      requestRef.current?.abort();
    };
  }, [adoptDraft, recalculate]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftMass.trim().length === 0 || draftRadius.trim().length === 0) {
      setMessage(messages.failures.emptyInput);
      return;
    }
    const next = validateBlackHoleRelativityState({
      version: 1,
      model_version: BLACK_HOLE_RELATIVITY_MODEL_VERSION,
      mass_nominal_solar: Number(draftMass),
      static_observer_radius_rs: Number(draftRadius),
    });
    if (next === null) {
      setMessage(messages.failures.outOfDomain);
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    adoptDraft(DEFAULT_BLACK_HOLE_RELATIVITY_STATE);
    setMessage("");
    void recalculate(DEFAULT_BLACK_HOLE_RELATIVITY_STATE, true);
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

      <section aria-labelledby="black-hole-input-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>01 · Parameters</p>
          <h2 className={styles.sectionTitle} id="black-hole-input-heading">
            {messages.controls.title}
          </h2>
          <p className={styles.sectionDescription}>{messages.controls.description}</p>
        </div>
        <div className={styles.sectionBody}>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.inputGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{messages.controls.massLabel}</span>
                <input
                  aria-label={messages.controls.massAriaLabel}
                  className={styles.input}
                  disabled={requestState === "loading"}
                  max={BLACK_HOLE_RELATIVITY_LIMITS.maxMassNominalSolar}
                  min={BLACK_HOLE_RELATIVITY_LIMITS.minMassNominalSolar}
                  onChange={(event) => {
                    setDraftMass(event.target.value);
                    setMessage("");
                  }}
                  step="any"
                  type="number"
                  value={draftMass}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{messages.controls.radiusLabel}</span>
                <input
                  aria-label={messages.controls.radiusAriaLabel}
                  className={styles.input}
                  disabled={requestState === "loading"}
                  max={BLACK_HOLE_RELATIVITY_LIMITS.maxStaticObserverRadiusRs}
                  min={BLACK_HOLE_RELATIVITY_LIMITS.minStaticObserverRadiusRs}
                  onChange={(event) => {
                    setDraftRadius(event.target.value);
                    setMessage("");
                  }}
                  step="any"
                  type="number"
                  value={draftRadius}
                />
              </label>
            </div>
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
        <section aria-labelledby="black-hole-result-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionIndex}>02 · Schwarzschild geometry</p>
            <h2 className={styles.sectionTitle} id="black-hole-result-heading">
              {messages.result.title}
            </h2>
            <p className={styles.sectionDescription}>
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>

          <div className={styles.resultStack}>
            <dl className={styles.summaryGrid}>
              <div className={styles.summaryCell}>
                <dt>{messages.result.metrics.gravitationalParameter}</dt>
                <dd>{format(calculation.gravitational_parameter_m3_s2, locale)} m³/s²</dd>
              </div>
              <div className={styles.summaryCell}>
                <dt>{messages.result.metrics.eventHorizonRadius}</dt>
                <dd>{format(calculation.schwarzschild_radius_m, locale)} m</dd>
              </div>
              <div className={styles.summaryCell}>
                <dt>{messages.result.metrics.clockRate}</dt>
                <dd>{format(calculation.proper_time_rate_vs_infinity, locale)}</dd>
              </div>
              <div className={styles.summaryCell}>
                <dt>{messages.result.metrics.redshift}</dt>
                <dd>{format(calculation.gravitational_redshift_z, locale)}</dd>
              </div>
            </dl>

            <section aria-labelledby="black-hole-landmarks-heading" className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <h3 id="black-hole-landmarks-heading">{messages.landmarks.title}</h3>
                <p>{messages.landmarks.description}</p>
              </div>
              <div className={styles.subsectionBody}>
                <ReturnedLandmarkSchematic
                  locale={locale}
                  messages={messages.landmarks}
                  result={calculation}
                />
                <LandmarkTable locale={locale} messages={messages.landmarks} result={calculation} />
              </div>
            </section>

            <section aria-labelledby="black-hole-clock-heading" className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <h3 id="black-hole-clock-heading">{messages.result.clock.title}</h3>
                <p>{calculation.observer_note}</p>
              </div>
              <dl className={styles.summaryGrid}>
                <div className={styles.summaryCell}>
                  <dt>{messages.result.clock.selectedRadius}</dt>
                  <dd>{format(calculation.static_observer_areal_radius_m, locale)} m</dd>
                </div>
                <div className={styles.summaryCell}>
                  <dt>{messages.result.clock.frequencyRatio}</dt>
                  <dd>{format(calculation.frequency_ratio_at_infinity, locale)}</dd>
                </div>
                <div className={styles.summaryCell}>
                  <dt>{messages.result.clock.farAwayInterval}</dt>
                  <dd>{format(calculation.far_away_interval_per_local_interval, locale)}</dd>
                </div>
                <div className={styles.summaryCell}>
                  <dt>{messages.result.clock.redshift}</dt>
                  <dd>{format(calculation.gravitational_redshift_z, locale)}</dd>
                </div>
              </dl>
            </section>

            <p className={styles.resultNote}>{calculation.model_note}</p>
          </div>
        </section>
      )}

      <section aria-labelledby="black-hole-model-heading" className={styles.modelSection}>
        <h2 id="black-hole-model-heading">{messages.model.title}</h2>
        <div className={styles.modelBody}>
          <p>{BLACK_HOLE_RELATIVITY_DEFINITION.summary}</p>
          <details className={styles.modelDetails} open>
            <summary>{messages.model.assumptionsAndLimitations}</summary>
            <div className={styles.modelDetailsBody}>
              <div className={styles.modelColumns}>
                <div>
                  <h3>{messages.model.assumptions}</h3>
                  <ul>
                    {BLACK_HOLE_RELATIVITY_DEFINITION.assumptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>{messages.model.limitations}</h3>
                  <ul>
                    {BLACK_HOLE_RELATIVITY_DEFINITION.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </details>
          <details className={styles.modelDetails}>
            <summary>{messages.model.equations}</summary>
            <ul>
              {BLACK_HOLE_RELATIVITY_DEFINITION.equations.map((equation) => (
                <li key={equation.id}>
                  <strong>{equation.id}:</strong> <code>{equation.expression}</code> —{" "}
                  {equation.meaning}
                </li>
              ))}
            </ul>
          </details>
          <div>
            <h3>{messages.model.reviewedSources}</h3>
            <SourceList messages={messages.model} />
          </div>
          <p className={styles.currentState}>
            {formatMessageTemplate(messages.model.currentState, {
              mass: format(state.mass_nominal_solar, locale),
              radius: format(state.static_observer_radius_rs, locale),
            })}
          </p>
        </div>
      </section>
    </article>
  );
}
