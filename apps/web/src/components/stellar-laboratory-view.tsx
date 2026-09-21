"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEndpoint, type StellarLaboratoryCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { StellarLaboratoryMessages } from "../lib/i18n/messages/types";
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
  locale: PublishedLocale;
  messages: StellarLaboratoryMessages;
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

function format(value: number, locale: PublishedLocale, digits = 6): string {
  if (value === 0) return formatLocaleNumber(0, locale, { useGrouping: false });
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(digits).split("e");
    return `${formatLocaleFixedNumber(Number(mantissa), digits, locale)}e${exponent}`;
  }
  return formatLocaleNumber(value, locale, { maximumSignificantDigits: digits + 1 });
}

function SourceList({ messages }: Readonly<{ messages: StellarLaboratoryMessages["model"] }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {STELLAR_LABORATORY_DEFINITION.references.map((sourceId) => {
        const source = STELLAR_LABORATORY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function ResultSummary({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: StellarLaboratoryMessages["result"];
  result: StellarLaboratoryCalculationResponse;
}>) {
  const rows = [
    [messages.labels.initialMass, `${format(result.inputs.initial_mass_msun, locale)} M☉`],
    [messages.labels.typicalLuminosity, `${format(result.luminosity_lsun, locale)} L☉`],
    [messages.labels.typicalRadius, `${format(result.radius_rsun, locale)} R☉`],
    [messages.labels.typicalTemperature, `${format(result.effective_temperature_k, locale)} K`],
    [
      messages.labels.nearestColourAnchor,
      `${result.nearest_spectral_type_anchor}; B−V ${format(result.approximate_b_minus_v_mag, locale)}`,
    ],
    [
      messages.labels.colourAnchorMass,
      `${format(result.colour_anchor_mass_msun, locale)} M☉ (${messages.sourceTableAnchor})`,
    ],
    [
      messages.labels.approximateLifetime,
      `${format(result.main_sequence_lifetime_years, locale)} ${messages.yearsUnit}`,
    ],
    [messages.labels.expectedRemnant, result.expected_remnant],
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

function Lifecycle({
  messages,
  result,
}: Readonly<{
  messages: StellarLaboratoryMessages["result"];
  result: StellarLaboratoryCalculationResponse;
}>) {
  return (
    <section aria-labelledby="stellar-lifecycle-heading" className="space-y-4">
      <div className="max-w-4xl space-y-2">
        <h3 className="text-xl font-semibold" id="stellar-lifecycle-heading">
          {messages.lifecycleTitle}
        </h3>
        <p className="leading-7 text-[var(--muted)]">{messages.lifecycleDescription}</p>
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
  locale,
  messages,
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
        const response = await requestEndpoint(
          apiOrigin,
          stellarLaboratoryRequestEndpoint(nextState),
          { signal: controller.signal },
        );
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
        const validated = validateStellarLaboratoryCalculationResult(nextState, response.data);
        if (validated === null) {
          setRequestState("unavailable");
          setMessage(messages.failures.resultMismatch);
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
        setMessage(messages.failures.serviceUnavailable);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [apiOrigin, messages.failures],
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
      setMessage(messages.failures.invalidInput);
      return;
    }
    const next = validateStellarLaboratoryState({
      version: 1,
      model_version: STELLAR_LABORATORY_MODEL_VERSION,
      initial_mass_msun: Number(draftMass),
    });
    if (next === null) {
      setMessage(messages.failures.invalidInput);
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

      <section aria-labelledby="stellar-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="stellar-input-heading">
            {messages.controls.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.controls.description, {
              minimum: format(STELLAR_LABORATORY_INPUT_RANGE.min, locale),
              maximum: format(STELLAR_LABORATORY_INPUT_RANGE.max, locale),
            })}
          </p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <label className="block max-w-md space-y-2" htmlFor="stellar-initial-mass">
            <span className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
              <span>{messages.controls.fieldLabel}</span>
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
        <section aria-labelledby="stellar-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="stellar-result-heading">
              {messages.result.title}
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>
          <ResultSummary locale={locale} messages={messages.result} result={calculation} />
          <Lifecycle messages={messages.result} result={calculation} />
          <p className="leading-7 text-[var(--muted)]">{calculation.metallicity_scope}</p>
        </section>
      )}

      <section
        aria-labelledby="stellar-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="stellar-model-heading">
          {messages.model.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {STELLAR_LABORATORY_DEFINITION.default_preset}
        </p>
        <p className="leading-7 text-[var(--muted)]">
          {STELLAR_LABORATORY_DEFINITION.sampling_policy}
        </p>
        <details>
          <summary className="cursor-pointer font-semibold">{messages.model.equations}</summary>
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
          <summary className="cursor-pointer font-semibold">
            {messages.model.assumptionsAndLimitations}
          </summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">{messages.model.assumptions}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {STELLAR_LABORATORY_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">{messages.model.limitations}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {STELLAR_LABORATORY_DEFINITION.limitations.map((item) => (
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
            mass: format(state.initial_mass_msun, locale),
          })}
        </p>
      </section>
    </article>
  );
}
