"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type ImpactSimulatorCalculationResponse } from "@lumina/api-client";

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
}>;

type RequestState = "idle" | "loading" | "unavailable";

const TARGET_LABELS: Readonly<Record<ImpactSimulatorTargetMaterial, string>> = {
  sedimentary_rock: "Sedimentary rock",
  crystalline_rock: "Crystalline rock",
};

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

function format(value: number, digits = 6): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) return value.toExponential(digits);
  return value.toLocaleString("en", { maximumSignificantDigits: digits + 1 });
}

function SourceList() {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {IMPACT_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = IMPACT_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
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

function CraterSensitivityTable({
  result,
}: Readonly<{ result: ImpactSimulatorCalculationResponse }>) {
  return (
    <div
      aria-label="Scrollable crater coefficient-sensitivity table"
      className="overflow-x-auto"
      tabIndex={0}
    >
      <table className="w-full min-w-[660px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">
          Canonical low, best, and high scaling-coefficient sensitivity returned by Python.
        </caption>
        <thead>
          <tr>
            {["Scaling coefficient", "Transient diameter m", "Final diameter m", "Class"].map(
              (heading) => (
                <th
                  className="border-b border-[var(--border)] p-2 text-left"
                  key={heading}
                  scope="col"
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {result.coefficient_sensitivity.map((row) => (
            <tr key={row.scaling_coefficient}>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.scaling_coefficient)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.transient_diameter_m)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.final_diameter_m)}
              </td>
              <td className="border-b border-[var(--border)] p-2">{row.classification}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EjectaTable({ result }: Readonly<{ result: ImpactSimulatorCalculationResponse }>) {
  return (
    <div aria-label="Scrollable ejecta thickness table" className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">
          Returned location-free lower-bound deposit radii.
        </caption>
        <thead>
          <tr>
            <th className="border-b border-[var(--border)] p-2 text-left" scope="col">
              Deposit thickness m
            </th>
            <th className="border-b border-[var(--border)] p-2 text-left" scope="col">
              Radius m
            </th>
          </tr>
        </thead>
        <tbody>
          {result.ejecta_thickness_radii.map((row) => (
            <tr key={row.thickness_m}>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.thickness_m)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(row.radius_m)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReturnedScaleFigure({ result }: Readonly<{ result: ImpactSimulatorCalculationResponse }>) {
  const rows = [
    {
      label: "Final crater radius",
      value: result.best_estimate_crater.final_diameter_m / 2,
    },
    ...result.ejecta_thickness_radii.map((row) => ({
      label: `${format(row.thickness_m)} m lower-bound deposit radius`,
      value: row.radius_m,
    })),
  ];
  const maximum = Math.max(...rows.map((row) => row.value));
  return (
    <figure className="space-y-3">
      <div
        aria-label="Returned crater and ejecta relative scale"
        className="space-y-3 rounded-md border border-[var(--border)] p-4"
        role="img"
      >
        {rows.map((row) => (
          <div className="space-y-1" key={row.label}>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{row.label}</span>
              <span className="font-mono">{format(row.value)} m</span>
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
        Presentation-only relative scaling of returned radii. The browser does not calculate impact
        energy, crater dimensions, coefficient sensitivity, or ejecta thickness.
      </figcaption>
    </figure>
  );
}

export function ImpactSimulatorView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
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
          impactSimulatorRequestEndpoint(nextState),
          {
            signal: controller.signal,
          },
        );
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Impact Simulator rejected this state. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateImpactSimulatorCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned impact state.");
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
      [draftDiameter, draftDensity, draftSpeed, draftAngle].some(
        (value) => value.trim().length === 0,
      )
    ) {
      setMessage("One or more controls are empty or outside the reviewed v1 domain.");
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
      setMessage(
        "The requested values are outside the reviewed large solid-rock v1 domain. Lumina does not clamp or reinterpret them.",
      );
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
          Phase 7 · large solid-rock Earth-impact teaching model
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Impact Simulator</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Explore how a synthetic large impactor maps to source-backed kinetic energy, crater-size
          sensitivity, and lower-bound ejecta deposit radii. This lab has no map, target location,
          casualty model, emergency-planning output, or optimization.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared impact state rejected.</strong> The reviewed synthetic preset is shown
          instead.
        </aside>
      ) : null}

      <section aria-labelledby="impact-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="impact-input-heading">
            Synthetic impact controls
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            V1 deliberately starts at a 1.5 km diameter and covers only solid sedimentary or
            crystalline rock. Smaller atmospheric-entry and airburst cases are outside this model.
          </p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2">
              <span className="block font-semibold">Diameter m</span>
              <input
                aria-label="Impactor diameter m"
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
              <span className="block font-semibold">Density kg/m³</span>
              <input
                aria-label="Impactor density kg per cubic metre"
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
              <span className="block font-semibold">Speed km/s</span>
              <input
                aria-label="Impact speed km per second"
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
              <span className="block font-semibold">Angle degrees</span>
              <input
                aria-label="Impact angle degrees above local horizontal"
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
              <span className="block font-semibold">Solid-rock target</span>
              <select
                aria-label="Target material"
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3"
                disabled={requestState === "loading"}
                onChange={(event) => {
                  setDraftTarget(event.target.value as ImpactSimulatorTargetMaterial);
                  setMessage("");
                }}
                value={draftTarget}
              >
                {Object.entries(TARGET_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
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
              {requestState === "loading" ? "Calculating…" : "Calculate teaching model"}
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
            No browser-generated energy, crater dimensions, coefficient sensitivity, or ejecta
            ranges are substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="impact-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="impact-result-heading">
              Canonical educational result
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. Target density:{" "}
              {format(calculation.target_density_kg_m3)} kg/m³. All scientific values below were
              returned by the canonical Python model.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Impactor mass</p>
              <p className="mt-1 font-semibold">{format(calculation.impactor_mass_kg)} kg</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Kinetic energy</p>
              <p className="mt-1 font-semibold">{format(calculation.kinetic_energy_j)} J</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">TNT-equivalent energy context</p>
              <p className="mt-1 font-semibold">
                {format(calculation.tnt_equivalent_megatons)} Mt TNT
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Best final crater diameter</p>
              <p className="mt-1 font-semibold">
                {format(calculation.best_estimate_crater.final_diameter_m)} m
              </p>
            </div>
          </div>
          <p className="max-w-4xl rounded-md border border-[var(--border)] p-4 text-sm leading-6">
            TNT equivalence is descriptive unit context only. It is not a blast-damage equivalence
            or a location-specific effect prediction.
          </p>

          <section aria-labelledby="impact-sensitivity-heading" className="space-y-4">
            <div className="max-w-4xl space-y-2">
              <h3 className="text-xl font-semibold" id="impact-sensitivity-heading">
                Crater scaling-coefficient sensitivity
              </h3>
              <p className="leading-7 text-[var(--muted)]">{calculation.uncertainty_note}</p>
            </div>
            <CraterSensitivityTable result={calculation} />
          </section>

          <section aria-labelledby="impact-ejecta-heading" className="space-y-4">
            <div className="max-w-4xl space-y-2">
              <h3 className="text-xl font-semibold" id="impact-ejecta-heading">
                Lower-bound ejecta deposit radii
              </h3>
              <p className="leading-7 text-[var(--muted)]">
                These returned radii are location-free lower-bound deposit estimates. They are not
                casualty, debris-lethality, infrastructure, evacuation, or property-damage zones.
              </p>
            </div>
            <ReturnedScaleFigure result={calculation} />
            <EjectaTable result={calculation} />
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
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">{IMPACT_SIMULATOR_DEFINITION.summary}</p>
        <details open>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {IMPACT_SIMULATOR_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {IMPACT_SIMULATOR_DEFINITION.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer font-semibold">Reviewed model equations</summary>
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
          <h3 className="font-semibold">Reviewed sources</h3>
          <div className="mt-2">
            <SourceList />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Current committed browser state: {format(state.diameter_m)} m diameter,{" "}
          {format(state.impactor_density_kg_m3)} kg/m³, {format(state.speed_km_s)} km/s,{" "}
          {format(state.impact_angle_deg)}°, {TARGET_LABELS[state.target_material]}.
        </p>
      </section>
    </article>
  );
}
