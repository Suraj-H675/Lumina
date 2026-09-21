"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  requestEndpoint,
  type PlanetarySystemBuilderCalculationResponse,
} from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { PlanetarySystemBuilderMessages } from "../lib/i18n/messages/types";
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
  locale: PublishedLocale;
  messages: PlanetarySystemBuilderMessages;
}>;

type RequestState = "idle" | "loading" | "unavailable";
type DraftPlanet = Readonly<{ mass: string; axis: string }>;

function hzRelationLabel(
  relation: PlanetarySystemBuilderCalculationResponse["planets"][number]["habitable_zone_relation"],
  messages: PlanetarySystemBuilderMessages["classifications"],
): string {
  switch (relation) {
    case "interior_to_reference_hz":
      return messages.interiorReferenceHz;
    case "inside_reference_hz":
      return messages.insideReferenceHz;
    case "exterior_to_reference_hz":
      return messages.exteriorReferenceHz;
  }
}

function pairwiseLabel(
  assessment: PlanetarySystemBuilderCalculationResponse["adjacent_pairs"][number]["spacing_assessment"],
  messages: PlanetarySystemBuilderMessages["classifications"],
): string {
  return assessment === "pairwise_close_warning"
    ? messages.pairwiseCloseWarning
    : messages.noPairwiseHillWarning;
}

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

function format(value: number, locale: PublishedLocale, digits = 6): string {
  if (value === 0) return formatLocaleNumber(0, locale, { useGrouping: false });
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(digits).split("e");
    return `${formatLocaleFixedNumber(Number(mantissa), digits, locale)}e${exponent}`;
  }
  return formatLocaleNumber(value, locale, { maximumSignificantDigits: digits + 1 });
}

function SourceList({ messages }: Readonly<{ messages: PlanetarySystemBuilderMessages["model"] }>) {
  return (
    <ul className="m-0 list-disc space-y-2 pl-6 text-sm leading-6 text-[var(--muted)]">
      {PLANETARY_SYSTEM_BUILDER_DEFINITION.references.map((sourceId) => {
        const source = PLANETARY_SYSTEM_BUILDER_SOURCES.find(
          (candidate) => candidate.id === sourceId,
        );
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

function SystemPlacementFigure({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: PlanetarySystemBuilderMessages["figure"];
  result: PlanetarySystemBuilderCalculationResponse;
}>) {
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
      <div aria-label={messages.scrollAriaLabel} className="overflow-x-auto" tabIndex={0}>
        <svg
          aria-label={messages.ariaLabel}
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
            {messages.hzLabel}
          </text>
          <circle cx={left} cy={axisY} fill="currentColor" r="9" />
          <text fontSize="12" textAnchor="middle" x={left} y={axisY + 30}>
            {messages.starLabel}
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
                  {format(planet.semi_major_axis_au, locale)} AU
                </text>
              </g>
            );
          })}
          <text fontSize="12" x={left} y={height - 20}>
            0 AU
          </text>
          <text fontSize="12" textAnchor="end" x={left + plotWidth} y={height - 20}>
            {formatMessageTemplate(messages.displayExtent, {
              extent: format(scaleMaximum, locale),
            })}
          </text>
        </svg>
      </div>
      <figcaption className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        {messages.caption}
      </figcaption>
    </figure>
  );
}

function PlanetResults({
  locale,
  messages,
  result,
  classifications,
}: Readonly<{
  locale: PublishedLocale;
  messages: PlanetarySystemBuilderMessages["planets"];
  result: PlanetarySystemBuilderCalculationResponse;
  classifications: PlanetarySystemBuilderMessages["classifications"];
}>) {
  return (
    <div aria-label={messages.scrollAriaLabel} className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">{messages.caption}</caption>
        <thead>
          <tr>
            {[
              messages.headers.planet,
              messages.headers.mass,
              messages.headers.axis,
              messages.headers.period,
              messages.headers.hzPlacement,
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
                {format(planet.mass_mearth, locale)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(planet.semi_major_axis_au, locale)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(planet.orbital_period_days, locale, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2">
                {hzRelationLabel(planet.habitable_zone_relation, classifications)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PairwiseResults({
  classifications,
  locale,
  messages,
  result,
}: Readonly<{
  classifications: PlanetarySystemBuilderMessages["classifications"];
  locale: PublishedLocale;
  messages: PlanetarySystemBuilderMessages["pairwise"];
  result: PlanetarySystemBuilderCalculationResponse;
}>) {
  if (result.adjacent_pairs.length === 0) {
    return <p className="rounded-md border border-[var(--border)] p-4">{messages.singlePlanet}</p>;
  }
  return (
    <div aria-label={messages.scrollAriaLabel} className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[780px] border-collapse text-sm">
        <caption className="mb-2 text-left text-[var(--muted)]">{messages.caption}</caption>
        <thead>
          <tr>
            {[
              messages.headers.pair,
              messages.headers.mutualHillRadius,
              messages.headers.separation,
              messages.headers.referenceThreshold,
              messages.headers.assessment,
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
                {format(pair.mutual_hill_radius_au, locale, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(pair.separation_mutual_hill, locale, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2 font-mono">
                {format(pair.pairwise_reference_threshold, locale, 7)}
              </td>
              <td className="border-b border-[var(--border)] p-2">
                {pairwiseLabel(pair.spacing_assessment, classifications)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
        {result.adjacent_pairs.map((pair) => (
          <li key={`${pair.inner_index}-${pair.outer_index}-interpretation`}>
            {formatMessageTemplate(messages.interpretation, {
              inner: pair.inner_index,
              outer: pair.outer_index,
              interpretation: pair.interpretation,
            })}
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
  locale,
  messages,
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
          planetarySystemBuilderRequestEndpoint(nextState),
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
        const validated = validatePlanetarySystemBuilderCalculationResult(nextState, response.data);
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
      setMessage(messages.failures.invalidInput);
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
      setMessage(messages.failures.outOfDomain);
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

      <section aria-labelledby="builder-input-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="builder-input-heading">
            {messages.controls.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.controls.description}</p>
        </div>
        <form className="space-y-6" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-3">
            <label className="space-y-2">
              <span className="flex justify-between gap-2 font-semibold">
                <span>{messages.controls.fields.stellarMass}</span>
                <span className="text-xs font-normal text-[var(--muted)]">M☉</span>
              </span>
              <input
                aria-label={messages.controls.fieldAriaLabels.stellarMass}
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
                <span>{messages.controls.fields.stellarLuminosity}</span>
                <span className="text-xs font-normal text-[var(--muted)]">L☉</span>
              </span>
              <input
                aria-label={messages.controls.fieldAriaLabels.stellarLuminosity}
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
                <span>{messages.controls.fields.effectiveTemperature}</span>
                <span className="text-xs font-normal text-[var(--muted)]">K</span>
              </span>
              <input
                aria-label={messages.controls.fieldAriaLabels.effectiveTemperature}
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
            <legend className="px-1 font-semibold">{messages.controls.orderedPlanetsLegend}</legend>
            <p className="text-sm leading-6 text-[var(--muted)]">
              {messages.controls.orderedPlanetsDescription}
            </p>
            <div className="space-y-4">
              {draftPlanets.map((planet, index) => (
                <fieldset
                  className="grid gap-4 rounded-md border border-[var(--border)] p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
                  key={index}
                >
                  <legend className="px-1 font-semibold">
                    {formatMessageTemplate(messages.controls.planetLegend, { index: index + 1 })}
                  </legend>
                  <label className="space-y-2">
                    <span className="block font-semibold">
                      {messages.controls.fields.planetMass}
                    </span>
                    <input
                      aria-label={formatMessageTemplate(
                        messages.controls.fieldAriaLabels.planetMass,
                        {
                          index: index + 1,
                        },
                      )}
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
                    <span className="block font-semibold">
                      {messages.controls.fields.planetAxis}
                    </span>
                    <input
                      aria-label={formatMessageTemplate(
                        messages.controls.fieldAriaLabels.planetAxis,
                        {
                          index: index + 1,
                        },
                      )}
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
                    aria-label={formatMessageTemplate(
                      messages.controls.fieldAriaLabels.removePlanet,
                      { index: index + 1 },
                    )}
                    className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 font-semibold"
                    disabled={
                      requestState === "loading" ||
                      draftPlanets.length <= PLANETARY_SYSTEM_BUILDER_LIMITS.minPlanetCount
                    }
                    onClick={() => removePlanet(index)}
                    type="button"
                  >
                    {messages.actions.remove}
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
              {messages.actions.addPlanet}
            </button>
          </fieldset>

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
        <section aria-labelledby="builder-result-heading" className="space-y-7">
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-semibold" id="builder-result-heading">
              {messages.result.title}
            </h2>
            <p className="leading-7 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.description, {
                modelVersion: calculation.model_version,
              })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.labels.hzInner}</p>
              <p className="mt-1 font-semibold">
                {format(calculation.habitable_zone.inner_edge_au, locale, 7)} AU
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">{messages.result.labels.hzOuter}</p>
              <p className="mt-1 font-semibold">
                {format(calculation.habitable_zone.outer_edge_au, locale, 7)} AU
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">
                {messages.result.labels.returnedPlanets}
              </p>
              <p className="mt-1 font-semibold">
                {formatLocaleNumber(calculation.planets.length, locale)}
              </p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--muted)]">
                {messages.result.labels.pairwiseDiagnostics}
              </p>
              <p className="mt-1 font-semibold">
                {formatLocaleNumber(calculation.adjacent_pairs.length, locale)}
              </p>
            </div>
          </div>
          <p className="rounded-md border border-[var(--border-strong)] p-4 leading-7">
            {calculation.habitable_zone.habitability_note}
          </p>
          <SystemPlacementFigure locale={locale} messages={messages.figure} result={calculation} />
          <PlanetResults
            classifications={messages.classifications}
            locale={locale}
            messages={messages.planets}
            result={calculation}
          />
          <PairwiseResults
            classifications={messages.classifications}
            locale={locale}
            messages={messages.pairwise}
            result={calculation}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <p className="rounded-md border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
              {calculation.stellar_consistency_note}
            </p>
            <p className="rounded-md border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
              {calculation.stability_note} {messages.result.furtherStabilityAnalysis}
            </p>
          </div>
        </section>
      )}

      <section
        aria-labelledby="builder-model-heading"
        className="max-w-5xl space-y-5 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="builder-model-heading">
          {messages.model.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {PLANETARY_SYSTEM_BUILDER_DEFINITION.sampling_policy}
        </p>
        <details open>
          <summary className="cursor-pointer font-semibold">
            {messages.model.assumptionsAndLimitations}
          </summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">{messages.model.assumptions}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {PLANETARY_SYSTEM_BUILDER_DEFINITION.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">{messages.model.limitations}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6 text-sm text-[var(--muted)]">
                {PLANETARY_SYSTEM_BUILDER_DEFINITION.limitations.map((item) => (
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
          {formatMessageTemplate(
            state.planets.length === 1
              ? messages.model.currentStateOne
              : messages.model.currentStateMany,
            {
              count: formatLocaleNumber(state.planets.length, locale),
              mass: format(state.stellar_mass_msun, locale),
              luminosity: format(state.stellar_luminosity_lsun, locale),
              temperature: format(state.stellar_effective_temperature_k, locale),
            },
          )}
        </p>
      </section>
    </article>
  );
}
