"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestEndpoint, type TransitMethodCalculationResponse } from "@nova-lumina/api-client";

import {
  formatLocaleScientificNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { TransitMethodMessages } from "../lib/i18n/messages/types";
import {
  DEFAULT_TRANSIT_METHOD_STATE,
  TRANSIT_DEFINITION,
  TRANSIT_INPUT_RANGES,
  TRANSIT_SOURCES,
  buildTransitLightCurveVisual,
  decodeTransitMethodState,
  encodeTransitMethodState,
  transitMethodRequestEndpoint,
  validateTransitMethodCalculationResult,
  validateTransitMethodState,
  type TransitMethodState,
} from "../lib/simulations/transit-method";
import styles from "./lab-calculation-instrument.module.css";

type TransitMethodViewProps = Readonly<{
  initialState: TransitMethodState;
  initialStateInvalid: boolean;
  initialCalculation: TransitMethodCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: TransitMethodMessages;
}>;

type NumericField = Exclude<keyof TransitMethodState, "version" | "model_version">;
type DraftState = Record<NumericField, string>;
type RequestState = "idle" | "loading" | "unavailable";

const FIELD_META: Record<
  NumericField,
  Readonly<{ messageKey: keyof TransitMethodMessages["fields"]; unit: string; step: string }>
> = {
  stellar_radius_m: { messageKey: "stellarRadius", unit: "m", step: "any" },
  planet_radius_m: { messageKey: "planetRadius", unit: "m", step: "any" },
  semi_major_axis_m: { messageKey: "semiMajorAxis", unit: "m", step: "any" },
  orbital_period_s: { messageKey: "orbitalPeriod", unit: "s", step: "any" },
  inclination_deg: { messageKey: "inclination", unit: "deg", step: "any" },
};

function draftsForState(state: TransitMethodState): DraftState {
  return {
    stellar_radius_m: String(state.stellar_radius_m),
    planet_radius_m: String(state.planet_radius_m),
    semi_major_axis_m: String(state.semi_major_axis_m),
    orbital_period_s: String(state.orbital_period_s),
    inclination_deg: String(state.inclination_deg),
  };
}

function stateForDraft(draft: DraftState): TransitMethodState | null {
  if (Object.values(draft).some((value) => value.trim().length === 0)) return null;
  return validateTransitMethodState({
    version: 1,
    model_version: "transit-method-v1",
    stellar_radius_m: Number(draft.stellar_radius_m),
    planet_radius_m: Number(draft.planet_radius_m),
    semi_major_axis_m: Number(draft.semi_major_axis_m),
    orbital_period_s: Number(draft.orbital_period_s),
    inclination_deg: Number(draft.inclination_deg),
  });
}

function replaceBrowserState(state: TransitMethodState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/transit-method";
  url.searchParams.set("state", encodeTransitMethodState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: TransitMethodState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_TRANSIT_METHOD_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeTransitMethodState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_TRANSIT_METHOD_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

function format(
  value: number | null,
  locale: PublishedLocale,
  notApplicable: string,
  digits = 6,
): string {
  if (value === null) return notApplicable;
  return formatLocaleScientificNumber(value, locale, digits, digits + 2);
}

function percent(value: number, locale: PublishedLocale): string {
  return formatLocaleNumber(value, locale, {
    style: "percent",
    maximumSignificantDigits: 5,
  });
}

function classificationLabel(
  value: TransitMethodCalculationResponse["classification"],
  messages: TransitMethodMessages["classification"],
): string {
  const labels: Record<TransitMethodCalculationResponse["classification"], string> = {
    full: messages.full,
    grazing: messages.grazing,
    no_transit: messages.noTransit,
  };
  return labels[value];
}

function NumericInput({
  field,
  value,
  onChange,
  disabled,
  messages,
}: Readonly<{
  field: NumericField;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  messages: TransitMethodMessages["fields"];
}>) {
  const meta = FIELD_META[field];
  const range = TRANSIT_INPUT_RANGES[field];
  const id = `transit-${field}`;
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.fieldLabel}>
        <span>{messages[meta.messageKey]}</span>
        <span className={styles.unit}>{meta.unit}</span>
      </span>
      <input
        className={styles.input}
        disabled={disabled}
        id={id}
        inputMode="decimal"
        max={range.max}
        min={range.min}
        onChange={(event) => onChange(event.target.value)}
        step={meta.step}
        type="number"
        value={value}
      />
    </label>
  );
}

function SourceList({ messages }: Readonly<{ messages: TransitMethodMessages["model"] }>) {
  return (
    <ul className={styles.sourceList}>
      {TRANSIT_DEFINITION.references.map((sourceId) => {
        const source = TRANSIT_SOURCES.find((candidate) => candidate.id === sourceId);
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

function LightCurveFigure({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: TransitMethodMessages;
  result: TransitMethodCalculationResponse;
}>) {
  const visual = buildTransitLightCurveVisual(result);
  if (visual === null) return null;
  return (
    <figure className={styles.figure}>
      <svg
        aria-describedby="transit-light-curve-description"
        aria-labelledby="transit-light-curve-title"
        className={styles.figureSvg}
        role="img"
        viewBox="0 0 100 100"
      >
        <title id="transit-light-curve-title">{messages.lightCurve.title}</title>
        <desc id="transit-light-curve-description">
          {formatMessageTemplate(messages.lightCurve.description, {
            count: formatLocaleNumber(result.light_curve.length, locale),
          })}
        </desc>
        <line x1="5" x2="95" y1="50" y2="50" stroke="currentColor" opacity="0.1" />
        <line x1="50" x2="50" y1="8" y2="92" stroke="currentColor" opacity="0.12" />
        <path d={visual.path} fill="none" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <figcaption className={styles.caption}>
        {formatMessageTemplate(messages.lightCurve.caption, {
          maximum: format(visual.maximum_flux, locale, messages.notApplicable, 6),
          minimum: format(visual.minimum_flux, locale, messages.notApplicable, 6),
        })}
      </figcaption>
    </figure>
  );
}

function ResultSummary({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: TransitMethodMessages;
  result: TransitMethodCalculationResponse;
}>) {
  const labels = messages.result.labels;
  const rows = [
    [labels.alignment, classificationLabel(result.classification, messages.classification)],
    [labels.radiusRatio, format(result.radius_ratio, locale, messages.notApplicable)],
    [
      labels.scaledSemiMajorAxis,
      format(result.scaled_semi_major_axis, locale, messages.notApplicable),
    ],
    [labels.impactParameter, format(result.impact_parameter, locale, messages.notApplicable)],
    [
      labels.centralDepthApproximation,
      percent(result.central_depth_approximation_fraction, locale),
    ],
    [labels.maximumUniformSourceDepth, percent(result.maximum_depth_fraction, locale)],
    [
      labels.maximumDepth,
      `${format(result.maximum_depth_ppm, locale, messages.notApplicable)} ppm`,
    ],
    [
      labels.totalDuration,
      result.total_duration_s === null
        ? messages.result.noTransit
        : `${format(result.total_duration_s, locale, messages.notApplicable)} s`,
    ],
    [
      labels.fullDuration,
      result.full_duration_s === null
        ? messages.notApplicable
        : `${format(result.full_duration_s, locale, messages.notApplicable)} s`,
    ],
    [labels.lightCurveSamples, formatLocaleNumber(result.light_curve.length, locale)],
  ] as const;
  return (
    <dl className={styles.summaryGrid} data-columns="3">
      {rows.map(([label, value]) => (
        <div className={styles.summaryCell} key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LightCurveDataPreview({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: TransitMethodMessages;
  result: TransitMethodCalculationResponse;
}>) {
  const step = Math.max(1, Math.ceil(result.light_curve.length / 20));
  const preview = result.light_curve.filter((_, index) => index % step === 0);
  const last = result.light_curve.at(-1)!;
  if (preview.at(-1) !== last) preview.push(last);
  return (
    <details className={styles.preview}>
      <summary>{messages.preview.summary}</summary>
      <p className={styles.previewDescription}>
        {formatMessageTemplate(messages.preview.description, {
          shown: formatLocaleNumber(preview.length, locale),
          total: formatLocaleNumber(result.light_curve.length, locale),
        })}
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{messages.preview.headers.time}</th>
              <th>{messages.preview.headers.orbitalPhase}</th>
              <th>{messages.preview.headers.projectedSeparation}</th>
              <th>{messages.preview.headers.relativeFlux}</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((point) => (
              <tr key={point.time_from_mid_transit_s}>
                <td data-numeric="true">
                  {format(point.time_from_mid_transit_s, locale, messages.notApplicable, 5)}
                </td>
                <td data-numeric="true">
                  {format(point.orbital_phase, locale, messages.notApplicable, 5)}
                </td>
                <td data-numeric="true">
                  {format(
                    point.projected_separation_stellar_radii,
                    locale,
                    messages.notApplicable,
                    5,
                  )}
                </td>
                <td data-numeric="true">
                  {format(point.relative_flux, locale, messages.notApplicable, 7)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TransitMethodView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: TransitMethodViewProps) {
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState<DraftState>(() => draftsForState(initialState));
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const recalculate = useCallback(
    async (nextState: TransitMethodState, commit: boolean) => {
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
        const response = await requestEndpoint(apiOrigin, transitMethodRequestEndpoint(nextState), {
          signal: controller.signal,
        });
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
        const validated = validateTransitMethodCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage(messages.failures.resultMismatch);
          return;
        }
        setCalculation(validated);
        if (commit) {
          setState(nextState);
          setDraft(draftsForState(nextState));
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
      setDraft(draftsForState(next.state));
      setInvalidNotice(next.invalid);
      void recalculate(next.state, true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      requestRef.current?.abort();
    };
  }, [recalculate]);

  const currentVisual = useMemo(
    () => (calculation === null ? null : buildTransitLightCurveVisual(calculation)),
    [calculation],
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = stateForDraft(draft);
    if (next === null) {
      setMessage(messages.failures.invalidInput);
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    const next = DEFAULT_TRANSIT_METHOD_STATE;
    setDraft(draftsForState(next));
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

      <section aria-labelledby="transit-input-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>01 · Parameters</p>
          <h2 className={styles.sectionTitle} id="transit-input-heading">
            {messages.controls.title}
          </h2>
          <p className={styles.sectionDescription}>{messages.controls.description}</p>
        </div>
        <div className={styles.sectionBody}>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.inputGrid}>
              {(Object.keys(FIELD_META) as NumericField[]).map((field) => (
                <NumericInput
                  disabled={requestState === "loading"}
                  field={field}
                  key={field}
                  messages={messages.fields}
                  onChange={(value) => {
                    setDraft((current) => ({ ...current, [field]: value }));
                    setMessage("");
                  }}
                  value={draft[field]}
                />
              ))}
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
        <section aria-labelledby="transit-result-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionIndex}>02 · Observation</p>
            <h2 className={styles.sectionTitle} id="transit-result-heading">
              {messages.result.title}
            </h2>
            <p className={styles.sectionDescription}>
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>
          <div className={styles.resultStack}>
            <ResultSummary locale={locale} messages={messages} result={calculation} />
            {currentVisual === null ? null : (
              <LightCurveFigure locale={locale} messages={messages} result={calculation} />
            )}
            <LightCurveDataPreview locale={locale} messages={messages} result={calculation} />
          </div>
        </section>
      )}

      <section aria-labelledby="transit-model-heading" className={styles.modelSection}>
        <h2 id="transit-model-heading">{messages.model.title}</h2>
        <div className={styles.modelBody}>
          <p>{TRANSIT_DEFINITION.default_preset}</p>
          <p>{TRANSIT_DEFINITION.sampling_policy}</p>
          <details className={styles.modelDetails}>
            <summary>{messages.model.equations}</summary>
            <div className={styles.modelDetailsBody}>
              <dl className={styles.equationList}>
                {Object.entries(TRANSIT_DEFINITION.equations).map(([name, equation]) => (
                  <div key={name}>
                    <dt>{name.replaceAll("_", " ")}</dt>
                    <dd>{equation}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
          <details className={styles.modelDetails}>
            <summary>{messages.model.assumptionsAndLimitations}</summary>
            <div className={styles.modelDetailsBody}>
              <div className={styles.modelColumns}>
                <div>
                  <h3>{messages.model.assumptions}</h3>
                  <ul>
                    {TRANSIT_DEFINITION.assumptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>{messages.model.limitations}</h3>
                  <ul>
                    {TRANSIT_DEFINITION.limitations.map((item) => (
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
              inclination: format(state.inclination_deg, locale, messages.notApplicable, 4),
              period: format(state.orbital_period_s, locale, messages.notApplicable, 4),
              planetRadius: format(state.planet_radius_m, locale, messages.notApplicable, 4),
              stellarRadius: format(state.stellar_radius_m, locale, messages.notApplicable, 4),
            })}
          </p>
        </div>
      </section>
    </article>
  );
}
