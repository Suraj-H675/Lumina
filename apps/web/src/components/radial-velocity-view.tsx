"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestEndpoint, type RadialVelocityCalculationResponse } from "@lumina/api-client";

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

type RadialVelocityViewProps = Readonly<{
  initialState: RadialVelocityState;
  initialStateInvalid: boolean;
  initialCalculation: RadialVelocityCalculationResponse | null;
  apiOrigin: string | null;
}>;

type NumericField = Exclude<keyof RadialVelocityState, "version" | "model_version">;
type DraftState = Record<NumericField, string>;
type RequestState = "idle" | "loading" | "unavailable";

const FIELD_COPY: Record<NumericField, Readonly<{ label: string; unit: string; step: string }>> = {
  stellar_mass_kg: { label: "Stellar mass", unit: "kg", step: "any" },
  planet_mass_kg: { label: "Companion mass", unit: "kg", step: "any" },
  orbital_period_s: { label: "Orbital period", unit: "s", step: "any" },
  eccentricity: { label: "Eccentricity", unit: "dimensionless", step: "any" },
  inclination_deg: { label: "Inclination", unit: "deg", step: "any" },
  stellar_argument_of_periastron_deg: {
    label: "Star's argument of periastron",
    unit: "deg",
    step: "any",
  },
  mean_anomaly_at_epoch_deg: { label: "Mean anomaly at epoch", unit: "deg", step: "any" },
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

function format(value: number, digits = 6): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) return value.toExponential(digits);
  return value.toLocaleString("en", { maximumSignificantDigits: digits + 2 });
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
  const range = RADIAL_VELOCITY_INPUT_RANGES[field];
  const id = `rv-${field}`;
  const max =
    field.endsWith("_periastron_deg") || field === "mean_anomaly_at_epoch_deg"
      ? 359.999999
      : range.max;
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
        max={max}
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
      {RADIAL_VELOCITY_DEFINITION.references.map((sourceId) => {
        const source = RADIAL_VELOCITY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function CurveFigure({ result }: Readonly<{ result: RadialVelocityCalculationResponse }>) {
  const visual = buildRadialVelocityVisual(result);
  if (visual === null) return null;
  return (
    <figure className="space-y-3">
      <svg
        aria-describedby="rv-curve-description"
        aria-labelledby="rv-curve-title"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 100 100"
      >
        <title id="rv-curve-title">Returned stellar radial-velocity curve</title>
        <desc id="rv-curve-description">
          Display-normalized plot of {result.curve.length} API-returned stellar reflex-velocity
          samples over one orbital period. The browser does not solve the orbit.
        </desc>
        <line x1="5" x2="95" y1="50" y2="50" stroke="currentColor" opacity="0.14" />
        <path d={visual.path} fill="none" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        Horizontal position uses returned time; vertical position uses returned stellar reflex
        velocity. Returned range: {format(visual.minimum_velocity_m_s)} to{" "}
        {format(visual.maximum_velocity_m_s)} m/s. A flat line is the valid face-on result.
      </figcaption>
    </figure>
  );
}

function ResultSummary({ result }: Readonly<{ result: RadialVelocityCalculationResponse }>) {
  const rows = [
    ["RV semi-amplitude K", `${format(result.semi_amplitude_m_s)} m/s`],
    ["Inclination projection", format(result.inclination_projection)],
    ["Projected mass Mp sin(i)", `${format(result.projected_planet_mass_kg)} kg`],
    ["Spectroscopic mass function", `${format(result.mass_function_kg)} kg`],
    ["Exact edge-on minimum mass", `${format(result.edge_on_minimum_mass_kg)} kg`],
    ["Returned RV samples", String(result.curve.length)],
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

function DataPreview({ result }: Readonly<{ result: RadialVelocityCalculationResponse }>) {
  const step = Math.max(1, Math.ceil(result.curve.length / 20));
  const preview = result.curve.filter((_, index) => index % step === 0);
  const last = result.curve.at(-1)!;
  if (preview.at(-1) !== last) preview.push(last);
  return (
    <details className="rounded-md border border-[var(--border)] p-4">
      <summary className="cursor-pointer font-semibold">RV data preview</summary>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Showing {preview.length} of {result.curve.length} returned samples at a fixed display
        stride. This table does not interpolate or resynthesize radial velocity.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr>
              <th>Time (s)</th>
              <th>Orbital phase</th>
              <th>Stellar RV (m/s)</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((point) => (
              <tr key={point.time_s}>
                <td>{format(point.time_s, 5)}</td>
                <td>{format(point.orbital_phase, 5)}</td>
                <td>{format(point.radial_velocity_m_s, 7)}</td>
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
          radialVelocityRequestEndpoint(nextState),
          {
            signal: controller.signal,
          },
        );
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Radial Velocity model rejected this configuration. Check masses, period, eccentricity, inclination, and phase angles. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateRadialVelocityCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned RV state.");
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
      setMessage(
        "One or more inputs are empty, non-finite, outside the reviewed range, or violate the companion-to-star mass-ratio boundary.",
      );
      return;
    }
    await recalculate(draftState, true);
  };

  const reset = () => {
    setDraft(draftsForState(DEFAULT_RADIAL_VELOCITY_STATE));
    void recalculate(DEFAULT_RADIAL_VELOCITY_STATE, true);
  };

  return (
    <article className="space-y-10">
      <header className="max-w-4xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 7 / Radial Velocity Lab
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Radial Velocity Lab</h1>
        <p className="max-w-3xl text-lg leading-8 text-[var(--muted)]">
          Explore the star&apos;s deterministic Keplerian reflex signal, how inclination suppresses
          the observed velocity, and why radial velocity constrains a minimum mass rather than a
          unique true companion mass.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="rounded-md border border-[var(--border-strong)] p-4" role="alert">
          <h2 className="font-semibold">Shared radial-velocity state rejected</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            The malformed or unsupported shared state was replaced with the reviewed synthetic
            default.
          </p>
        </aside>
      ) : null}

      <section aria-labelledby="rv-controls-heading" className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold" id="rv-controls-heading">
            Model inputs
          </h2>
          <p className="mt-2 max-w-3xl leading-7 text-[var(--muted)]">
            Inputs define a forward model. Real RV observations do not generally reveal inclination
            or true companion mass by themselves.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(FIELD_COPY) as NumericField[]).map((field) => (
            <NumericInput
              disabled={busy}
              field={field}
              key={field}
              onChange={(value) => setDraft((current) => ({ ...current, [field]: value }))}
              value={draft[field]}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-md bg-[var(--accent)] px-5 font-semibold text-[var(--background)] disabled:opacity-60"
            disabled={busy}
            onClick={() => void calculate()}
            type="button"
          >
            {busy ? "Calculating…" : "Calculate radial velocity"}
          </button>
          <button
            className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
            disabled={busy}
            onClick={reset}
            type="button"
          >
            Reset synthetic circular preset
          </button>
        </div>
        {message ? (
          <p aria-live="polite" className="text-sm text-[var(--muted)]">
            {message}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="rv-result-heading" className="space-y-6">
        <h2 className="text-2xl font-semibold" id="rv-result-heading">
          Canonical result
        </h2>
        {calculation === null ? (
          <div className="rounded-md border border-[var(--border)] p-5">
            <h3 className="font-semibold">No canonical result available</h3>
            <p className="mt-2 text-[var(--muted)]">
              Lumina does not fabricate an RV curve in the browser when the canonical service is
              unavailable.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--muted)]">Model {calculation.model_version}</p>
            <ResultSummary result={calculation} />
            <CurveFigure result={calculation} />
            <DataPreview result={calculation} />
          </>
        )}
      </section>

      <section
        aria-labelledby="rv-minimum-mass-heading"
        className="space-y-3 rounded-md border border-[var(--border)] p-5"
      >
        <h2 className="text-2xl font-semibold" id="rv-minimum-mass-heading">
          Mp sin(i) and the exact minimum mass are related, not identical
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          The conventional projected quantity Mp sin(i) is useful shorthand. Lumina also reports the
          exact edge-on minimum companion mass obtained from the spectroscopic mass function, which
          retains the companion mass in the denominator. They converge in the small-companion limit
          but are not treated as the same algebraic quantity in this model.
        </p>
      </section>

      <section aria-labelledby="rv-model-heading" className="space-y-5">
        <h2 className="text-2xl font-semibold" id="rv-model-heading">
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">{RADIAL_VELOCITY_DEFINITION.default_preset}</p>
        <p className="leading-7 text-[var(--muted)]">
          {RADIAL_VELOCITY_DEFINITION.sampling_policy}
        </p>
        <details>
          <summary className="cursor-pointer font-semibold">Equations</summary>
          <dl className="mt-3 space-y-3 text-sm">
            {Object.entries(RADIAL_VELOCITY_DEFINITION.equations).map(([name, equation]) => (
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
                {RADIAL_VELOCITY_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {RADIAL_VELOCITY_DEFINITION.limitations.map((item) => (
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
          Current committed state: stellar mass {format(state.stellar_mass_kg, 4)} kg, companion
          mass {format(state.planet_mass_kg, 4)} kg, period {format(state.orbital_period_s, 4)} s,
          eccentricity {format(state.eccentricity, 4)}, inclination{" "}
          {format(state.inclination_deg, 4)}°.
        </p>
      </section>
    </article>
  );
}
