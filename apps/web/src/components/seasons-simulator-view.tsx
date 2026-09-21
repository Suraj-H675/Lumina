"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requestEndpoint,
  seasonsSimulatorEndpoint,
  type SeasonsCalculationResponse,
} from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SeasonsSimulatorMessages } from "../lib/i18n/messages/types";
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
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages;
}>;

type NumericField = "axial_tilt_deg" | "orbital_position_deg" | "latitude_deg";
type RequestState = "idle" | "loading" | "unavailable";

const numericFieldMessageKeys: Record<
  NumericField,
  keyof SeasonsSimulatorMessages["controls"]["fields"]
> = {
  axial_tilt_deg: "axialTilt",
  orbital_position_deg: "orbitalPosition",
  latitude_deg: "latitude",
};

const numericFieldRanges: Record<
  NumericField,
  Readonly<{ min: number; max: number; step: string }>
> = {
  axial_tilt_deg: { min: 0, max: 90, step: "0.01" },
  orbital_position_deg: { min: 0, max: 360, step: "1" },
  latitude_deg: { min: -90, max: 90, step: "1" },
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

function numericFieldLabel(
  field: NumericField,
  messages: SeasonsSimulatorMessages["controls"],
): string {
  return messages.fields[numericFieldMessageKeys[field]];
}

function formatAngle(value: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber(value, 1, locale)}°`;
}

function formatDayLength(
  value: number | null,
  locale: PublishedLocale,
  messages: SeasonsSimulatorMessages,
): string {
  return value === null
    ? messages.result.horizonAllDay
    : `${formatLocaleFixedNumber(value, 1, locale)} h`;
}

function formatFlux(value: number, locale: PublishedLocale): string {
  const difference = (value - 1) * 100;
  return `${formatLocaleFixedNumber(value, 4, locale)}× (${difference >= 0 ? "+" : ""}${formatLocaleFixedNumber(difference, 1, locale)}%)`;
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

function SourceList({
  messages,
  sourceIds,
}: Readonly<{
  messages: SeasonsSimulatorMessages["model"];
  sourceIds: ReadonlyArray<string>;
}>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {sourceIds.map((sourceId) => {
        const source = SEASONS_SOURCES.find((candidate) => candidate.id === sourceId);
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
  locale,
  messages,
  state,
  result,
  visual,
}: Readonly<{
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages["figures"]["orbit"];
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
        <title id="seasons-orbit-title">{messages.title}</title>
        <desc id="seasons-orbit-desc">
          {formatMessageTemplate(messages.description, {
            position: formatAngle(state.orbital_position_deg, locale),
          })}
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
          {messages.sunFocus}
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
          {messages.earth}
        </text>
        <text fill="var(--muted)" fontSize="7" x="96" y="12">
          {messages.june}
        </text>
        <text fill="var(--muted)" fontSize="7" x="154" y="78">
          {messages.september}
        </text>
        <text fill="var(--muted)" fontSize="7" x="91" y="143">
          {messages.december}
        </text>
        <text fill="var(--muted)" fontSize="7" x="8" y="78">
          {messages.march}
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.caption, {
          distance: formatLocaleFixedNumber(result.distance_over_semimajor_axis, 4, locale),
        })}
      </figcaption>
    </figure>
  );
}

function IlluminationFigure({
  locale,
  messages,
  state,
  result,
  visual,
}: Readonly<{
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages["figures"]["illumination"];
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
        <title id="seasons-illumination-title">{messages.title}</title>
        <desc id="seasons-illumination-desc">{messages.description}</desc>
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
          {messages.selectedLatitude}
        </text>
        <text fill="var(--foreground)" fontSize="7" x="8" y="112">
          {messages.parallelRays}
        </text>
        <text fill="var(--focus)" fontSize="7" x="8" y="125">
          {formatMessageTemplate(messages.axisTilt, {
            angle: formatAngle(state.axial_tilt_deg, locale),
          })}
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.caption, {
          incidence: formatAngle(result.selected.illumination_incidence_deg, locale),
        })}
      </figcaption>
    </figure>
  );
}

function GeometryTable({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages;
  result: SeasonsCalculationResponse;
}>) {
  return (
    <div
      aria-label={messages.table.ariaLabel}
      className="max-w-full overflow-x-auto rounded-md border border-[var(--border)]"
      role="region"
      tabIndex={0}
    >
      <table
        className="min-w-[48rem] w-full border-collapse text-left text-sm"
        data-testid="seasons-geometry-table"
      >
        <caption className="sr-only">{messages.table.caption}</caption>
        <thead className="bg-[var(--surface)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3" scope="col">
              {messages.table.headers.location}
            </th>
            <th className="px-4 py-3" scope="col">
              {messages.table.headers.latitude}
            </th>
            <th className="px-4 py-3" scope="col">
              {messages.table.headers.noonAltitude}
            </th>
            <th className="px-4 py-3" scope="col">
              {messages.table.headers.incidence}
            </th>
            <th className="px-4 py-3" scope="col">
              {messages.table.headers.dayLength}
            </th>
            <th className="px-4 py-3" scope="col">
              {messages.table.headers.polarState}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-[var(--border)]">
            <th className="px-4 py-3" scope="row">
              {messages.table.selectedLatitude}
            </th>
            <td className="px-4 py-3">{formatAngle(result.selected.latitude_deg, locale)}</td>
            <td className="px-4 py-3">
              {formatAngle(result.selected.noon_sun_altitude_deg, locale)}
            </td>
            <td className="px-4 py-3">
              {formatAngle(result.selected.illumination_incidence_deg, locale)}
            </td>
            <td className="px-4 py-3">
              {formatDayLength(result.selected.day_length_hours, locale, messages)}
            </td>
            <td className="px-4 py-3">{result.selected.polar_state}</td>
          </tr>
          <tr className="border-t border-[var(--border)]">
            <th className="px-4 py-3" scope="row">
              {messages.table.oppositeLatitude}
            </th>
            <td className="px-4 py-3">
              {formatAngle(result.opposite_hemisphere.latitude_deg, locale)}
            </td>
            <td className="px-4 py-3">
              {formatAngle(result.opposite_hemisphere.noon_sun_altitude_deg, locale)}
            </td>
            <td className="px-4 py-3">
              {formatAngle(result.opposite_hemisphere.illumination_incidence_deg, locale)}
            </td>
            <td className="px-4 py-3">
              {formatDayLength(result.opposite_hemisphere.day_length_hours, locale, messages)}
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
  locale,
  messages,
  value,
  error,
  onChange,
}: Readonly<{
  field: NumericField;
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages["controls"];
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}>) {
  const range = numericFieldRanges[field];
  const label = numericFieldLabel(field, messages);
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
          {formatMessageTemplate(messages.range, {
            maximum: formatLocaleNumber(range.max, locale),
            minimum: formatLocaleNumber(range.min, locale),
            unit: messages.unitDegrees,
          })}
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
          aria-label={formatMessageTemplate(messages.sliderAriaLabel, { label })}
          aria-valuetext={formatMessageTemplate(messages.sliderAriaValue, {
            unit: messages.unitDegrees,
            value,
          })}
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
          ? messages.helps.orbitalPosition
          : field === "latitude_deg"
            ? messages.helps.latitude
            : messages.helps.axialTilt}
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
  locale,
  messages,
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
    initialResult === null ? messages.failures.initialUnavailable : "",
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
        setRequestMessage(messages.failures.noApiOrigin);
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
            setRequestMessage(messages.failures.serviceUnavailable);
            return;
          }
          const validated = validateSeasonsCalculationResult(nextState, response.data);
          if (validated === null) {
            setRequestState("unavailable");
            setRequestMessage(messages.failures.resultMismatch);
            return;
          }
          setCalculation(validated);
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
      const label = numericFieldLabel(field, messages.controls);
      if (rawValue.trim() === "") {
        setFieldError({
          field,
          message: formatMessageTemplate(messages.failures.invalidFinite, { field: label }),
        });
        return;
      }
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        setFieldError({
          field,
          message: formatMessageTemplate(messages.failures.invalidFinite, { field: label }),
        });
        return;
      }
      const normalizedValue =
        field === "orbital_position_deg"
          ? canonicalizeSeasonsOrbitalPosition(numericValue)
          : numericValue;
      if (normalizedValue === null) {
        setFieldError({
          field,
          message: formatMessageTemplate(messages.failures.invalidRange, { field: label }),
        });
        return;
      }
      const nextState = validateSeasonsState({ ...state, [field]: normalizedValue });
      if (nextState === null) {
        setFieldError({
          field,
          message: formatMessageTemplate(messages.failures.invalidRange, { field: label }),
        });
        return;
      }
      applyState(nextState);
    },
    [applyState, messages.controls, messages.failures, state],
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
    setShareMessage(messages.share.reset);
    recalculate(DEFAULT_SEASONS_STATE);
  }, [messages.share.reset, recalculate]);

  const handleShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.pathname = "/lab/seasons-simulator";
    url.searchParams.set("state", encodeSeasonsState(state));
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
  }, [messages.share.copied, messages.share.ready, state]);

  const visual = calculation === null ? null : buildSeasonsVisualTransform(state, calculation);
  const copy = modeCopy[mode];

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
          aria-labelledby="invalid-seasons-state-heading"
          className="max-w-4xl space-y-3 rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
          role="alert"
        >
          <h2 id="invalid-seasons-state-heading">{messages.invalidState.title}</h2>
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

      <section aria-labelledby="seasons-objective-heading" className="max-w-4xl space-y-4">
        <h2 id="seasons-objective-heading">{messages.objective.title}</h2>
        <p className="leading-7 text-[var(--muted)]">{copy.introduction}</p>
        <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 leading-7 text-[var(--foreground)]">
          <strong>{messages.objective.thinkAbout}</strong> {copy.prompt}
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
          <h2 id="seasons-controls-heading">{messages.controls.title}</h2>
          <p className="leading-7 text-[var(--muted)]">{messages.controls.description}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {(Object.keys(numericFieldMessageKeys) as NumericField[]).map((field) => (
            <NumericControl
              error={fieldError?.field === field ? fieldError.message : null}
              field={field}
              key={field}
              locale={locale}
              messages={messages.controls}
              onChange={(value) => updateNumericField(field, value)}
              value={drafts[field]}
            />
          ))}
        </div>
        <div className="space-y-2">
          <label className="font-semibold" htmlFor="seasons-eccentricity-preset">
            {messages.controls.eccentricityLabel}
          </label>
          <select
            className="min-h-11 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)]"
            id="seasons-eccentricity-preset"
            onChange={(event) => updatePreset(event.target.value)}
            value={state.eccentricity_preset}
          >
            <option value="circular">{messages.controls.presetLabels.circular}</option>
            <option value="earth">{messages.controls.presetLabels.earth}</option>
            <option value="exaggerated">{messages.controls.presetLabels.exaggerated}</option>
          </select>
          <p className="text-sm leading-6 text-[var(--muted)]">
            {messages.controls.eccentricityDescription}
          </p>
        </div>
        <div
          className="flex flex-wrap gap-3"
          role="group"
          aria-label={messages.controls.phasePresets.ariaLabel}
        >
          {[0, 90, 180, 270].map((position) => (
            <button
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-[var(--surface-hover)]"
              key={position}
              onClick={() => updateNumericField("orbital_position_deg", String(position))}
              type="button"
            >
              {position === 0
                ? messages.controls.phasePresets.march
                : position === 90
                  ? messages.controls.phasePresets.june
                  : position === 180
                    ? messages.controls.phasePresets.september
                    : messages.controls.phasePresets.december}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
      </section>

      <section aria-labelledby="seasons-results-heading" className="max-w-5xl space-y-6">
        <div className="space-y-2">
          <h2 id="seasons-results-heading">{messages.result.title}</h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.result.description, {
              modelVersion: calculation?.model_version ?? "seasons-simulator-v1",
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
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <dt className="text-sm text-[var(--muted)]">
                  {messages.result.labels.solarDeclination}
                </dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatAngle(calculation.solar_declination_deg, locale)}
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <dt className="text-sm text-[var(--muted)]">
                  {messages.result.labels.sunAltitude}
                </dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatAngle(calculation.selected.noon_sun_altitude_deg, locale)}
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <dt className="text-sm text-[var(--muted)]">{messages.result.labels.dayLength}</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatDayLength(calculation.selected.day_length_hours, locale, messages)}
                </dd>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <dt className="text-sm text-[var(--muted)]">
                  {messages.result.labels.relativeFlux}
                </dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatFlux(calculation.relative_solar_flux, locale)}
                </dd>
              </div>
            </dl>
            <p className="leading-7 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.comparisonSummary, {
                latitude: formatAngle(calculation.comparison_latitude_deg, locale),
              })}
            </p>
            <GeometryTable locale={locale} messages={messages} result={calculation} />
          </>
        )}
      </section>

      {calculation !== null && visual !== null ? (
        <section aria-labelledby="seasons-visualization-heading" className="max-w-5xl space-y-6">
          <div className="space-y-2">
            <h2 id="seasons-visualization-heading">{messages.figures.sectionTitle}</h2>
            <p className="leading-7 text-[var(--muted)]">{messages.figures.sectionDescription}</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <OrbitFigure
              locale={locale}
              messages={messages.figures.orbit}
              result={calculation}
              state={state}
              visual={visual}
            />
            <IlluminationFigure
              locale={locale}
              messages={messages.figures.illumination}
              result={calculation}
              state={state}
              visual={visual}
            />
          </div>
        </section>
      ) : null}

      {calculation !== null ? (
        <section aria-labelledby="seasons-distance-heading" className="max-w-4xl space-y-5">
          <h2 id="seasons-distance-heading">{messages.distance.title}</h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.distance.description, {
              distance: formatLocaleFixedNumber(
                calculation.distance_over_semimajor_axis,
                4,
                locale,
              ),
              flux: formatFlux(calculation.relative_solar_flux, locale),
            })}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="seasons-model-heading" className="max-w-5xl space-y-6">
        <h2 id="seasons-model-heading">{messages.model.title}</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3>{messages.model.equations}</h3>
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
            <h3>{messages.model.inputsAndValidity}</h3>
            <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
              <li>{messages.model.validityItems.axialTilt}</li>
              <li>{messages.model.validityItems.orbitalPosition}</li>
              <li>{messages.model.validityItems.latitude}</li>
              <li>{messages.model.validityItems.eccentricity}</li>
              <li>{messages.model.validityItems.precision}</li>
            </ul>
            <h3>{messages.model.assumptions}</h3>
            <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
              {SEASONS_DEFINITION.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-3">
          <h3>{messages.model.limitations}</h3>
          <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
            {SEASONS_DEFINITION.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <p className="text-sm leading-6 text-[var(--muted)]">{messages.model.futureMotion}</p>
        </div>
        <div className="space-y-3">
          <h3>{messages.model.reviewedSources}</h3>
          <SourceList messages={messages.model} sourceIds={SEASONS_DEFINITION.references} />
          <p className="text-sm leading-6 text-[var(--muted)]">
            {messages.model.supportingSourceNote}
          </p>
        </div>
      </section>

      <p className="text-sm leading-6 text-[var(--muted)]">
        {messages.footer.prefix}{" "}
        <Link className="text-[var(--link)] underline" href="/lab/scale-explorer">
          {messages.footer.link}
        </Link>
        .
      </p>
    </article>
  );
}
