"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestEndpoint, type OrbitSandboxCalculationResponse } from "@lumina/api-client";

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

type OrbitSandboxViewProps = Readonly<{
  initialState: OrbitSandboxState;
  initialStateInvalid: boolean;
  initialCalculation: OrbitSandboxCalculationResponse | null;
  apiOrigin: string | null;
}>;

type NumericField = Exclude<keyof OrbitSandboxState, "version" | "model_version">;
type DraftState = Record<NumericField, string>;
type RequestState = "idle" | "loading" | "unavailable";

const FIELD_COPY: Record<NumericField, Readonly<{ label: string; unit: string; step: string }>> = {
  central_mass_kg: { label: "Central mass", unit: "kg", step: "any" },
  central_radius_m: { label: "Central collision radius", unit: "m", step: "any" },
  orbiting_body_mass_kg: { label: "Secondary mass", unit: "kg", step: "any" },
  position_x_m: { label: "Initial x position", unit: "m", step: "any" },
  position_y_m: { label: "Initial y position", unit: "m", step: "any" },
  velocity_x_m_s: { label: "Initial x velocity", unit: "m/s", step: "any" },
  velocity_y_m_s: { label: "Initial y velocity", unit: "m/s", step: "any" },
  duration_s: { label: "Simulation duration", unit: "s", step: "any" },
  time_step_s: { label: "Integration time step", unit: "s", step: "any" },
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

function format(value: number | null, digits = 6): string {
  if (value === null) return "Not applicable";
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) return value.toExponential(digits);
  return value.toLocaleString("en", { maximumSignificantDigits: digits + 2 });
}

function classificationLabel(value: OrbitSandboxCalculationResponse["classification"]): string {
  const labels: Record<OrbitSandboxCalculationResponse["classification"], string> = {
    bound: "Bound",
    parabolic_near: "Near-parabolic",
    escape: "Escape",
    collision: "Collision",
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
  const range = ORBIT_INPUT_RANGES[field];
  const id = `orbit-${field}`;
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
      {ORBIT_DEFINITION.references.map((sourceId) => {
        const source = ORBIT_SOURCES.find((candidate) => candidate.id === sourceId);
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

function TrajectoryFigure({ result }: Readonly<{ result: OrbitSandboxCalculationResponse }>) {
  const visual = buildOrbitVisualTransform(result);
  if (visual === null) return null;
  const finalPoint = visual.points.at(-1)!;
  return (
    <figure className="space-y-3">
      <svg
        aria-describedby="orbit-trajectory-description"
        aria-labelledby="orbit-trajectory-title"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 100 100"
      >
        <title id="orbit-trajectory-title">Returned relative trajectory</title>
        <desc id="orbit-trajectory-description">
          A display-normalized plot of {result.trajectory.length} API-returned trajectory samples.
          The central body marker is enlarged for legibility and is not to physical scale.
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
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        Coordinates are uniformly normalized from the returned relative positions. Filled point =
        start; outlined point = final returned sample. Central-body marker is deliberately enlarged
        and not to physical scale. Plot half-span: {format(visual.scale_m, 3)} m.
      </figcaption>
    </figure>
  );
}

function ResultSummary({ result }: Readonly<{ result: OrbitSandboxCalculationResponse }>) {
  const rows = [
    ["Classification", classificationLabel(result.classification)],
    ["Eccentricity", format(result.eccentricity)],
    ["Specific orbital energy", `${format(result.specific_orbital_energy_j_per_kg)} J/kg`],
    ["Specific angular momentum", `${format(result.specific_angular_momentum_m2_per_s)} m²/s`],
    [
      "Semi-major axis",
      result.semi_major_axis_m === null
        ? "Not applicable"
        : `${format(result.semi_major_axis_m)} m`,
    ],
    ["Period", result.period_s === null ? "Not applicable" : `${format(result.period_s)} s`],
    ["Periapsis", `${format(result.periapsis_m)} m`],
    ["Apoapsis", result.apoapsis_m === null ? "Not applicable" : `${format(result.apoapsis_m)} m`],
    [
      "Collision time",
      result.collision_time_s === null
        ? "Not reached in requested window"
        : `${format(result.collision_time_s)} s`,
    ],
    ["Trajectory samples", String(result.trajectory.length)],
    ["Max specific-energy drift", format(result.max_specific_energy_drift_fraction)],
    ["Max angular-momentum drift", format(result.max_specific_angular_momentum_drift_fraction)],
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

function TrajectoryDataPreview({ result }: Readonly<{ result: OrbitSandboxCalculationResponse }>) {
  const step = Math.max(1, Math.ceil(result.trajectory.length / 20));
  const preview = result.trajectory.filter((_, index) => index % step === 0);
  const last = result.trajectory.at(-1)!;
  if (preview.at(-1) !== last) preview.push(last);
  return (
    <details className="rounded-md border border-[var(--border)] p-4">
      <summary className="cursor-pointer font-semibold">Trajectory data preview</summary>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Showing {preview.length} of {result.trajectory.length} returned samples at a fixed display
        stride, always including the final sample. This table does not interpolate or recalculate
        the orbit.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead>
            <tr>
              <th>Time (s)</th>
              <th>x (m)</th>
              <th>y (m)</th>
              <th>Distance (m)</th>
              <th>Speed (m/s)</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((point) => (
              <tr key={point.time_s}>
                <td>{format(point.time_s, 4)}</td>
                <td>{format(point.x_m, 4)}</td>
                <td>{format(point.y_m, 4)}</td>
                <td>{format(point.distance_m, 4)}</td>
                <td>{format(point.speed_m_s, 4)}</td>
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
        const response = await requestEndpoint(apiOrigin, orbitSandboxRequestEndpoint(nextState), {
          signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Orbit Sandbox rejected this configuration. Check the speed, central-body compactness, secondary mass, time step, and trajectory-point budget. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateOrbitSandboxCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned orbit state.");
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
    () => (calculation === null ? null : buildOrbitVisualTransform(calculation)),
    [calculation],
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = stateForDraft(draft);
    if (next === null) {
      setMessage(
        "One or more inputs are empty, non-finite, or outside the published coarse range.",
      );
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
    <article className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 7 · deterministic simulation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Orbit Sandbox</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Explore planar Newtonian relative two-body motion from an explicit initial position and
          velocity. Analytic initial elements and the velocity-Verlet trajectory are calculated only
          by Lumina&apos;s canonical Python astronomy domain.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared state rejected.</strong> The reviewed Earth-like default is shown instead.
        </aside>
      ) : null}

      <section aria-labelledby="orbit-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="orbit-input-heading">
            Initial state and integration window
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Units are SI. Browser checks cover only finite field ranges; derived physical and
            numerical-domain constraints are enforced by the canonical API and are never silently
            clamped.
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
              {requestState === "loading" ? "Calculating…" : "Calculate orbit"}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              Reset Earth-like circular preset
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
            No browser-generated fallback orbit is substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="orbit-result-heading" className="space-y-6">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="orbit-result-heading">
              Canonical orbit result
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. The conic elements describe the initial idealized
              state; the plotted forward trajectory is a separate finite-step numerical result with
              its own drift diagnostics.
            </p>
          </div>
          <ResultSummary result={calculation} />
          {currentVisual === null ? null : <TrajectoryFigure result={calculation} />}
          <TrajectoryDataPreview result={calculation} />
        </section>
      )}

      <section
        aria-labelledby="orbit-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="orbit-model-heading">
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {ORBIT_DEFINITION.calculation_module.valid_domain}
        </p>
        <p className="leading-7 text-[var(--muted)]">
          {ORBIT_DEFINITION.calculation_module.numerical_policy}
        </p>
        <details>
          <summary className="cursor-pointer font-semibold">Equations</summary>
          <dl className="mt-3 space-y-3 text-sm">
            {Object.entries(ORBIT_DEFINITION.calculation_module.equations).map(
              ([name, equation]) => (
                <div key={name}>
                  <dt className="font-semibold">{name.replaceAll("_", " ")}</dt>
                  <dd className="font-mono text-[var(--muted)]">{equation}</dd>
                </div>
              ),
            )}
          </dl>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {ORBIT_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {ORBIT_DEFINITION.limitations.map((item) => (
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
          Current committed state: {format(state.position_x_m, 3)} m x-position,{" "}
          {format(state.velocity_y_m_s, 3)} m/s y-velocity, {format(state.duration_s, 3)} s
          duration.
        </p>
      </section>
    </article>
  );
}
