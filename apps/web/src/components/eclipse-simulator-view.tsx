"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type EclipseSimulatorCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { EclipseSimulatorMessages } from "../lib/i18n/messages/types";
import {
  DEFAULT_ECLIPSE_SIMULATOR_STATE,
  ECLIPSE_SIMULATOR_DEFINITION,
  ECLIPSE_SIMULATOR_LIMITS,
  ECLIPSE_SIMULATOR_MODEL_VERSION,
  ECLIPSE_SIMULATOR_SOURCES,
  decodeEclipseSimulatorState,
  eclipseSimulatorRequestEndpoint,
  encodeEclipseSimulatorState,
  validateEclipseSimulatorCalculationResult,
  validateEclipseSimulatorState,
  type EclipseSimulatorState,
} from "../lib/simulations/eclipse-simulator";

type EclipseSimulatorViewProps = Readonly<{
  initialState: EclipseSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: EclipseSimulatorCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: EclipseSimulatorMessages;
}>;

type RequestState = "idle" | "loading" | "unavailable";

function replaceBrowserState(state: EclipseSimulatorState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/eclipse-simulator";
  url.searchParams.set("state", encodeEclipseSimulatorState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: EclipseSimulatorState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_ECLIPSE_SIMULATOR_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeEclipseSimulatorState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_ECLIPSE_SIMULATOR_STATE, invalid: true }
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

function utcInputValue(value: string): string {
  return value.slice(0, 16);
}

function SafetyNotice({ messages }: Readonly<{ messages: EclipseSimulatorMessages["safety"] }>) {
  const source = ECLIPSE_SIMULATOR_SOURCES.find((item) => item.id === "nasa-eclipse-safety");
  return (
    <section
      aria-labelledby="eclipse-safety-heading"
      className="space-y-2 rounded-md border-2 border-[var(--border-strong)] p-5"
      role="alert"
    >
      <h2 className="text-xl font-semibold" id="eclipse-safety-heading">
        {messages.title}
      </h2>
      <p className="leading-7">
        Simulator output never determines whether direct Solar viewing is safe. Partial and annular
        phases require proper Solar viewing protection. Cameras, binoculars, and telescopes require
        appropriate Solar filters on the Sun-facing optics.
      </p>
      {source ? (
        <a
          className="font-semibold text-[var(--link)] underline"
          href={source.url}
          rel="noreferrer"
        >
          {messages.link}
        </a>
      ) : null}
    </section>
  );
}

function DiskFigure({
  messages,
  result,
}: Readonly<{
  messages: EclipseSimulatorMessages["figure"];
  result: EclipseSimulatorCalculationResponse;
}>) {
  // Presentation-only normalization of already-returned geometry. These
  // visual clamps do not alter the canonical phase or obscuration result.
  const sunRadius = 55;
  const moonRadius = Math.max(
    42,
    Math.min(
      68,
      sunRadius * (result.instant.moon_angular_radius_deg / result.instant.sun_angular_radius_deg),
    ),
  );
  const centerOffset = Math.min(
    120,
    sunRadius * (result.instant.center_separation_deg / result.instant.sun_angular_radius_deg),
  );
  return (
    <figure className="space-y-3">
      <svg
        aria-hidden="true"
        className="h-auto w-full max-w-xl rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        viewBox="0 0 360 200"
      >
        <circle cx="170" cy="100" fill="none" r={sunRadius} stroke="currentColor" strokeWidth="5" />
        <circle
          cx={170 + centerOffset}
          cy="100"
          fill="var(--surface)"
          r={moonRadius}
          stroke="currentColor"
          strokeWidth="4"
        />
      </svg>
      <figcaption className="max-w-xl text-sm leading-6 text-[var(--muted)]">
        {messages.caption}
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
  messages: EclipseSimulatorMessages;
  result: EclipseSimulatorCalculationResponse;
}>) {
  const rows = [
    [messages.result.labels.phase, result.instant.phase],
    [messages.result.labels.shadow, result.instant.shadow_region],
    [messages.result.labels.sunRadius, `${format(result.instant.sun_angular_radius_deg, locale)}°`],
    [
      messages.result.labels.moonRadius,
      `${format(result.instant.moon_angular_radius_deg, locale)}°`,
    ],
    [
      messages.result.labels.centerSeparation,
      `${format(result.instant.center_separation_deg, locale)}°`,
    ],
    [
      messages.result.labels.obscuration,
      `${format(result.instant.obscuration_fraction * 100, locale)}%`,
    ],
    [messages.result.labels.sunAltitude, `${format(result.instant.sun_altitude_deg, locale)}°`],
    [
      messages.result.labels.horizon,
      result.instant.sun_above_geometric_horizon ? messages.horizon.above : messages.horizon.below,
    ],
  ] as const;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map(([label, value]) => (
        <div
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4"
          key={label}
        >
          <dt className="text-sm text-[var(--muted)]">{label}</dt>
          <dd className="mt-1 break-words font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EventTimeline({
  messages,
  result,
}: Readonly<{
  messages: EclipseSimulatorMessages["event"];
  result: EclipseSimulatorCalculationResponse;
}>) {
  const event = result.local_event;
  if (event === null) {
    return <p className="rounded-md border border-[var(--border)] p-4">{messages.noEvent}</p>;
  }
  const rows = [
    [messages.partialBegin, event.partial_begin_utc],
    ...(event.central_begin_utc === null
      ? []
      : [[messages.centralBegin, event.central_begin_utc] as const]),
    [messages.maximum, event.maximum_utc],
    ...(event.central_end_utc === null
      ? []
      : [[messages.centralEnd, event.central_end_utc] as const]),
    [messages.partialEnd, event.partial_end_utc],
  ];
  return (
    <section aria-labelledby="eclipse-timeline-heading" className="space-y-4">
      <h3 className="text-xl font-semibold" id="eclipse-timeline-heading">
        {formatMessageTemplate(messages.title, { classification: event.classification })}
      </h3>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {rows.map(([label, value]) => (
          <li className="rounded-md border border-[var(--border)] p-4" key={label}>
            <strong className="block">{label}</strong>
            <span className="mt-1 block font-mono text-sm">{value}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm leading-6 text-[var(--muted)]">{result.timing_note}</p>
    </section>
  );
}

function SourceList({ messages }: Readonly<{ messages: EclipseSimulatorMessages["model"] }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {ECLIPSE_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = ECLIPSE_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
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

export function EclipseSimulatorView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: EclipseSimulatorViewProps) {
  const [state, setState] = useState(initialState);
  const [draftUtc, setDraftUtc] = useState(utcInputValue(initialState.at_utc));
  const [draftLatitude, setDraftLatitude] = useState(String(initialState.latitude_deg));
  const [draftLongitude, setDraftLongitude] = useState(String(initialState.longitude_deg));
  const [draftElevation, setDraftElevation] = useState(String(initialState.elevation_m));
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const adoptDraft = useCallback((next: EclipseSimulatorState) => {
    setDraftUtc(utcInputValue(next.at_utc));
    setDraftLatitude(String(next.latitude_deg));
    setDraftLongitude(String(next.longitude_deg));
    setDraftElevation(String(next.elevation_m));
  }, []);

  const recalculate = useCallback(
    async (nextState: EclipseSimulatorState, commit: boolean) => {
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
          eclipseSimulatorRequestEndpoint(nextState),
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
        const validated = validateEclipseSimulatorCalculationResult(nextState, response.data);
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
    const atUtc = draftUtc.length === 16 ? `${draftUtc}:00Z` : "";
    const next = validateEclipseSimulatorState({
      version: 1,
      model_version: ECLIPSE_SIMULATOR_MODEL_VERSION,
      at_utc: atUtc,
      latitude_deg: Number(draftLatitude),
      longitude_deg: Number(draftLongitude),
      elevation_m: Number(draftElevation),
    });
    if (
      next === null ||
      draftLatitude.trim().length === 0 ||
      draftLongitude.trim().length === 0 ||
      draftElevation.trim().length === 0
    ) {
      setMessage(messages.failures.invalidInput);
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    adoptDraft(DEFAULT_ECLIPSE_SIMULATOR_STATE);
    setMessage("");
    void recalculate(DEFAULT_ECLIPSE_SIMULATOR_STATE, true);
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

      <SafetyNotice messages={messages.safety} />

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          {messages.invalidState.inline}
        </aside>
      ) : null}

      <section aria-labelledby="eclipse-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="eclipse-input-heading">
            {messages.controls.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.controls.description, {
              minimumUtc: ECLIPSE_SIMULATOR_LIMITS.minUtc,
              maximumUtc: ECLIPSE_SIMULATOR_LIMITS.maxUtc,
            })}
          </p>
        </div>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2">
            <span className="block font-semibold">{messages.controls.fields.utc}</span>
            <input
              aria-label={messages.controls.fieldAriaLabels.utc}
              className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3"
              disabled={requestState === "loading"}
              onChange={(event) => {
                setDraftUtc(event.target.value);
                setMessage("");
              }}
              type="datetime-local"
              value={draftUtc}
            />
          </label>
          {[
            {
              ariaLabel: messages.controls.fieldAriaLabels.latitude,
              label: messages.controls.fields.latitude,
              max: ECLIPSE_SIMULATOR_LIMITS.maxLatitudeDeg,
              min: ECLIPSE_SIMULATOR_LIMITS.minLatitudeDeg,
              setter: setDraftLatitude,
              unit: "deg",
              value: draftLatitude,
            },
            {
              ariaLabel: messages.controls.fieldAriaLabels.longitude,
              label: messages.controls.fields.longitude,
              max: ECLIPSE_SIMULATOR_LIMITS.maxLongitudeDeg,
              min: ECLIPSE_SIMULATOR_LIMITS.minLongitudeDeg,
              setter: setDraftLongitude,
              unit: "deg",
              value: draftLongitude,
            },
            {
              ariaLabel: messages.controls.fieldAriaLabels.elevation,
              label: messages.controls.fields.elevation,
              max: ECLIPSE_SIMULATOR_LIMITS.maxElevationM,
              min: ECLIPSE_SIMULATOR_LIMITS.minElevationM,
              setter: setDraftElevation,
              unit: "m",
              value: draftElevation,
            },
          ].map(({ ariaLabel, label, max, min, setter, unit, value }) => (
            <label className="space-y-2" key={label}>
              <span className="flex justify-between gap-2 font-semibold">
                <span>{label}</span>
                <span className="text-xs font-normal text-[var(--muted)]">{unit}</span>
              </span>
              <input
                aria-label={ariaLabel}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={max}
                min={min}
                onChange={(event) => {
                  setter(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={value}
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-3 md:col-span-2">
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
        <section aria-labelledby="eclipse-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="eclipse-result-heading">
              {messages.result.title}
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>
          <ResultSummary locale={locale} messages={messages} result={calculation} />
          <DiskFigure messages={messages.figure} result={calculation} />
          <EventTimeline messages={messages.event} result={calculation} />
          <p className="text-sm leading-6 text-[var(--muted)]">{calculation.ephemeris_note}</p>
        </section>
      )}

      <section
        aria-labelledby="eclipse-why-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="eclipse-why-heading">
          {messages.model.monthlyQuestion}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          NASA explains that the Moon&apos;s orbit is inclined by roughly five degrees to the
          ecliptic. At most new moons the Moon passes above or below the Sun in our sky, so its
          shadow misses Earth.
        </p>
        <details open>
          <summary className="cursor-pointer font-semibold">
            {messages.model.assumptionsAndLimitations}
          </summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">{messages.model.assumptions}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {ECLIPSE_SIMULATOR_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">{messages.model.limitations}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {ECLIPSE_SIMULATOR_DEFINITION.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <div>
          <h3 className="font-semibold">{messages.model.reviewedSources}</h3>
          <div className="mt-2">
            <SourceList messages={messages.model} />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.model.currentState, {
            utc: state.at_utc,
            latitude: format(state.latitude_deg, locale),
            longitude: format(state.longitude_deg, locale),
          })}
        </p>
      </section>
    </article>
  );
}
