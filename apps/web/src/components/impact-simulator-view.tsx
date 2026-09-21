"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type ImpactSimulatorCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
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
  if (value === 0) return formatLocaleNumber(0, locale, { useGrouping: false });
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(digits).split("e");
    return `${formatLocaleFixedNumber(Number(mantissa), digits, locale)}e${exponent}`;
  }
  return formatLocaleNumber(value, locale, { maximumSignificantDigits: digits + 1 });
}

function SourceList({ messages }: Readonly<{ messages: ImpactSimulatorMessages["model"] }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {IMPACT_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = IMPACT_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.sourceUnavailable, { sourceId })}</>
            ) : (
              <>
                <a className="text-[var(--link)] underline" href={source.url} rel="noreferrer">
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
    <div aria-label={messages.scrollAriaLabel} className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[660px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">{messages.caption}</caption>
        <thead>
          <tr>
            {[
              messages.headers.scalingCoefficient,
              messages.headers.transientDiameter,
              messages.headers.finalDiameter,
              messages.headers.classification,
            ].map((heading) => (
              <th
                className="border-b border-[var(--border)] p-2 text-left"
                key={heading}
                scope="col"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.coefficient_sensitivity.map((row) => (
            <tr key={row.scaling_coefficient}>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.scaling_coefficient, locale)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.transient_diameter_m, locale)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.final_diameter_m, locale)}
              </td>
              <td className="border-b border-[var(--border)] p-2">{row.classification}</td>
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
    <div aria-label={messages.scrollAriaLabel} className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">{messages.caption}</caption>
        <thead>
          <tr>
            <th className="border-b border-[var(--border)] p-2 text-left" scope="col">
              {messages.headers.thickness}
            </th>
            <th className="border-b border-[var(--border)] p-2 text-left" scope="col">
              {messages.headers.radius}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.ejecta_thickness_radii.map((row) => (
            <tr key={row.thickness_m}>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.thickness_m, locale)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.radius_m, locale)}
              </td>
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
    <figure className="space-y-3">
      <div
        aria-label={messages.ariaLabel}
        className="space-y-3 rounded-md border border-[var(--border)] p-4"
        role="img"
      >
        {rows.map((row) => (
          <div className="space-y-1" key={row.label}>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{row.label}</span>
              <span className="font-mono">{format(row.value, locale)} m</span>
            </div>
            <div className="h-3 w-full rounded-sm border border-[var(--border)]">
              <div
                className="h-full bg-[var(--accent)]"
                style={{ width: `${Math.max(2, (row.value / maximum) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <figcaption className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        {messages.caption}
      </figcaption>
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
    <article className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.header.intro}</p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          {messages.invalidState.inline}
        </aside>
      ) : null}

      <section aria-labelledby="impact-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="impact-input-heading">
            {messages.controls.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.controls.description}</p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.diameter}</span>
              <input
                aria-label={messages.controls.fieldAriaLabels.diameter}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
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
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.density}</span>
              <input
                aria-label={messages.controls.fieldAriaLabels.density}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
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
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.speed}</span>
              <input
                aria-label={messages.controls.fieldAriaLabels.speed}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
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
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.angle}</span>
              <input
                aria-label={messages.controls.fieldAriaLabels.angle}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
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
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.target}</span>
              <select
                aria-label={messages.controls.fieldAriaLabels.target}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3"
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
          <div className="flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-md bg-[var(--accent)] px-5 font-semibold text-[var(--background)]"
              disabled={requestState === "loading"}
              type="submit"
            >
              {requestState === "loading"
                ? messages.actions.calculating
                : messages.actions.calculate}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              {messages.actions.reset}
            </button>
          </div>
        </form>
        {message ? (
          <p role={requestState === "unavailable" ? "alert" : "status"}>{message}</p>
        ) : null}
      </section>

      {calculation === null ? (
        <section className="border border-[var(--border)] p-5" role="alert">
          <h2 className="text-2xl font-semibold">{messages.result.unavailableTitle}</h2>
          <p className="mt-2 text-[var(--muted)]">{messages.result.unavailableDescription}</p>
        </section>
      ) : (
        <section aria-labelledby="impact-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="impact-result-heading">
              {messages.result.title}
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
                targetDensity: format(calculation.target_density_kg_m3, locale),
              })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.labels.impactorMass}</p>
              <p className="mt-1 font-semibold">
                {format(calculation.impactor_mass_kg, locale)} kg
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.labels.kineticEnergy}</p>
              <p className="mt-1 font-semibold">{format(calculation.kinetic_energy_j, locale)} J</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.labels.tntContext}</p>
              <p className="mt-1 font-semibold">
                {format(calculation.tnt_equivalent_megatons, locale)} Mt TNT
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">
                {messages.result.labels.bestFinalCrater}
              </p>
              <p className="mt-1 font-semibold">
                {format(calculation.best_estimate_crater.final_diameter_m, locale)} m
              </p>
            </div>
          </div>
          <p className="max-w-4xl rounded-md border border-[var(--border)] p-4 text-sm leading-6">
            {messages.result.tntDescription}
          </p>

          <section aria-labelledby="impact-sensitivity-heading" className="space-y-4">
            <div className="max-w-4xl space-y-2">
              <h3 className="text-xl font-semibold" id="impact-sensitivity-heading">
                {messages.sensitivity.title}
              </h3>
              <p className="leading-7 text-[var(--muted)]">{calculation.uncertainty_note}</p>
            </div>
            <CraterSensitivityTable
              locale={locale}
              messages={messages.sensitivity}
              result={calculation}
            />
          </section>

          <section aria-labelledby="impact-ejecta-heading" className="space-y-4">
            <div className="max-w-4xl space-y-2">
              <h3 className="text-xl font-semibold" id="impact-ejecta-heading">
                {messages.ejecta.title}
              </h3>
              <p className="leading-7 text-[var(--muted)]">{messages.ejecta.description}</p>
            </div>
            <ReturnedScaleFigure locale={locale} messages={messages.figure} result={calculation} />
            <EjectaTable locale={locale} messages={messages.ejecta.table} result={calculation} />
          </section>

          <p className="max-w-4xl rounded-md border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
            {calculation.model_note}
          </p>
        </section>
      )}

      <section
        aria-labelledby="impact-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="impact-model-heading">
          {messages.model.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{IMPACT_SIMULATOR_DEFINITION.summary}</p>
        <details open>
          <summary className="cursor-pointer font-semibold">
            {messages.model.assumptionsAndLimitations}
          </summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">{messages.model.assumptions}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {IMPACT_SIMULATOR_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">{messages.model.limitations}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {IMPACT_SIMULATOR_DEFINITION.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">{messages.model.equations}</summary>
          <ul className="mt-3 list-disc space-y-3 pl-6 text-sm leading-6 text-[var(--muted)]">
            {IMPACT_SIMULATOR_DEFINITION.equations.map((equation) => (
              <li key={equation.id}>
                <strong className="text-[var(--foreground)]">{equation.id}:</strong>{" "}
                <code>{equation.expression}</code>
                {equation.source_equation ? <> — {equation.source_equation}</> : null}
              </li>
            ))}
          </ul>
        </details>
        <div>
          <h3 className="font-semibold">{messages.model.reviewedSources}</h3>
          <div className="mt-2">
            <SourceList messages={messages.model} />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.model.currentState, {
            diameter: format(state.diameter_m, locale),
            density: format(state.impactor_density_kg_m3, locale),
            speed: format(state.speed_km_s, locale),
            angle: format(state.impact_angle_deg, locale),
            target: targetLabel(state.target_material, messages.targets),
          })}
        </p>
      </section>
    </article>
  );
}
