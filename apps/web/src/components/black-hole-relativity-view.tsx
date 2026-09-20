"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type BlackHoleRelativityCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
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
  if (value === 0) return formatLocaleNumber(0, locale, { useGrouping: false });
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(digits).split("e");
    return `${formatLocaleFixedNumber(Number(mantissa), digits, locale)}e${exponent}`;
  }
  return formatLocaleNumber(value, locale, { maximumSignificantDigits: digits + 1 });
}

function SourceList({ messages }: Readonly<{ messages: BlackHoleRelativityMessages["model"] }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {BLACK_HOLE_RELATIVITY_DEFINITION.references.map((sourceId) => {
        const source = BLACK_HOLE_RELATIVITY_SOURCES.find((candidate) => candidate.id === sourceId);
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
    <div aria-label={messages.tableAriaLabel} className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">{messages.caption}</caption>
        <thead>
          <tr>
            {[
              messages.headers.landmark,
              messages.headers.radiusRs,
              messages.headers.radiusM,
              messages.headers.interpretation,
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
          {result.landmarks.map((row) => (
            <tr key={row.id}>
              <td className="border-b border-[var(--border)] p-2 font-semibold">{row.label}</td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.radius_rs, locale)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.radius_m, locale)}
              </td>
              <td className="border-b border-[var(--border)] p-2">{row.interpretation}</td>
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
    <figure className="space-y-3">
      <div
        aria-label={messages.schematicAriaLabel}
        className="space-y-3 rounded-md border border-[var(--border)] p-4"
        role="img"
      >
        {rows.map((row) => (
          <div className="space-y-1" key={row.id}>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{row.label}</span>
              <span className="font-mono">{format(row.radiusM, locale)} m</span>
            </div>
            <div className="h-3 w-full rounded-sm border border-[var(--border)]">
              <div
                className="h-full bg-[var(--accent)]"
                style={{ width: `${Math.max(2, (row.radiusM / maximum) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <figcaption className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        {messages.schematicCaption}
      </figcaption>
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

      <section aria-labelledby="black-hole-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="black-hole-input-heading">
            {messages.controls.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.controls.description}</p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.massLabel}</span>
              <input
                aria-label={messages.controls.massAriaLabel}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
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
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.radiusLabel}</span>
              <input
                aria-label={messages.controls.radiusAriaLabel}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
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
        <section aria-labelledby="black-hole-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="black-hole-result-heading">
              {messages.result.title}
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">
                {messages.result.metrics.gravitationalParameter}
              </p>
              <p className="mt-1 font-semibold">
                {format(calculation.gravitational_parameter_m3_s2, locale)} m³/s²
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">
                {messages.result.metrics.eventHorizonRadius}
              </p>
              <p className="mt-1 font-semibold">
                {format(calculation.schwarzschild_radius_m, locale)} m
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.metrics.clockRate}</p>
              <p className="mt-1 font-semibold">
                {format(calculation.proper_time_rate_vs_infinity, locale)}
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.metrics.redshift}</p>
              <p className="mt-1 font-semibold">
                {format(calculation.gravitational_redshift_z, locale)}
              </p>
            </div>
          </div>

          <section aria-labelledby="black-hole-landmarks-heading" className="space-y-4">
            <div className="max-w-4xl space-y-2">
              <h3 className="text-xl font-semibold" id="black-hole-landmarks-heading">
                {messages.landmarks.title}
              </h3>
              <p className="leading-7 text-[var(--muted)]">{messages.landmarks.description}</p>
            </div>
            <ReturnedLandmarkSchematic
              locale={locale}
              messages={messages.landmarks}
              result={calculation}
            />
            <LandmarkTable locale={locale} messages={messages.landmarks} result={calculation} />
          </section>

          <section aria-labelledby="black-hole-clock-heading" className="space-y-4">
            <div className="max-w-4xl space-y-2">
              <h3 className="text-xl font-semibold" id="black-hole-clock-heading">
                {messages.result.clock.title}
              </h3>
              <p className="leading-7 text-[var(--muted)]">{calculation.observer_note}</p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-[var(--border)] p-4">
                <dt className="text-sm text-[var(--muted)]">
                  {messages.result.clock.selectedRadius}
                </dt>
                <dd className="mt-1 font-mono">
                  {format(calculation.static_observer_areal_radius_m, locale)} m
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] p-4">
                <dt className="text-sm text-[var(--muted)]">
                  {messages.result.clock.frequencyRatio}
                </dt>
                <dd className="mt-1 font-mono">
                  {format(calculation.frequency_ratio_at_infinity, locale)}
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] p-4">
                <dt className="text-sm text-[var(--muted)]">
                  {messages.result.clock.farAwayInterval}
                </dt>
                <dd className="mt-1 font-mono">
                  {format(calculation.far_away_interval_per_local_interval, locale)}
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] p-4">
                <dt className="text-sm text-[var(--muted)]">{messages.result.clock.redshift}</dt>
                <dd className="mt-1 font-mono">
                  {format(calculation.gravitational_redshift_z, locale)}
                </dd>
              </div>
            </dl>
          </section>

          <p className="max-w-4xl rounded-md border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
            {calculation.model_note}
          </p>
        </section>
      )}

      <section
        aria-labelledby="black-hole-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="black-hole-model-heading">
          {messages.model.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{BLACK_HOLE_RELATIVITY_DEFINITION.summary}</p>
        <details open>
          <summary className="cursor-pointer font-semibold">
            {messages.model.assumptionsAndLimitations}
          </summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">{messages.model.assumptions}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {BLACK_HOLE_RELATIVITY_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">{messages.model.limitations}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {BLACK_HOLE_RELATIVITY_DEFINITION.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">{messages.model.equations}</summary>
          <ul className="mt-3 list-disc space-y-3 pl-6 text-sm leading-6 text-[var(--muted)]">
            {BLACK_HOLE_RELATIVITY_DEFINITION.equations.map((equation) => (
              <li key={equation.id}>
                <strong className="text-[var(--foreground)]">{equation.id}:</strong>{" "}
                <code>{equation.expression}</code> — {equation.meaning}
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
            mass: format(state.mass_nominal_solar, locale),
            radius: format(state.static_observer_radius_rs, locale),
          })}
        </p>
      </section>
    </article>
  );
}
