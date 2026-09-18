"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type EclipseSimulatorCalculationResponse } from "@lumina/api-client";

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

function format(value: number, digits = 6): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) return value.toExponential(digits);
  return value.toLocaleString("en", { maximumSignificantDigits: digits + 1 });
}

function utcInputValue(value: string): string {
  return value.slice(0, 16);
}

function SafetyNotice() {
  const source = ECLIPSE_SIMULATOR_SOURCES.find((item) => item.id === "nasa-eclipse-safety");
  return (
    <section
      aria-labelledby="eclipse-safety-heading"
      className="space-y-2 rounded-md border-2 border-[var(--border-strong)] p-5"
      role="alert"
    >
      <h2 className="text-xl font-semibold" id="eclipse-safety-heading">
        Solar-viewing safety
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
          Read NASA&apos;s eclipse viewing safety guidance.
        </a>
      ) : null}
    </section>
  );
}

function DiskFigure({ result }: Readonly<{ result: EclipseSimulatorCalculationResponse }>) {
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
        Presentation-only apparent-disk sketch normalized from the returned angular radii and center
        separation. The canonical classification and obscuration are computed by Python, not this
        SVG.
      </figcaption>
    </figure>
  );
}

function ResultSummary({ result }: Readonly<{ result: EclipseSimulatorCalculationResponse }>) {
  const rows = [
    ["Local phase", result.instant.phase],
    ["Shadow interpretation", result.instant.shadow_region],
    ["Sun angular radius", `${format(result.instant.sun_angular_radius_deg)}°`],
    ["Moon angular radius", `${format(result.instant.moon_angular_radius_deg)}°`],
    ["Center separation", `${format(result.instant.center_separation_deg)}°`],
    ["Geometric obscuration", `${format(result.instant.obscuration_fraction * 100)}%`],
    ["Geometric Sun altitude", `${format(result.instant.sun_altitude_deg)}°`],
    [
      "Geometric horizon",
      result.instant.sun_above_geometric_horizon ? "Sun above horizon" : "Sun below horizon",
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

function EventTimeline({ result }: Readonly<{ result: EclipseSimulatorCalculationResponse }>) {
  const event = result.local_event;
  if (event === null) {
    return (
      <p className="rounded-md border border-[var(--border)] p-4">
        No local eclipse event is returned because the requested instant is outside a local
        geometric eclipse.
      </p>
    );
  }
  const rows = [
    ["Partial begins", event.partial_begin_utc],
    ...(event.central_begin_utc === null
      ? []
      : [["Central phase begins", event.central_begin_utc] as const]),
    ["Maximum alignment", event.maximum_utc],
    ...(event.central_end_utc === null
      ? []
      : [["Central phase ends", event.central_end_utc] as const]),
    ["Partial ends", event.partial_end_utc],
  ];
  return (
    <section aria-labelledby="eclipse-timeline-heading" className="space-y-4">
      <h3 className="text-xl font-semibold" id="eclipse-timeline-heading">
        Approximate local {event.classification} event
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

function SourceList() {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {ECLIPSE_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = ECLIPSE_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
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

export function EclipseSimulatorView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
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
          eclipseSimulatorRequestEndpoint(nextState),
          {
            signal: controller.signal,
          },
        );
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Eclipse Simulator rejected this state. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateEclipseSimulatorCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned eclipse state.");
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
      setMessage(
        "UTC time or observer location is empty, non-finite, or outside the reviewed v1 range.",
      );
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
          Phase 7 · offline topocentric solar geometry
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Eclipse Simulator</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Explore the apparent Sun–Moon geometry for one UTC instant and observer. V1 is an
          educational offline solar-eclipse model, not a precision eclipse-navigation service.
        </p>
      </header>

      <SafetyNotice />

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared eclipse state rejected.</strong> The reviewed Dallas 2024 reference preset
          is shown instead.
        </aside>
      ) : null}

      <section aria-labelledby="eclipse-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="eclipse-input-heading">
            UTC instant and observer
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Offline v1 supports {ECLIPSE_SIMULATOR_LIMITS.minUtc} through{" "}
            {ECLIPSE_SIMULATOR_LIMITS.maxUtc}. The date bound prevents silent Earth-orientation
            extrapolation.
          </p>
        </div>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2">
            <span className="block font-semibold">UTC date and time</span>
            <input
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
            ["Latitude", "deg", draftLatitude, setDraftLatitude, -90, 90],
            ["Longitude", "deg", draftLongitude, setDraftLongitude, -180, 180],
            ["Elevation", "m", draftElevation, setDraftElevation, -500, 9000],
          ].map(([label, unit, value, setter, min, max]) => (
            <label className="space-y-2" key={String(label)}>
              <span className="flex justify-between gap-2 font-semibold">
                <span>{String(label)}</span>
                <span className="text-xs font-normal text-[var(--muted)]">{String(unit)}</span>
              </span>
              <input
                aria-label={`${String(label)} ${String(unit)}`}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={Number(max)}
                min={Number(min)}
                onChange={(event) => {
                  (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={String(value)}
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              className="min-h-11 rounded-md bg-[var(--accent)] px-5 font-semibold text-[var(--background)]"
              disabled={requestState === "loading"}
              type="submit"
            >
              {requestState === "loading" ? "Calculating…" : "Calculate eclipse geometry"}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              Reset Dallas 2024 reference
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
            No browser-generated eclipse geometry or timing is substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="eclipse-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="eclipse-result-heading">
              Topocentric apparent geometry
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. Geometric obscuration is apparent Solar-disk area
              overlap; it is not irradiance, perceived brightness, or a safety state.
            </p>
          </div>
          <ResultSummary result={calculation} />
          <DiskFigure result={calculation} />
          <EventTimeline result={calculation} />
          <p className="text-sm leading-6 text-[var(--muted)]">{calculation.ephemeris_note}</p>
        </section>
      )}

      <section
        aria-labelledby="eclipse-why-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="eclipse-why-heading">
          Why is there not a solar eclipse every month?
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          NASA explains that the Moon&apos;s orbit is inclined by roughly five degrees to the
          ecliptic. At most new moons the Moon passes above or below the Sun in our sky, so its
          shadow misses Earth.
        </p>
        <details open>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {ECLIPSE_SIMULATOR_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {ECLIPSE_SIMULATOR_DEFINITION.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <div>
          <h3 className="font-semibold">Reviewed sources</h3>
          <div className="mt-2">
            <SourceList />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Current committed browser state: {state.at_utc}; latitude {format(state.latitude_deg)}°,
          longitude {format(state.longitude_deg)}°.
        </p>
      </section>
    </article>
  );
}
