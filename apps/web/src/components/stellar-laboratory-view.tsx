"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type StellarLaboratoryCalculationResponse } from "@lumina/api-client";

import {
  DEFAULT_STELLAR_LABORATORY_STATE,
  STELLAR_LABORATORY_DEFINITION,
  STELLAR_LABORATORY_INPUT_RANGE,
  STELLAR_LABORATORY_MODEL_VERSION,
  STELLAR_LABORATORY_SOURCES,
  decodeStellarLaboratoryState,
  encodeStellarLaboratoryState,
  stellarLaboratoryRequestEndpoint,
  validateStellarLaboratoryCalculationResult,
  validateStellarLaboratoryState,
  type StellarLaboratoryState,
} from "../lib/simulations/stellar-laboratory";

type StellarLaboratoryViewProps = Readonly<{
  initialState: StellarLaboratoryState;
  initialStateInvalid: boolean;
  initialCalculation: StellarLaboratoryCalculationResponse | null;
  apiOrigin: string | null;
}>;

type RequestState = "idle" | "loading" | "unavailable";

function replaceBrowserState(state: StellarLaboratoryState): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/stellar-laboratory";
  url.searchParams.set("state", encodeStellarLaboratoryState(state));
  window.history.replaceState(null, "", url);
}

function stateFromBrowser(): Readonly<{ state: StellarLaboratoryState; invalid: boolean }> {
  const values = new URL(window.location.href).searchParams.getAll("state");
  if (values.length === 0) return { state: DEFAULT_STELLAR_LABORATORY_STATE, invalid: false };
  const decoded = values.length === 1 ? decodeStellarLaboratoryState(values[0]) : null;
  return decoded === null
    ? { state: DEFAULT_STELLAR_LABORATORY_STATE, invalid: true }
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
      {STELLAR_LABORATORY_DEFINITION.references.map((sourceId) => {
        const source = STELLAR_LABORATORY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function ResultSummary({ result }: Readonly<{ result: StellarLaboratoryCalculationResponse }>) {
  const rows = [
    ["Initial mass", `${format(result.inputs.initial_mass_msun)} M☉`],
    ["Typical luminosity", `${format(result.luminosity_lsun)} L☉`],
    ["Typical radius", `${format(result.radius_rsun)} R☉`],
    ["Typical effective temperature", `${format(result.effective_temperature_k)} K`],
    [
      "Nearest source colour anchor",
      `${result.nearest_spectral_type_anchor}; B−V ${format(result.approximate_b_minus_v_mag)}`,
    ],
    ["Colour-anchor mass", `${format(result.colour_anchor_mass_msun)} M☉ (source table anchor)`],
    ["Approximate main-sequence lifetime", `${format(result.main_sequence_lifetime_years)} years`],
    ["Expected remnant", result.expected_remnant],
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

function Lifecycle({ result }: Readonly<{ result: StellarLaboratoryCalculationResponse }>) {
  return (
    <section aria-labelledby="stellar-lifecycle-heading" className="space-y-4">
      <div className="max-w-4xl space-y-2">
        <h3 className="text-xl font-semibold" id="stellar-lifecycle-heading">
          Broad educational lifecycle
        </h3>
        <p className="leading-7 text-[var(--muted)]">
          These are returned categorical stages, not an age-resolved evolutionary track or H–R
          trajectory.
        </p>
      </div>
      <ol className="grid list-decimal gap-3 pl-6 sm:grid-cols-2 xl:grid-cols-4">
        {result.evolutionary_path.map((stage) => (
          <li
            className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] p-4 font-semibold"
            key={stage}
          >
            {stage}
          </li>
        ))}
      </ol>
      <p className="text-sm leading-6 text-[var(--muted)]">{result.remnant_boundary_note}</p>
    </section>
  );
}

export function StellarLaboratoryView({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
}: StellarLaboratoryViewProps) {
  const [state, setState] = useState(initialState);
  const [draftMass, setDraftMass] = useState(String(initialState.initial_mass_msun));
  const [calculation, setCalculation] = useState(initialCalculation);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const recalculate = useCallback(
    async (nextState: StellarLaboratoryState, commit: boolean) => {
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
          stellarLaboratoryRequestEndpoint(nextState),
          { signal: controller.signal },
        );
        if (generation !== generationRef.current) return;
        if (response.kind === "http-error" && response.status === 422) {
          setRequestState("idle");
          setMessage(
            "The canonical Stellar Laboratory model rejected this mass. The last valid result remains visible.",
          );
          return;
        }
        if (response.kind !== "ok") {
          setRequestState("unavailable");
          setMessage("Calculation service is unavailable; the last valid result remains visible.");
          return;
        }
        const validated = validateStellarLaboratoryCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage("The returned result did not match the requested versioned stellar state.");
          return;
        }
        setCalculation(validated);
        if (commit) {
          setState(nextState);
          setDraftMass(String(nextState.initial_mass_msun));
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
      setDraftMass(String(next.state.initial_mass_msun));
      setInvalidNotice(next.invalid);
      void recalculate(next.state, true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      requestRef.current?.abort();
    };
  }, [recalculate]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftMass.trim().length === 0) {
      setMessage("Mass is empty, non-finite, or outside the reviewed 0.4–29.669 M☉ v1 range.");
      return;
    }
    const next = validateStellarLaboratoryState({
      version: 1,
      model_version: STELLAR_LABORATORY_MODEL_VERSION,
      initial_mass_msun: Number(draftMass),
    });
    if (next === null) {
      setMessage("Mass is empty, non-finite, or outside the reviewed 0.4–29.669 M☉ v1 range.");
      return;
    }
    void recalculate(next, true);
  }

  function resetDefault() {
    const next = DEFAULT_STELLAR_LABORATORY_STATE;
    setDraftMass(String(next.initial_mass_msun));
    setMessage("");
    void recalculate(next, true);
  }

  return (
    <article className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 7 · approximate source-backed model
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Stellar Laboratory</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Explore how initial mass maps to typical main-sequence luminosity, radius, effective
          temperature, an approximate lifetime, a nearest published colour anchor, and a broad
          expected remnant. This is not an age-resolved stellar-evolution grid.
        </p>
      </header>

      {invalidNotice ? (
        <aside className="border border-[var(--border-strong)] p-4" role="alert">
          <strong>Shared stellar-laboratory state rejected.</strong> The reviewed one-Solar-mass
          preset is shown instead.
        </aside>
      ) : null}

      <section aria-labelledby="stellar-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="stellar-input-heading">
            Initial mass
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            V1 accepts only {STELLAR_LABORATORY_INPUT_RANGE.min}–
            {STELLAR_LABORATORY_INPUT_RANGE.max} M☉. There is intentionally no metallicity slider
            because this model is not a metallicity-dependent evolution grid.
          </p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <label className="block max-w-md space-y-2" htmlFor="stellar-initial-mass">
            <span className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
              <span>Initial stellar mass</span>
              <span className="text-xs font-normal text-[var(--muted)]">M☉</span>
            </span>
            <input
              className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-sm"
              disabled={requestState === "loading"}
              id="stellar-initial-mass"
              inputMode="decimal"
              max={STELLAR_LABORATORY_INPUT_RANGE.max}
              min={STELLAR_LABORATORY_INPUT_RANGE.min}
              onChange={(event) => {
                setDraftMass(event.target.value);
                setMessage("");
              }}
              step="any"
              type="number"
              value={draftMass}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-md bg-[var(--accent)] px-5 font-semibold text-[var(--background)]"
              disabled={requestState === "loading"}
              type="submit"
            >
              {requestState === "loading" ? "Calculating…" : "Calculate stellar model"}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-5 font-semibold"
              disabled={requestState === "loading"}
              onClick={resetDefault}
              type="button"
            >
              Reset one-Solar-mass preset
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
            No browser-generated fallback stellar properties or lifecycle are substituted.
          </p>
        </section>
      ) : (
        <section aria-labelledby="stellar-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="stellar-result-heading">
              Approximate main-sequence result
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              Model {calculation.model_version}. Values are typical educational estimates within the
              reviewed source domain, not measurements or a prediction for an individual star.
            </p>
          </div>
          <ResultSummary result={calculation} />
          <Lifecycle result={calculation} />
          <p className="leading-7 text-[var(--muted)]">{calculation.metallicity_scope}</p>
        </section>
      )}

      <section
        aria-labelledby="stellar-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="stellar-model-heading">
          Model contract and provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {STELLAR_LABORATORY_DEFINITION.default_preset}
        </p>
        <p className="leading-7 text-[var(--muted)]">
          {STELLAR_LABORATORY_DEFINITION.sampling_policy}
        </p>
        <details>
          <summary className="cursor-pointer font-semibold">Equations and mappings</summary>
          <dl className="mt-3 space-y-3 text-sm">
            {Object.entries(STELLAR_LABORATORY_DEFINITION.equations).map(([name, equation]) => (
              <div key={name}>
                <dt className="font-semibold">{name.replaceAll("_", " ")}</dt>
                <dd className="font-mono text-[var(--muted)]">{equation}</dd>
              </div>
            ))}
          </dl>
        </details>
        <details open>
          <summary className="cursor-pointer font-semibold">Assumptions and limitations</summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Assumptions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {STELLAR_LABORATORY_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Limitations</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {STELLAR_LABORATORY_DEFINITION.limitations.map((item) => (
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
          Current committed browser state: initial mass {format(state.initial_mass_msun)} M☉.
        </p>
      </section>
    </article>
  );
}
