"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  requestEndpoint,
  type RelativityVisualizationsCalculationResponse,
} from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { RelativityVisualizationsMessages } from "../lib/i18n/messages/types";
import {
  DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
  RELATIVITY_LIGHT_CONE,
  RELATIVITY_VISUALIZATIONS_DEFINITION,
  RELATIVITY_VISUALIZATIONS_LIMITS,
  RELATIVITY_VISUALIZATIONS_MODEL_VERSION,
  RELATIVITY_VISUALIZATIONS_SOURCES,
  decodeRelativityVisualizationsState,
  encodeRelativityVisualizationsState,
  relativityVisualizationsRequestEndpoint,
  validateRelativityVisualizationsCalculationResult,
  validateRelativityVisualizationsState,
  type RelativityVisualizationsState,
} from "../lib/simulations/relativity-visualizations";

type RelativityVisualizationsViewProps = Readonly<{
  initialState: RelativityVisualizationsState;
  initialStateInvalid: boolean;
  initialCalculation: RelativityVisualizationsCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: RelativityVisualizationsMessages;
}>;

type RequestState = "idle" | "loading" | "unavailable";

function replaceBrowserState(state: RelativityVisualizationsState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/relativity-visualizations";
  url.searchParams.set("state", encodeRelativityVisualizationsState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: RelativityVisualizationsState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0)
    return { state: DEFAULT_RELATIVITY_VISUALIZATIONS_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeRelativityVisualizationsState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_RELATIVITY_VISUALIZATIONS_STATE, invalid: true }
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

function SourceList({
  messages,
}: Readonly<{ messages: RelativityVisualizationsMessages["model"] }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {RELATIVITY_VISUALIZATIONS_DEFINITION.references.map((sourceId) => {
        const source = RELATIVITY_VISUALIZATIONS_SOURCES.find(
          (candidate) => candidate.id === sourceId,
        );
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

function LightConeFigure({
  messages,
}: Readonly<{ messages: RelativityVisualizationsMessages["lightCone"] }>) {
  return (
    <figure className="space-y-3">
      <div className="max-w-xl rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
        <svg
          aria-label={messages.ariaLabel}
          className="h-auto w-full"
          role="img"
          viewBox="-1.25 -1.25 2.5 2.5"
        >
          <title>{messages.svgTitle}</title>
          <line
            className="text-[var(--muted)]"
            stroke="currentColor"
            strokeWidth="0.025"
            x1="-1.15"
            x2="1.15"
            y1="0"
            y2="0"
          />
          <line
            className="text-[var(--muted)]"
            stroke="currentColor"
            strokeWidth="0.025"
            x1="0"
            x2="0"
            y1="-1.15"
            y2="1.15"
          />
          <g className="text-[var(--accent)]" transform="scale(1,-1)">
            {RELATIVITY_LIGHT_CONE.segments.map((segment) => (
              <line
                key={segment.id}
                stroke="currentColor"
                strokeWidth="0.04"
                x1={segment.x0}
                x2={segment.x1}
                y1={segment.ct0}
                y2={segment.ct1}
              />
            ))}
          </g>
        </svg>
      </div>
      <figcaption className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.caption, {
          coordinateSystem: RELATIVITY_LIGHT_CONE.coordinate_system,
          note: RELATIVITY_LIGHT_CONE.note,
        })}
      </figcaption>
    </figure>
  );
}

export function RelativityVisualizationsView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: RelativityVisualizationsViewProps) {
  const [state, setState] = useState(initialState);
  const [draftBeta, setDraftBeta] = useState(String(initialState.relative_speed_fraction_c));
  const [draftProperTime, setDraftProperTime] = useState(String(initialState.proper_time_s));
  const [draftProperLength, setDraftProperLength] = useState(String(initialState.proper_length_m));
  const [draftSeparation, setDraftSeparation] = useState(
    String(initialState.simultaneous_event_separation_m),
  );
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const adoptDraft = useCallback((next: RelativityVisualizationsState) => {
    setDraftBeta(String(next.relative_speed_fraction_c));
    setDraftProperTime(String(next.proper_time_s));
    setDraftProperLength(String(next.proper_length_m));
    setDraftSeparation(String(next.simultaneous_event_separation_m));
  }, []);

  const recalculate = useCallback(
    async (nextState: RelativityVisualizationsState, commit: boolean) => {
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
          relativityVisualizationsRequestEndpoint(nextState),
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
        const validated = validateRelativityVisualizationsCalculationResult(
          nextState,
          response.data,
        );
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
      draftBeta.trim().length === 0 ||
      draftProperTime.trim().length === 0 ||
      draftProperLength.trim().length === 0 ||
      draftSeparation.trim().length === 0
    ) {
      setMessage(messages.failures.emptyInput);
      return;
    }
    const next = validateRelativityVisualizationsState({
      version: 1,
      model_version: RELATIVITY_VISUALIZATIONS_MODEL_VERSION,
      relative_speed_fraction_c: Number(draftBeta),
      proper_time_s: Number(draftProperTime),
      proper_length_m: Number(draftProperLength),
      simultaneous_event_separation_m: Number(draftSeparation),
    });
    if (next === null) {
      setMessage(messages.failures.outOfDomain);
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    adoptDraft(DEFAULT_RELATIVITY_VISUALIZATIONS_STATE);
    setMessage("");
    void recalculate(DEFAULT_RELATIVITY_VISUALIZATIONS_STATE, true);
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

      <section aria-labelledby="relativity-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="relativity-input-heading">
            {messages.controls.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.controls.description}</p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.relativeSpeed}</span>
              <input
                aria-label={messages.controls.fieldAriaLabels.relativeSpeed}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={RELATIVITY_VISUALIZATIONS_LIMITS.maxRelativeSpeedFractionC}
                min={RELATIVITY_VISUALIZATIONS_LIMITS.minRelativeSpeedFractionC}
                onChange={(event) => {
                  setDraftBeta(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={draftBeta}
              />
            </label>
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.properTime}</span>
              <input
                aria-label={messages.controls.fieldAriaLabels.properTime}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={RELATIVITY_VISUALIZATIONS_LIMITS.maxProperTimeS}
                min={RELATIVITY_VISUALIZATIONS_LIMITS.minProperTimeS}
                onChange={(event) => {
                  setDraftProperTime(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={draftProperTime}
              />
            </label>
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.properLength}</span>
              <input
                aria-label={messages.controls.fieldAriaLabels.properLength}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={RELATIVITY_VISUALIZATIONS_LIMITS.maxProperLengthM}
                min={RELATIVITY_VISUALIZATIONS_LIMITS.minProperLengthM}
                onChange={(event) => {
                  setDraftProperLength(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={draftProperLength}
              />
            </label>
            <label className="space-y-2">
              <span className="block font-semibold">{messages.controls.fields.separation}</span>
              <input
                aria-label={messages.controls.fieldAriaLabels.separation}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={RELATIVITY_VISUALIZATIONS_LIMITS.maxSimultaneousEventSeparationM}
                min={RELATIVITY_VISUALIZATIONS_LIMITS.minSimultaneousEventSeparationM}
                onChange={(event) => {
                  setDraftSeparation(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={draftSeparation}
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
        <section aria-labelledby="relativity-result-heading" className="space-y-8">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="relativity-result-heading">
              {messages.result.title}
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.relativeSpeed}</p>
              <p className="mt-1 font-semibold">
                {format(calculation.relative_speed_m_s, locale)} m/s
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.lorentzFactor}</p>
              <p className="mt-1 font-semibold">{format(calculation.lorentz_factor, locale)}</p>
            </div>
          </div>

          <section aria-labelledby="relativity-time-heading" className="space-y-3">
            <h3 className="text-xl font-semibold" id="relativity-time-heading">
              {messages.result.timeTitle}
            </h3>
            <p className="text-3xl font-semibold">
              {format(calculation.dilated_time_s, locale)} <span className="text-base">s</span>
            </p>
            <p className="max-w-4xl leading-7 text-[var(--muted)]">
              {calculation.time_dilation_note}
            </p>
          </section>

          <section aria-labelledby="relativity-length-heading" className="space-y-3">
            <h3 className="text-xl font-semibold" id="relativity-length-heading">
              {messages.result.lengthTitle}
            </h3>
            <p className="text-3xl font-semibold">
              {format(calculation.contracted_length_m, locale)} <span className="text-base">m</span>
            </p>
            <p className="max-w-4xl leading-7 text-[var(--muted)]">
              {calculation.length_contraction_note}
            </p>
          </section>

          <section aria-labelledby="relativity-simultaneity-heading" className="space-y-3">
            <h3 className="text-xl font-semibold" id="relativity-simultaneity-heading">
              {messages.result.simultaneityTitle}
            </h3>
            <p className="text-3xl font-semibold">
              {format(calculation.simultaneity_offset_s, locale)}{" "}
              <span className="text-base">s</span>
            </p>
            <p className="max-w-4xl leading-7 text-[var(--muted)]">
              {calculation.simultaneity_interpretation}
            </p>
          </section>
        </section>
      )}

      <section aria-labelledby="relativity-light-cone-heading" className="space-y-4">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="relativity-light-cone-heading">
            {messages.lightCone.sectionTitle}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.lightCone.sectionDescription}</p>
        </div>
        <LightConeFigure messages={messages.lightCone} />
      </section>

      <section
        aria-labelledby="relativity-gravity-heading"
        className="max-w-4xl rounded-md border border-[var(--border)] p-5"
      >
        <h2 className="text-xl font-semibold" id="relativity-gravity-heading">
          {messages.gravity.title}
        </h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">{messages.gravity.description}</p>
        <Link
          className="mt-3 inline-block font-semibold text-[var(--link)] underline"
          href="/lab/black-hole-relativity"
        >
          {messages.gravity.link}
        </Link>
      </section>

      <section
        aria-labelledby="relativity-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="relativity-model-heading">
          {messages.model.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {RELATIVITY_VISUALIZATIONS_DEFINITION.summary}
        </p>
        <details open>
          <summary className="cursor-pointer font-semibold">
            {messages.model.assumptionsAndLimitations}
          </summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">{messages.model.assumptions}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {RELATIVITY_VISUALIZATIONS_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">{messages.model.limitations}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {RELATIVITY_VISUALIZATIONS_DEFINITION.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">{messages.model.equations}</summary>
          <ul className="mt-3 list-disc space-y-3 pl-6 text-sm leading-6 text-[var(--muted)]">
            {RELATIVITY_VISUALIZATIONS_DEFINITION.equations.map((equation) => (
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
            beta: format(state.relative_speed_fraction_c, locale),
            properLength: format(state.proper_length_m, locale),
            properTime: format(state.proper_time_s, locale),
            separation: format(state.simultaneous_event_separation_m, locale),
          })}
        </p>
      </section>
    </article>
  );
}
