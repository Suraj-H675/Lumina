"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type SpectroscopyCalculationResponse } from "@lumina/api-client";

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
}>;

type RequestState = "idle" | "loading" | "unavailable";

const MODE_LABELS: Record<SpectroscopyMode, string> = {
  continuum: "Blackbody continuum",
  emission: "Emission lines",
  absorption: "Absorption lines",
  doppler: "Doppler shift",
  element_match: "Element matching",
};

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

function format(value: number, digits = 6): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) return value.toExponential(digits);
  return value.toLocaleString("en", { maximumSignificantDigits: digits + 1 });
}

function SourceList() {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {SPECTROSCOPY_DEFINITION.references.map((sourceId) => {
        const source = SPECTROSCOPY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function SpectrumFigure({ result }: Readonly<{ result: SpectroscopyCalculationResponse }>) {
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
      <div
        aria-label="Scrollable normalized spectrum plot"
        className="overflow-x-auto"
        tabIndex={0}
      >
        <svg
          aria-label="Returned normalized spectrum from 380 to 750 nanometres vacuum wavelength"
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
            {format(minimumWavelength)} nm
          </text>
          <text textAnchor="end" x={left + plotWidth} y={height - 12} fontSize="12">
            {format(maximumWavelength)} nm
          </text>
          <text transform={`translate(16 ${top + plotHeight / 2}) rotate(-90)`} fontSize="12">
            normalized flux
          </text>
        </svg>
      </div>
      <figcaption className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        Presentation-only plot of the returned vacuum-wavelength and normalized-flux arrays. Dashed
        markers use returned shifted line centers. The browser does not calculate continuum, Doppler
        shift, line width, or noise.
      </figcaption>
    </figure>
  );
}

function ResultSummary({ result }: Readonly<{ result: SpectroscopyCalculationResponse }>) {
  const rows = [
    ["Mode", MODE_LABELS[result.inputs.mode]],
    ["Temperature", `${format(result.inputs.temperature_k)} K`],
    ["Wien peak", `${format(result.wien_peak_nm)} nm`],
    ["Radial velocity", `${format(result.inputs.radial_velocity_km_s)} km/s`],
    ["Doppler factor", format(result.doppler_factor, 8)],
    ["Resolving power", format(result.inputs.resolving_power)],
    ["Returned samples", String(result.wavelength_nm.length)],
    [
      "Selected species",
      result.inputs.selected_elements.length === 0
        ? "none"
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

function ReturnedLines({ result }: Readonly<{ result: SpectroscopyCalculationResponse }>) {
  if (result.representative_lines.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border)] p-4">
        Continuum mode returns no atomic fingerprint lines.
      </p>
    );
  }
  return (
    <div aria-label="Scrollable representative line table" className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">
          Source-backed representative line metadata returned by the canonical model.
        </caption>
        <thead>
          <tr>
            <th className="border-b border-[var(--border)] p-2 text-left" scope="col">
              Species
            </th>
            <th className="border-b border-[var(--border)] p-2 text-left" scope="col">
              Feature
            </th>
            <th className="border-b border-[var(--border)] p-2 text-right" scope="col">
              Rest vacuum nm
            </th>
            <th className="border-b border-[var(--border)] p-2 text-right" scope="col">
              Shifted vacuum nm
            </th>
            <th className="border-b border-[var(--border)] p-2 text-right" scope="col">
              Illustrative FWHM nm
            </th>
          </tr>
        </thead>
        <tbody>
          {result.representative_lines.map((line) => (
            <tr key={`${line.element}-${line.label}`}>
              <td className="border-b border-[var(--border)] p-2">{line.element}</td>
              <td className="border-b border-[var(--border)] p-2">{line.label}</td>
              <td className="border-b border-[var(--border)] p-2 text-right font-mono">
                {format(line.rest_wavelength_vacuum_nm, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2 text-right font-mono">
                {format(line.shifted_wavelength_vacuum_nm, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2 text-right font-mono">
                {format(line.illustrative_fwhm_nm, 7)}
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
        const response = await requestEndpoint(apiOrigin, spectroscopyRequestEndpoint(nextState), {
          signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Spectroscopy Lab rejected this state. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateSpectroscopyCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned spectrum state.");
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
      setMessage("One or more controls are empty or outside the reviewed v1 domain.");
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
      setMessage(
        "The requested mode, species, temperature, velocity, resolution, or noise settings are outside the reviewed v1 domain.",
      );
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
          Phase 7 · normalized visible-spectrum teaching model
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Spectroscopy Lab</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Explore an ideal normalized blackbody continuum, a small source-backed atomic fingerprint
          set, bounded radial-velocity shifts, illustrative resolving power, and deterministic
          display noise. V1 is not a stellar-atmosphere or abundance-analysis code.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared spectroscopy state rejected.</strong> The reviewed Solar-like absorption
          preset is shown instead.
        </aside>
      ) : null}

      <section aria-labelledby="spectroscopy-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="spectroscopy-input-heading">
            Teaching spectrum controls
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            All atomic coordinates are reviewed NIST ASD observed-vacuum wavelengths. Line
            amplitudes/depths are illustrative and are not abundance predictions.
          </p>
        </div>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2">
            <span className="block font-semibold">Mode</span>
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
                  {MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="flex justify-between gap-2 font-semibold">
              <span>Temperature</span>
              <span className="text-xs font-normal text-[var(--muted)]">K</span>
            </span>
            <input
              aria-label="Temperature K"
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
            <legend className="px-1 font-semibold">Representative species</legend>
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
            [
              "Radial velocity",
              "km/s",
              draftVelocity,
              setDraftVelocity,
              SPECTROSCOPY_LIMITS.minRadialVelocityKmS,
              SPECTROSCOPY_LIMITS.maxRadialVelocityKmS,
            ],
            [
              "Resolving power",
              "R",
              draftResolution,
              setDraftResolution,
              SPECTROSCOPY_LIMITS.minResolvingPower,
              SPECTROSCOPY_LIMITS.maxResolvingPower,
            ],
            [
              "Display noise sigma",
              "normalized flux",
              draftNoiseSigma,
              setDraftNoiseSigma,
              SPECTROSCOPY_LIMITS.minNoiseSigma,
              SPECTROSCOPY_LIMITS.maxNoiseSigma,
            ],
          ].map(([label, unit, value, setter, minimum, maximum]) => (
            <label className="space-y-2" key={String(label)}>
              <span className="flex justify-between gap-2 font-semibold">
                <span>{String(label)}</span>
                <span className="text-xs font-normal text-[var(--muted)]">{String(unit)}</span>
              </span>
              <input
                aria-label={`${String(label)} ${String(unit)}`}
                className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono"
                disabled={requestState === "loading"}
                max={Number(maximum)}
                min={Number(minimum)}
                onChange={(event) => {
                  (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value);
                  setMessage("");
                }}
                step="any"
                type="number"
                value={String(value)}
              />
            </label>
          ))}

          <label className="space-y-2">
            <span className="flex justify-between gap-2 font-semibold">
              <span>Noise seed</span>
              <span className="text-xs font-normal text-[var(--muted)]">uint32</span>
            </span>
            <input
              aria-label="Noise seed uint32"
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
              {requestState === "loading" ? "Calculating…" : "Calculate spectrum"}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              Reset Solar-like absorption preset
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
            No browser-generated fallback continuum, line positions, or noise are substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="spectroscopy-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="spectroscopy-result-heading">
              Canonical normalized spectrum
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. The returned spectrum is normalized teaching data,
              not flux-calibrated physical radiance.
            </p>
          </div>
          <ResultSummary result={calculation} />
          <SpectrumFigure result={calculation} />
          <ReturnedLines result={calculation} />
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
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">{SPECTROSCOPY_DEFINITION.sampling_policy}</p>
        <details open>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {SPECTROSCOPY_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {SPECTROSCOPY_DEFINITION.limitations.map((item) => (
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
          Current committed browser state: {MODE_LABELS[state.mode]}, {format(state.temperature_k)}{" "}
          K, radial velocity {format(state.radial_velocity_km_s)} km/s.
        </p>
      </section>
    </article>
  );
}
