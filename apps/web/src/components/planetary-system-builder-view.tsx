"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  requestEndpoint,
  type PlanetarySystemBuilderCalculationResponse,
} from "@lumina/api-client";

import {
  DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
  PLANETARY_SYSTEM_BUILDER_DEFINITION,
  PLANETARY_SYSTEM_BUILDER_LIMITS,
  PLANETARY_SYSTEM_BUILDER_MODEL_VERSION,
  PLANETARY_SYSTEM_BUILDER_SOURCES,
  decodePlanetarySystemBuilderState,
  encodePlanetarySystemBuilderState,
  planetarySystemBuilderRequestEndpoint,
  validatePlanetarySystemBuilderCalculationResult,
  validatePlanetarySystemBuilderState,
  type PlanetarySystemBuilderState,
} from "../lib/simulations/planetary-system-builder";

type PlanetarySystemBuilderViewProps = Readonly<{
  initialState: PlanetarySystemBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: PlanetarySystemBuilderCalculationResponse | null;
  apiOrigin: string | null;
}>;

type RequestState = "idle" | "loading" | "unavailable";
type DraftPlanet = Readonly<{ mass: string; axis: string }>;

const HZ_RELATION_LABELS = {
  interior_to_reference_hz: "Interior to reference HZ",
  inside_reference_hz: "Inside modeled reference HZ",
  exterior_to_reference_hz: "Exterior to reference HZ",
} as const;

const PAIRWISE_LABELS = {
  pairwise_close_warning: "Pairwise close warning",
  no_pairwise_hill_warning: "No pairwise Hill warning",
} as const;

function replaceBrowserState(state: PlanetarySystemBuilderState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/planetary-system-builder";
  url.searchParams.set("state", encodePlanetarySystemBuilderState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: PlanetarySystemBuilderState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE, invalid: false };
  const decoded = values.length === 1 ? decodePlanetarySystemBuilderState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE, invalid: true }
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
      {PLANETARY_SYSTEM_BUILDER_DEFINITION.references.map((sourceId) => {
        const source = PLANETARY_SYSTEM_BUILDER_SOURCES.find(
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

function SystemPlacementFigure({
  result,
}: Readonly<{ result: PlanetarySystemBuilderCalculationResponse }>) {
  const width = 820;
  const height = 250;
  const left = 68;
  const right = 30;
  const axisY = 120;
  const plotWidth = width - left - right;
  const maximumReturnedDistance = Math.max(
    result.habitable_zone.outer_edge_au,
    ...result.planets.map((planet) => planet.semi_major_axis_au),
  );
  const scaleMaximum = maximumReturnedDistance > 0 ? maximumReturnedDistance * 1.05 : 1;
  const x = (distanceAu: number) => left + (distanceAu / scaleMaximum) * plotWidth;
  const hzStart = x(result.habitable_zone.inner_edge_au);
  const hzEnd = x(result.habitable_zone.outer_edge_au);

  return (
    <figure className="space-y-3">
      <div
        aria-label="Scrollable returned planetary-system placement diagram"
        className="overflow-x-auto"
        tabIndex={0}
      >
        <svg
          aria-label="Returned planetary-system placement diagram with modeled reference habitable-zone band"
          className="min-w-[680px] max-w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <line stroke="currentColor" x1={left} x2={left + plotWidth} y1={axisY} y2={axisY} />
          <rect
            fill="none"
            height="72"
            stroke="currentColor"
            strokeDasharray="6 4"
            width={Math.max(1, hzEnd - hzStart)}
            x={hzStart}
            y={axisY - 36}
          />
          <text fontSize="12" textAnchor="middle" x={(hzStart + hzEnd) / 2} y={axisY - 44}>
            modeled reference HZ
          </text>
          <circle cx={left} cy={axisY} fill="currentColor" r="9" />
          <text fontSize="12" textAnchor="middle" x={left} y={axisY + 30}>
            star
          </text>
          {result.planets.map((planet) => {
            const markerX = x(planet.semi_major_axis_au);
            return (
              <g key={planet.index}>
                <circle cx={markerX} cy={axisY} fill="currentColor" r="6" />
                <text fontSize="12" textAnchor="middle" x={markerX} y={axisY + 30}>
                  P{planet.index}
                </text>
                <text fontSize="11" textAnchor="middle" x={markerX} y={axisY + 48}>
                  {format(planet.semi_major_axis_au)} AU
                </text>
              </g>
            );
          })}
          <text fontSize="12" x={left} y={height - 20}>
            0 AU
          </text>
          <text fontSize="12" textAnchor="end" x={left + plotWidth} y={height - 20}>
            {format(scaleMaximum)} AU display extent
          </text>
        </svg>
      </div>
      <figcaption className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        Presentation-only placement of returned semimajor axes and returned HZ edges on a shared
        screen axis. The browser does not calculate Keplerian periods, HZ boundaries, mutual-Hill
        radii, separations, or pairwise assessments.
      </figcaption>
    </figure>
  );
}

function PlanetResults({
  result,
}: Readonly<{ result: PlanetarySystemBuilderCalculationResponse }>) {
  return (
    <div aria-label="Scrollable returned planet table" className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">
          Canonical Python-owned planet periods and reference-HZ placement.
        </caption>
        <thead>
          <tr>
            {[
              "Planet",
              "Mass M⊕",
              "Semimajor axis AU",
              "Period days",
              "Reference-HZ placement",
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
          {result.planets.map((planet) => (
            <tr key={planet.index}>
              <td className="border-b border-[var(--border)] p-2">{planet.index}</td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(planet.mass_mearth)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(planet.semi_major_axis_au)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(planet.orbital_period_days, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2">
                {HZ_RELATION_LABELS[planet.habitable_zone_relation]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PairwiseResults({
  result,
}: Readonly<{ result: PlanetarySystemBuilderCalculationResponse }>) {
  if (result.adjacent_pairs.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border)] p-4">
        This single-planet system has no adjacent-pair mutual-Hill diagnostic.
      </p>
    );
  }
  return (
    <div
      aria-label="Scrollable pairwise mutual-Hill table"
      className="overflow-x-auto"
      tabIndex={0}
    >
      <table className="w-full min-w-[780px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">
          Pairwise mutual-Hill spacing diagnostic only; not a whole-system stability result.
        </caption>
        <thead>
          <tr>
            {[
              "Pair",
              "Mutual Hill radius AU",
              "Separation Δ",
              "Reference threshold",
              "Assessment",
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
          {result.adjacent_pairs.map((pair) => (
            <tr key={`${pair.inner_index}-${pair.outer_index}`}>
              <td className="border-b border-[var(--border)] p-2">
                {pair.inner_index}–{pair.outer_index}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(pair.mutual_hill_radius_au, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(pair.separation_mutual_hill, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(pair.pairwise_reference_threshold, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2">
                {PAIRWISE_LABELS[pair.spacing_assessment]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
        {result.adjacent_pairs.map((pair) => (
          <li key={`${pair.inner_index}-${pair.outer_index}-interpretation`}>
            Pair {pair.inner_index}–{pair.outer_index}: {pair.interpretation}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanetarySystemBuilderView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
}: PlanetarySystemBuilderViewProps) {
  const [state, setState] = useState(initialState);
  const [draftStellarMass, setDraftStellarMass] = useState(String(initialState.stellar_mass_msun));
  const [draftStellarLuminosity, setDraftStellarLuminosity] = useState(
    String(initialState.stellar_luminosity_lsun),
  );
  const [draftStellarTemperature, setDraftStellarTemperature] = useState(
    String(initialState.stellar_effective_temperature_k),
  );
  const [draftPlanets, setDraftPlanets] = useState<ReadonlyArray<DraftPlanet>>(
    initialState.planets.map((planet) => ({
      mass: String(planet.mass_mearth),
      axis: String(planet.semi_major_axis_au),
    })),
  );
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const adoptDraft = useCallback((next: PlanetarySystemBuilderState) => {
    setDraftStellarMass(String(next.stellar_mass_msun));
    setDraftStellarLuminosity(String(next.stellar_luminosity_lsun));
    setDraftStellarTemperature(String(next.stellar_effective_temperature_k));
    setDraftPlanets(
      next.planets.map((planet) => ({
        mass: String(planet.mass_mearth),
        axis: String(planet.semi_major_axis_au),
      })),
    );
  }, []);

  const recalculate = useCallback(
    async (nextState: PlanetarySystemBuilderState, commit: boolean) => {
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
          planetarySystemBuilderRequestEndpoint(nextState),
          { signal: controller.signal },
        );
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Planetary System Builder rejected this state. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validatePlanetarySystemBuilderCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned builder state.");
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

  function updatePlanet(index: number, field: keyof DraftPlanet, value: string) {
    setDraftPlanets((current) =>
      current.map((planet, planetIndex) =>
        planetIndex === index ? { ...planet, [field]: value } : planet,
      ),
    );
    setMessage("");
  }

  function addPlanet() {
    if (draftPlanets.length >= PLANETARY_SYSTEM_BUILDER_LIMITS.maxPlanetCount) return;
    setDraftPlanets((current) => [...current, { mass: "1", axis: "" }]);
    setMessage("");
  }

  function removePlanet(index: number) {
    if (draftPlanets.length <= PLANETARY_SYSTEM_BUILDER_LIMITS.minPlanetCount) return;
    setDraftPlanets((current) => current.filter((_, planetIndex) => planetIndex !== index));
    setMessage("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      draftStellarMass.trim().length === 0 ||
      draftStellarLuminosity.trim().length === 0 ||
      draftStellarTemperature.trim().length === 0 ||
      draftPlanets.some(
        (planet) => planet.mass.trim().length === 0 || planet.axis.trim().length === 0,
      )
    ) {
      setMessage("One or more controls are empty or outside the reviewed v1 domain.");
      return;
    }
    const next = validatePlanetarySystemBuilderState({
      version: 1,
      model_version: PLANETARY_SYSTEM_BUILDER_MODEL_VERSION,
      stellar_mass_msun: Number(draftStellarMass),
      stellar_luminosity_lsun: Number(draftStellarLuminosity),
      stellar_effective_temperature_k: Number(draftStellarTemperature),
      planets: draftPlanets.map((planet) => ({
        mass_mearth: Number(planet.mass),
        semi_major_axis_au: Number(planet.axis),
      })),
    });
    if (next === null) {
      setMessage(
        "The requested star or ordered planet inputs are outside the reviewed v1 domain. Semimajor axes must already be strictly increasing.",
      );
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    adoptDraft(DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE);
    setMessage("");
    void recalculate(DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE, true);
  }

  return (
    <article className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 7 · deterministic multi-planet teaching model
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Planetary System Builder
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Build one synthetic star with one to eight circular, coplanar, non-interacting planets.
          Compare Python-owned Keplerian periods, a published conservative reference HZ band, and
          limited adjacent-pair mutual-Hill context without making a long-term stability claim.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared planetary-system state rejected.</strong> The reviewed illustrative
          three-planet preset is shown instead.
        </aside>
      ) : null}

      <section aria-labelledby="builder-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="builder-input-heading">
            Synthetic system controls
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Stellar mass, luminosity, and effective temperature are independent educational
            controls. V1 does not claim every allowed combination is a self-consistent stellar
            evolution model. Planet order is explicit; Lumina does not silently sort it.
          </p>
        </div>
        <form className="space-y-6" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-3">
            <label className="space-y-2">
              <span className="flex justify-between gap-2 font-semibold">
                <span>Stellar mass</span>
                <span className="text-xs font-normal text-[var(--muted)]">M☉</span>
              </span>
              <input
                aria-label="Stellar mass Msun"
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarMassMsun}
                min={PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarMassMsun}
                onChange={(event) => {
                  setDraftStellarMass(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={draftStellarMass}
              />
            </label>
            <label className="space-y-2">
              <span className="flex justify-between gap-2 font-semibold">
                <span>Stellar luminosity</span>
                <span className="text-xs font-normal text-[var(--muted)]">L☉</span>
              </span>
              <input
                aria-label="Stellar luminosity Lsun"
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarLuminosityLsun}
                min={PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarLuminosityLsun}
                onChange={(event) => {
                  setDraftStellarLuminosity(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={draftStellarLuminosity}
              />
            </label>
            <label className="space-y-2">
              <span className="flex justify-between gap-2 font-semibold">
                <span>Effective temperature</span>
                <span className="text-xs font-normal text-[var(--muted)]">K</span>
              </span>
              <input
                aria-label="Stellar effective temperature K"
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarEffectiveTemperatureK}
                min={PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarEffectiveTemperatureK}
                onChange={(event) => {
                  setDraftStellarTemperature(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={draftStellarTemperature}
              />
            </label>
          </div>

          <fieldset className="space-y-4 rounded-md border border-[var(--border)] p-4">
            <legend className="px-1 font-semibold">Ordered planets</legend>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Enter planets from smallest to largest semimajor axis. Equal or descending axes are
              rejected rather than reordered.
            </p>
            <div className="space-y-4">
              {draftPlanets.map((planet, index) => (
                <fieldset
                  className="grid gap-4 rounded-md border border-[var(--border)] p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
                  key={index}
                >
                  <legend className="px-1 font-semibold">Planet {index + 1}</legend>
                  <label className="space-y-2">
                    <span className="block font-semibold">Mass M⊕</span>
                    <input
                      aria-label={`Planet ${index + 1} mass Mearth`}
                      className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                      disabled={requestState === "loading"}
                      max={PLANETARY_SYSTEM_BUILDER_LIMITS.maxPlanetMassMearth}
                      min={PLANETARY_SYSTEM_BUILDER_LIMITS.minPlanetMassMearth}
                      onChange={(event) => updatePlanet(index, "mass", event.target.value)}
                      step="any"
                      type="number"
                      value={planet.mass}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="block font-semibold">Semimajor axis AU</span>
                    <input
                      aria-label={`Planet ${index + 1} semimajor axis AU`}
                      className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                      disabled={requestState === "loading"}
                      max={PLANETARY_SYSTEM_BUILDER_LIMITS.maxSemiMajorAxisAu}
                      min={PLANETARY_SYSTEM_BUILDER_LIMITS.minSemiMajorAxisAu}
                      onChange={(event) => updatePlanet(index, "axis", event.target.value)}
                      step="any"
                      type="number"
                      value={planet.axis}
                    />
                  </label>
                  <button
                    aria-label={`Remove planet ${index + 1}`}
                    className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 font-semibold"
                    disabled={
                      requestState === "loading" ||
                      draftPlanets.length <= PLANETARY_SYSTEM_BUILDER_LIMITS.minPlanetCount
                    }
                    onClick={() => removePlanet(index)}
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
                draftPlanets.length >= PLANETARY_SYSTEM_BUILDER_LIMITS.maxPlanetCount
              }
              onClick={addPlanet}
              type="button"
            >
              Add planet
            </button>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-md bg-[var(--accent)] px-5 font-semibold text-[var(--background)]"
              disabled={requestState === "loading"}
              type="submit"
            >
              {requestState === "loading" ? "Calculating…" : "Calculate system"}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              Reset illustrative preset
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
            No browser-generated fallback periods, HZ boundaries, or Hill diagnostics are
            substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="builder-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="builder-result-heading">
              Canonical system result
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. V1 returns one deterministic record per planet and
              one pairwise diagnostic per adjacent pair; it performs no n-body integration.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Reference HZ inner edge</p>
              <p className="mt-1 font-semibold">
                {format(calculation.habitable_zone.inner_edge_au, 7)} AU
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Reference HZ outer edge</p>
              <p className="mt-1 font-semibold">
                {format(calculation.habitable_zone.outer_edge_au, 7)} AU
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Returned planets</p>
              <p className="mt-1 font-semibold">{calculation.planets.length}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">Pairwise diagnostics</p>
              <p className="mt-1 font-semibold">{calculation.adjacent_pairs.length}</p>
            </div>
          </div>
          <p className="rounded-md border border-[var(--border-strong)] p-4 leading-7">
            {calculation.habitable_zone.habitability_note}
          </p>
          <SystemPlacementFigure result={calculation} />
          <PlanetResults result={calculation} />
          <PairwiseResults result={calculation} />
          <div className="grid gap-3 md:grid-cols-2">
            <p className="rounded-md border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
              {calculation.stellar_consistency_note}
            </p>
            <p className="rounded-md border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
              {calculation.stability_note} Further dynamical analysis is required for long-term
              multi-planet behavior.
            </p>
          </div>
        </section>
      )}

      <section
        aria-labelledby="builder-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="builder-model-heading">
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {PLANETARY_SYSTEM_BUILDER_DEFINITION.sampling_policy}
        </p>
        <details open>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {PLANETARY_SYSTEM_BUILDER_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {PLANETARY_SYSTEM_BUILDER_DEFINITION.limitations.map((item) => (
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
          Current committed browser state: {state.planets.length} planet
          {state.planets.length === 1 ? "" : "s"}; stellar controls{" "}
          {format(state.stellar_mass_msun)}
          {" M☉, "}
          {format(state.stellar_luminosity_lsun)} L☉,{" "}
          {format(state.stellar_effective_temperature_k)}
          {" K"}.
        </p>
      </section>
    </article>
  );
}
