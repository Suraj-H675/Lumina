"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestEndpoint, type TransitMethodCalculationResponse } from "@lumina/api-client";

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

type TransitMethodViewProps = Readonly<{
  initialState: TransitMethodState;
  initialStateInvalid: boolean;
  initialCalculation: TransitMethodCalculationResponse | null;
  apiOrigin: string | null;
}>;

type NumericField = Exclude<keyof TransitMethodState, "version" | "model_version">;
type DraftState = Record<NumericField, string>;
type RequestState = "idle" | "loading" | "unavailable";

const FIELD_COPY: Record<NumericField, Readonly<{ label: string; unit: string; step: string }>> = {
  stellar_radius_m: { label: "Stellar radius", unit: "m", step: "any" },
  planet_radius_m: { label: "Planet radius", unit: "m", step: "any" },
  semi_major_axis_m: { label: "Semi-major axis", unit: "m", step: "any" },
  orbital_period_s: { label: "Orbital period", unit: "s", step: "any" },
  inclination_deg: { label: "Inclination", unit: "deg", step: "any" },
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

function format(value: number | null, digits = 6): string {
  if (value === null) return "Not applicable";
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) return value.toExponential(digits);
  return value.toLocaleString("en", { maximumSignificantDigits: digits + 2 });
}

function percent(value: number): string {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumSignificantDigits: 5,
  }).format(value);
}

function classificationLabel(value: TransitMethodCalculationResponse["classification"]): string {
  const labels: Record<TransitMethodCalculationResponse["classification"], string> = {
    full: "Full transit",
    grazing: "Grazing transit",
    no_transit: "No transit",
  };
  return labels[value];
}

function NumericInput({
  field,
  value,
  onChange,
  disabled,
}: Readonly<{
  field: NumericField;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}>) {
  const copy = FIELD_COPY[field];
  const range = TRANSIT_INPUT_RANGES[field];
  const id = `transit-${field}`;
  return (
    <label className="space-y-2" htmlFor={id}>
      <span className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
        <span>{copy.label}</span>
        <span className="text-xs font-normal text-[var(--muted)]">{copy.unit}</span>
      </span>
      <input
        className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-sm"
        disabled={disabled}
        id={id}
        inputMode="decimal"
        max={range.max}
        min={range.min}
        onChange={(event) => onChange(event.target.value)}
        step={copy.step}
        type="number"
        value={value}
      />
    </label>
  );
}

function SourceList() {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {TRANSIT_DEFINITION.references.map((sourceId) => {
        const source = TRANSIT_SOURCES.find((candidate) => candidate.id === sourceId);
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

function LightCurveFigure({ result }: Readonly<{ result: TransitMethodCalculationResponse }>) {
  const visual = buildTransitLightCurveVisual(result);
  if (visual === null) return null;
  return (
    <figure className="space-y-3">
      <svg
        aria-describedby="transit-light-curve-description"
        aria-labelledby="transit-light-curve-title"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 100 100"
      >
        <title id="transit-light-curve-title">Returned relative-flux light curve</title>
        <desc id="transit-light-curve-description">
          Display-normalized plot of {result.light_curve.length} API-returned relative-flux samples
          around mid-transit. The browser does not recalculate transit flux.
        </desc>
        <line x1="5" x2="95" y1="50" y2="50" stroke="currentColor" opacity="0.1" />
        <line x1="50" x2="50" y1="8" y2="92" stroke="currentColor" opacity="0.12" />
        <path d={visual.path} fill="none" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        Horizontal position uses returned time from mid-transit; vertical position uses returned
        relative flux. Returned flux range: {format(visual.minimum_flux, 6)} to{" "}
        {format(visual.maximum_flux, 6)}. A flat line is a valid no-transit result.
      </figcaption>
    </figure>
  );
}

function ResultSummary({ result }: Readonly<{ result: TransitMethodCalculationResponse }>) {
  const rows = [
    ["Alignment", classificationLabel(result.classification)],
    ["Radius ratio Rp/R⋆", format(result.radius_ratio)],
    ["Scaled semi-major axis a/R⋆", format(result.scaled_semi_major_axis)],
    ["Impact parameter", format(result.impact_parameter)],
    ["Central depth approximation", percent(result.central_depth_approximation_fraction)],
    ["Maximum uniform-source depth", percent(result.maximum_depth_fraction)],
    ["Maximum depth", `${format(result.maximum_depth_ppm)} ppm`],
    [
      "First-to-fourth contact duration",
      result.total_duration_s === null ? "No transit" : `${format(result.total_duration_s)} s`,
    ],
    [
      "Second-to-third contact duration",
      result.full_duration_s === null ? "Not applicable" : `${format(result.full_duration_s)} s`,
    ],
    ["Light-curve samples", String(result.light_curve.length)],
  ] as const;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

function LightCurveDataPreview({ result }: Readonly<{ result: TransitMethodCalculationResponse }>) {
  const step = Math.max(1, Math.ceil(result.light_curve.length / 20));
  const preview = result.light_curve.filter((_, index) => index % step === 0);
  const last = result.light_curve.at(-1)!;
  if (preview.at(-1) !== last) preview.push(last);
  return (
    <details className="rounded-md border border-[var(--border)] p-4">
      <summary className="cursor-pointer font-semibold">Light-curve data preview</summary>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Showing {preview.length} of {result.light_curve.length} returned samples at a fixed display
        stride, always including the final sample. This table does not interpolate or resynthesize
        flux values.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead>
            <tr>
              <th>Time from mid-transit (s)</th>
              <th>Orbital phase</th>
              <th>Projected separation (R⋆)</th>
              <th>Relative flux</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((point) => (
              <tr key={point.time_from_mid_transit_s}>
                <td>{format(point.time_from_mid_transit_s, 5)}</td>
                <td>{format(point.orbital_phase, 5)}</td>
                <td>{format(point.projected_separation_stellar_radii, 5)}</td>
                <td>{format(point.relative_flux, 7)}</td>
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
        const response = await requestEndpoint(apiOrigin, transitMethodRequestEndpoint(nextState), {
          signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Transit Method model rejected this configuration. Check the planet/star sizes, orbital radius, period, and inclination. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateTransitMethodCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned transit state.");
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
        setMessage("Calculation service is unavailable; the last valid result remains visible.");
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [apiOrigin],
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
      setMessage(
        "One or more inputs are empty, non-finite, or outside the published coarse field range.",
      );
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
    <article className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 7 · deterministic simulation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Transit Method Lab</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Explore how circular orbital alignment and relative sizes shape an idealized exoplanet
          transit. Lumina&apos;s canonical Python astronomy domain returns the geometry, contact
          times, and uniform-source light curve; the browser only validates and displays that
          result.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared state rejected.</strong> The reviewed synthetic default is shown instead.
        </aside>
      ) : null}

      <section aria-labelledby="transit-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="transit-input-heading">
            Circular-orbit geometry inputs
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Browser checks cover only finite field ranges. Relational constraints—such as the planet
            being smaller than the star and the orbit clearing both disks—are enforced by the
            canonical API and are never silently clamped.
          </p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(FIELD_COPY) as NumericField[]).map((field) => (
              <NumericInput
                disabled={requestState === "loading"}
                field={field}
                key={field}
                onChange={(value) => {
                  setDraft((current) => ({ ...current, [field]: value }));
                  setMessage("");
                }}
                value={draft[field]}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-md bg-[var(--accent)] px-5 font-semibold text-[var(--background)]"
              disabled={requestState === "loading"}
              type="submit"
            >
              {requestState === "loading" ? "Calculating…" : "Calculate transit"}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              Reset synthetic central-transit preset
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
            No browser-generated fallback transit or light curve is substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="transit-result-heading" className="space-y-6">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="transit-result-heading">
              Canonical transit result
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. A no-transit classification is a valid geometric
              outcome. V1 intentionally provides no detectability score because real detectability
              depends on stellar variability, instrument noise, cadence, and analysis choices that
              this idealized model does not simulate.
            </p>
          </div>
          <ResultSummary result={calculation} />
          {currentVisual === null ? null : <LightCurveFigure result={calculation} />}
          <LightCurveDataPreview result={calculation} />
        </section>
      )}

      <section
        aria-labelledby="transit-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="transit-model-heading">
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">{TRANSIT_DEFINITION.default_preset}</p>
        <p className="leading-7 text-[var(--muted)]">{TRANSIT_DEFINITION.sampling_policy}</p>
        <details>
          <summary className="cursor-pointer font-semibold">Equations</summary>
          <dl className="mt-3 space-y-3 text-sm">
            {Object.entries(TRANSIT_DEFINITION.equations).map(([name, equation]) => (
              <div key={name}>
                <dt className="font-semibold">{name.replaceAll("_", " ")}</dt>
                <dd className="font-mono text-[var(--muted)]">{equation}</dd>
              </div>
            ))}
          </dl>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {TRANSIT_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {TRANSIT_DEFINITION.limitations.map((item) => (
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
          Current committed state: stellar radius {format(state.stellar_radius_m, 4)} m, planet
          radius {format(state.planet_radius_m, 4)} m, period {format(state.orbital_period_s, 4)} s,
          inclination {format(state.inclination_deg, 4)}°.
        </p>
      </section>
    </article>
  );
}
