"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type ImpactSimulatorCalculationResponse } from "@nova-lumina/api-client";

import { formatLocaleScientificNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ImpactSimulatorMessages } from "../lib/i18n/messages/types";
import {
  DEFAULT_IMPACT_SIMULATOR_STATE,
  IMPACT_SIMULATOR_DEFINITION,
  IMPACT_SIMULATOR_LIMITS,
  IMPACT_SIMULATOR_MODEL_VERSION,
  IMPACT_SIMULATOR_SOURCES,
  decodeImpactSimulatorState,
  encodeImpactSimulatorState,
  impactSimulatorRequestEndpoint,
  validateImpactSimulatorCalculationResult,
  validateImpactSimulatorState,
  type ImpactSimulatorState,
  type ImpactSimulatorTargetMaterial,
} from "../lib/simulations/impact-simulator";
import styles from "./lab-calculation-instrument.module.css";

type ImpactSimulatorViewProps = Readonly<{
  initialState: ImpactSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: ImpactSimulatorCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: ImpactSimulatorMessages;
}>;

type RequestState = "idle" | "loading" | "unavailable";

function targetLabel(
  target: ImpactSimulatorTargetMaterial,
  messages: ImpactSimulatorMessages["targets"],
): string {
  return target === "sedimentary_rock" ? messages.sedimentaryRock : messages.crystallineRock;
}

function replaceBrowserState(state: ImpactSimulatorState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/impact-simulator";
  url.searchParams.set("state", encodeImpactSimulatorState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: ImpactSimulatorState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_IMPACT_SIMULATOR_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeImpactSimulatorState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_IMPACT_SIMULATOR_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

function format(value: number, locale: PublishedLocale, digits = 6): string {
  return formatLocaleScientificNumber(value, locale, digits);
}

function SourceList({ messages }: Readonly<{ messages: ImpactSimulatorMessages["model"] }>) {
  return (
    <ul className={styles.sourceList}>
      {IMPACT_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = IMPACT_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
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

function CraterSensitivityTable({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: ImpactSimulatorMessages["sensitivity"];
  result: ImpactSimulatorCalculationResponse;
}>) {
  return (
    <div aria-label={messages.scrollAriaLabel} className={styles.tableWrap} tabIndex={0}>
      <table className={styles.table}>
        <caption>{messages.caption}</caption>
        <thead>
          <tr>
            {[
              messages.headers.scalingCoefficient,
              messages.headers.transientDiameter,
              messages.headers.finalDiameter,
              messages.headers.classification,
            ].map((heading) => (
              <th key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.coefficient_sensitivity.map((row) => (
            <tr key={row.scaling_coefficient}>
              <td data-numeric="true">{format(row.scaling_coefficient, locale)}</td>
              <td data-numeric="true">{format(row.transient_diameter_m, locale)}</td>
              <td data-numeric="true">{format(row.final_diameter_m, locale)}</td>
              <td>{row.classification}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EjectaTable({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: ImpactSimulatorMessages["ejecta"]["table"];
  result: ImpactSimulatorCalculationResponse;
}>) {
  return (
    <div aria-label={messages.scrollAriaLabel} className={styles.tableWrap} tabIndex={0}>
      <table className={styles.table}>
        <caption>{messages.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{messages.headers.thickness}</th>
            <th scope="col">{messages.headers.radius}</th>
          </tr>
        </thead>
        <tbody>
          {result.ejecta_thickness_radii.map((row) => (
            <tr key={row.thickness_m}>
              <td data-numeric="true">{format(row.thickness_m, locale)}</td>
              <td data-numeric="true">{format(row.radius_m, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReturnedScaleFigure({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: ImpactSimulatorMessages["figure"];
  result: ImpactSimulatorCalculationResponse;
}>) {
  const rows = [
    {
      label: messages.finalCraterRadius,
      value: result.best_estimate_crater.final_diameter_m / 2,
    },
    ...result.ejecta_thickness_radii.map((row) => ({
      label: formatMessageTemplate(messages.depositRadius, {
        thickness: format(row.thickness_m, locale),
      }),
      value: row.radius_m,
    })),
  ];
  const maximum = Math.max(...rows.map((row) => row.value));
  return (
    <figure className={styles.figure}>
      <div aria-label={messages.ariaLabel} className={styles.figureFrame} role="img">
        <div className={styles.figureRows}>
          {rows.map((row) => (
            <div className={styles.figureRow} key={row.label}>
              <div className={styles.figureRowHeader}>
                <span>{row.label}</span>
                <span>{format(row.value, locale)} m</span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barValue}
                  style={{ width: `${Math.max(2, (row.value / maximum) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className={styles.caption}>{messages.caption}</figcaption>
    </figure>
  );
}

export function ImpactSimulatorView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: ImpactSimulatorViewProps) {
  const [state, setState] = useState(initialState);
  const [draftDiameter, setDraftDiameter] = useState(String(initialState.diameter_m));
  const [draftDensity, setDraftDensity] = useState(String(initialState.impactor_density_kg_m3));
  const [draftSpeed, setDraftSpeed] = useState(String(initialState.speed_km_s));
  const [draftAngle, setDraftAngle] = useState(String(initialState.impact_angle_deg));
  const [draftTarget, setDraftTarget] = useState(initialState.target_material);
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const adoptDraft = useCallback((next: ImpactSimulatorState) => {
    setDraftDiameter(String(next.diameter_m));
    setDraftDensity(String(next.impactor_density_kg_m3));
    setDraftSpeed(String(next.speed_km_s));
    setDraftAngle(String(next.impact_angle_deg));
    setDraftTarget(next.target_material);
  }, []);

  const recalculate = useCallback(
    async (nextState: ImpactSimulatorState, commit: boolean) => {
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
          impactSimulatorRequestEndpoint(nextState),
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
        const validated = validateImpactSimulatorCalculationResult(nextState, response.data);
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
    if (
      [draftDiameter, draftDensity, draftSpeed, draftAngle].some(
        (value) => value.trim().length === 0,
      )
    ) {
      setMessage(messages.failures.invalidInput);
      return;
    }
    const next = validateImpactSimulatorState({
      version: 1,
      model_version: IMPACT_SIMULATOR_MODEL_VERSION,
      diameter_m: Number(draftDiameter),
      impactor_density_kg_m3: Number(draftDensity),
      speed_km_s: Number(draftSpeed),
      impact_angle_deg: Number(draftAngle),
      target_material: draftTarget,
    });
    if (next === null) {
      setMessage(messages.failures.outOfDomain);
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    adoptDraft(DEFAULT_IMPACT_SIMULATOR_STATE);
    setMessage("");
    void recalculate(DEFAULT_IMPACT_SIMULATOR_STATE, true);
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

      <section aria-labelledby="impact-input-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>01 · Parameters</p>
          <h2 className={styles.sectionTitle} id="impact-input-heading">
            {messages.controls.title}
          </h2>
          <p className={styles.sectionDescription}>{messages.controls.description}</p>
        </div>
        <div className={styles.sectionBody}>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.inputGrid} data-columns="5">
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{messages.controls.fields.diameter}</span>
                <input
                  aria-label={messages.controls.fieldAriaLabels.diameter}
                  className={styles.input}
                  disabled={requestState === "loading"}
                  max={IMPACT_SIMULATOR_LIMITS.maxDiameterM}
                  min={IMPACT_SIMULATOR_LIMITS.minDiameterM}
                  onChange={(event) => {
                    setDraftDiameter(event.target.value);
                    setMessage("");
                  }}
                  step="any"
                  type="number"
                  value={draftDiameter}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{messages.controls.fields.density}</span>
                <input
                  aria-label={messages.controls.fieldAriaLabels.density}
                  className={styles.input}
                  disabled={requestState === "loading"}
                  max={IMPACT_SIMULATOR_LIMITS.maxImpactorDensityKgM3}
                  min={IMPACT_SIMULATOR_LIMITS.minImpactorDensityKgM3}
                  onChange={(event) => {
                    setDraftDensity(event.target.value);
                    setMessage("");
                  }}
                  step="any"
                  type="number"
                  value={draftDensity}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{messages.controls.fields.speed}</span>
                <input
                  aria-label={messages.controls.fieldAriaLabels.speed}
                  className={styles.input}
                  disabled={requestState === "loading"}
                  max={IMPACT_SIMULATOR_LIMITS.maxSpeedKmS}
                  min={IMPACT_SIMULATOR_LIMITS.minSpeedKmS}
                  onChange={(event) => {
                    setDraftSpeed(event.target.value);
                    setMessage("");
                  }}
                  step="any"
                  type="number"
                  value={draftSpeed}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{messages.controls.fields.angle}</span>
                <input
                  aria-label={messages.controls.fieldAriaLabels.angle}
                  className={styles.input}
                  disabled={requestState === "loading"}
                  max={IMPACT_SIMULATOR_LIMITS.maxImpactAngleDeg}
                  min={IMPACT_SIMULATOR_LIMITS.minImpactAngleDeg}
                  onChange={(event) => {
                    setDraftAngle(event.target.value);
                    setMessage("");
                  }}
                  step="any"
                  type="number"
                  value={draftAngle}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{messages.controls.fields.target}</span>
                <select
                  aria-label={messages.controls.fieldAriaLabels.target}
                  className={styles.select}
                  disabled={requestState === "loading"}
                  onChange={(event) => {
                    setDraftTarget(event.target.value as ImpactSimulatorTargetMaterial);
                    setMessage("");
                  }}
                  value={draftTarget}
                >
                  {(["sedimentary_rock", "crystalline_rock"] as const).map((value) => (
                    <option key={value} value={value}>
                      {targetLabel(value, messages.targets)}
                    </option>
                  ))}
                </select>
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
        <section aria-labelledby="impact-result-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionIndex}>02 · Result</p>
            <h2 className={styles.sectionTitle} id="impact-result-heading">
              {messages.result.title}
            </h2>
            <p className={styles.sectionDescription}>
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
                targetDensity: format(calculation.target_density_kg_m3, locale),
              })}
            </p>
          </div>
          <div className={styles.resultStack}>
            <dl className={styles.summaryGrid}>
              <div className={styles.summaryCell}>
                <dt>{messages.result.labels.impactorMass}</dt>
                <dd>{format(calculation.impactor_mass_kg, locale)} kg</dd>
              </div>
              <div className={styles.summaryCell}>
                <dt>{messages.result.labels.kineticEnergy}</dt>
                <dd>{format(calculation.kinetic_energy_j, locale)} J</dd>
              </div>
              <div className={styles.summaryCell}>
                <dt>{messages.result.labels.tntContext}</dt>
                <dd>{format(calculation.tnt_equivalent_megatons, locale)} Mt TNT</dd>
              </div>
              <div className={styles.summaryCell}>
                <dt>{messages.result.labels.bestFinalCrater}</dt>
                <dd>{format(calculation.best_estimate_crater.final_diameter_m, locale)} m</dd>
              </div>
            </dl>
            <p className={styles.resultNote}>{messages.result.tntDescription}</p>

            <section aria-labelledby="impact-sensitivity-heading" className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <h3 id="impact-sensitivity-heading">{messages.sensitivity.title}</h3>
                <p>{calculation.uncertainty_note}</p>
              </div>
              <div className={styles.subsectionBody}>
                <CraterSensitivityTable
                  locale={locale}
                  messages={messages.sensitivity}
                  result={calculation}
                />
              </div>
            </section>

            <section aria-labelledby="impact-ejecta-heading" className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <h3 id="impact-ejecta-heading">{messages.ejecta.title}</h3>
                <p>{messages.ejecta.description}</p>
              </div>
              <div className={styles.subsectionBody}>
                <ReturnedScaleFigure
                  locale={locale}
                  messages={messages.figure}
                  result={calculation}
                />
                <EjectaTable
                  locale={locale}
                  messages={messages.ejecta.table}
                  result={calculation}
                />
              </div>
            </section>

            <p className={styles.resultNote}>{calculation.model_note}</p>
          </div>
        </section>
      )}

      <section aria-labelledby="impact-model-heading" className={styles.modelSection}>
        <h2 id="impact-model-heading">{messages.model.title}</h2>
        <div className={styles.modelBody}>
          <p>{IMPACT_SIMULATOR_DEFINITION.summary}</p>
          <details className={styles.modelDetails} open>
            <summary>{messages.model.assumptionsAndLimitations}</summary>
            <div className={styles.modelDetailsBody}>
              <div className={styles.modelColumns}>
                <div>
                  <h3>{messages.model.assumptions}</h3>
                  <ul>
                    {IMPACT_SIMULATOR_DEFINITION.assumptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>{messages.model.limitations}</h3>
                  <ul>
                    {IMPACT_SIMULATOR_DEFINITION.limitations.map((item) => (
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
              {IMPACT_SIMULATOR_DEFINITION.equations.map((equation) => (
                <li key={equation.id}>
                  <strong>{equation.id}:</strong> <code>{equation.expression}</code>
                  {equation.source_equation ? <> — {equation.source_equation}</> : null}
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
              diameter: format(state.diameter_m, locale),
              density: format(state.impactor_density_kg_m3, locale),
              speed: format(state.speed_km_s, locale),
              angle: format(state.impact_angle_deg, locale),
              target: targetLabel(state.target_material, messages.targets),
            })}
          </p>
        </div>
      </section>
    </article>
  );
}
