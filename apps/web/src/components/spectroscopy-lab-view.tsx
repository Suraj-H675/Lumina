"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type SpectroscopyCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SpectroscopyLabMessages } from "../lib/i18n/messages/types";
import {
  DEFAULT_SPECTROSCOPY_STATE,
  SPECTROSCOPY_DEFINITION,
  SPECTROSCOPY_ELEMENTS,
  SPECTROSCOPY_LIMITS,
  SPECTROSCOPY_MODEL_VERSION,
  SPECTROSCOPY_MODES,
  SPECTROSCOPY_SOURCES,
  decodeSpectroscopyState,
  encodeSpectroscopyState,
  spectroscopyRequestEndpoint,
  validateSpectroscopyCalculationResult,
  validateSpectroscopyState,
  type SpectroscopyElement,
  type SpectroscopyMode,
  type SpectroscopyState,
} from "../lib/simulations/spectroscopy-lab";

type SpectroscopyLabViewProps = Readonly<{
  initialState: SpectroscopyState;
  initialStateInvalid: boolean;
  initialCalculation: SpectroscopyCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: SpectroscopyLabMessages;
}>;

type RequestState = "idle" | "loading" | "unavailable";

function modeLabel(mode: SpectroscopyMode, messages: SpectroscopyLabMessages["modes"]): string {
  switch (mode) {
    case "continuum":
      return messages.continuum;
    case "emission":
      return messages.emission;
    case "absorption":
      return messages.absorption;
    case "doppler":
      return messages.doppler;
    case "element_match":
      return messages.elementMatch;
  }
}

function replaceBrowserState(state: SpectroscopyState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/spectroscopy-lab";
  url.searchParams.set("state", encodeSpectroscopyState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: SpectroscopyState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_SPECTROSCOPY_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeSpectroscopyState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_SPECTROSCOPY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

function format(value: number, locale: PublishedLocale, digits = 6): string {
  if (value === 0) return formatLocaleNumber(0, locale, { useGrouping: false });
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(digits).split("e");
    return `${formatLocaleFixedNumber(Number(mantissa), digits, locale)}e${exponent}`;
  }
  return formatLocaleNumber(value, locale, { maximumSignificantDigits: digits + 1 });
}

function SourceList({ messages }: Readonly<{ messages: SpectroscopyLabMessages["model"] }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {SPECTROSCOPY_DEFINITION.references.map((sourceId) => {
        const source = SPECTROSCOPY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function SpectrumFigure({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: SpectroscopyLabMessages["figure"];
  result: SpectroscopyCalculationResponse;
}>) {
  const width = 760;
  const height = 300;
  const left = 56;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const minimumWavelength = result.wavelength_nm[0] ?? 0;
  const maximumWavelength = result.wavelength_nm.at(-1) ?? 1;
  const wavelengthSpan = maximumWavelength - minimumWavelength;

  function x(wavelength: number): number {
    return left + ((wavelength - minimumWavelength) / wavelengthSpan) * plotWidth;
  }

  function y(flux: number): number {
    return top + (1 - flux) * plotHeight;
  }

  const path = result.wavelength_nm
    .map((wavelength, index) => {
      const flux = result.normalized_flux[index] ?? 0;
      return `${index === 0 ? "M" : "L"} ${x(wavelength).toFixed(2)} ${y(flux).toFixed(2)}`;
    })
    .join(" ");

  return (
    <figure className="space-y-3">
      <div aria-label={messages.scrollAriaLabel} className="overflow-x-auto" tabIndex={0}>
        <svg
          aria-label={messages.plotAriaLabel}
          className="min-w-[640px] max-w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <line x1={left} x2={left} y1={top} y2={top + plotHeight} stroke="currentColor" />
          <line
            x1={left}
            x2={left + plotWidth}
            y1={top + plotHeight}
            y2={top + plotHeight}
            stroke="currentColor"
          />
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          {result.representative_lines.map((line) => {
            const markerX = x(line.shifted_wavelength_vacuum_nm);
            if (markerX < left || markerX > left + plotWidth) return null;
            return (
              <line
                key={`${line.element}-${line.label}`}
                stroke="currentColor"
                strokeDasharray="4 4"
                strokeWidth="1"
                x1={markerX}
                x2={markerX}
                y1={top}
                y2={top + plotHeight}
              />
            );
          })}
          <text x={left} y={height - 12} fontSize="12">
            {format(minimumWavelength, locale)} nm
          </text>
          <text textAnchor="end" x={left + plotWidth} y={height - 12} fontSize="12">
            {format(maximumWavelength, locale)} nm
          </text>
          <text transform={`translate(16 ${top + plotHeight / 2}) rotate(-90)`} fontSize="12">
            {messages.normalizedFlux}
          </text>
        </svg>
      </div>
      <figcaption className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        {messages.caption}
      </figcaption>
    </figure>
  );
}

function ResultSummary({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: SpectroscopyLabMessages;
  result: SpectroscopyCalculationResponse;
}>) {
  const rows = [
    [messages.result.labels.mode, modeLabel(result.inputs.mode, messages.modes)],
    [messages.result.labels.temperature, `${format(result.inputs.temperature_k, locale)} K`],
    [messages.result.labels.wienPeak, `${format(result.wien_peak_nm, locale)} nm`],
    [
      messages.result.labels.radialVelocity,
      `${format(result.inputs.radial_velocity_km_s, locale)} km/s`,
    ],
    [messages.result.labels.dopplerFactor, format(result.doppler_factor, locale, 8)],
    [messages.result.labels.resolvingPower, format(result.inputs.resolving_power, locale)],
    [
      messages.result.labels.returnedSamples,
      formatLocaleNumber(result.wavelength_nm.length, locale),
    ],
    [
      messages.result.labels.selectedSpecies,
      result.inputs.selected_elements.length === 0
        ? messages.none
        : result.inputs.selected_elements.join(", "),
    ],
  ] as const;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

function ReturnedLines({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: SpectroscopyLabMessages["result"]["lines"];
  result: SpectroscopyCalculationResponse;
}>) {
  if (result.representative_lines.length === 0) {
    return <p className="rounded-md border border-[var(--border)] p-4">{messages.empty}</p>;
  }
  return (
    <div aria-label={messages.scrollAriaLabel} className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">{messages.caption}</caption>
        <thead>
          <tr>
            <th className="border-b border-[var(--border)] p-2 text-left" scope="col">
              {messages.headers.species}
            </th>
            <th className="border-b border-[var(--border)] p-2 text-left" scope="col">
              {messages.headers.feature}
            </th>
            <th className="border-b border-[var(--border)] p-2 text-right" scope="col">
              {messages.headers.rest}
            </th>
            <th className="border-b border-[var(--border)] p-2 text-right" scope="col">
              {messages.headers.shifted}
            </th>
            <th className="border-b border-[var(--border)] p-2 text-right" scope="col">
              {messages.headers.fwhm}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.representative_lines.map((line) => (
            <tr key={`${line.element}-${line.label}`}>
              <td className="border-b border-[var(--border)] p-2">{line.element}</td>
              <td className="border-b border-[var(--border)] p-2">{line.label}</td>
              <td className="border-b border-[var(--border)] p-2 text-right font-mono">
                {format(line.rest_wavelength_vacuum_nm, locale, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2 text-right font-mono">
                {format(line.shifted_wavelength_vacuum_nm, locale, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2 text-right font-mono">
                {format(line.illustrative_fwhm_nm, locale, 7)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SpectroscopyLabView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
}: SpectroscopyLabViewProps) {
  const [state, setState] = useState(initialState);
  const [draftMode, setDraftMode] = useState<SpectroscopyMode>(initialState.mode);
  const [draftTemperature, setDraftTemperature] = useState(String(initialState.temperature_k));
  const [draftElements, setDraftElements] = useState<ReadonlyArray<SpectroscopyElement>>(
    initialState.selected_elements,
  );
  const [draftVelocity, setDraftVelocity] = useState(String(initialState.radial_velocity_km_s));
  const [draftResolution, setDraftResolution] = useState(String(initialState.resolving_power));
  const [draftNoiseSigma, setDraftNoiseSigma] = useState(String(initialState.noise_sigma));
  const [draftNoiseSeed, setDraftNoiseSeed] = useState(String(initialState.noise_seed));
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const adoptDraft = useCallback((next: SpectroscopyState) => {
    setDraftMode(next.mode);
    setDraftTemperature(String(next.temperature_k));
    setDraftElements(next.selected_elements);
    setDraftVelocity(String(next.radial_velocity_km_s));
    setDraftResolution(String(next.resolving_power));
    setDraftNoiseSigma(String(next.noise_sigma));
    setDraftNoiseSeed(String(next.noise_seed));
  }, []);

  const recalculate = useCallback(
    async (nextState: SpectroscopyState, commit: boolean) => {
      if (apiOrigin === null) {
        setRequestState("unavailable");
        setMessage(messages.failures.serviceUnavailable);
        return;
      }
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const generation = ++generationRef.current;
      setRequestState("loading");
      setMessage("");
      try {
        const response = await requestEndpoint(apiOrigin, spectroscopyRequestEndpoint(nextState), {
          signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(messages.failures.rejected);
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage(messages.failures.serviceUnavailable);
          return;
        }
        const validated = validateSpectroscopyCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage(messages.failures.resultMismatch);
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
        setMessage(messages.failures.serviceUnavailable);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [adoptDraft, apiOrigin, messages.failures],
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

  function toggleElement(element: SpectroscopyElement) {
    setDraftElements((current) =>
      current.includes(element)
        ? current.filter((candidate) => candidate !== element)
        : SPECTROSCOPY_ELEMENTS.filter(
            (candidate) => current.includes(candidate) || candidate === element,
          ),
    );
    setMessage("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      draftTemperature.trim().length === 0 ||
      draftVelocity.trim().length === 0 ||
      draftResolution.trim().length === 0 ||
      draftNoiseSigma.trim().length === 0 ||
      draftNoiseSeed.trim().length === 0
    ) {
      setMessage(messages.failures.invalidInput);
      return;
    }
    const next = validateSpectroscopyState({
      version: 1,
      model_version: SPECTROSCOPY_MODEL_VERSION,
      mode: draftMode,
      temperature_k: Number(draftTemperature),
      selected_elements: draftElements,
      radial_velocity_km_s: Number(draftVelocity),
      resolving_power: Number(draftResolution),
      noise_sigma: Number(draftNoiseSigma),
      noise_seed: Number(draftNoiseSeed),
    });
    if (next === null) {
      setMessage(messages.failures.outOfDomain);
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    adoptDraft(DEFAULT_SPECTROSCOPY_STATE);
    setMessage("");
    void recalculate(DEFAULT_SPECTROSCOPY_STATE, true);
  }

  return (
    <article className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.header.intro}</p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          {messages.invalidState.inline}
        </aside>
      ) : null}

      <section aria-labelledby="spectroscopy-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="spectroscopy-input-heading">
            {messages.controls.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.controls.description}</p>
        </div>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2">
            <span className="block font-semibold">{messages.controls.fields.mode}</span>
            <select
              className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3"
              disabled={requestState === "loading"}
              onChange={(event) => {
                const mode = event.target.value as SpectroscopyMode;
                setDraftMode(mode);
                if (mode === "continuum") {
                  setDraftElements([]);
                } else if (draftElements.length === 0) {
                  setDraftElements(["H I"]);
                }
                setMessage("");
              }}
              value={draftMode}
            >
              {SPECTROSCOPY_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {modeLabel(mode, messages.modes)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="flex justify-between gap-2 font-semibold">
              <span>{messages.controls.fields.temperature}</span>
              <span className="text-xs font-normal text-[var(--muted)]">K</span>
            </span>
            <input
              aria-label={messages.controls.fieldAriaLabels.temperature}
              className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
              disabled={requestState === "loading"}
              max={SPECTROSCOPY_LIMITS.maxTemperatureK}
              min={SPECTROSCOPY_LIMITS.minTemperatureK}
              onChange={(event) => {
                setDraftTemperature(event.target.value);
                setMessage("");
              }}
              step="any"
              type="number"
              value={draftTemperature}
            />
          </label>

          <fieldset
            className="space-y-2 rounded-md border border-[var(--border)] p-4 md:col-span-2"
            disabled={draftMode === "continuum" || requestState === "loading"}
          >
            <legend className="px-1 font-semibold">
              {messages.controls.fields.representativeSpecies}
            </legend>
            <div className="flex flex-wrap gap-4">
              {SPECTROSCOPY_ELEMENTS.map((element) => (
                <label className="flex min-h-11 items-center gap-2" key={element}>
                  <input
                    checked={draftElements.includes(element)}
                    onChange={() => toggleElement(element)}
                    type="checkbox"
                  />
                  <span>{element}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {[
            {
              ariaLabel: messages.controls.fieldAriaLabels.radialVelocity,
              label: messages.controls.fields.radialVelocity,
              maximum: SPECTROSCOPY_LIMITS.maxRadialVelocityKmS,
              minimum: SPECTROSCOPY_LIMITS.minRadialVelocityKmS,
              setter: setDraftVelocity,
              unit: "km/s",
              value: draftVelocity,
            },
            {
              ariaLabel: messages.controls.fieldAriaLabels.resolvingPower,
              label: messages.controls.fields.resolvingPower,
              maximum: SPECTROSCOPY_LIMITS.maxResolvingPower,
              minimum: SPECTROSCOPY_LIMITS.minResolvingPower,
              setter: setDraftResolution,
              unit: "R",
              value: draftResolution,
            },
            {
              ariaLabel: messages.controls.fieldAriaLabels.displayNoise,
              label: messages.controls.fields.displayNoise,
              maximum: SPECTROSCOPY_LIMITS.maxNoiseSigma,
              minimum: SPECTROSCOPY_LIMITS.minNoiseSigma,
              setter: setDraftNoiseSigma,
              unit: messages.figure.normalizedFlux,
              value: draftNoiseSigma,
            },
          ].map(({ ariaLabel, label, maximum, minimum, setter, unit, value }) => (
            <label className="space-y-2" key={label}>
              <span className="flex justify-between gap-2 font-semibold">
                <span>{label}</span>
                <span className="text-xs font-normal text-[var(--muted)]">{unit}</span>
              </span>
              <input
                aria-label={ariaLabel}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={maximum}
                min={minimum}
                onChange={(event) => {
                  setter(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={value}
              />
            </label>
          ))}

          <label className="space-y-2">
            <span className="flex justify-between gap-2 font-semibold">
              <span>{messages.controls.fields.noiseSeed}</span>
              <span className="text-xs font-normal text-[var(--muted)]">uint32</span>
            </span>
            <input
              aria-label={messages.controls.fieldAriaLabels.noiseSeed}
              className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
              disabled={requestState === "loading"}
              max={SPECTROSCOPY_LIMITS.maxNoiseSeed}
              min={SPECTROSCOPY_LIMITS.minNoiseSeed}
              onChange={(event) => {
                setDraftNoiseSeed(event.target.value);
                setMessage("");
              }}
              step="1"
              type="number"
              value={draftNoiseSeed}
            />
          </label>

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              className="min-h-11 rounded-md bg-[var(--accent)] px-5 font-semibold text-[var(--background)]"
              disabled={requestState === "loading"}
              type="submit"
            >
              {requestState === "loading"
                ? messages.actions.calculating
                : messages.actions.calculate}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              {messages.actions.reset}
            </button>
          </div>
        </form>
        {message ? (
          <p role={requestState === "unavailable" ? "alert" : "status"}>{message}</p>
        ) : null}
      </section>

      {calculation === null ? (
        <section className="border border-[var(--border)] p-5" role="alert">
          <h2 className="text-2xl font-semibold">{messages.result.unavailableTitle}</h2>
          <p className="mt-2 text-[var(--muted)]">{messages.result.unavailableDescription}</p>
        </section>
      ) : (
        <section aria-labelledby="spectroscopy-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="spectroscopy-result-heading">
              {messages.result.title}
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>
          <ResultSummary locale={locale} messages={messages} result={calculation} />
          <SpectrumFigure locale={locale} messages={messages.figure} result={calculation} />
          <ReturnedLines locale={locale} messages={messages.result.lines} result={calculation} />
          <p className="leading-7 text-[var(--muted)]">{calculation.identification_explanation}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              calculation.continuum_note,
              calculation.line_strength_note,
              calculation.resolution_note,
              calculation.noise_note,
            ].map((note) => (
              <p
                className="rounded-md border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]"
                key={note}
              >
                {note}
              </p>
            ))}
          </div>
        </section>
      )}

      <section
        aria-labelledby="spectroscopy-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="spectroscopy-model-heading">
          {messages.model.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{SPECTROSCOPY_DEFINITION.sampling_policy}</p>
        <details open>
          <summary className="cursor-pointer font-semibold">
            {messages.model.assumptionsAndLimitations}
          </summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">{messages.model.assumptions}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {SPECTROSCOPY_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">{messages.model.limitations}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {SPECTROSCOPY_DEFINITION.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <div>
          <h3 className="font-semibold">{messages.model.reviewedSources}</h3>
          <div className="mt-2">
            <SourceList messages={messages.model} />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.model.currentState, {
            mode: modeLabel(state.mode, messages.modes),
            temperature: format(state.temperature_k, locale),
            velocity: format(state.radial_velocity_km_s, locale),
          })}
        </p>
      </section>
    </article>
  );
}
