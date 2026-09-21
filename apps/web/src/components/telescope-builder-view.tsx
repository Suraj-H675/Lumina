"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requestEndpoint,
  telescopeBuilderEndpoint,
  type TelescopeBuilderCalculationResponse,
} from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { TelescopeBuilderMessages } from "../lib/i18n/messages/types";
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
  locale: PublishedLocale;
  messages: TelescopeBuilderMessages;
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

const numericFieldMessageKeys: Record<
  NumericField,
  keyof TelescopeBuilderMessages["controls"]["fields"]
> = {
  aperture_mm: "aperture",
  telescope_focal_length_mm: "telescopeFocalLength",
  eyepiece_focal_length_mm: "eyepieceFocalLength",
  eyepiece_apparent_field_deg: "eyepieceApparentField",
  optical_modifier_factor: "modifierFactor",
  target_angular_size_arcmin: "targetAngularExtent",
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

function numericFieldLabel(
  field: NumericField,
  messages: TelescopeBuilderMessages["controls"],
): string {
  return messages.fields[numericFieldMessageKeys[field]];
}

function format(value: number, locale: PublishedLocale, digits = 2): string {
  return formatLocaleFixedNumber(value, digits, locale);
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

function SourceList({
  messages,
  sourceIds,
}: Readonly<{
  messages: TelescopeBuilderMessages["model"];
  sourceIds: ReadonlyArray<string>;
}>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {sourceIds.map((sourceId) => {
        const source = TELESCOPE_SOURCES.find((candidate) => candidate.id === sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.sourceUnavailable, { sourceId })}</>
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
  locale,
  messages,
  value,
  error,
  onChange,
  range,
  help,
  disabled = false,
}: Readonly<{
  field: NumericField;
  locale: PublishedLocale;
  messages: TelescopeBuilderMessages["controls"];
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  range: Readonly<{ min: number; max: number; step: string; unit: string }>;
  help: string;
  disabled?: boolean;
}>) {
  const label = numericFieldLabel(field, messages);
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
          {formatMessageTemplate(messages.range, {
            maximum: formatLocaleNumber(range.max, locale),
            minimum: formatLocaleNumber(range.min, locale),
            unit: range.unit,
          })}
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
          aria-label={formatMessageTemplate(messages.sliderAriaLabel, { label })}
          aria-valuetext={formatMessageTemplate(messages.sliderAriaValue, {
            unit: range.unit,
            value,
          })}
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
  locale,
  messages,
  state,
  result,
  visual,
}: Readonly<{
  locale: PublishedLocale;
  messages: TelescopeBuilderMessages["figures"]["opticalTrain"];
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
        <title id="telescope-optical-train-title">{messages.title}</title>
        <desc id="telescope-optical-train-desc">
          {formatMessageTemplate(messages.description, {
            modifier: state.optical_modifier_kind,
          })}
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
          {messages.aperture}
        </text>
        <text fill="var(--foreground)" fontSize="7" x="53" y="24">
          {messages.telescope}
        </text>
        <text fill="var(--foreground)" fontSize="7" x="162" y="28">
          {messages.eyepiece}
        </text>
        {train.modifier_x_percent === null ? null : (
          <text fill="var(--foreground)" fontSize="7" x="110" y="18">
            {state.optical_modifier_kind}
          </text>
        )}
        <text fill="var(--muted)" fontSize="7" x="10" y="91">
          {formatMessageTemplate(messages.nativeFocalLength, {
            value: formatLocaleNumber(result.inputs.telescope_focal_length_mm, locale, {
              maximumFractionDigits: 20,
              useGrouping: false,
            }),
          })}
          ;{" "}
          {formatMessageTemplate(messages.effectiveFocalLength, {
            value: formatLocaleNumber(result.effective_focal_length_mm, locale, {
              maximumFractionDigits: 20,
              useGrouping: false,
            }),
          })}
        </text>
        <text fill="var(--muted)" fontSize="7" x="10" y="103">
          {formatMessageTemplate(messages.schematicType, {
            telescopeType: result.inputs.telescope_type,
          })}
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">{messages.caption}</figcaption>
    </figure>
  );
}

function FieldFitFigure({
  locale,
  messages,
  result,
  visual,
}: Readonly<{
  locale: PublishedLocale;
  messages: TelescopeBuilderMessages["figures"]["fieldFit"];
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
        <title id="telescope-field-fit-title">{messages.title}</title>
        <desc id="telescope-field-fit-desc">{messages.description}</desc>
        <circle cx="100" cy="64" fill="none" r="35" stroke="var(--border-strong)" strokeWidth="2" />
        <text fill="var(--foreground)" fontSize="8" x="82" y="20">
          {messages.approximateField}
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
              {messages.targetBeyondField}
            </text>
          </>
        )}
        <text fill="var(--muted)" fontSize="8" textAnchor="middle" x="100" y="119">
          {formatMessageTemplate(messages.targetExtent, {
            percent: format(result.target_field_fraction * 100, locale, 1),
          })}
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">{messages.caption}</figcaption>
    </figure>
  );
}

function ResultsTable({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: TelescopeBuilderMessages;
  result: TelescopeBuilderCalculationResponse;
}>) {
  const rows: ReadonlyArray<Readonly<{ label: string; value: string }>> = [
    {
      label: messages.result.labels.effectiveFocalLength,
      value: `${format(result.effective_focal_length_mm, locale)} mm`,
    },
    {
      label: messages.result.labels.nativeFocalRatio,
      value: `f/${format(result.native_focal_ratio, locale)}`,
    },
    {
      label: messages.result.labels.effectiveFocalRatio,
      value: `f/${format(result.effective_focal_ratio, locale)}`,
    },
    {
      label: messages.result.labels.magnification,
      value: `${format(result.magnification_x, locale, 1)}×`,
    },
    {
      label: messages.result.labels.trueField,
      value: `${format(result.approx_true_field_deg, locale)}°`,
    },
    {
      label: messages.result.labels.exitPupil,
      value: `${format(result.exit_pupil_mm, locale)} mm`,
    },
    {
      label: messages.result.labels.dawesReference,
      value: `${format(result.dawes_limit_arcsec, locale)} arcsec`,
    },
    {
      label: messages.result.labels.rayleighReference,
      value: `${format(result.rayleigh_limit_arcsec, locale)} arcsec`,
    },
    {
      label: messages.result.labels.collectingAreaRatio,
      value: `${format(result.ideal_light_gathering_ratio_vs_7mm_pupil, locale, 1)}×`,
    },
    {
      label: messages.result.labels.targetAngularSize,
      value: `${format(result.target_angular_size_deg, locale)}°`,
    },
    {
      label: messages.result.labels.targetFieldFraction,
      value: `${format(result.target_field_fraction * 100, locale, 1)}%`,
    },
    { label: messages.result.labels.targetFit, value: result.target_fit },
  ];
  return (
    <div
      aria-label={messages.table.ariaLabel}
      className="max-w-full overflow-x-auto rounded-md border border-[var(--border)]"
      role="region"
      tabIndex={0}
    >
      <table
        className="min-w-[34rem] w-full border-collapse text-left text-sm"
        data-testid="telescope-results-table"
      >
        <caption className="sr-only">{messages.table.caption}</caption>
        <thead className="bg-[var(--surface)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3" scope="col">
              {messages.table.quantity}
            </th>
            <th className="px-4 py-3" scope="col">
              {messages.table.value}
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
  locale,
  messages,
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
    initialResult === null ? messages.failures.initialUnavailable : "",
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
        setRequestMessage(messages.failures.noApiOrigin);
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
              message: messages.failures.rejected,
            });
            setRequestMessage("");
            return;
          }
          if (response.kind !== "ok") {
            setRequestState("unavailable");
            setRequestMessage(messages.failures.serviceUnavailable);
            return;
          }
          const validated = validateTelescopeBuilderCalculationResult(nextState, response.data);
          if (validated === null) {
            setRequestState("unavailable");
            setRequestMessage(messages.failures.resultMismatch);
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
          setRequestMessage(messages.failures.serviceUnavailable);
        } finally {
          if (requestRef.current === controller) requestRef.current = null;
        }
      })();
    },
    [apiOrigin, messages.failures],
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
        setFieldError({
          field,
          message: formatMessageTemplate(messages.failures.invalidFinite, {
            field: numericFieldLabel(field, messages.controls),
          }),
        });
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
        message: messages.failures.invalidConfiguration,
      });
      return;
    }
    applyState(nextState);
  }, [applyState, drafts, messages.controls, messages.failures]);

  const handleReset = useCallback(() => {
    replaceBrowserState(null);
    setState(DEFAULT_TELESCOPE_BUILDER_STATE);
    setDrafts(draftsForState(DEFAULT_TELESCOPE_BUILDER_STATE));
    setInvalidNotice(false);
    setFieldError(null);
    setShareUrl(null);
    setShareMessage(messages.share.reset);
    recalculate(DEFAULT_TELESCOPE_BUILDER_STATE);
  }, [messages.share.reset, recalculate]);

  const handleShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.pathname = "/lab/telescope-builder";
    const encoded = encodeTelescopeBuilderState(state);
    if (encoded.length > TELESCOPE_BUILDER_SHARE_STATE_MAX_CHARS) {
      setShareMessage(messages.share.tooLong);
      return;
    }
    url.searchParams.set("state", encoded);
    const serialized = url.toString();
    setShareUrl(serialized);
    try {
      if (typeof navigator.clipboard !== "undefined") {
        await navigator.clipboard.writeText(serialized);
        setShareMessage(messages.share.copied);
        return;
      }
    } catch {
      // The visible link remains available for manual copying.
    }
    setShareMessage(messages.share.ready);
  }, [messages.share.copied, messages.share.ready, messages.share.tooLong, state]);

  const visual =
    calculation === null ? null : buildTelescopeBuilderVisualTransform(state, calculation);
  const copy = modeCopy[mode];
  const factorRange = modifierFactorRange(drafts.optical_modifier_kind);

  return (
    <article className="space-y-12">
      <nav aria-label={messages.header.breadcrumbAriaLabel}>
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm text-[var(--muted)]">
          <li>{messages.header.labBreadcrumb}</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{messages.header.title}</li>
        </ol>
      </nav>

      <header className="max-w-4xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.header.intro}</p>
      </header>

      <LearningModeSelector onChange={setMode} />

      {invalidNotice ? (
        <aside
          aria-labelledby="invalid-telescope-state-heading"
          className="max-w-4xl space-y-3 rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
          role="alert"
        >
          <h2 id="invalid-telescope-state-heading">{messages.invalidState.title}</h2>
          <p className="leading-7 text-[var(--muted)]">{messages.invalidState.description}</p>
          <button
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
            onClick={handleReset}
            type="button"
          >
            {messages.actions.resetDefault}
          </button>
        </aside>
      ) : null}

      <section aria-labelledby="telescope-objective-heading" className="max-w-4xl space-y-4">
        <h2 id="telescope-objective-heading">{messages.objective.title}</h2>
        <p className="leading-7 text-[var(--muted)]">{copy.introduction}</p>
        <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 leading-7 text-[var(--foreground)]">
          <strong>{messages.objective.thinkAbout}</strong> {copy.prompt}
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
          <h2 id="telescope-controls-heading">{messages.controls.title}</h2>
          <p className="leading-7 text-[var(--muted)]">{messages.controls.description}</p>
        </div>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            applyDraft();
          }}
        >
          <fieldset className="grid gap-6 lg:grid-cols-3">
            <legend className="sr-only">{messages.controls.fieldsets.telescope}</legend>
            <NumericControl
              error={fieldError?.field === "aperture_mm" ? fieldError.message : null}
              field="aperture_mm"
              help={messages.controls.helps.aperture}
              locale={locale}
              messages={messages.controls}
              onChange={(value) => updateDraft("aperture_mm", value)}
              range={numericFieldRanges.aperture_mm}
              value={drafts.aperture_mm}
            />
            <NumericControl
              error={fieldError?.field === "telescope_focal_length_mm" ? fieldError.message : null}
              field="telescope_focal_length_mm"
              help={messages.controls.helps.telescopeFocalLength}
              locale={locale}
              messages={messages.controls}
              onChange={(value) => updateDraft("telescope_focal_length_mm", value)}
              range={numericFieldRanges.telescope_focal_length_mm}
              value={drafts.telescope_focal_length_mm}
            />
            <div className="space-y-2">
              <label className="font-semibold" htmlFor="telescope-type">
                {messages.controls.telescopeType.label}
              </label>
              <select
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)]"
                id="telescope-type"
                onChange={(event) =>
                  updateDraft("telescope_type", event.target.value as TelescopeType)
                }
                value={drafts.telescope_type}
              >
                <option value="refractor">
                  {messages.controls.telescopeType.options.refractor}
                </option>
                <option value="reflector">
                  {messages.controls.telescopeType.options.reflector}
                </option>
                <option value="catadioptric">
                  {messages.controls.telescopeType.options.catadioptric}
                </option>
              </select>
              <p className="text-sm leading-6 text-[var(--muted)]">
                {messages.controls.telescopeType.description}
              </p>
            </div>
          </fieldset>

          <fieldset className="grid gap-6 lg:grid-cols-3">
            <legend className="sr-only">{messages.controls.fieldsets.eyepieceAndTarget}</legend>
            <NumericControl
              error={fieldError?.field === "eyepiece_focal_length_mm" ? fieldError.message : null}
              field="eyepiece_focal_length_mm"
              help={messages.controls.helps.eyepieceFocalLength}
              locale={locale}
              messages={messages.controls}
              onChange={(value) => updateDraft("eyepiece_focal_length_mm", value)}
              range={numericFieldRanges.eyepiece_focal_length_mm}
              value={drafts.eyepiece_focal_length_mm}
            />
            <NumericControl
              error={
                fieldError?.field === "eyepiece_apparent_field_deg" ? fieldError.message : null
              }
              field="eyepiece_apparent_field_deg"
              help={messages.controls.helps.eyepieceApparentField}
              locale={locale}
              messages={messages.controls}
              onChange={(value) => updateDraft("eyepiece_apparent_field_deg", value)}
              range={numericFieldRanges.eyepiece_apparent_field_deg}
              value={drafts.eyepiece_apparent_field_deg}
            />
            <NumericControl
              error={fieldError?.field === "target_angular_size_arcmin" ? fieldError.message : null}
              field="target_angular_size_arcmin"
              help={messages.controls.helps.targetAngularExtent}
              locale={locale}
              messages={messages.controls}
              onChange={(value) => updateDraft("target_angular_size_arcmin", value)}
              range={numericFieldRanges.target_angular_size_arcmin}
              value={drafts.target_angular_size_arcmin}
            />
          </fieldset>

          <fieldset className="grid gap-6 lg:grid-cols-2">
            <legend className="sr-only">{messages.controls.fieldsets.modifier}</legend>
            <div className="space-y-2">
              <label className="font-semibold" htmlFor="optical-modifier-kind">
                {messages.controls.modifier.label}
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
                    {kind === "none"
                      ? messages.controls.modifier.options.none
                      : kind === "barlow"
                        ? messages.controls.modifier.options.barlow
                        : messages.controls.modifier.options.reducer}
                  </option>
                ))}
              </select>
              <p className="text-sm leading-6 text-[var(--muted)]">
                {messages.controls.modifier.description}
              </p>
            </div>
            <NumericControl
              disabled={drafts.optical_modifier_kind === "none"}
              error={fieldError?.field === "optical_modifier_factor" ? fieldError.message : null}
              field="optical_modifier_factor"
              help={
                drafts.optical_modifier_kind === "none"
                  ? messages.controls.helps.modifierFactorNone
                  : drafts.optical_modifier_kind === "barlow"
                    ? messages.controls.helps.modifierFactorBarlow
                    : messages.controls.helps.modifierFactorReducer
              }
              locale={locale}
              messages={messages.controls}
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
              {messages.actions.calculate}
            </button>
            <button
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
              onClick={handleReset}
              type="button"
            >
              {messages.actions.reset}
            </button>
            <button
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
              onClick={() => void handleShare()}
              type="button"
            >
              {messages.actions.share}
            </button>
            <span aria-live="polite" className="text-sm text-[var(--muted)]" role="status">
              {requestState === "loading"
                ? messages.status.calculating
                : requestMessage || shareMessage}
            </span>
          </div>
          {shareUrl === null ? null : (
            <p className="max-w-4xl break-all rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
              {messages.share.urlLabel}{" "}
              <a className="text-[var(--link)] underline" href={shareUrl}>
                {shareUrl}
              </a>
            </p>
          )}
        </form>
      </section>

      <section aria-labelledby="telescope-results-heading" className="max-w-5xl space-y-6">
        <div className="space-y-2">
          <h2 id="telescope-results-heading">{messages.result.title}</h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.result.description, {
              modelVersion: calculation?.model_version ?? TELESCOPE_BUILDER_MODEL_VERSION,
            })}
          </p>
        </div>
        {calculation === null ? (
          <div
            className="rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
            role="alert"
          >
            <h3>{messages.result.unavailableTitle}</h3>
            <p className="mt-2 leading-7 text-[var(--muted)]">
              {messages.result.unavailableDescription}
            </p>
          </div>
        ) : (
          <>
            <ResultsTable locale={locale} messages={messages} result={calculation} />
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 leading-7">
                <strong>{messages.result.labels.targetFit}:</strong>{" "}
                {formatMessageTemplate(
                  calculation.target_fit === "fits"
                    ? messages.result.targetFitFits
                    : messages.result.targetFitDoesNotFit,
                  { targetFit: calculation.target_fit },
                )}
              </p>
              <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 leading-7">
                <strong>{messages.result.typeLabel}:</strong>{" "}
                {formatMessageTemplate(messages.result.typeSummary, {
                  telescopeType: calculation.inputs.telescope_type,
                })}
              </p>
            </div>
            {calculation.warning_codes.length > 0 ? (
              <aside
                aria-labelledby="telescope-warnings-heading"
                className="rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
                role="note"
              >
                <h3 id="telescope-warnings-heading">{messages.result.warningsTitle}</h3>
                <ul className="mt-3 list-disc space-y-2 pl-6 leading-7 text-[var(--muted)]">
                  {calculation.warning_codes.map((warning) => (
                    <li key={warning}>{TELESCOPE_WARNING_COPY[warning]}</li>
                  ))}
                </ul>
              </aside>
            ) : (
              <p className="text-sm leading-6 text-[var(--muted)]">{messages.result.noWarnings}</p>
            )}
          </>
        )}
      </section>

      {calculation !== null && visual !== null ? (
        <section aria-labelledby="telescope-visualization-heading" className="max-w-5xl space-y-6">
          <div className="space-y-2">
            <h2 id="telescope-visualization-heading">{messages.figures.sectionTitle}</h2>
            <p className="leading-7 text-[var(--muted)]">{messages.figures.sectionDescription}</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <OpticalTrainFigure
              locale={locale}
              messages={messages.figures.opticalTrain}
              result={calculation}
              state={state}
              visual={visual}
            />
            <FieldFitFigure
              locale={locale}
              messages={messages.figures.fieldFit}
              result={calculation}
              visual={visual}
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="telescope-model-heading" className="max-w-5xl space-y-6">
        <h2 id="telescope-model-heading">{messages.model.title}</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3>{messages.model.equations}</h3>
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
            <h3>{messages.model.inputsAndValidity}</h3>
            <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
              {TELESCOPE_DEFINITION.input_schema.fields.map((field) => (
                <li key={field.name}>
                  <strong>{field.name}</strong>:{" "}
                  {formatMessageTemplate(messages.model.inputFieldDetails, {
                    defaultValue: String(field.default),
                    range: field.valid_range ?? field.valid_values?.join(", ") ?? "",
                    unit: field.unit,
                  })}
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
          <h3>{messages.model.assumptions}</h3>
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
          <h3>{messages.model.limitations}</h3>
          <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
            {TELESCOPE_DEFINITION.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <h3>{messages.model.frozenConstants}</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">
            {Object.entries(TELESCOPE_CONSTANTS)
              .map(([key, value]) => `${key}=${value}`)
              .join("; ")}
            .{" "}
            {formatMessageTemplate(messages.model.defaultPresetSummary, {
              presets: Object.keys(TELESCOPE_PRESETS).join(", "),
            })}
          </p>
        </div>
        <div className="space-y-3">
          <h3>{messages.model.reviewedSources}</h3>
          <SourceList messages={messages.model} sourceIds={TELESCOPE_DEFINITION.references} />
          <p className="text-sm leading-6 text-[var(--muted)]">
            The sources support the first-order relationships and their limited interpretations.
            They do not turn these estimates into guaranteed observing performance.
          </p>
        </div>
      </section>

      <p className="text-sm leading-6 text-[var(--muted)]">
        {messages.footer.prefix}{" "}
        <Link className="text-[var(--link)] underline" href="/lab">
          {messages.footer.link}
        </Link>
        .
      </p>
    </article>
  );
}
