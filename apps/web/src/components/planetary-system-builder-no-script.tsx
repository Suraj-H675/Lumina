import type { PlanetarySystemBuilderCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { PlanetarySystemBuilderMessages } from "../lib/i18n/messages/types";
import {
  PLANETARY_SYSTEM_BUILDER_DEFINITION,
  PLANETARY_SYSTEM_BUILDER_SOURCES,
  type PlanetarySystemBuilderState,
} from "../lib/simulations/planetary-system-builder";

type PlanetarySystemBuilderNoScriptProps = Readonly<{
  initialState: PlanetarySystemBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: PlanetarySystemBuilderCalculationResponse | null;
  locale: PublishedLocale;
  messages: PlanetarySystemBuilderMessages;
}>;

function numeric(value: number, locale: PublishedLocale, unit = ""): string {
  let formatted: string;
  if (value === 0) {
    formatted = formatLocaleNumber(0, locale, { useGrouping: false });
  } else if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(5).split("e");
    formatted = `${formatLocaleFixedNumber(Number(mantissa), 5, locale)}e${exponent}`;
  } else {
    formatted = formatLocaleNumber(value, locale, { maximumSignificantDigits: 7 });
  }
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList({ messages }: Readonly<{ messages: PlanetarySystemBuilderMessages["model"] }>) {
  return (
    <ul>
      {PLANETARY_SYSTEM_BUILDER_DEFINITION.references.map((sourceId) => {
        const source = PLANETARY_SYSTEM_BUILDER_SOURCES.find(
          (candidate) => candidate.id === sourceId,
        );
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.sourceUnavailable, { sourceId })}</>
            ) : (
              <a href={source.url} rel="noreferrer">
                {source.title} — {source.organization_or_authors}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PlanetarySystemBuilderNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: PlanetarySystemBuilderNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.noScript.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="builder-nojs-invalid">
            <h2 id="builder-nojs-invalid">{messages.invalidState.title}</h2>
            <p>{messages.invalidState.description}</p>
          </section>
        ) : null}
        <section aria-labelledby="builder-nojs-input">
          <h2 id="builder-nojs-input">{messages.noScript.requestedTitle}</h2>
          <p>
            {messages.noScript.stateLabels.stellarMass}:{" "}
            {numeric(initialState.stellar_mass_msun, locale, "M☉")}
          </p>
          <p>
            {messages.noScript.stateLabels.stellarLuminosity}:{" "}
            {numeric(initialState.stellar_luminosity_lsun, locale, "L☉")}
          </p>
          <p>
            {messages.noScript.stateLabels.effectiveTemperature}:{" "}
            {numeric(initialState.stellar_effective_temperature_k, locale, "K")}
          </p>
          <ol>
            {initialState.planets.map((planet, index) => (
              <li key={`${index}-${planet.semi_major_axis_au}`}>
                {formatMessageTemplate(messages.noScript.planetLine, {
                  index: index + 1,
                  mass: numeric(planet.mass_mearth, locale),
                  axis: numeric(planet.semi_major_axis_au, locale),
                })}
              </li>
            ))}
          </ol>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="builder-nojs-unavailable">
            <h2 id="builder-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <p>{messages.noScript.unavailableDescription}</p>
          </section>
        ) : (
          <section aria-labelledby="builder-nojs-result">
            <h2 id="builder-nojs-result">{messages.noScript.resultTitle}</h2>
            <p>
              {messages.noScript.modelVersion}: {initialCalculation.model_version}
            </p>
            <p>
              {formatMessageTemplate(messages.noScript.hzRange, {
                inner: numeric(initialCalculation.habitable_zone.inner_edge_au, locale),
                outer: numeric(initialCalculation.habitable_zone.outer_edge_au, locale),
              })}
            </p>
            <p>{initialCalculation.habitable_zone.habitability_note}</p>
            <table>
              <caption>{messages.noScript.planetsCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{messages.planets.headers.planet}</th>
                  <th scope="col">{messages.planets.headers.mass}</th>
                  <th scope="col">{messages.planets.headers.axis}</th>
                  <th scope="col">{messages.planets.headers.period}</th>
                  <th scope="col">{messages.planets.headers.hzPlacement}</th>
                </tr>
              </thead>
              <tbody>
                {initialCalculation.planets.map((planet) => (
                  <tr key={planet.index}>
                    <td>{planet.index}</td>
                    <td>{numeric(planet.mass_mearth, locale)}</td>
                    <td>{numeric(planet.semi_major_axis_au, locale)}</td>
                    <td>{numeric(planet.orbital_period_days, locale)}</td>
                    <td>{planet.habitable_zone_relation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {initialCalculation.adjacent_pairs.length === 0 ? (
              <p>{messages.noScript.singlePlanet}</p>
            ) : (
              <table>
                <caption>{messages.noScript.pairwiseCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{messages.noScript.pairwiseHeaders.pair}</th>
                    <th scope="col">{messages.noScript.pairwiseHeaders.separation}</th>
                    <th scope="col">{messages.noScript.pairwiseHeaders.assessment}</th>
                    <th scope="col">{messages.noScript.pairwiseHeaders.interpretation}</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.adjacent_pairs.map((pair) => (
                    <tr key={`${pair.inner_index}-${pair.outer_index}`}>
                      <td>
                        {pair.inner_index}–{pair.outer_index}
                      </td>
                      <td>{numeric(pair.separation_mutual_hill, locale)}</td>
                      <td>{pair.spacing_assessment}</td>
                      <td>{pair.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p>{initialCalculation.stellar_consistency_note}</p>
            <p>{initialCalculation.stability_note}</p>
          </section>
        )}
        <section aria-labelledby="builder-nojs-model">
          <h2 id="builder-nojs-model">{messages.model.title}</h2>
          <p>{PLANETARY_SYSTEM_BUILDER_DEFINITION.sampling_policy}</p>
          <h3>{messages.model.limitations}</h3>
          <ul>
            {PLANETARY_SYSTEM_BUILDER_DEFINITION.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{messages.model.reviewedSources}</h3>
          <SourceList messages={messages.model} />
        </section>
      </article>
    </noscript>
  );
}
