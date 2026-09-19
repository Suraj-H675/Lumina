"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  requestEndpoint,
  type RelativityVisualizationsCalculationResponse,
} from "@lumina/api-client";

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

function format(value: number, digits = 6): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) return value.toExponential(digits);
  return value.toLocaleString("en", { maximumSignificantDigits: digits + 1 });
}

function SourceList() {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {RELATIVITY_VISUALIZATIONS_DEFINITION.references.map((sourceId) => {
        const source = RELATIVITY_VISUALIZATIONS_SOURCES.find(
          (candidate) => candidate.id === sourceId,
        );
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>Unavailable source record: {sourceId}</>
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

function LightConeFigure() {
  return (
    <figure className="space-y-3">
      <div className="max-w-xl rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
        <svg
          aria-label="Reviewed normalized special-relativity light-cone diagram"
          className="h-auto w-full"
          role="img"
          viewBox="-1.25 -1.25 2.5 2.5"
        >
          <title>Reviewed normalized light-cone diagram</title>
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
        {RELATIVITY_LIGHT_CONE.note} Coordinate convention:{" "}
        {RELATIVITY_LIGHT_CONE.coordinate_system}. The diagonal boundaries are reviewed static
        teaching geometry, not values calculated from the controls.
      </figcaption>
    </figure>
  );
}

export function RelativityVisualizationsView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
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
        setMessage("Calculation service is unavailable; the last valid result remains visible.");
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
          setMessage(
            "The canonical Relativity Visualizations model rejected this state. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateRelativityVisualizationsCalculationResult(
          nextState,
          response.data,
        );
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned relativity state.");
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
        setMessage("Calculation service is unavailable; the last valid result remains visible.");
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [adoptDraft, apiOrigin],
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
      setMessage("One or more controls are empty or outside the reviewed v1 domain.");
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
      setMessage(
        "The requested values are outside the reviewed special-relativity v1 domain. Lumina does not clamp or reinterpret them.",
      );
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
          Phase 7 · One-dimensional inertial special relativity
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Relativity Visualizations
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Compare measurements made by two inertial frames moving at constant relative speed along
          one shared axis. This model teaches frame-dependent time, length, and simultaneity; it
          does not model acceleration or gravity.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared relativity state rejected.</strong> The reviewed synthetic inertial-frame
          preset is shown instead.
        </aside>
      ) : null}

      <section aria-labelledby="relativity-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="relativity-input-heading">
            Inertial-frame teaching controls
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Frame S&apos; moves in the +x direction relative to S. Proper time belongs to a clock at
            rest in its defining frame; proper length belongs to an object at rest in its defining
            frame. The event pair is simultaneous in S before it is compared with S&apos;.
          </p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="block font-semibold">Relative speed β = v/c</span>
              <input
                aria-label="Relative speed as fraction of c"
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
              <span className="block font-semibold">Proper time (s)</span>
              <input
                aria-label="Proper time in seconds"
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
              <span className="block font-semibold">Proper length (m)</span>
              <input
                aria-label="Proper length in meters"
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
              <span className="block font-semibold">Simultaneous-event +x separation (m)</span>
              <input
                aria-label="Simultaneous event separation in meters"
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
              {requestState === "loading" ? "Calculating…" : "Calculate special relativity"}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              Reset synthetic preset
            </button>
          </div>
        </form>
        {message ? (
          <p role={requestState === "unavailable" ? "alert" : "status"}>{message}</p>
        ) : null}
      </section>

      {calculation === null ? (
        <section className="border border-[var(--border)] p-5" role="alert">
          <h2 className="text-2xl font-semibold">No canonical result available</h2>
          <p className="mt-2 text-[var(--muted)]">
            No browser-generated Lorentz factor, time-dilation, length-contraction, or simultaneity
            value is substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="relativity-result-heading" className="space-y-8">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="relativity-result-heading">
              Canonical inertial-frame result
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. All user-dependent physical values below were
              returned by the canonical Python model.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Relative speed</p>
              <p className="mt-1 font-semibold">{format(calculation.relative_speed_m_s)} m/s</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Lorentz factor γ</p>
              <p className="mt-1 font-semibold">{format(calculation.lorentz_factor)}</p>
            </div>
          </div>

          <section aria-labelledby="relativity-time-heading" className="space-y-3">
            <h3 className="text-xl font-semibold" id="relativity-time-heading">
              1. Time dilation
            </h3>
            <p className="text-3xl font-semibold">
              {format(calculation.dilated_time_s)} <span className="text-base">s</span>
            </p>
            <p className="max-w-4xl leading-7 text-[var(--muted)]">
              {calculation.time_dilation_note}
            </p>
          </section>

          <section aria-labelledby="relativity-length-heading" className="space-y-3">
            <h3 className="text-xl font-semibold" id="relativity-length-heading">
              2. Length contraction
            </h3>
            <p className="text-3xl font-semibold">
              {format(calculation.contracted_length_m)} <span className="text-base">m</span>
            </p>
            <p className="max-w-4xl leading-7 text-[var(--muted)]">
              {calculation.length_contraction_note}
            </p>
          </section>

          <section aria-labelledby="relativity-simultaneity-heading" className="space-y-3">
            <h3 className="text-xl font-semibold" id="relativity-simultaneity-heading">
              3. Relativity of simultaneity
            </h3>
            <p className="text-3xl font-semibold">
              {format(calculation.simultaneity_offset_s)} <span className="text-base">s</span>
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
            4. Light cones and causal boundaries
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            The reviewed normalized diagram shows the lightlike boundaries of one event. It is a
            conceptual causal-structure lesson, not a user-input calculation.
          </p>
        </div>
        <LightConeFigure />
      </section>

      <section
        aria-labelledby="relativity-gravity-heading"
        className="max-w-4xl rounded-md border border-[var(--border)] p-5"
      >
        <h2 className="text-xl font-semibold" id="relativity-gravity-heading">
          Gravitational redshift uses a different model
        </h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">
          This lab is special relativity only. For a static clock outside an ideal Schwarzschild
          black hole, use the already-certified gravitational-redshift model.
        </p>
        <Link
          className="mt-3 inline-block font-semibold text-[var(--link)] underline"
          href="/lab/black-hole-relativity"
        >
          Open Black-Hole / Relativity Lab →
        </Link>
      </section>

      <section
        aria-labelledby="relativity-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="relativity-model-heading">
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {RELATIVITY_VISUALIZATIONS_DEFINITION.summary}
        </p>
        <details open>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {RELATIVITY_VISUALIZATIONS_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {RELATIVITY_VISUALIZATIONS_DEFINITION.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">Reviewed model equations</summary>
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
          <h3 className="font-semibold">Reviewed sources</h3>
          <div className="mt-2">
            <SourceList />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Current committed browser state: β={format(state.relative_speed_fraction_c)}; proper time{" "}
          {format(state.proper_time_s)} s; proper length {format(state.proper_length_m)} m; S event
          separation {format(state.simultaneous_event_separation_m)} m.
        </p>
      </section>
    </article>
  );
}
