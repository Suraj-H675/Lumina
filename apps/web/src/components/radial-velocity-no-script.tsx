import type { RadialVelocityCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { RadialVelocityMessages } from "../lib/i18n/messages/types";
import {
  RADIAL_VELOCITY_DEFINITION,
  RADIAL_VELOCITY_SOURCES,
  type RadialVelocityState,
} from "../lib/simulations/radial-velocity";

type RadialVelocityNoScriptProps = Readonly<{
  initialState: RadialVelocityState;
  initialStateInvalid: boolean;
  initialCalculation: RadialVelocityCalculationResponse | null;
  locale: PublishedLocale;
  messages: RadialVelocityMessages;
}>;

function numeric(value: number, locale: PublishedLocale, unit = ""): string {
  let formatted: string;
  if (value === 0) {
    formatted = formatLocaleNumber(0, locale, { useGrouping: false });
  } else if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(6).split("e");
    formatted = `${formatLocaleFixedNumber(Number(mantissa), 6, locale)}e${exponent}`;
  } else {
    formatted = formatLocaleNumber(value, locale, { maximumSignificantDigits: 8 });
  }
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList({ messages }: Readonly<{ messages: RadialVelocityMessages["model"] }>) {
  return (
    <ul>
      {RADIAL_VELOCITY_DEFINITION.references.map((sourceId) => {
        const source = RADIAL_VELOCITY_SOURCES.find((candidate) => candidate.id === sourceId);
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

function ResultTable({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: RadialVelocityMessages;
  result: RadialVelocityCalculationResponse;
}>) {
  const labels = messages.result.noScriptLabels;
  return (
    <table>
      <caption>{messages.result.noScriptCaption}</caption>
      <tbody>
        <tr>
          <th scope="row">{labels.semiAmplitude}</th>
          <td>{numeric(result.semi_amplitude_m_s, locale, "m/s")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.inclinationProjection}</th>
          <td>{numeric(result.inclination_projection, locale)}</td>
        </tr>
        <tr>
          <th scope="row">{labels.projectedMass}</th>
          <td>{numeric(result.projected_planet_mass_kg, locale, "kg")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.massFunction}</th>
          <td>{numeric(result.mass_function_kg, locale, "kg")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.edgeOnMinimumMass}</th>
          <td>{numeric(result.edge_on_minimum_mass_kg, locale, "kg")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.samples}</th>
          <td>{formatLocaleNumber(result.curve.length, locale)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function RadialVelocityNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: RadialVelocityNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.header.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>
        {initialStateInvalid ? (
          <aside role="alert">
            <h2>{messages.invalidState.title}</h2>
            <p>{messages.invalidState.description}</p>
          </aside>
        ) : null}
        <section aria-labelledby="rv-noscript-state">
          <h2 id="rv-noscript-state">{messages.noScript.currentStateTitle}</h2>
          <dl>
            <div>
              <dt>{messages.noScript.stateLabels.stellarMass}</dt>
              <dd>{numeric(initialState.stellar_mass_kg, locale, "kg")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.companionMass}</dt>
              <dd>{numeric(initialState.planet_mass_kg, locale, "kg")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.orbitalPeriod}</dt>
              <dd>{numeric(initialState.orbital_period_s, locale, "s")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.eccentricity}</dt>
              <dd>{numeric(initialState.eccentricity, locale)}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.inclination}</dt>
              <dd>{numeric(initialState.inclination_deg, locale, "deg")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.argumentOfPeriastron}</dt>
              <dd>{numeric(initialState.stellar_argument_of_periastron_deg, locale, "deg")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.meanAnomalyAtEpoch}</dt>
              <dd>{numeric(initialState.mean_anomaly_at_epoch_deg, locale, "deg")}</dd>
            </div>
          </dl>
        </section>
        {initialCalculation === null ? (
          <section role="alert">
            <h2>{messages.result.unavailableNoScriptTitle}</h2>
            <p>{messages.result.unavailableNoScriptDescription}</p>
          </section>
        ) : (
          <section aria-labelledby="rv-noscript-result">
            <h2 id="rv-noscript-result">{messages.result.title}</h2>
            <p>
              {formatMessageTemplate(messages.result.model, {
                modelVersion: initialCalculation.model_version,
              })}
            </p>
            <ResultTable locale={locale} messages={messages} result={initialCalculation} />
          </section>
        )}
        <section aria-labelledby="rv-noscript-model">
          <h2 id="rv-noscript-model">{messages.noScript.modelTitle}</h2>
          <p>{RADIAL_VELOCITY_DEFINITION.sampling_policy}</p>
          <p>{RADIAL_VELOCITY_DEFINITION.default_preset}</p>
          <h3>{messages.minimumMass.noScriptTitle}</h3>
          <p>{messages.minimumMass.noScriptDescription}</p>
          <h3>{messages.model.equations}</h3>
          <dl>
            {Object.entries(RADIAL_VELOCITY_DEFINITION.equations).map(([name, equation]) => (
              <div key={name}>
                <dt>{name.replaceAll("_", " ")}</dt>
                <dd>{equation}</dd>
              </div>
            ))}
          </dl>
          <h3>{messages.model.assumptions}</h3>
          <ul>
            {RADIAL_VELOCITY_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{messages.model.limitations}</h3>
          <ul>
            {RADIAL_VELOCITY_DEFINITION.limitations.map((item) => (
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
