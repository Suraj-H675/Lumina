import type { TransitMethodCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { TransitMethodMessages } from "../lib/i18n/messages/types";
import {
  TRANSIT_DEFINITION,
  TRANSIT_SOURCES,
  type TransitMethodState,
} from "../lib/simulations/transit-method";

type TransitMethodNoScriptProps = Readonly<{
  initialState: TransitMethodState;
  initialStateInvalid: boolean;
  initialCalculation: TransitMethodCalculationResponse | null;
  locale: PublishedLocale;
  messages: TransitMethodMessages;
}>;

function numeric(
  value: number | null,
  locale: PublishedLocale,
  notApplicable: string,
  unit = "",
): string {
  if (value === null) return notApplicable;
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

function SourceList({ messages }: Readonly<{ messages: TransitMethodMessages["model"] }>) {
  return (
    <ul>
      {TRANSIT_DEFINITION.references.map((sourceId) => {
        const source = TRANSIT_SOURCES.find((candidate) => candidate.id === sourceId);
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
  messages: TransitMethodMessages;
  result: TransitMethodCalculationResponse;
}>) {
  const labels = messages.result.noScriptLabels;
  const classification = {
    full: messages.classification.full,
    grazing: messages.classification.grazing,
    no_transit: messages.classification.noTransit,
  }[result.classification];
  return (
    <table>
      <caption>{messages.result.noScriptCaption}</caption>
      <tbody>
        <tr>
          <th scope="row">{labels.alignment}</th>
          <td>{classification}</td>
        </tr>
        <tr>
          <th scope="row">{labels.radiusRatio}</th>
          <td>{numeric(result.radius_ratio, locale, messages.notApplicable)}</td>
        </tr>
        <tr>
          <th scope="row">{labels.scaledSemiMajorAxis}</th>
          <td>{numeric(result.scaled_semi_major_axis, locale, messages.notApplicable)}</td>
        </tr>
        <tr>
          <th scope="row">{labels.impactParameter}</th>
          <td>{numeric(result.impact_parameter, locale, messages.notApplicable)}</td>
        </tr>
        <tr>
          <th scope="row">{labels.centralDepthApproximation}</th>
          <td>
            {numeric(result.central_depth_approximation_fraction, locale, messages.notApplicable)}
          </td>
        </tr>
        <tr>
          <th scope="row">{labels.maximumUniformSourceDepth}</th>
          <td>{numeric(result.maximum_depth_fraction, locale, messages.notApplicable)}</td>
        </tr>
        <tr>
          <th scope="row">{labels.maximumDepth}</th>
          <td>{numeric(result.maximum_depth_ppm, locale, messages.notApplicable, "ppm")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.totalDuration}</th>
          <td>{numeric(result.total_duration_s, locale, messages.notApplicable, "s")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.fullDuration}</th>
          <td>{numeric(result.full_duration_s, locale, messages.notApplicable, "s")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.lightCurveSamples}</th>
          <td>{formatLocaleNumber(result.light_curve.length, locale)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function TransitMethodNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: TransitMethodNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.noScript.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>
        {initialStateInvalid ? (
          <aside role="alert">
            <h2>{messages.invalidState.title}</h2>
            <p>{messages.invalidState.description}</p>
          </aside>
        ) : null}
        <section aria-labelledby="transit-noscript-state">
          <h2 id="transit-noscript-state">{messages.noScript.currentStateTitle}</h2>
          <dl>
            <div>
              <dt>{messages.noScript.stateLabels.stellarRadius}</dt>
              <dd>{numeric(initialState.stellar_radius_m, locale, messages.notApplicable, "m")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.planetRadius}</dt>
              <dd>{numeric(initialState.planet_radius_m, locale, messages.notApplicable, "m")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.semiMajorAxis}</dt>
              <dd>
                {numeric(initialState.semi_major_axis_m, locale, messages.notApplicable, "m")}
              </dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.orbitalPeriod}</dt>
              <dd>{numeric(initialState.orbital_period_s, locale, messages.notApplicable, "s")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.inclination}</dt>
              <dd>
                {numeric(initialState.inclination_deg, locale, messages.notApplicable, "deg")}
              </dd>
            </div>
          </dl>
        </section>
        {initialCalculation === null ? (
          <section role="alert">
            <h2>{messages.result.unavailableNoScriptTitle}</h2>
            <p>{messages.result.unavailableNoScriptDescription}</p>
          </section>
        ) : (
          <section aria-labelledby="transit-noscript-result">
            <h2 id="transit-noscript-result">{messages.result.noScriptTitle}</h2>
            <p>
              {formatMessageTemplate(messages.result.model, {
                modelVersion: initialCalculation.model_version,
              })}
            </p>
            <ResultTable locale={locale} messages={messages} result={initialCalculation} />
          </section>
        )}
        <section aria-labelledby="transit-noscript-model">
          <h2 id="transit-noscript-model">{messages.noScript.modelTitle}</h2>
          <p>{TRANSIT_DEFINITION.sampling_policy}</p>
          <p>{TRANSIT_DEFINITION.default_preset}</p>
          <h3>{messages.model.equations}</h3>
          <dl>
            {Object.entries(TRANSIT_DEFINITION.equations).map(([name, equation]) => (
              <div key={name}>
                <dt>{name.replaceAll("_", " ")}</dt>
                <dd>{equation}</dd>
              </div>
            ))}
          </dl>
          <h3>{messages.model.assumptions}</h3>
          <ul>
            {TRANSIT_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{messages.model.limitations}</h3>
          <ul>
            {TRANSIT_DEFINITION.limitations.map((item) => (
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
