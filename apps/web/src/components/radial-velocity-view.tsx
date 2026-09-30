"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestEndpoint, type RadialVelocityCalculationResponse } from "@nova-lumina/api-client";

import {
  formatLocaleScientificNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { RadialVelocityMessages } from "../lib/i18n/messages/types";
import {
  DEFAULT_RADIAL_VELOCITY_STATE,
  RADIAL_VELOCITY_DEFINITION,
  RADIAL_VELOCITY_INPUT_RANGES,
  RADIAL_VELOCITY_SOURCES,
  buildRadialVelocityVisual,
  decodeRadialVelocityState,
  encodeRadialVelocityState,
  radialVelocityRequestEndpoint,
  validateRadialVelocityCalculationResult,
  validateRadialVelocityState,
  type RadialVelocityState,
} from "../lib/simulations/radial-velocity";
import styles from "./lab-calculation-instrument.module.css";

type RadialVelocityViewProps = Readonly<{
  initialState: RadialVelocityState;
  initialStateInvalid: boolean;
  initialCalculation: RadialVelocityCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: RadialVelocityMessages;
}>;

type NumericField = Exclude<keyof RadialVelocityState, "version" | "model_version">;
type DraftState = Record<NumericField, string>;
type RequestState = "idle" | "loading" | "unavailable";

const FIELD_META: Record<
  NumericField,
  Readonly<{ messageKey: keyof RadialVelocityMessages["fields"]; unit: string; step: string }>
> = {
  stellar_mass_kg: { messageKey: "stellarMass", unit: "kg", step: "any" },
  planet_mass_kg: { messageKey: "companionMass", unit: "kg", step: "any" },
  orbital_period_s: { messageKey: "orbitalPeriod", unit: "s", step: "any" },
  eccentricity: { messageKey: "eccentricity", unit: "dimensionless", step: "any" },
  inclination_deg: { messageKey: "inclination", unit: "deg", step: "any" },
  stellar_argument_of_periastron_deg: {
    messageKey: "argumentOfPeriastron",
    unit: "deg",
    step: "any",
  },
  mean_anomaly_at_epoch_deg: { messageKey: "meanAnomalyAtEpoch", unit: "deg", step: "any" },
};

function draftsForState(state: RadialVelocityState): DraftState {
  return {
    stellar_mass_kg: String(state.stellar_mass_kg),
    planet_mass_kg: String(state.planet_mass_kg),
    orbital_period_s: String(state.orbital_period_s),
    eccentricity: String(state.eccentricity),
    inclination_deg: String(state.inclination_deg),
    stellar_argument_of_periastron_deg: String(state.stellar_argument_of_periastron_deg),
    mean_anomaly_at_epoch_deg: String(state.mean_anomaly_at_epoch_deg),
  };
}

function stateForDraft(draft: DraftState): RadialVelocityState | null {
  if (Object.values(draft).some((value) => value.trim().length === 0)) return null;
  return validateRadialVelocityState({
    version: 1,
    model_version: "radial-velocity-v1",
    stellar_mass_kg: Number(draft.stellar_mass_kg),
    planet_mass_kg: Number(draft.planet_mass_kg),
    orbital_period_s: Number(draft.orbital_period_s),
    eccentricity: Number(draft.eccentricity),
    inclination_deg: Number(draft.inclination_deg),
    stellar_argument_of_periastron_deg: Number(draft.stellar_argument_of_periastron_deg),
    mean_anomaly_at_epoch_deg: Number(draft.mean_anomaly_at_epoch_deg),
  });
}

function replaceBrowserState(state: RadialVelocityState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/radial-velocity";
  url.searchParams.set("state", encodeRadialVelocityState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: RadialVelocityState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_RADIAL_VELOCITY_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeRadialVelocityState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_RADIAL_VELOCITY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

function format(value: number, locale: PublishedLocale, digits = 6): string {
  return formatLocaleScientificNumber(value, locale, digits, digits + 2);
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
  messages: RadialVelocityMessages["fields"];
}>) {
  const meta = FIELD_META[field];
  const range = RADIAL_VELOCITY_INPUT_RANGES[field];
  const id = `rv-${field}`;
  const max =
    field.endsWith("_periastron_deg") || field === "mean_anomaly_at_epoch_deg"
      ? 359.999999
      : range.max;
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
        max={max}
        min={range.min}
        onChange={(event) => onChange(event.target.value)}
        step={meta.step}
        type="number"
        value={value}
      />
    </label>
  );
}

function SourceList({ messages }: Readonly<{ messages: RadialVelocityMessages["model"] }>) {
  return (
    <ul className={styles.sourceList}>
      {RADIAL_VELOCITY_DEFINITION.references.map((sourceId) => {
        const source = RADIAL_VELOCITY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function CurveFigure({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: RadialVelocityMessages;
  result: RadialVelocityCalculationResponse;
}>) {
  const visual = buildRadialVelocityVisual(result);
  if (visual === null) return null;
  return (
    <figure className={styles.figure}>
      <svg
        aria-describedby="rv-curve-description"
        aria-labelledby="rv-curve-title"
        className={styles.figureSvg}
        role="img"
        viewBox="0 0 100 100"
      >
        <title id="rv-curve-title">{messages.curve.title}</title>
        <desc id="rv-curve-description">
          {formatMessageTemplate(messages.curve.description, {
            count: formatLocaleNumber(result.curve.length, locale),
          })}
        </desc>
        <line x1="5" x2="95" y1="50" y2="50" stroke="currentColor" opacity="0.14" />
        <path d={visual.path} fill="none" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <figcaption className={styles.caption}>
        {formatMessageTemplate(messages.curve.caption, {
          maximum: format(visual.maximum_velocity_m_s, locale),
          minimum: format(visual.minimum_velocity_m_s, locale),
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
  messages: RadialVelocityMessages;
  result: RadialVelocityCalculationResponse;
}>) {
  const labels = messages.result.labels;
  const rows = [
    [labels.semiAmplitude, `${format(result.semi_amplitude_m_s, locale)} m/s`],
    [labels.inclinationProjection, format(result.inclination_projection, locale)],
    [labels.projectedMass, `${format(result.projected_planet_mass_kg, locale)} kg`],
    [labels.massFunction, `${format(result.mass_function_kg, locale)} kg`],
    [labels.edgeOnMinimumMass, `${format(result.edge_on_minimum_mass_kg, locale)} kg`],
    [labels.samples, formatLocaleNumber(result.curve.length, locale)],
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

function DataPreview({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: RadialVelocityMessages;
  result: RadialVelocityCalculationResponse;
}>) {
  const step = Math.max(1, Math.ceil(result.curve.length / 20));
  const preview = result.curve.filter((_, index) => index % step === 0);
  const last = result.curve.at(-1)!;
  if (preview.at(-1) !== last) preview.push(last);
  return (
    <details className={styles.preview}>
      <summary>{messages.preview.summary}</summary>
      <p className={styles.previewDescription}>
        {formatMessageTemplate(messages.preview.description, {
          shown: formatLocaleNumber(preview.length, locale),
          total: formatLocaleNumber(result.curve.length, locale),
        })}
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{messages.preview.headers.time}</th>
              <th>{messages.preview.headers.orbitalPhase}</th>
              <th>{messages.preview.headers.stellarRv}</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((point) => (
              <tr key={point.time_s}>
                <td data-numeric="true">{format(point.time_s, locale, 5)}</td>
                <td data-numeric="true">{format(point.orbital_phase, locale, 5)}</td>
                <td data-numeric="true">{format(point.radial_velocity_m_s, locale, 7)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function RadialVelocityView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: RadialVelocityViewProps) {
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState<DraftState>(() => draftsForState(initialState));
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const recalculate = useCallback(
    async (nextState: RadialVelocityState, commit: boolean) => {
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
          radialVelocityRequestEndpoint(nextState),
          {
            signal: controller.signal,
          },
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
        const validated = validateRadialVelocityCalculationResult(nextState, response.data);
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
    const onPopState = () => {
      const next = stateFromBrowser();
      setState(next.state);
      setDraft(draftsForState(next.state));
      setInvalidNotice(next.invalid);
      void recalculate(next.state, false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      requestRef.current?.abort();
    };
  }, [recalculate]);

  const draftState = useMemo(() => stateForDraft(draft), [draft]);
  const busy = requestState === "loading";

  const calculate = async () => {
    if (draftState === null) {
      setMessage(messages.failures.invalidInput);
      return;
    }
    await recalculate(draftState, true);
  };

  const reset = () => {
    setDraft(draftsForState(DEFAULT_RADIAL_VELOCITY_STATE));
    void recalculate(DEFAULT_RADIAL_VELOCITY_STATE, true);
  };

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
          <h2>{messages.invalidState.title}</h2>
          <p>{messages.invalidState.description}</p>
        </aside>
      ) : null}

      <section aria-labelledby="rv-controls-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>01 · Orbital parameters</p>
          <h2 className={styles.sectionTitle} id="rv-controls-heading">
            {messages.controls.title}
          </h2>
          <p className={styles.sectionDescription}>{messages.controls.description}</p>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.inputGrid}>
            {(Object.keys(FIELD_META) as NumericField[]).map((field) => (
              <NumericInput
                disabled={busy}
                field={field}
                key={field}
                messages={messages.fields}
                onChange={(value) => setDraft((current) => ({ ...current, [field]: value }))}
                value={draft[field]}
              />
            ))}
          </div>
          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              disabled={busy}
              onClick={() => void calculate()}
              type="button"
            >
              {busy ? messages.actions.calculating : messages.actions.calculate}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={busy}
              onClick={reset}
              type="button"
            >
              {messages.actions.reset}
            </button>
          </div>
          {message ? (
            <p aria-live="polite" className={styles.message}>
              {message}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="rv-result-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>02 · Velocity curve</p>
          <h2 className={styles.sectionTitle} id="rv-result-heading">
            {messages.result.title}
          </h2>
        </div>
        <div className={styles.resultStack}>
          {calculation === null ? (
            <div className={styles.unavailable}>
              <h3>{messages.result.unavailableTitle}</h3>
              <p>{messages.result.unavailableDescription}</p>
            </div>
          ) : (
            <>
              <p className={styles.caption}>
                {formatMessageTemplate(messages.result.model, {
                  modelVersion: calculation.model_version,
                })}
              </p>
              <ResultSummary locale={locale} messages={messages} result={calculation} />
              <CurveFigure locale={locale} messages={messages} result={calculation} />
              <DataPreview locale={locale} messages={messages} result={calculation} />
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="rv-minimum-mass-heading" className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <h2 id="rv-minimum-mass-heading">{messages.minimumMass.title}</h2>
        </div>
        <div className={styles.subsectionBody}>
          <p className={styles.resultNote}>{messages.minimumMass.description}</p>
        </div>
      </section>

      <section aria-labelledby="rv-model-heading" className={styles.modelSection}>
        <h2 id="rv-model-heading">{messages.model.title}</h2>
        <div className={styles.modelBody}>
          <p>{RADIAL_VELOCITY_DEFINITION.default_preset}</p>
          <p>{RADIAL_VELOCITY_DEFINITION.sampling_policy}</p>
          <details className={styles.modelDetails}>
            <summary>{messages.model.equations}</summary>
            <div className={styles.modelDetailsBody}>
              <dl className={styles.equationList}>
                {Object.entries(RADIAL_VELOCITY_DEFINITION.equations).map(([name, equation]) => (
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
                    {RADIAL_VELOCITY_DEFINITION.assumptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>{messages.model.limitations}</h3>
                  <ul>
                    {RADIAL_VELOCITY_DEFINITION.limitations.map((item) => (
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
              companionMass: format(state.planet_mass_kg, locale, 4),
              eccentricity: format(state.eccentricity, locale, 4),
              inclination: format(state.inclination_deg, locale, 4),
              period: format(state.orbital_period_s, locale, 4),
              stellarMass: format(state.stellar_mass_kg, locale, 4),
            })}
          </p>
        </div>
      </section>
    </article>
  );
}
