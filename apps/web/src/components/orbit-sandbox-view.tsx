"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestEndpoint, type OrbitSandboxCalculationResponse } from "@nova-lumina/api-client";

import {
  formatLocaleScientificNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { OrbitSandboxMessages } from "../lib/i18n/messages/types";
import {
  DEFAULT_ORBIT_SANDBOX_STATE,
  ORBIT_DEFINITION,
  ORBIT_INPUT_RANGES,
  ORBIT_SOURCES,
  buildOrbitVisualTransform,
  decodeOrbitSandboxState,
  encodeOrbitSandboxState,
  orbitSandboxRequestEndpoint,
  validateOrbitSandboxCalculationResult,
  validateOrbitSandboxState,
  type OrbitSandboxState,
} from "../lib/simulations/orbit-sandbox";
import styles from "./orbit-sandbox-view.module.css";

type OrbitSandboxViewProps = Readonly<{
  initialState: OrbitSandboxState;
  initialStateInvalid: boolean;
  initialCalculation: OrbitSandboxCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: OrbitSandboxMessages;
}>;

type NumericField = Exclude<keyof OrbitSandboxState, "version" | "model_version">;
type DraftState = Record<NumericField, string>;
type RequestState = "idle" | "loading" | "unavailable";

const FIELD_META: Record<
  NumericField,
  Readonly<{ messageKey: keyof OrbitSandboxMessages["fields"]; unit: string; step: string }>
> = {
  central_mass_kg: { messageKey: "centralMass", unit: "kg", step: "any" },
  central_radius_m: { messageKey: "centralRadius", unit: "m", step: "any" },
  orbiting_body_mass_kg: { messageKey: "secondaryMass", unit: "kg", step: "any" },
  position_x_m: { messageKey: "positionX", unit: "m", step: "any" },
  position_y_m: { messageKey: "positionY", unit: "m", step: "any" },
  velocity_x_m_s: { messageKey: "velocityX", unit: "m/s", step: "any" },
  velocity_y_m_s: { messageKey: "velocityY", unit: "m/s", step: "any" },
  duration_s: { messageKey: "duration", unit: "s", step: "any" },
  time_step_s: { messageKey: "timeStep", unit: "s", step: "any" },
};

function draftsForState(state: OrbitSandboxState): DraftState {
  return {
    central_mass_kg: String(state.central_mass_kg),
    central_radius_m: String(state.central_radius_m),
    orbiting_body_mass_kg: String(state.orbiting_body_mass_kg),
    position_x_m: String(state.position_x_m),
    position_y_m: String(state.position_y_m),
    velocity_x_m_s: String(state.velocity_x_m_s),
    velocity_y_m_s: String(state.velocity_y_m_s),
    duration_s: String(state.duration_s),
    time_step_s: String(state.time_step_s),
  };
}

function stateForDraft(draft: DraftState): OrbitSandboxState | null {
  if (Object.values(draft).some((value) => value.trim().length === 0)) return null;
  return validateOrbitSandboxState({
    version: 1,
    model_version: "orbit-sandbox-v1",
    central_mass_kg: Number(draft.central_mass_kg),
    central_radius_m: Number(draft.central_radius_m),
    orbiting_body_mass_kg: Number(draft.orbiting_body_mass_kg),
    position_x_m: Number(draft.position_x_m),
    position_y_m: Number(draft.position_y_m),
    velocity_x_m_s: Number(draft.velocity_x_m_s),
    velocity_y_m_s: Number(draft.velocity_y_m_s),
    duration_s: Number(draft.duration_s),
    time_step_s: Number(draft.time_step_s),
  });
}

function replaceBrowserState(state: OrbitSandboxState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/orbit-sandbox";
  url.searchParams.set("state", encodeOrbitSandboxState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: OrbitSandboxState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_ORBIT_SANDBOX_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeOrbitSandboxState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_ORBIT_SANDBOX_STATE, invalid: true }
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

function classificationLabel(
  value: OrbitSandboxCalculationResponse["classification"],
  messages: OrbitSandboxMessages["classification"],
): string {
  const labels: Record<OrbitSandboxCalculationResponse["classification"], string> = {
    bound: messages.bound,
    parabolic_near: messages.parabolicNear,
    escape: messages.escape,
    collision: messages.collision,
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
  messages: OrbitSandboxMessages["fields"];
}>) {
  const meta = FIELD_META[field];
  const range = ORBIT_INPUT_RANGES[field];
  const id = `orbit-${field}`;
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

function SourceList({ messages }: Readonly<{ messages: OrbitSandboxMessages["model"] }>) {
  return (
    <ul className={styles.sourceList}>
      {ORBIT_DEFINITION.references.map((sourceId) => {
        const source = ORBIT_SOURCES.find((candidate) => candidate.id === sourceId);
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

function TrajectoryFigure({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: OrbitSandboxMessages;
  result: OrbitSandboxCalculationResponse;
}>) {
  const visual = buildOrbitVisualTransform(result);
  if (visual === null) return null;
  const finalPoint = visual.points.at(-1)!;
  return (
    <figure className={styles.trajectory}>
      <div className={styles.trajectoryFrame}>
        <svg
          aria-describedby="orbit-trajectory-description"
          aria-labelledby="orbit-trajectory-title"
          role="img"
          viewBox="0 0 100 100"
        >
          <title id="orbit-trajectory-title">{messages.trajectory.title}</title>
          <desc id="orbit-trajectory-description">
            {formatMessageTemplate(messages.trajectory.description, {
              count: formatLocaleNumber(result.trajectory.length, locale),
            })}
          </desc>
          <line x1="50" x2="50" y1="3" y2="97" stroke="currentColor" opacity="0.12" />
          <line x1="3" x2="97" y1="50" y2="50" stroke="currentColor" opacity="0.12" />
          <circle
            cx="50"
            cy="50"
            fill="currentColor"
            opacity="0.3"
            r={visual.central_radius_percent}
          />
          <path d={visual.path} fill="none" stroke="currentColor" strokeWidth="0.7" />
          <circle cx={visual.points[0]!.x} cy={visual.points[0]!.y} fill="currentColor" r="1.4" />
          <circle cx={finalPoint.x} cy={finalPoint.y} fill="none" r="1.8" stroke="currentColor" />
        </svg>
      </div>
      <figcaption className={styles.caption}>
        {formatMessageTemplate(messages.trajectory.caption, {
          halfSpan: format(visual.scale_m, locale, messages.notApplicable, 3),
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
  messages: OrbitSandboxMessages;
  result: OrbitSandboxCalculationResponse;
}>) {
  const labels = messages.result.labels;
  const rows = [
    [labels.classification, classificationLabel(result.classification, messages.classification)],
    [labels.eccentricity, format(result.eccentricity, locale, messages.notApplicable)],
    [
      labels.specificOrbitalEnergy,
      `${format(result.specific_orbital_energy_j_per_kg, locale, messages.notApplicable)} J/kg`,
    ],
    [
      labels.specificAngularMomentum,
      `${format(result.specific_angular_momentum_m2_per_s, locale, messages.notApplicable)} m²/s`,
    ],
    [
      labels.semiMajorAxis,
      result.semi_major_axis_m === null
        ? messages.notApplicable
        : `${format(result.semi_major_axis_m, locale, messages.notApplicable)} m`,
    ],
    [
      labels.period,
      result.period_s === null
        ? messages.notApplicable
        : `${format(result.period_s, locale, messages.notApplicable)} s`,
    ],
    [labels.periapsis, `${format(result.periapsis_m, locale, messages.notApplicable)} m`],
    [
      labels.apoapsis,
      result.apoapsis_m === null
        ? messages.notApplicable
        : `${format(result.apoapsis_m, locale, messages.notApplicable)} m`,
    ],
    [
      labels.collisionTime,
      result.collision_time_s === null
        ? messages.result.notReached
        : `${format(result.collision_time_s, locale, messages.notApplicable)} s`,
    ],
    [labels.trajectorySamples, formatLocaleNumber(result.trajectory.length, locale)],
    [
      labels.maxSpecificEnergyDrift,
      format(result.max_specific_energy_drift_fraction, locale, messages.notApplicable),
    ],
    [
      labels.maxAngularMomentumDrift,
      format(result.max_specific_angular_momentum_drift_fraction, locale, messages.notApplicable),
    ],
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

function TrajectoryDataPreview({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: OrbitSandboxMessages;
  result: OrbitSandboxCalculationResponse;
}>) {
  const step = Math.max(1, Math.ceil(result.trajectory.length / 20));
  const preview = result.trajectory.filter((_, index) => index % step === 0);
  const last = result.trajectory.at(-1)!;
  if (preview.at(-1) !== last) preview.push(last);
  return (
    <details className={styles.preview}>
      <summary>{messages.preview.summary}</summary>
      <p className={styles.previewDescription}>
        {formatMessageTemplate(messages.preview.description, {
          shown: formatLocaleNumber(preview.length, locale),
          total: formatLocaleNumber(result.trajectory.length, locale),
        })}
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{messages.preview.headers.time}</th>
              <th>{messages.preview.headers.x}</th>
              <th>{messages.preview.headers.y}</th>
              <th>{messages.preview.headers.distance}</th>
              <th>{messages.preview.headers.speed}</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((point) => (
              <tr key={point.time_s}>
                <td>{format(point.time_s, locale, messages.notApplicable, 4)}</td>
                <td>{format(point.x_m, locale, messages.notApplicable, 4)}</td>
                <td>{format(point.y_m, locale, messages.notApplicable, 4)}</td>
                <td>{format(point.distance_m, locale, messages.notApplicable, 4)}</td>
                <td>{format(point.speed_m_s, locale, messages.notApplicable, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function OrbitSandboxView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: OrbitSandboxViewProps) {
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState<DraftState>(() => draftsForState(initialState));
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const recalculate = useCallback(
    async (nextState: OrbitSandboxState, commit: boolean) => {
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
        const response = await requestEndpoint(apiOrigin, orbitSandboxRequestEndpoint(nextState), {
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
        const validated = validateOrbitSandboxCalculationResult(nextState, response.data);
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
    () => (calculation === null ? null : buildOrbitVisualTransform(calculation)),
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
    const next = DEFAULT_ORBIT_SANDBOX_STATE;
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

      <section aria-labelledby="orbit-input-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>01 · Inputs</p>
          <h2 className={styles.sectionTitle} id="orbit-input-heading">
            {messages.controls.title}
          </h2>
          <p className={styles.sectionDescription}>{messages.controls.description}</p>
        </div>
        <div className={styles.sectionBody}>
          <form onSubmit={submit}>
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
        <section aria-labelledby="orbit-result-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionIndex}>02 · Output</p>
            <h2 className={styles.sectionTitle} id="orbit-result-heading">
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
              <TrajectoryFigure locale={locale} messages={messages} result={calculation} />
            )}
            <TrajectoryDataPreview locale={locale} messages={messages} result={calculation} />
          </div>
        </section>
      )}

      <section aria-labelledby="orbit-model-heading" className={styles.model}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>03 · Model</p>
          <h2 className={styles.sectionTitle} id="orbit-model-heading">
            {messages.model.title}
          </h2>
        </div>
        <div className={styles.modelBody}>
          <p className={styles.modelCopy}>{ORBIT_DEFINITION.calculation_module.valid_domain}</p>
          <p className={styles.modelCopy}>{ORBIT_DEFINITION.calculation_module.numerical_policy}</p>
          <details className={styles.modelDetails}>
            <summary>{messages.model.equations}</summary>
            <dl className={styles.equationList}>
              {Object.entries(ORBIT_DEFINITION.calculation_module.equations).map(
                ([name, equation]) => (
                  <div key={name}>
                    <dt>{name.replaceAll("_", " ")}</dt>
                    <dd>{equation}</dd>
                  </div>
                ),
              )}
            </dl>
          </details>
          <details className={styles.modelDetails}>
            <summary>{messages.model.assumptionsAndLimitations}</summary>
            <div className={styles.assumptionGrid}>
              <div>
                <h3>{messages.model.assumptions}</h3>
                <ul>
                  {ORBIT_DEFINITION.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>{messages.model.limitations}</h3>
                <ul>
                  {ORBIT_DEFINITION.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
          <div>
            <h3 className={styles.sourcesTitle}>{messages.model.reviewedSources}</h3>
            <SourceList messages={messages.model} />
          </div>
          <p className={styles.currentState}>
            {formatMessageTemplate(messages.model.currentState, {
              duration: format(state.duration_s, locale, messages.notApplicable, 3),
              xPosition: format(state.position_x_m, locale, messages.notApplicable, 3),
              yVelocity: format(state.velocity_y_m_s, locale, messages.notApplicable, 3),
            })}
          </p>
        </div>
      </section>
    </article>
  );
}
