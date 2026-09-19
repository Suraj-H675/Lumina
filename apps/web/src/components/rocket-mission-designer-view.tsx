"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type RocketMissionDesignerCalculationResponse } from "@lumina/api-client";

import {
  DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
  ROCKET_MISSION_DESIGNER_DEFINITION,
  ROCKET_MISSION_DESIGNER_LIMITS,
  ROCKET_MISSION_DESIGNER_MODEL_VERSION,
  ROCKET_MISSION_DESIGNER_SOURCES,
  decodeRocketMissionDesignerState,
  encodeRocketMissionDesignerState,
  rocketMissionDesignerRequestEndpoint,
  validateRocketMissionDesignerCalculationResult,
  validateRocketMissionDesignerState,
  type RocketMissionDesignerGravityBody,
  type RocketMissionDesignerReferenceId,
  type RocketMissionDesignerState,
} from "../lib/simulations/rocket-mission-designer";

type RocketMissionDesignerViewProps = Readonly<{
  initialState: RocketMissionDesignerState;
  initialStateInvalid: boolean;
  initialCalculation: RocketMissionDesignerCalculationResponse | null;
  apiOrigin: string | null;
}>;

type RequestState = "idle" | "loading" | "unavailable";
type DraftStage = Readonly<{
  dryMass: string;
  propellantMass: string;
  specificImpulse: string;
  thrust: string;
}>;

const GRAVITY_LABELS: Readonly<Record<RocketMissionDesignerGravityBody, string>> = {
  earth: "Earth",
  moon: "Moon",
  mars: "Mars",
};

const REFERENCE_LABELS: Readonly<Record<RocketMissionDesignerReferenceId, string>> = {
  earth_200_mile_orbit_example: "NASA Glenn approximate 200-mile circular-orbit example",
  earth_equatorial_escape_speed: "JPL Earth equatorial escape-speed reference",
  mars_equatorial_escape_speed: "JPL Mars equatorial escape-speed reference",
};

function replaceBrowserState(state: RocketMissionDesignerState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/rocket-mission-designer";
  url.searchParams.set("state", encodeRocketMissionDesignerState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: RocketMissionDesignerState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_ROCKET_MISSION_DESIGNER_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeRocketMissionDesignerState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_ROCKET_MISSION_DESIGNER_STATE, invalid: true }
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
      {ROCKET_MISSION_DESIGNER_DEFINITION.references.map((sourceId) => {
        const source = ROCKET_MISSION_DESIGNER_SOURCES.find(
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

function StageResults({ result }: Readonly<{ result: RocketMissionDesignerCalculationResponse }>) {
  return (
    <div aria-label="Scrollable returned stage table" className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">
          Canonical Python-owned ideal staged-rocket outputs in ignition order.
        </caption>
        <thead>
          <tr>
            {[
              "Stage",
              "Dry kg",
              "Propellant kg",
              "Ignition kg",
              "Burnout kg",
              "Mass ratio",
              "Ideal Δv m/s",
              "Surface-reference TWR",
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
          {result.stages.map((stage) => (
            <tr key={stage.index}>
              <td className="border-b border-[var(--border)] p-2">{stage.index}</td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(stage.dry_mass_kg)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(stage.propellant_mass_kg)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(stage.ignition_mass_kg)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(stage.burnout_before_jettison_mass_kg)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(stage.mass_ratio)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(stage.ideal_delta_v_m_s)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(stage.surface_gravity_thrust_to_weight)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayloadTradeoffFigure({
  result,
}: Readonly<{ result: RocketMissionDesignerCalculationResponse }>) {
  const width = 760;
  const height = 260;
  const left = 72;
  const right = 24;
  const top = 24;
  const bottom = 54;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = result.payload_tradeoff.map((point) => point.total_ideal_delta_v_m_s);
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  const span = maximum === minimum ? 1 : maximum - minimum;
  const x = (index: number) =>
    left + (index / Math.max(1, result.payload_tradeoff.length - 1)) * plotWidth;
  const y = (value: number) => top + ((maximum - value) / span) * plotHeight;
  const path = result.payload_tradeoff
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.total_ideal_delta_v_m_s)}`,
    )
    .join(" ");

  return (
    <figure className="space-y-3">
      <div
        aria-label="Scrollable returned payload-sensitivity plot"
        className="overflow-x-auto"
        tabIndex={0}
      >
        <svg
          aria-label="Returned payload sensitivity plot"
          className="min-w-[620px] max-w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <line stroke="currentColor" x1={left} x2={left} y1={top} y2={top + plotHeight} />
          <line
            stroke="currentColor"
            x1={left}
            x2={left + plotWidth}
            y1={top + plotHeight}
            y2={top + plotHeight}
          />
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          {result.payload_tradeoff.map((point, index) => (
            <g key={point.payload_multiplier}>
              <circle
                cx={x(index)}
                cy={y(point.total_ideal_delta_v_m_s)}
                fill="currentColor"
                r="5"
              />
              <text fontSize="11" textAnchor="middle" x={x(index)} y={top + plotHeight + 22}>
                {format(point.payload_multiplier)}×
              </text>
            </g>
          ))}
          <text fontSize="11" x={left + 4} y={top + 12}>
            {format(maximum)} m/s
          </text>
          <text fontSize="11" x={left + 4} y={top + plotHeight - 8}>
            {format(minimum)} m/s
          </text>
          <text fontSize="12" textAnchor="middle" x={left + plotWidth / 2} y={height - 12}>
            submitted payload multiplier
          </text>
        </svg>
      </div>
      <figcaption className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        Presentation-only plot of the five returned payload-sensitivity points. The browser does not
        calculate payload delta-v, stage delta-v, TWR, mass ratios, or reference differences.
      </figcaption>
    </figure>
  );
}

function PayloadTradeoffTable({
  result,
}: Readonly<{ result: RocketMissionDesignerCalculationResponse }>) {
  return (
    <div
      aria-label="Scrollable returned payload-sensitivity table"
      className="overflow-x-auto"
      tabIndex={0}
    >
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">
          Fixed returned payload multipliers with the submitted stages unchanged.
        </caption>
        <thead>
          <tr>
            {["Payload multiplier", "Payload kg", "Total ideal Δv m/s"].map((heading) => (
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
          {result.payload_tradeoff.map((point) => (
            <tr key={point.payload_multiplier}>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(point.payload_multiplier)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(point.payload_mass_kg)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(point.total_ideal_delta_v_m_s)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RocketMissionDesignerView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
}: RocketMissionDesignerViewProps) {
  const [state, setState] = useState(initialState);
  const [draftGravityBody, setDraftGravityBody] = useState(initialState.gravity_body);
  const [draftReferenceId, setDraftReferenceId] = useState(initialState.delta_v_reference_id);
  const [draftPayloadMass, setDraftPayloadMass] = useState(String(initialState.payload_mass_kg));
  const [draftStages, setDraftStages] = useState<ReadonlyArray<DraftStage>>(
    initialState.stages.map((stage) => ({
      dryMass: String(stage.dry_mass_kg),
      propellantMass: String(stage.propellant_mass_kg),
      specificImpulse: String(stage.specific_impulse_s),
      thrust: String(stage.thrust_n),
    })),
  );
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const adoptDraft = useCallback((next: RocketMissionDesignerState) => {
    setDraftGravityBody(next.gravity_body);
    setDraftReferenceId(next.delta_v_reference_id);
    setDraftPayloadMass(String(next.payload_mass_kg));
    setDraftStages(
      next.stages.map((stage) => ({
        dryMass: String(stage.dry_mass_kg),
        propellantMass: String(stage.propellant_mass_kg),
        specificImpulse: String(stage.specific_impulse_s),
        thrust: String(stage.thrust_n),
      })),
    );
  }, []);

  const recalculate = useCallback(
    async (nextState: RocketMissionDesignerState, commit: boolean) => {
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
          rocketMissionDesignerRequestEndpoint(nextState),
          { signal: controller.signal },
        );
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Rocket / Mission Designer rejected this state. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateRocketMissionDesignerCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned rocket state.");
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

  function updateStage(index: number, field: keyof DraftStage, value: string) {
    setDraftStages((current) =>
      current.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, [field]: value } : stage,
      ),
    );
    setMessage("");
  }

  function addStage() {
    if (draftStages.length >= ROCKET_MISSION_DESIGNER_LIMITS.maxStageCount) return;
    setDraftStages((current) => [
      ...current,
      { dryMass: "", propellantMass: "", specificImpulse: "", thrust: "" },
    ]);
    setMessage("");
  }

  function removeStage(index: number) {
    if (draftStages.length <= ROCKET_MISSION_DESIGNER_LIMITS.minStageCount) return;
    setDraftStages((current) => current.filter((_, stageIndex) => stageIndex !== index));
    setMessage("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      draftPayloadMass.trim().length === 0 ||
      draftStages.some(
        (stage) =>
          stage.dryMass.trim().length === 0 ||
          stage.propellantMass.trim().length === 0 ||
          stage.specificImpulse.trim().length === 0 ||
          stage.thrust.trim().length === 0,
      )
    ) {
      setMessage("One or more controls are empty or outside the reviewed v1 domain.");
      return;
    }
    const next = validateRocketMissionDesignerState({
      version: 1,
      model_version: ROCKET_MISSION_DESIGNER_MODEL_VERSION,
      gravity_body: draftGravityBody,
      delta_v_reference_id: draftReferenceId,
      payload_mass_kg: Number(draftPayloadMass),
      stages: draftStages.map((stage) => ({
        dry_mass_kg: Number(stage.dryMass),
        propellant_mass_kg: Number(stage.propellantMass),
        specific_impulse_s: Number(stage.specificImpulse),
        thrust_n: Number(stage.thrust),
      })),
    });
    if (next === null) {
      setMessage(
        "The requested payload or stage values are outside the reviewed v1 input bounds. Lumina does not clamp, reorder, or optimize them.",
      );
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    adoptDraft(DEFAULT_ROCKET_MISSION_DESIGNER_STATE);
    setMessage("");
    void recalculate(DEFAULT_ROCKET_MISSION_DESIGNER_STATE, true);
  }

  return (
    <article className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 7 · deterministic ideal staged-rocket teaching model
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Rocket / Mission Designer
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Explore how stage masses, specific impulse, thrust, payload, and a selected
          surface-gravity reference relate inside one deliberately idealized model. This lab does
          not determine mission feasibility, real launch capability, or operational flight plans.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared rocket state rejected.</strong> The reviewed synthetic two-stage preset is
          shown instead.
        </aside>
      ) : null}

      <section aria-labelledby="rocket-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="rocket-input-heading">
            Teaching vehicle controls
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Stages are entered in ignition order, bottom/first through top/final. The selected body
            changes only the returned surface-gravity TWR teaching reference. It does not change the
            specific-impulse convention or turn this into a trajectory simulation.
          </p>
        </div>
        <form className="space-y-6" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-3">
            <label className="space-y-2">
              <span className="block font-semibold">Surface-gravity reference</span>
              <select
                aria-label="Surface-gravity reference body"
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3"
                disabled={requestState === "loading"}
                onChange={(event) => {
                  setDraftGravityBody(event.target.value as RocketMissionDesignerGravityBody);
                  setMessage("");
                }}
                value={draftGravityBody}
              >
                {Object.entries(GRAVITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="block font-semibold">Velocity reference</span>
              <select
                aria-label="Educational velocity reference"
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3"
                disabled={requestState === "loading"}
                onChange={(event) => {
                  setDraftReferenceId(event.target.value as RocketMissionDesignerReferenceId);
                  setMessage("");
                }}
                value={draftReferenceId}
              >
                {Object.entries(REFERENCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="flex justify-between gap-2 font-semibold">
                <span>Payload mass</span>
                <span className="text-xs font-normal text-[var(--muted)]">kg</span>
              </span>
              <input
                aria-label="Payload mass kg"
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={ROCKET_MISSION_DESIGNER_LIMITS.maxPayloadMassKg}
                min={ROCKET_MISSION_DESIGNER_LIMITS.minPayloadMassKg}
                onChange={(event) => {
                  setDraftPayloadMass(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={draftPayloadMass}
              />
            </label>
          </div>

          <fieldset className="space-y-4 rounded-md border border-[var(--border)] p-4">
            <legend className="px-1 font-semibold">Stages in ignition order</legend>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Each stage has positive dry mass, propellant mass, thrust, and specific impulse.
              Stages are never silently reordered, merged, or optimized.
            </p>
            <div className="space-y-4">
              {draftStages.map((stage, index) => (
                <fieldset
                  className="grid gap-4 rounded-md border border-[var(--border)] p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end"
                  key={index}
                >
                  <legend className="px-1 font-semibold">Stage {index + 1}</legend>
                  <label className="space-y-2">
                    <span className="block font-semibold">Dry mass kg</span>
                    <input
                      aria-label={`Stage ${index + 1} dry mass kg`}
                      className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                      disabled={requestState === "loading"}
                      max={ROCKET_MISSION_DESIGNER_LIMITS.maxStageDryMassKg}
                      min={ROCKET_MISSION_DESIGNER_LIMITS.minStageDryMassKg}
                      onChange={(event) => updateStage(index, "dryMass", event.target.value)}
                      step="any"
                      type="number"
                      value={stage.dryMass}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="block font-semibold">Propellant kg</span>
                    <input
                      aria-label={`Stage ${index + 1} propellant mass kg`}
                      className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                      disabled={requestState === "loading"}
                      max={ROCKET_MISSION_DESIGNER_LIMITS.maxStagePropellantMassKg}
                      min={ROCKET_MISSION_DESIGNER_LIMITS.minStagePropellantMassKg}
                      onChange={(event) => updateStage(index, "propellantMass", event.target.value)}
                      step="any"
                      type="number"
                      value={stage.propellantMass}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="block font-semibold">Specific impulse s</span>
                    <input
                      aria-label={`Stage ${index + 1} specific impulse s`}
                      className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                      disabled={requestState === "loading"}
                      max={ROCKET_MISSION_DESIGNER_LIMITS.maxStageSpecificImpulseS}
                      min={ROCKET_MISSION_DESIGNER_LIMITS.minStageSpecificImpulseS}
                      onChange={(event) =>
                        updateStage(index, "specificImpulse", event.target.value)
                      }
                      step="any"
                      type="number"
                      value={stage.specificImpulse}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="block font-semibold">Thrust N</span>
                    <input
                      aria-label={`Stage ${index + 1} thrust N`}
                      className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                      disabled={requestState === "loading"}
                      max={ROCKET_MISSION_DESIGNER_LIMITS.maxStageThrustN}
                      min={ROCKET_MISSION_DESIGNER_LIMITS.minStageThrustN}
                      onChange={(event) => updateStage(index, "thrust", event.target.value)}
                      step="any"
                      type="number"
                      value={stage.thrust}
                    />
                  </label>
                  <button
                    aria-label={`Remove stage ${index + 1}`}
                    className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 font-semibold"
                    disabled={
                      requestState === "loading" ||
                      draftStages.length <= ROCKET_MISSION_DESIGNER_LIMITS.minStageCount
                    }
                    onClick={() => removeStage(index)}
                    type="button"
                  >
                    Remove
                  </button>
                </fieldset>
              ))}
            </div>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 font-semibold"
              disabled={
                requestState === "loading" ||
                draftStages.length >= ROCKET_MISSION_DESIGNER_LIMITS.maxStageCount
              }
              onClick={addStage}
              type="button"
            >
              Add stage
            </button>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-md bg-[var(--accent)] px-5 font-semibold text-[var(--background)]"
              disabled={requestState === "loading"}
              type="submit"
            >
              {requestState === "loading" ? "Calculating…" : "Calculate ideal model"}
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
            No browser-generated fallback delta-v, staging, TWR, payload sensitivity, or mission
            comparison is substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="rocket-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="rocket-result-heading">
              Canonical ideal staged result
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. The selected surface-gravity reference is{" "}
              {format(calculation.selected_surface_gravity_m_s2)} m/s². All values below are
              returned by the canonical Python model.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Total ideal delta-v</p>
              <p className="mt-1 font-semibold">
                {format(calculation.total_ideal_delta_v_m_s)} m/s
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Launch mass</p>
              <p className="mt-1 font-semibold">
                {format(calculation.mass_fractions.launch_mass_kg)} kg
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Propellant fraction</p>
              <p className="mt-1 font-semibold">
                {format(calculation.mass_fractions.propellant_fraction_of_launch_mass)}
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Payload fraction</p>
              <p className="mt-1 font-semibold">
                {format(calculation.mass_fractions.payload_fraction_of_launch_mass)}
              </p>
            </div>
          </div>
          <StageResults result={calculation} />
          <section aria-labelledby="rocket-payload-heading" className="space-y-4">
            <div className="max-w-4xl space-y-2">
              <h3 className="text-xl font-semibold" id="rocket-payload-heading">
                Fixed payload sensitivity
              </h3>
              <p className="leading-7 text-[var(--muted)]">
                The five returned points keep the submitted stages unchanged. They are an
                educational sensitivity view, not an optimizer or recommendation.
              </p>
            </div>
            <PayloadTradeoffFigure result={calculation} />
            <PayloadTradeoffTable result={calculation} />
          </section>
          <section
            aria-labelledby="rocket-reference-heading"
            className="max-w-4xl space-y-3 rounded-md border border-[var(--border-strong)] p-5"
          >
            <h3 className="text-xl font-semibold" id="rocket-reference-heading">
              Educational velocity reference
            </h3>
            <p className="font-semibold">{calculation.reference_comparison.label}</p>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-[var(--muted)]">Reference value</dt>
                <dd className="font-mono">
                  {format(calculation.reference_comparison.reference_value_m_s)} m/s
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--muted)]">Ideal Δv difference</dt>
                <dd className="font-mono">
                  {format(calculation.reference_comparison.ideal_delta_v_difference_m_s)} m/s
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--muted)]">Ideal Δv/reference ratio</dt>
                <dd className="font-mono">
                  {format(calculation.reference_comparison.ideal_delta_v_to_reference_ratio)}
                </dd>
              </div>
            </dl>
            <p className="leading-7">{calculation.reference_comparison.interpretation}</p>
          </section>
          <p className="max-w-4xl rounded-md border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
            {calculation.model_note}
          </p>
        </section>
      )}

      <section
        aria-labelledby="rocket-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="rocket-model-heading">
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          V1 is an educational ideal staged-rocket model, not an engineering design, trajectory
          solver, mission planner, launch-capability assessment, or hazardous construction guide.
        </p>
        <details open>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {ROCKET_MISSION_DESIGNER_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {ROCKET_MISSION_DESIGNER_DEFINITION.limitations.map((item) => (
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
          Current committed browser state: {state.stages.length} stage
          {state.stages.length === 1 ? "" : "s"}, {format(state.payload_mass_kg)} kg payload,{" "}
          {GRAVITY_LABELS[state.gravity_body]} surface-gravity reference.
        </p>
      </section>
    </article>
  );
}
