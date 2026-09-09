"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requestEndpoint,
  seasonsSimulatorEndpoint,
  type SeasonsCalculationResponse,
} from "@lumina/api-client";

import {
  DEFAULT_SEASONS_STATE,
  SEASONS_DEFINITION,
  SEASONS_PRESETS,
  SEASONS_SOURCES,
  buildSeasonsVisualTransform,
  canonicalizeSeasonsOrbitalPosition,
  decodeSeasonsState,
  encodeSeasonsState,
  validateSeasonsCalculationResult,
  validateSeasonsState,
  type SeasonsEccentricityPreset,
  type SeasonsState,
  type SeasonsVisualTransform,
} from "../lib/simulations/seasons-simulator";
import type { AudienceMode } from "../lib/learning/content";
import { LearningModeSelector } from "./learning-mode-selector";

type SeasonsSimulatorViewProps = Readonly<{
  initialState: SeasonsState;
  initialStateInvalid: boolean;
  initialCalculation: SeasonsCalculationResponse | null;
  apiOrigin: string | null;
}>;

type NumericField = "axial_tilt_deg" | "orbital_position_deg" | "latitude_deg";
type RequestState = "idle" | "loading" | "unavailable";

const numericFieldLabels: Record<NumericField, string> = {
  axial_tilt_deg: "Axial tilt",
  orbital_position_deg: "Orbital position",
  latitude_deg: "Observer latitude",
};

const numericFieldRanges: Record<
  NumericField,
  Readonly<{ min: number; max: number; step: string; unit: string }>
> = {
  axial_tilt_deg: { min: 0, max: 90, step: "0.01", unit: "degrees" },
  orbital_position_deg: { min: 0, max: 360, step: "1", unit: "degrees" },
  latitude_deg: { min: -90, max: 90, step: "1", unit: "degrees" },
};

const modeCopy: Record<
  AudienceMode,
  Readonly<{ introduction: string; prompt: string; modelNote: string }>
> = {
  explorer: {
    introduction:
      "Change one input at a time and compare the selected latitude with its exact opposite. Look for the reversal in noon Sun height and geometric daylight.",
    prompt: "What changes when the same seasonal angle is viewed from the opposite hemisphere?",
    modelNote:
      "Explorer mode keeps the explanation compact. The calculation and cited model stay the same in every mode.",
  },
  student: {
    introduction:
      "Solar declination is the Sun's idealized north-south angle. Latitude and declination then determine local-noon zenith angle and the geometric day-length approximation.",
    prompt: "Why does a zero-tilt model keep equal-and-opposite latitudes geometrically symmetric?",
    modelNote:
      "Student mode foregrounds declination, incidence, geometric horizon, polar day, and polar night without adding weather or temperature claims.",
  },
  "deep-dive": {
    introduction:
      "The Python astronomy domain owns the deterministic model. This browser layer validates the versioned result and performs only disclosed visual-coordinate transforms.",
    prompt:
      "Why must eccentricity remain separate from the tilt-driven geometry at a fixed orbital angle?",
    modelNote:
      "Deep Dive mode exposes equations, validity domain, numerical policy, constants, provenance, and known-case references.",
  },
};

function formatAngle(value: number): string {
  return `${value.toFixed(1)}°`;
}

function formatDayLength(value: number | null): string {
  return value === null ? "horizon all day" : `${value.toFixed(1)} h`;
}

function formatFlux(value: number): string {
  const difference = (value - 1) * 100;
  return `${value.toFixed(4)}× (${difference >= 0 ? "+" : ""}${difference.toFixed(1)}%)`;
}

function endpointForState(state: SeasonsState) {
  const query = new URLSearchParams({
    axial_tilt_deg: String(state.axial_tilt_deg),
    orbital_position_deg: String(state.orbital_position_deg),
    latitude_deg: String(state.latitude_deg),
    eccentricity_preset: state.eccentricity_preset,
  });
  return { ...seasonsSimulatorEndpoint, path: `${seasonsSimulatorEndpoint.path}?${query}` };
}

function draftsForState(state: SeasonsState): Record<NumericField, string> {
  return {
    axial_tilt_deg: String(state.axial_tilt_deg),
    orbital_position_deg: String(state.orbital_position_deg),
    latitude_deg: String(state.latitude_deg),
  };
}

function SourceList({ sourceIds }: Readonly<{ sourceIds: ReadonlyArray<string> }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {sourceIds.map((sourceId) => {
        const source = SEASONS_SOURCES.find((candidate) => candidate.id === sourceId);
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

function replaceBrowserState(state: SeasonsState | null): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/seasons-simulator";
  if (state === null) url.searchParams.delete("state");
  else url.searchParams.set("state", encodeSeasonsState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(
  defaultState: SeasonsState,
): Readonly<{ state: SeasonsState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_SEASONS_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeSeasonsState(values[0]) : null;
  return decoded === null
    ? { state: defaultState, invalid: true }
    : { state: decoded, invalid: false };
}

function OrbitFigure({
  state,
  result,
  visual,
}: Readonly<{
  state: SeasonsState;
  result: SeasonsCalculationResponse;
  visual: SeasonsVisualTransform;
}>) {
  const orbit = visual.orbit;
  return (
    <figure className="space-y-3" data-testid="seasons-orbit-figure">
      <svg
        aria-labelledby="seasons-orbit-title seasons-orbit-desc"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 200 150"
      >
        <title id="seasons-orbit-title">Normalized seasonal orbit diagram</title>
        <desc id="seasons-orbit-desc">
          A schematic orbit with a labelled Sun focus, four seasonal phase markers, and the Earth
          position for {formatAngle(state.orbital_position_deg)}. The drawing is not to scale in
          kilometres.
        </desc>
        <ellipse
          cx="100"
          cy="75"
          fill="none"
          rx={orbit.major_radius_percent * 2}
          ry={orbit.minor_radius_percent * 1.5}
          stroke="var(--border-strong)"
          strokeWidth="1.5"
        />
        <circle
          cx={orbit.sun_x_percent * 2}
          cy={orbit.sun_y_percent * 1.5}
          fill="var(--focus)"
          r="5"
        />
        <text
          fill="var(--foreground)"
          fontSize="7"
          x={orbit.sun_x_percent * 2 - 12}
          y={orbit.sun_y_percent * 1.5 - 9}
        >
          Sun focus
        </text>
        <circle
          cx={orbit.earth_x_percent * 2}
          cy={orbit.earth_y_percent * 1.5}
          fill="var(--accent)"
          r="4"
        />
        <text
          fill="var(--foreground)"
          fontSize="7"
          x={orbit.earth_x_percent * 2 + 6}
          y={orbit.earth_y_percent * 1.5 + 3}
        >
          Earth
        </text>
        <text fill="var(--muted)" fontSize="7" x="96" y="12">
          90° June
        </text>
        <text fill="var(--muted)" fontSize="7" x="154" y="78">
          180° Sep
        </text>
        <text fill="var(--muted)" fontSize="7" x="91" y="143">
          270° Dec
        </text>
        <text fill="var(--muted)" fontSize="7" x="8" y="78">
          0° Mar
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        The orbit drawing is normalized and schematic. Earth&apos;s actual eccentricity stays nearly
        circular; the hypothetical exaggerated preset is shown with a more visibly compressed
        drawing as a disclosed visualization transform. It does not depict absolute distance or
        elapsed orbital time. Selected normalized distance:{" "}
        {result.distance_over_semimajor_axis.toFixed(4)} a.
      </figcaption>
    </figure>
  );
}

function IlluminationFigure({
  state,
  result,
  visual,
}: Readonly<{
  state: SeasonsState;
  result: SeasonsCalculationResponse;
  visual: SeasonsVisualTransform;
}>) {
  const illumination = visual.illumination;
  return (
    <figure className="space-y-3" data-testid="seasons-illumination-figure">
      <svg
        aria-labelledby="seasons-illumination-title seasons-illumination-desc"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 200 150"
      >
        <title id="seasons-illumination-title">Schematic Earth illumination view</title>
        <desc id="seasons-illumination-desc">
          Parallel schematic rays arrive from the left at a spherical Earth. A normalized axis and
          selected latitude are labelled; the numerical incidence angle is in the text result.
        </desc>
        <line
          stroke="var(--accent)"
          strokeDasharray="5 4"
          strokeWidth="1.5"
          x1="10"
          x2="190"
          y1="35"
          y2="35"
        />
        <line
          stroke="var(--accent)"
          strokeDasharray="5 4"
          strokeWidth="1.5"
          x1="10"
          x2="190"
          y1="58"
          y2="58"
        />
        <line
          stroke="var(--accent)"
          strokeDasharray="5 4"
          strokeWidth="1.5"
          x1="10"
          x2="190"
          y1="81"
          y2="81"
        />
        <circle
          cx="100"
          cy="75"
          fill="var(--surface)"
          r="39"
          stroke="var(--border-strong)"
          strokeWidth="1.5"
        />
        <ellipse
          cx="100"
          cy="75"
          fill="none"
          rx="39"
          ry="12"
          stroke="var(--muted)"
          strokeWidth="1"
        />
        <line
          stroke="var(--focus)"
          strokeWidth="2"
          x1={illumination.axis_x1_percent * 2}
          x2={illumination.axis_x2_percent * 2}
          y1={illumination.axis_y1_percent * 1.5}
          y2={illumination.axis_y2_percent * 1.5}
        />
        <line stroke="var(--foreground)" strokeWidth="1.5" x1="100" x2="141" y1="75" y2="75" />
        <circle cx="141" cy="75" fill="var(--accent)" r="3" />
        <text fill="var(--foreground)" fontSize="7" x="105" y="70">
          selected latitude
        </text>
        <text fill="var(--foreground)" fontSize="7" x="8" y="112">
          parallel rays (schematic)
        </text>
        <text fill="var(--focus)" fontSize="7" x="8" y="125">
          axis tilt {formatAngle(state.axial_tilt_deg)} (normalized drawing)
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        Rays are drawn parallel and are not a physical Sun-Earth distance. The incidence result is{" "}
        {formatAngle(result.selected.illumination_incidence_deg)} from the outward local surface
        normal at local solar noon; it is not a temperature or irradiance prediction.
      </figcaption>
    </figure>
  );
}

function GeometryTable({ result }: Readonly<{ result: SeasonsCalculationResponse }>) {
  return (
    <div
      aria-label="Seasons solar geometry comparison table"
      className="max-w-full overflow-x-auto rounded-md border border-[var(--border)]"
      role="region"
      tabIndex={0}
    >
      <table
        className="min-w-[48rem] w-full border-collapse text-left text-sm"
        data-testid="seasons-geometry-table"
      >
        <caption className="sr-only">
          Selected and equal-and-opposite latitude solar geometry. Values are also written in the
          surrounding text and do not depend on colour or the SVG diagrams.
        </caption>
        <thead className="bg-[var(--surface)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3" scope="col">
              Location
            </th>
            <th className="px-4 py-3" scope="col">
              Latitude
            </th>
            <th className="px-4 py-3" scope="col">
              Noon altitude
            </th>
            <th className="px-4 py-3" scope="col">
              Noon incidence angle from surface normal
            </th>
            <th className="px-4 py-3" scope="col">
              Geometric day length
            </th>
            <th className="px-4 py-3" scope="col">
              Polar state
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-[var(--border)]">
            <th className="px-4 py-3" scope="row">
              Selected latitude
            </th>
            <td className="px-4 py-3">{formatAngle(result.selected.latitude_deg)}</td>
            <td className="px-4 py-3">{formatAngle(result.selected.noon_sun_altitude_deg)}</td>
            <td className="px-4 py-3">{formatAngle(result.selected.illumination_incidence_deg)}</td>
            <td className="px-4 py-3">{formatDayLength(result.selected.day_length_hours)}</td>
            <td className="px-4 py-3">{result.selected.polar_state}</td>
          </tr>
          <tr className="border-t border-[var(--border)]">
            <th className="px-4 py-3" scope="row">
              Equal-and-opposite latitude
            </th>
            <td className="px-4 py-3">{formatAngle(result.opposite_hemisphere.latitude_deg)}</td>
            <td className="px-4 py-3">
              {formatAngle(result.opposite_hemisphere.noon_sun_altitude_deg)}
            </td>
            <td className="px-4 py-3">
              {formatAngle(result.opposite_hemisphere.illumination_incidence_deg)}
            </td>
            <td className="px-4 py-3">
              {formatDayLength(result.opposite_hemisphere.day_length_hours)}
            </td>
            <td className="px-4 py-3">{result.opposite_hemisphere.polar_state}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NumericControl({
  field,
  value,
  error,
  onChange,
}: Readonly<{
  field: NumericField;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}>) {
  const range = numericFieldRanges[field];
  const label = numericFieldLabels[field];
  const inputId = `seasons-${field}`;
  const rangeId = `seasons-${field}-range`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="font-semibold" htmlFor={inputId}>
          {label}
        </label>
        <span className="text-sm text-[var(--muted)]">
          {range.unit}; {range.min} to {range.max}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-describedby={`${helpId}${error === null ? "" : ` ${errorId}`}`}
          aria-invalid={error === null ? undefined : true}
          className="min-h-11 w-32 rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)]"
          id={inputId}
          inputMode="decimal"
          max={range.max}
          min={range.min}
          onChange={(event) => onChange(event.target.value)}
          step={range.step}
          type="number"
          value={value}
        />
        <input
          aria-label={`${label} slider`}
          aria-valuetext={`${value} ${range.unit}`}
          className="min-h-11 min-w-[12rem] flex-1 accent-[var(--accent)]"
          id={rangeId}
          max={range.max}
          min={range.min}
          onChange={(event) => onChange(event.target.value)}
          step={range.step}
          type="range"
          value={Number.isFinite(Number(value)) ? value : range.min}
        />
      </div>
      <p className="text-sm text-[var(--muted)]" id={helpId}>
        {field === "orbital_position_deg"
          ? "0° March equinox; 90° June solstice; 180° September equinox; 270° December solstice. A displayed 360° endpoint canonicalizes to 0°."
          : field === "latitude_deg"
            ? "North is positive and south is negative. The comparison is always the exact opposite latitude."
            : "Increasing tilt increases the idealized solar-declination excursion; values above 90° are outside v1."}
      </p>
      {error === null ? null : (
        <p className="text-sm font-semibold text-[var(--focus)]" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SeasonsSimulatorView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
}: SeasonsSimulatorViewProps) {
  const initialResult = useMemo(
    () => validateSeasonsCalculationResult(initialState, initialCalculation),
    [initialCalculation, initialState],
  );
  const [state, setState] = useState<SeasonsState>(initialState);
  const [calculation, setCalculation] = useState<SeasonsCalculationResponse | null>(initialResult);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>(
    initialResult === null ? "unavailable" : "idle",
  );
  const [requestMessage, setRequestMessage] = useState(
    initialResult === null ? "Calculation unavailable; no fallback result was substituted." : "",
  );
  const [drafts, setDrafts] = useState<Record<NumericField, string>>({
    axial_tilt_deg: String(initialState.axial_tilt_deg),
    orbital_position_deg: String(initialState.orbital_position_deg),
    latitude_deg: String(initialState.latitude_deg),
  });
  const [fieldError, setFieldError] = useState<Readonly<{
    field: NumericField;
    message: string;
  }> | null>(null);
  const [mode, setMode] = useState<AudienceMode>("explorer");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const generationRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);

  const recalculate = useCallback(
    (nextState: SeasonsState) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setRequestState("loading");
      setRequestMessage("");
      if (apiOrigin === null) {
        setRequestState("unavailable");
        setRequestMessage("Calculation unavailable because no safe API origin is configured.");
        return;
      }
      void (async () => {
        try {
          const response = await requestEndpoint(apiOrigin, endpointForState(nextState), {
            signal: controller.signal,
          });
          if (generation !== generationRef.current) return;
          if (response.kind !== "ok") {
            setRequestState("unavailable");
            setRequestMessage("Calculation unavailable; the last valid result remains visible.");
            return;
          }
          const validated = validateSeasonsCalculationResult(nextState, response.data);
          if (validated === null) {
            setRequestState("unavailable");
            setRequestMessage(
              "The calculation response was not accepted as the requested model state.",
            );
            return;
          }
          setCalculation(validated);
          setRequestState("idle");
          setRequestMessage("");
        } catch {
          if (generation !== generationRef.current) return;
          setRequestState("unavailable");
          setRequestMessage("Calculation unavailable; the last valid result remains visible.");
        } finally {
          if (requestRef.current === controller) requestRef.current = null;
        }
      })();
    },
    [apiOrigin],
  );

  useEffect(() => {
    const handlePopState = () => {
      const next = stateFromBrowser(initialState);
      setState(next.state);
      setDrafts(draftsForState(next.state));
      setInvalidNotice(next.invalid);
      setFieldError(null);
      setShareUrl(null);
      recalculate(next.state);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      requestRef.current?.abort();
    };
  }, [initialState, recalculate]);

  const applyState = useCallback(
    (nextState: SeasonsState) => {
      setState(nextState);
      setDrafts(draftsForState(nextState));
      setInvalidNotice(false);
      setFieldError(null);
      setShareUrl(null);
      setShareMessage("");
      replaceBrowserState(nextState);
      recalculate(nextState);
    },
    [recalculate],
  );

  const updateNumericField = useCallback(
    (field: NumericField, rawValue: string) => {
      setDrafts((current) => ({ ...current, [field]: rawValue }));
      if (rawValue.trim() === "") {
        setFieldError({ field, message: `${numericFieldLabels[field]} must be a finite number.` });
        return;
      }
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        setFieldError({ field, message: `${numericFieldLabels[field]} must be a finite number.` });
        return;
      }
      const normalizedValue =
        field === "orbital_position_deg"
          ? canonicalizeSeasonsOrbitalPosition(numericValue)
          : numericValue;
      if (normalizedValue === null) {
        setFieldError({
          field,
          message: `${numericFieldLabels[field]} is outside the v1 valid range.`,
        });
        return;
      }
      const nextState = validateSeasonsState({ ...state, [field]: normalizedValue });
      if (nextState === null) {
        setFieldError({
          field,
          message: `${numericFieldLabels[field]} is outside the v1 valid range.`,
        });
        return;
      }
      applyState(nextState);
    },
    [applyState, state],
  );

  const updatePreset = useCallback(
    (preset: string) => {
      if (SEASONS_PRESETS[preset as SeasonsEccentricityPreset] === undefined) return;
      const nextState = validateSeasonsState({ ...state, eccentricity_preset: preset });
      if (nextState !== null) applyState(nextState);
    },
    [applyState, state],
  );

  const handleReset = useCallback(() => {
    replaceBrowserState(null);
    setState(DEFAULT_SEASONS_STATE);
    setDrafts(draftsForState(DEFAULT_SEASONS_STATE));
    setInvalidNotice(false);
    setFieldError(null);
    setShareUrl(null);
    setShareMessage("Seasons Simulator reset to its June-solstice default.");
    recalculate(DEFAULT_SEASONS_STATE);
  }, [recalculate]);

  const handleShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.pathname = "/lab/seasons-simulator";
    url.searchParams.set("state", encodeSeasonsState(state));
    const serialized = url.toString();
    setShareUrl(serialized);
    try {
      if (typeof navigator.clipboard !== "undefined") {
        await navigator.clipboard.writeText(serialized);
        setShareMessage("Share link copied. It contains only the versioned simulator inputs.");
        return;
      }
    } catch {
      // The visible link remains available for manual copying.
    }
    setShareMessage("Share link ready below. Copy it manually; no personal data is included.");
  }, [state]);

  const visual = calculation === null ? null : buildSeasonsVisualTransform(state, calculation);
  const copy = modeCopy[mode];

  return (
    <article className="space-y-12">
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm text-[var(--muted)]">
          <li>Space Lab</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Seasons Simulator</li>
        </ol>
      </nav>

      <header className="max-w-4xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 3B / Vertical 2
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Seasons Simulator</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          See how axial tilt and seasonal orbital position change solar declination, local-noon Sun
          height, incidence, and geometric daylight between equal-and-opposite latitudes. Distance
          variation is shown separately as context, not as the cause of opposite-hemisphere seasons.
        </p>
      </header>

      <LearningModeSelector onChange={setMode} />

      {invalidNotice ? (
        <aside
          aria-labelledby="invalid-seasons-state-heading"
          className="max-w-4xl space-y-3 rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
          role="alert"
        >
          <h2 id="invalid-seasons-state-heading">
            The shared Seasons Simulator state was not valid
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Lumina rejected the model version, exact field set, value range, or canonical serialized
            form. The separately labelled default state is shown until you choose a new valid state.
          </p>
          <button
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
            onClick={handleReset}
            type="button"
          >
            Reset to default state
          </button>
        </aside>
      ) : null}

      <section aria-labelledby="seasons-objective-heading" className="max-w-4xl space-y-4">
        <h2 id="seasons-objective-heading">What this lab demonstrates</h2>
        <p className="leading-7 text-[var(--muted)]">{copy.introduction}</p>
        <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 leading-7 text-[var(--foreground)]">
          <strong>Think about:</strong> {copy.prompt}
        </p>
        <ul className="m-0 grid list-disc gap-2 pl-6 leading-7 text-[var(--muted)]">
          {SEASONS_DEFINITION.learning_objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
        <p className="text-sm leading-6 text-[var(--muted)]">{copy.modelNote}</p>
      </section>

      <section aria-labelledby="seasons-controls-heading" className="max-w-4xl space-y-6">
        <div className="space-y-2">
          <h2 id="seasons-controls-heading">Choose model inputs</h2>
          <p className="leading-7 text-[var(--muted)]">
            Inputs use degrees except for the closed eccentricity preset. A valid update requests a
            fresh canonical result; while it is loading, the last valid output remains visible.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {(Object.keys(numericFieldLabels) as NumericField[]).map((field) => (
            <NumericControl
              error={fieldError?.field === field ? fieldError.message : null}
              field={field}
              key={field}
              onChange={(value) => updateNumericField(field, value)}
              value={drafts[field]}
            />
          ))}
        </div>
        <div className="space-y-2">
          <label className="font-semibold" htmlFor="seasons-eccentricity-preset">
            Eccentricity context preset
          </label>
          <select
            className="min-h-11 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)]"
            id="seasons-eccentricity-preset"
            onChange={(event) => updatePreset(event.target.value)}
            value={state.eccentricity_preset}
          >
            <option value="circular">Circular orbit (e = 0.0)</option>
            <option value="earth">Earth preset (e = 0.01671123)</option>
            <option value="exaggerated">Exaggerated hypothetical (e = 0.10)</option>
          </select>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Eccentricity changes only normalized distance and inverse-square flux context at a fixed
            orbital position. It does not feed the declination, incidence, day-length, or hemisphere
            comparison calculation.
          </p>
        </div>
        <div className="flex flex-wrap gap-3" role="group" aria-label="Seasonal phase presets">
          {[0, 90, 180, 270].map((position) => (
            <button
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-[var(--surface-hover)]"
              key={position}
              onClick={() => updateNumericField("orbital_position_deg", String(position))}
              type="button"
            >
              {position === 0
                ? "March equinox"
                : position === 90
                  ? "June solstice"
                  : position === 180
                    ? "September equinox"
                    : "December solstice"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
            onClick={handleReset}
            type="button"
          >
            Reset
          </button>
          <button
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
            onClick={() => void handleShare()}
            type="button"
          >
            Share state
          </button>
          <span aria-live="polite" className="text-sm text-[var(--muted)]" role="status">
            {requestState === "loading"
              ? "Calculating the canonical model result…"
              : requestMessage || shareMessage}
          </span>
        </div>
        {shareUrl === null ? null : (
          <p className="max-w-4xl break-all rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
            Share URL:{" "}
            <a className="text-[var(--link)] underline" href={shareUrl}>
              {shareUrl}
            </a>
          </p>
        )}
      </section>

      <section aria-labelledby="seasons-results-heading" className="max-w-5xl space-y-6">
        <div className="space-y-2">
          <h2 id="seasons-results-heading">Canonical model result</h2>
          <p className="leading-7 text-[var(--muted)]">
            The result is calculated by{" "}
            <code>{calculation?.model_version ?? "seasons-simulator-v1"}</code> in the Python
            astronomy domain. Angles are shown to one decimal place and day length to one decimal
            hour; the underlying response retains deterministic double-precision values.
          </p>
        </div>
        {calculation === null ? (
          <div
            className="rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
            role="alert"
          >
            <h3>Calculation unavailable</h3>
            <p className="mt-2 leading-7 text-[var(--muted)]">
              No scientific fallback was substituted. Check the connection and change an input to
              try the read-only calculation boundary again.
            </p>
          </div>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <dt className="text-sm text-[var(--muted)]">Solar declination</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatAngle(calculation.solar_declination_deg)}
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <dt className="text-sm text-[var(--muted)]">Selected noon altitude</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatAngle(calculation.selected.noon_sun_altitude_deg)}
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <dt className="text-sm text-[var(--muted)]">Selected day length</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatDayLength(calculation.selected.day_length_hours)}
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <dt className="text-sm text-[var(--muted)]">Relative distance flux</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatFlux(calculation.relative_solar_flux)}
                </dd>
              </div>
            </dl>
            <p className="leading-7 text-[var(--muted)]">
              The equal-and-opposite comparison is{" "}
              {formatAngle(calculation.comparison_latitude_deg)}. Noon incidence is measured from
              the outward surface normal; a value above 90° means the Sun&apos;s centre is below the
              geometric horizon even at local noon.
            </p>
            <GeometryTable result={calculation} />
          </>
        )}
      </section>

      {calculation !== null && visual !== null ? (
        <section aria-labelledby="seasons-visualization-heading" className="max-w-5xl space-y-6">
          <div className="space-y-2">
            <h2 id="seasons-visualization-heading">Schematic geometry views</h2>
            <p className="leading-7 text-[var(--muted)]">
              These accessible SVGs are subordinate to the numeric result. Their normalized pixels,
              axis drawing, orbit compression, and parallel rays are visualization choices, not
              physical scale geometry.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <OrbitFigure result={calculation} state={state} visual={visual} />
            <IlluminationFigure result={calculation} state={state} visual={visual} />
          </div>
        </section>
      ) : null}

      {calculation !== null ? (
        <section aria-labelledby="seasons-distance-heading" className="max-w-4xl space-y-5">
          <h2 id="seasons-distance-heading">Distance context is separate</h2>
          <p className="leading-7 text-[var(--muted)]">
            At this fixed orbital angle, changing the eccentricity preset changes the normalized
            Earth-Sun distance ({calculation.distance_over_semimajor_axis.toFixed(4)} a) and the
            inverse-square context ({formatFlux(calculation.relative_solar_flux)}). The declination,
            noon geometry, day length, polar state, and opposite-hemisphere geometry remain tied to
            tilt, orbital position, and latitude. Set axial tilt to 0° to see the required teaching
            comparison: distance can vary while the geometric seasons disappear.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="seasons-model-heading" className="max-w-5xl space-y-6">
        <h2 id="seasons-model-heading">Model, assumptions, validity, and provenance</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3>Equations and relationships</h3>
            <dl className="space-y-3 text-sm leading-6 text-[var(--muted)]">
              {Object.entries(SEASONS_DEFINITION.calculation_module.equations).map(
                ([name, equation]) => (
                  <div key={name}>
                    <dt className="font-semibold text-[var(--foreground)]">
                      {name.replaceAll("_", " ")}
                    </dt>
                    <dd className="mt-1 break-words font-mono text-xs">{equation}</dd>
                  </div>
                ),
              )}
            </dl>
          </div>
          <div className="space-y-4">
            <h3>Inputs and validity domain</h3>
            <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
              <li>Axial tilt: 0° through 90° inclusive.</li>
              <li>
                Orbital position: 0° inclusive through 360° exclusive; 360° is a UI endpoint that
                canonicalizes to 0°.
              </li>
              <li>Latitude: −90° through +90° inclusive; north is positive.</li>
              <li>
                Eccentricity: circular, Earth, or exaggerated preset only; no arbitrary eccentricity
                or perihelion orientation.
              </li>
              <li>
                Python double precision; arithmetic tolerances do not claim observational accuracy.
              </li>
            </ul>
            <h3>Assumptions</h3>
            <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
              {SEASONS_DEFINITION.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-3">
          <h3>Limitations and disclosures</h3>
          <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
            {SEASONS_DEFINITION.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <p className="text-sm leading-6 text-[var(--muted)]">
            No animation is required. If a future phase adds motion, it must be stoppable, honor
            reduced-motion preferences, and be labelled an orbital phase sweep rather than elapsed
            calendar time.
          </p>
        </div>
        <div className="space-y-3">
          <h3>Reviewed scientific sources</h3>
          <SourceList sourceIds={SEASONS_DEFINITION.references} />
          <p className="text-sm leading-6 text-[var(--muted)]">
            NOAA&apos;s fractional-year declination polynomial is not the Lumina v1 calculation.
            NOAA is included only as supporting comparison for general solar-position terminology
            and why real sunrise calculations include corrections excluded here.
          </p>
        </div>
      </section>

      <p className="text-sm leading-6 text-[var(--muted)]">
        Want another reviewed scale model?{" "}
        <Link className="text-[var(--link)] underline" href="/lab/scale-explorer">
          Open Scale Explorer
        </Link>
        .
      </p>
    </article>
  );
}
