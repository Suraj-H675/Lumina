"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requestEndpoint,
  telescopeBuilderEndpoint,
  type TelescopeBuilderCalculationResponse,
} from "@lumina/api-client";

import {
  DEFAULT_TELESCOPE_BUILDER_STATE,
  OPTICAL_MODIFIER_KINDS,
  TELESCOPE_BUILDER_SHARE_STATE_MAX_CHARS,
  TELESCOPE_BUILDER_MODEL_VERSION,
  TELESCOPE_CONSTANTS,
  TELESCOPE_DEFINITION,
  TELESCOPE_PRESETS,
  TELESCOPE_SOURCES,
  TELESCOPE_WARNING_COPY,
  buildTelescopeBuilderVisualTransform,
  decodeTelescopeBuilderState,
  encodeTelescopeBuilderState,
  validateTelescopeBuilderCalculationResult,
  validateTelescopeBuilderState,
  type OpticalModifierKind,
  type TelescopeBuilderState,
  type TelescopeBuilderVisualTransform,
  type TelescopeType,
} from "../lib/simulations/telescope-builder";
import type { AudienceMode } from "../lib/learning/content";
import { LearningModeSelector } from "./learning-mode-selector";

type TelescopeBuilderViewProps = Readonly<{
  initialState: TelescopeBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: TelescopeBuilderCalculationResponse | null;
  apiOrigin: string | null;
}>;

type NumericField =
  | "aperture_mm"
  | "telescope_focal_length_mm"
  | "eyepiece_focal_length_mm"
  | "eyepiece_apparent_field_deg"
  | "optical_modifier_factor"
  | "target_angular_size_arcmin";

type DraftState = Readonly<{
  aperture_mm: string;
  telescope_focal_length_mm: string;
  telescope_type: TelescopeType;
  eyepiece_focal_length_mm: string;
  eyepiece_apparent_field_deg: string;
  optical_modifier_kind: OpticalModifierKind;
  optical_modifier_factor: string;
  target_angular_size_arcmin: string;
}>;

type RequestState = "idle" | "loading" | "unavailable";

type RecalculateOptions = Readonly<{
  commit?: boolean;
  reportInvalidState?: boolean;
}>;

const numericFieldLabels: Record<NumericField, string> = {
  aperture_mm: "Aperture",
  telescope_focal_length_mm: "Native telescope focal length",
  eyepiece_focal_length_mm: "Eyepiece focal length",
  eyepiece_apparent_field_deg: "Eyepiece apparent field",
  optical_modifier_factor: "Effective modifier factor",
  target_angular_size_arcmin: "Target angular extent",
};

const numericFieldRanges: Record<
  Exclude<NumericField, "optical_modifier_factor">,
  Readonly<{
    min: number;
    max: number;
    step: string;
    unit: string;
  }>
> = {
  aperture_mm: { min: 20, max: 1000, step: "1", unit: "mm" },
  telescope_focal_length_mm: { min: 100, max: 10000, step: "1", unit: "mm" },
  eyepiece_focal_length_mm: { min: 1, max: 60, step: "0.1", unit: "mm" },
  eyepiece_apparent_field_deg: { min: 30, max: 120, step: "1", unit: "degrees" },
  target_angular_size_arcmin: { min: 0.01, max: 600, step: "0.01", unit: "arcminutes" },
};

const modeCopy: Record<
  AudienceMode,
  Readonly<{ introduction: string; prompt: string; modelNote: string }>
> = {
  explorer: {
    introduction:
      "Change one optical input at a time and watch which quantities follow aperture, focal length, or the eyepiece.",
    prompt:
      "What changes when the same telescope receives a Barlow, reducer, or different eyepiece?",
    modelNote:
      "Explorer mode keeps the explanation compact. The canonical result and model boundaries are unchanged.",
  },
  student: {
    introduction:
      "Aperture sets the clear-aperture reference limits and collecting-area ratio; focal lengths and apparent field shape the visual geometry.",
    prompt:
      "Why can a modifier change magnification and field without changing the aperture-only resolution references?",
    modelNote:
      "Student mode foregrounds the relationships and the narrow meaning of target fit without adding brightness or visibility claims.",
  },
  "deep-dive": {
    introduction:
      "The Python astronomy domain owns every optical calculation. The browser validates the versioned response and applies only disclosed schematic transforms.",
    prompt:
      "Which inputs are descriptive, which are focal-length controls, and which outputs are deliberately only reference quantities?",
    modelNote:
      "Deep Dive mode exposes equations, constants, validity domain, warnings, limitations, provenance, and literal fixtures.",
  },
};

function format(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function draftsForState(state: TelescopeBuilderState): DraftState {
  return {
    aperture_mm: String(state.aperture_mm),
    telescope_focal_length_mm: String(state.telescope_focal_length_mm),
    telescope_type: state.telescope_type,
    eyepiece_focal_length_mm: String(state.eyepiece_focal_length_mm),
    eyepiece_apparent_field_deg: String(state.eyepiece_apparent_field_deg),
    optical_modifier_kind: state.optical_modifier_kind,
    optical_modifier_factor: String(state.optical_modifier_factor),
    target_angular_size_arcmin: String(state.target_angular_size_arcmin),
  };
}

function endpointForState(state: TelescopeBuilderState) {
  const query = new URLSearchParams({
    aperture_mm: String(state.aperture_mm),
    telescope_focal_length_mm: String(state.telescope_focal_length_mm),
    telescope_type: state.telescope_type,
    eyepiece_focal_length_mm: String(state.eyepiece_focal_length_mm),
    eyepiece_apparent_field_deg: String(state.eyepiece_apparent_field_deg),
    optical_modifier_kind: state.optical_modifier_kind,
    optical_modifier_factor: String(state.optical_modifier_factor),
    target_angular_size_arcmin: String(state.target_angular_size_arcmin),
  });
  return { ...telescopeBuilderEndpoint, path: `${telescopeBuilderEndpoint.path}?${query}` };
}

function replaceBrowserState(state: TelescopeBuilderState | null): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/telescope-builder";
  if (state === null) url.searchParams.delete("state");
  else url.searchParams.set("state", encodeTelescopeBuilderState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(
  defaultState: TelescopeBuilderState,
): Readonly<{ state: TelescopeBuilderState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: defaultState, invalid: false };
  const decoded = values.length === 1 ? decodeTelescopeBuilderState(values[0]) : null;
  return decoded === null
    ? { state: defaultState, invalid: true }
    : { state: decoded, invalid: false };
}

function modifierFactorRange(kind: OpticalModifierKind): Readonly<{
  min: number;
  max: number;
  step: string;
  unit: string;
}> {
  if (kind === "barlow") return { min: 1.1, max: 5, step: "0.1", unit: "×" };
  if (kind === "reducer") return { min: 0.5, max: 0.95, step: "0.01", unit: "×" };
  return { min: 1, max: 1, step: "1", unit: "×" };
}

function SourceList({ sourceIds }: Readonly<{ sourceIds: ReadonlyArray<string> }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {sourceIds.map((sourceId) => {
        const source = TELESCOPE_SOURCES.find((candidate) => candidate.id === sourceId);
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

function NumericControl({
  field,
  value,
  error,
  onChange,
  range,
  help,
  disabled = false,
}: Readonly<{
  field: NumericField;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  range: Readonly<{ min: number; max: number; step: string; unit: string }>;
  help: string;
  disabled?: boolean;
}>) {
  const label = numericFieldLabels[field];
  const inputId = `telescope-${field}`;
  const sliderId = `${inputId}-slider`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const sliderValue = Number(value);
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
          className="min-h-11 w-36 rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
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
          className="min-h-11 min-w-[12rem] flex-1 accent-[var(--accent)] disabled:opacity-60"
          disabled={disabled}
          id={sliderId}
          max={range.max}
          min={range.min}
          onChange={(event) => onChange(event.target.value)}
          step={range.step}
          type="range"
          value={Number.isFinite(sliderValue) ? value : range.min}
        />
      </div>
      <p className="text-sm leading-6 text-[var(--muted)]" id={helpId}>
        {help}
      </p>
      {error === null ? null : (
        <p className="text-sm font-semibold text-[var(--focus)]" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function OpticalTrainFigure({
  state,
  result,
  visual,
}: Readonly<{
  state: TelescopeBuilderState;
  result: TelescopeBuilderCalculationResponse;
  visual: TelescopeBuilderVisualTransform;
}>) {
  const train = visual.opticalTrain;
  return (
    <figure className="space-y-3" data-testid="telescope-optical-train-figure">
      <svg
        aria-labelledby="telescope-optical-train-title telescope-optical-train-desc"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 200 115"
      >
        <title id="telescope-optical-train-title">Schematic visual optical train</title>
        <desc id="telescope-optical-train-desc">
          A schematic aperture, telescope tube, optional {state.optical_modifier_kind} modifier, and
          eyepiece. Native and effective focal lengths are written below; the drawing is not to
          physical scale.
        </desc>
        <line stroke="var(--muted)" strokeWidth="1.5" x1="12" x2="184" y1="50" y2="50" />
        <rect
          fill="var(--surface)"
          height="36"
          rx="4"
          stroke="var(--border-strong)"
          width={train.telescope_width_percent * 1.5}
          x={train.telescope_x_percent * 1.5}
          y="32"
        />
        <line
          stroke="var(--accent)"
          strokeWidth="5"
          x1={train.aperture_x_percent * 1.5}
          x2={train.aperture_x_percent * 1.5}
          y1="29"
          y2="71"
        />
        {train.modifier_x_percent === null ? null : (
          <rect
            fill="var(--focus)"
            height="28"
            rx="3"
            width="8"
            x={train.modifier_x_percent * 1.5}
            y="36"
          />
        )}
        <rect
          fill="var(--accent)"
          height="24"
          rx="3"
          width="9"
          x={train.eyepiece_x_percent * 1.5}
          y="38"
        />
        <text fill="var(--foreground)" fontSize="7" x="8" y="17">
          aperture
        </text>
        <text fill="var(--foreground)" fontSize="7" x="53" y="24">
          telescope
        </text>
        <text fill="var(--foreground)" fontSize="7" x="162" y="28">
          eyepiece
        </text>
        {train.modifier_x_percent === null ? null : (
          <text fill="var(--foreground)" fontSize="7" x="110" y="18">
            {state.optical_modifier_kind}
          </text>
        )}
        <text fill="var(--muted)" fontSize="7" x="10" y="91">
          {train.native_focal_length_label}; {train.effective_focal_length_label}
        </text>
        <text fill="var(--muted)" fontSize="7" x="10" y="103">
          schematic only · {result.inputs.telescope_type} is descriptive in v1
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        Optical train drawing is schematic, not to physical scale. The modifier represents the
        supplied effective factor; it is not a ray trace or a real product prescription.
      </figcaption>
    </figure>
  );
}

function FieldFitFigure({
  result,
  visual,
}: Readonly<{
  result: TelescopeBuilderCalculationResponse;
  visual: TelescopeBuilderVisualTransform;
}>) {
  const field = visual.field;
  const fits = !field.target_exceeds_field;
  const targetRadius = (field.target_diameter_percent / 100) * 35;
  return (
    <figure className="space-y-3" data-testid="telescope-field-fit-figure">
      <svg
        aria-labelledby="telescope-field-fit-title telescope-field-fit-desc"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 200 140"
      >
        <title id="telescope-field-fit-title">Approximate field and target extent comparison</title>
        <desc id="telescope-field-fit-desc">
          A schematic approximate field circle and a target extent marker. The numeric target field
          fraction is authoritative; the marker is not a target photograph or morphology.
        </desc>
        <circle cx="100" cy="64" fill="none" r="35" stroke="var(--border-strong)" strokeWidth="2" />
        <text fill="var(--foreground)" fontSize="8" x="82" y="20">
          approximate field
        </text>
        {fits ? (
          <circle
            cx="100"
            cy="64"
            fill="var(--surface)"
            fillOpacity="0.85"
            r={Math.max(2, targetRadius)}
            stroke="var(--accent)"
            strokeWidth="2"
          />
        ) : (
          <>
            <line stroke="var(--focus)" strokeWidth="3" x1="20" x2="180" y1="64" y2="64" />
            <path
              d="M 20 64 l 10 -6 M 20 64 l 10 6 M 180 64 l -10 -6 M 180 64 l -10 6"
              fill="none"
              stroke="var(--focus)"
              strokeWidth="2"
            />
            <text fill="var(--focus)" fontSize="9" textAnchor="middle" x="100" y="99">
              target extends beyond field
            </text>
          </>
        )}
        <text fill="var(--muted)" fontSize="8" textAnchor="middle" x="100" y="119">
          target extent = {format(result.target_field_fraction * 100, 1)}% of field diameter
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        The field circle and target marker are proportional schematic geometry only. A target that
        fits the approximate angular field is not thereby visible, resolved, bright, or well framed.
      </figcaption>
    </figure>
  );
}

function ResultsTable({ result }: Readonly<{ result: TelescopeBuilderCalculationResponse }>) {
  const rows: ReadonlyArray<Readonly<{ label: string; value: string }>> = [
    { label: "Effective focal length", value: `${format(result.effective_focal_length_mm)} mm` },
    { label: "Native focal ratio", value: `f/${format(result.native_focal_ratio)}` },
    { label: "Effective focal ratio", value: `f/${format(result.effective_focal_ratio)}` },
    { label: "Magnification", value: `${format(result.magnification_x, 1)}×` },
    {
      label: "Approximate true field",
      value: `${format(result.approx_true_field_deg)}°`,
    },
    { label: "Exit pupil", value: `${format(result.exit_pupil_mm)} mm` },
    {
      label: "Dawes empirical visual double-star reference",
      value: `${format(result.dawes_limit_arcsec)} arcsec`,
    },
    {
      label: "Rayleigh clear-circular-aperture reference",
      value: `${format(result.rayleigh_limit_arcsec)} arcsec`,
    },
    {
      label: "Ideal collecting-area ratio vs 7 mm reference pupil",
      value: `${format(result.ideal_light_gathering_ratio_vs_7mm_pupil, 1)}×`,
    },
    { label: "Target angular size", value: `${format(result.target_angular_size_deg)}°` },
    {
      label: "Target field fraction",
      value: `${format(result.target_field_fraction * 100, 1)}%`,
    },
    { label: "Target fit", value: result.target_fit },
  ];
  return (
    <div
      aria-label="Telescope Builder canonical result table"
      className="max-w-full overflow-x-auto rounded-md border border-[var(--border)]"
      role="region"
      tabIndex={0}
    >
      <table
        className="min-w-[34rem] w-full border-collapse text-left text-sm"
        data-testid="telescope-results-table"
      >
        <caption className="sr-only">
          Canonical numeric Telescope Builder outputs. The table is authoritative and independent of
          colour, animation, or SVG.
        </caption>
        <thead className="bg-[var(--surface)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3" scope="col">
              Quantity
            </th>
            <th className="px-4 py-3" scope="col">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-[var(--border)]" key={row.label}>
              <th className="px-4 py-3" scope="row">
                {row.label}
              </th>
              <td className="px-4 py-3">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TelescopeBuilderView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
}: TelescopeBuilderViewProps) {
  const initialResult = useMemo(
    () => validateTelescopeBuilderCalculationResult(initialState, initialCalculation),
    [initialCalculation, initialState],
  );
  const [state, setState] = useState<TelescopeBuilderState>(initialState);
  const [drafts, setDrafts] = useState<DraftState>(() => draftsForState(initialState));
  const [calculation, setCalculation] = useState<TelescopeBuilderCalculationResponse | null>(
    initialResult,
  );
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>(
    initialResult === null ? "unavailable" : "idle",
  );
  const [requestMessage, setRequestMessage] = useState(
    initialResult === null ? "Calculation unavailable; no fallback result was substituted." : "",
  );
  const [fieldError, setFieldError] = useState<Readonly<{
    field: NumericField | null;
    message: string;
  }> | null>(null);
  const [mode, setMode] = useState<AudienceMode>("explorer");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const generationRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);

  const recalculate = useCallback(
    (nextState: TelescopeBuilderState, options: RecalculateOptions = {}) => {
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
          if (response.kind === "http-error" && response.status === 422) {
            if (options.reportInvalidState === true) setInvalidNotice(true);
            setRequestState("idle");
            setFieldError({
              field: null,
              message:
                "The canonical Telescope Builder model rejected this configuration. Check the native focal ratio, modifier factor, and magnification; the last valid result remains visible.",
            });
            setRequestMessage("");
            return;
          }
          if (response.kind !== "ok") {
            setRequestState("unavailable");
            setRequestMessage("Calculation unavailable; the last valid result remains visible.");
            return;
          }
          const validated = validateTelescopeBuilderCalculationResult(nextState, response.data);
          if (validated === null) {
            setRequestState("unavailable");
            setRequestMessage(
              "The calculation response was not accepted as the requested model state.",
            );
            return;
          }
          setCalculation(validated);
          if (options.commit === true) {
            setState(nextState);
            setDrafts(draftsForState(nextState));
            replaceBrowserState(nextState);
          }
          setInvalidNotice(false);
          setFieldError(null);
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
      setDrafts(draftsForState(next.state));
      setInvalidNotice(next.invalid);
      setFieldError(null);
      setShareUrl(null);
      setShareMessage("");
      if (next.invalid) {
        setState(DEFAULT_TELESCOPE_BUILDER_STATE);
        recalculate(DEFAULT_TELESCOPE_BUILDER_STATE);
      } else {
        recalculate(next.state, { commit: true, reportInvalidState: true });
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      requestRef.current?.abort();
    };
  }, [initialState, recalculate]);

  const applyState = useCallback(
    (nextState: TelescopeBuilderState) => {
      setDrafts(draftsForState(nextState));
      setInvalidNotice(false);
      setFieldError(null);
      setShareUrl(null);
      setShareMessage("");
      recalculate(nextState, { commit: true });
    },
    [recalculate],
  );

  const updateDraft = useCallback(<K extends keyof DraftState>(field: K, value: DraftState[K]) => {
    setDrafts((current) => ({ ...current, [field]: value }));
    setFieldError(null);
  }, []);

  const applyDraft = useCallback(() => {
    const numericFields: ReadonlyArray<NumericField> = [
      "aperture_mm",
      "telescope_focal_length_mm",
      "eyepiece_focal_length_mm",
      "eyepiece_apparent_field_deg",
      "optical_modifier_factor",
      "target_angular_size_arcmin",
    ];
    const values: Record<string, unknown> = { ...drafts };
    for (const field of numericFields) {
      if (drafts[field].trim() === "" || !Number.isFinite(Number(drafts[field]))) {
        setFieldError({ field, message: `${numericFieldLabels[field]} must be a finite number.` });
        return;
      }
      values[field] = Number(drafts[field]);
    }
    const nextState = validateTelescopeBuilderState({
      version: 1,
      model_version: TELESCOPE_BUILDER_MODEL_VERSION,
      aperture_mm: values.aperture_mm,
      telescope_focal_length_mm: values.telescope_focal_length_mm,
      telescope_type: drafts.telescope_type,
      eyepiece_focal_length_mm: values.eyepiece_focal_length_mm,
      eyepiece_apparent_field_deg: values.eyepiece_apparent_field_deg,
      optical_modifier_kind: drafts.optical_modifier_kind,
      optical_modifier_factor: values.optical_modifier_factor,
      target_angular_size_arcmin: values.target_angular_size_arcmin,
    });
    if (nextState === null) {
      setFieldError({
        field: null,
        message:
          "This configuration is outside the v1 input ranges or modifier rules. Check the numeric fields and selected modifier before calculating.",
      });
      return;
    }
    applyState(nextState);
  }, [applyState, drafts]);

  const handleReset = useCallback(() => {
    replaceBrowserState(null);
    setState(DEFAULT_TELESCOPE_BUILDER_STATE);
    setDrafts(draftsForState(DEFAULT_TELESCOPE_BUILDER_STATE));
    setInvalidNotice(false);
    setFieldError(null);
    setShareUrl(null);
    setShareMessage("Telescope Builder reset to the balanced-reference default.");
    recalculate(DEFAULT_TELESCOPE_BUILDER_STATE);
  }, [recalculate]);

  const handleShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.pathname = "/lab/telescope-builder";
    const encoded = encodeTelescopeBuilderState(state);
    if (encoded.length > TELESCOPE_BUILDER_SHARE_STATE_MAX_CHARS) {
      setShareMessage("This state is too long to share safely.");
      return;
    }
    url.searchParams.set("state", encoded);
    const serialized = url.toString();
    setShareUrl(serialized);
    try {
      if (typeof navigator.clipboard !== "undefined") {
        await navigator.clipboard.writeText(serialized);
        setShareMessage("Share link copied. It contains only the versioned optical inputs.");
        return;
      }
    } catch {
      // The visible link remains available for manual copying.
    }
    setShareMessage("Share link ready below. Copy it manually; no personal data is included.");
  }, [state]);

  const visual =
    calculation === null ? null : buildTelescopeBuilderVisualTransform(state, calculation);
  const copy = modeCopy[mode];
  const factorRange = modifierFactorRange(drafts.optical_modifier_kind);

  return (
    <article className="space-y-12">
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm text-[var(--muted)]">
          <li>Space Lab</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Telescope Builder</li>
        </ol>
      </nav>

      <header className="max-w-4xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 3B / Vertical 3
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Telescope Builder</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Explore idealized visual-observing geometry: aperture, focal lengths, apparent field,
          modifiers, magnification, approximate field, exit pupil, and aperture-based reference
          limits. The result is not a product recommendation or a guaranteed view.
        </p>
      </header>

      <LearningModeSelector onChange={setMode} />

      {invalidNotice ? (
        <aside
          aria-labelledby="invalid-telescope-state-heading"
          className="max-w-4xl space-y-3 rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
          role="alert"
        >
          <h2 id="invalid-telescope-state-heading">
            The shared Telescope Builder state was not valid
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Lumina rejected the model version, exact field set, value range, relational constraint,
            or canonical serialized form. The separately labelled default state is shown until you
            choose a new valid state.
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

      <section aria-labelledby="telescope-objective-heading" className="max-w-4xl space-y-4">
        <h2 id="telescope-objective-heading">What this lab demonstrates</h2>
        <p className="leading-7 text-[var(--muted)]">{copy.introduction}</p>
        <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 leading-7 text-[var(--foreground)]">
          <strong>Think about:</strong> {copy.prompt}
        </p>
        <ul className="m-0 grid list-disc gap-2 pl-6 leading-7 text-[var(--muted)]">
          {TELESCOPE_DEFINITION.learning_objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
        <p className="text-sm leading-6 text-[var(--muted)]">{copy.modelNote}</p>
      </section>

      <section aria-labelledby="telescope-controls-heading" className="max-w-5xl space-y-6">
        <div className="space-y-2">
          <h2 id="telescope-controls-heading">Choose hypothetical optical inputs</h2>
          <p className="leading-7 text-[var(--muted)]">
            Canonical units are millimetres, degrees, and arcminutes. These continuous inputs are
            hypothetical model parameters, not a commercial equipment catalogue. Changes stay in a
            draft until you activate Calculate.
          </p>
        </div>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            applyDraft();
          }}
        >
          <fieldset className="grid gap-6 lg:grid-cols-3">
            <legend className="sr-only">Telescope objective and focal length</legend>
            <NumericControl
              error={fieldError?.field === "aperture_mm" ? fieldError.message : null}
              field="aperture_mm"
              help="Clear nominal objective diameter. The 20–1000 mm range is a Lumina v1 guardrail, not a statement about all telescopes."
              onChange={(value) => updateDraft("aperture_mm", value)}
              range={numericFieldRanges.aperture_mm}
              value={drafts.aperture_mm}
            />
            <NumericControl
              error={fieldError?.field === "telescope_focal_length_mm" ? fieldError.message : null}
              field="telescope_focal_length_mm"
              help="Native telescope focal length. The native focal ratio F/D must also remain between f/2 and f/30 in v1."
              onChange={(value) => updateDraft("telescope_focal_length_mm", value)}
              range={numericFieldRanges.telescope_focal_length_mm}
              value={drafts.telescope_focal_length_mm}
            />
            <div className="space-y-2">
              <label className="font-semibold" htmlFor="telescope-type">
                Telescope type
              </label>
              <select
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)]"
                id="telescope-type"
                onChange={(event) =>
                  updateDraft("telescope_type", event.target.value as TelescopeType)
                }
                value={drafts.telescope_type}
              >
                <option value="refractor">Refractor</option>
                <option value="reflector">Reflector</option>
                <option value="catadioptric">Catadioptric</option>
              </select>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Descriptive only in v1; changing this selection does not change numeric outputs.
              </p>
            </div>
          </fieldset>

          <fieldset className="grid gap-6 lg:grid-cols-3">
            <legend className="sr-only">Eyepiece and target</legend>
            <NumericControl
              error={fieldError?.field === "eyepiece_focal_length_mm" ? fieldError.message : null}
              field="eyepiece_focal_length_mm"
              help="Hypothetical eyepiece focal length. Shorter values produce more magnification for the same effective telescope focal length."
              onChange={(value) => updateDraft("eyepiece_focal_length_mm", value)}
              range={numericFieldRanges.eyepiece_focal_length_mm}
              value={drafts.eyepiece_focal_length_mm}
            />
            <NumericControl
              error={
                fieldError?.field === "eyepiece_apparent_field_deg" ? fieldError.message : null
              }
              field="eyepiece_apparent_field_deg"
              help="Nominal eyepiece apparent field. The simple AFOV/magnification field is approximate because field-stop geometry is not modeled."
              onChange={(value) => updateDraft("eyepiece_apparent_field_deg", value)}
              range={numericFieldRanges.eyepiece_apparent_field_deg}
              value={drafts.eyepiece_apparent_field_deg}
            />
            <NumericControl
              error={fieldError?.field === "target_angular_size_arcmin" ? fieldError.message : null}
              field="target_angular_size_arcmin"
              help="One scalar angular extent for comparison with the approximate field diameter; it is not brightness, area, shape, or observability."
              onChange={(value) => updateDraft("target_angular_size_arcmin", value)}
              range={numericFieldRanges.target_angular_size_arcmin}
              value={drafts.target_angular_size_arcmin}
            />
          </fieldset>

          <fieldset className="grid gap-6 lg:grid-cols-2">
            <legend className="sr-only">Optional focal-length modifier</legend>
            <div className="space-y-2">
              <label className="font-semibold" htmlFor="optical-modifier-kind">
                Optical modifier kind
              </label>
              <select
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)]"
                id="optical-modifier-kind"
                onChange={(event) => {
                  const kind = event.target.value as OpticalModifierKind;
                  updateDraft("optical_modifier_kind", kind);
                  if (kind === "none") updateDraft("optical_modifier_factor", "1");
                }}
                value={drafts.optical_modifier_kind}
              >
                {OPTICAL_MODIFIER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === "none" ? "None" : kind === "barlow" ? "Barlow" : "Focal reducer"}
                  </option>
                ))}
              </select>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Choose at most one. The factor is supplied as the effective focal-length multiplier;
                v1 does not derive it from physical spacing.
              </p>
            </div>
            <NumericControl
              disabled={drafts.optical_modifier_kind === "none"}
              error={fieldError?.field === "optical_modifier_factor" ? fieldError.message : null}
              field="optical_modifier_factor"
              help={
                drafts.optical_modifier_kind === "none"
                  ? "None requires exactly 1×."
                  : drafts.optical_modifier_kind === "barlow"
                    ? "Barlow teaching range: 1.1× through 5×."
                    : "Reducer teaching range: 0.5× through 0.95×."
              }
              onChange={(value) => updateDraft("optical_modifier_factor", value)}
              range={factorRange}
              value={drafts.optical_modifier_factor}
            />
          </fieldset>

          {fieldError?.field === null ? (
            <p
              className="rounded-md border border-[var(--focus)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--foreground)]"
              role="alert"
            >
              {fieldError.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="inline-flex min-h-11 items-center rounded-md bg-[var(--accent)] px-4 font-semibold text-[var(--background)]"
              type="submit"
            >
              Calculate
            </button>
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
        </form>
      </section>

      <section aria-labelledby="telescope-results-heading" className="max-w-5xl space-y-6">
        <div className="space-y-2">
          <h2 id="telescope-results-heading">Canonical model result</h2>
          <p className="leading-7 text-[var(--muted)]">
            The result is calculated by{" "}
            <code>{calculation?.model_version ?? TELESCOPE_BUILDER_MODEL_VERSION}</code> in the
            Python astronomy domain. Values below are learner-formatted; the API response keeps
            deterministic double-precision values.
          </p>
        </div>
        {calculation === null ? (
          <div
            className="rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
            role="alert"
          >
            <h3>Calculation unavailable</h3>
            <p className="mt-2 leading-7 text-[var(--muted)]">
              No scientific fallback was substituted. Check the connection and calculate again.
            </p>
          </div>
        ) : (
          <>
            <ResultsTable result={calculation} />
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 leading-7">
                <strong>Target fit:</strong> {calculation.target_fit} means only that the supplied
                scalar target extent is
                {calculation.target_fit === "fits" ? " no larger than " : " larger than "} the
                approximate field diameter.
              </p>
              <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 leading-7">
                <strong>Type:</strong> {calculation.inputs.telescope_type}. Numeric outputs are
                invariant across the three descriptive type labels in v1.
              </p>
            </div>
            {calculation.warning_codes.length > 0 ? (
              <aside
                aria-labelledby="telescope-warnings-heading"
                className="rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
                role="note"
              >
                <h3 id="telescope-warnings-heading">Practical rules of thumb</h3>
                <ul className="mt-3 list-disc space-y-2 pl-6 leading-7 text-[var(--muted)]">
                  {calculation.warning_codes.map((warning) => (
                    <li key={warning}>{TELESCOPE_WARNING_COPY[warning]}</li>
                  ))}
                </ul>
              </aside>
            ) : (
              <p className="text-sm leading-6 text-[var(--muted)]">
                No v1 practical rules-of-thumb warnings for this configuration.
              </p>
            )}
          </>
        )}
      </section>

      {calculation !== null && visual !== null ? (
        <section aria-labelledby="telescope-visualization-heading" className="max-w-5xl space-y-6">
          <div className="space-y-2">
            <h2 id="telescope-visualization-heading">Schematic geometry views</h2>
            <p className="leading-7 text-[var(--muted)]">
              These accessible SVGs are subordinate to the textual result. Their positions and
              shapes are normalized presentation transforms, not optical prescriptions or physical
              scale.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <OpticalTrainFigure result={calculation} state={state} visual={visual} />
            <FieldFitFigure result={calculation} visual={visual} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="telescope-model-heading" className="max-w-5xl space-y-6">
        <h2 id="telescope-model-heading">Model, assumptions, validity, and provenance</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3>Equations and relationships</h3>
            <dl className="space-y-3 text-sm leading-6 text-[var(--muted)]">
              {Object.entries(TELESCOPE_DEFINITION.calculation_module.equations).map(
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
              {TELESCOPE_DEFINITION.input_schema.fields.map((field) => (
                <li key={field.name}>
                  <strong>{field.name}</strong>: {field.unit};{" "}
                  {field.valid_range ?? field.valid_values?.join(", ")}; default {field.default}.
                </li>
              ))}
            </ul>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Native focal ratio is F/D and must be f/2 through f/30. Derived magnification must be
              at least 1×. Warnings are valid results, not input errors.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <h3>Assumptions and type disclosure</h3>
          <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
            {TELESCOPE_DEFINITION.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
          <p className="leading-7 text-[var(--muted)]">
            {TELESCOPE_DEFINITION.telescope_type_disclosure}
          </p>
          <p className="leading-7 text-[var(--muted)]">{TELESCOPE_DEFINITION.modifier_semantics}</p>
          <p className="leading-7 text-[var(--muted)]">
            {TELESCOPE_DEFINITION.target_fit_definition}
          </p>
        </div>
        <div className="space-y-3">
          <h3>Limitations</h3>
          <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
            {TELESCOPE_DEFINITION.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <h3>Frozen constants</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">
            {Object.entries(TELESCOPE_CONSTANTS)
              .map(([key, value]) => `${key}=${value}`)
              .join("; ")}
            . Default preset: {Object.keys(TELESCOPE_PRESETS).join(", ")} (hypothetical, not a
            product).
          </p>
        </div>
        <div className="space-y-3">
          <h3>Reviewed scientific sources</h3>
          <SourceList sourceIds={TELESCOPE_DEFINITION.references} />
          <p className="text-sm leading-6 text-[var(--muted)]">
            The sources support the first-order relationships and their limited interpretations.
            They do not turn these estimates into guaranteed observing performance.
          </p>
        </div>
      </section>

      <p className="text-sm leading-6 text-[var(--muted)]">
        Explore another reviewed lab:{" "}
        <Link className="text-[var(--link)] underline" href="/lab">
          open the Lab index
        </Link>
        .
      </p>
    </article>
  );
}
