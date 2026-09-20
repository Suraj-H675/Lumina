import type { RelativityVisualizationsCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { RelativityVisualizationsMessages } from "../lib/i18n/messages/types";
import {
  RELATIVITY_LIGHT_CONE,
  RELATIVITY_VISUALIZATIONS_DEFINITION,
  RELATIVITY_VISUALIZATIONS_SOURCES,
  type RelativityVisualizationsState,
} from "../lib/simulations/relativity-visualizations";

type RelativityVisualizationsNoScriptProps = Readonly<{
  initialState: RelativityVisualizationsState;
  initialStateInvalid: boolean;
  initialCalculation: RelativityVisualizationsCalculationResponse | null;
  locale: PublishedLocale;
  messages: RelativityVisualizationsMessages;
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

function SourceList({
  messages,
}: Readonly<{ messages: RelativityVisualizationsMessages["model"] }>) {
  return (
    <ul>
      {RELATIVITY_VISUALIZATIONS_DEFINITION.references.map((sourceId) => {
        const source = RELATIVITY_VISUALIZATIONS_SOURCES.find(
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

export function RelativityVisualizationsNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: RelativityVisualizationsNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.noScript.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="relativity-nojs-invalid">
            <h2 id="relativity-nojs-invalid">{messages.invalidState.title}</h2>
            <p>{messages.invalidState.description}</p>
          </section>
        ) : null}
        <section aria-labelledby="relativity-nojs-input">
          <h2 id="relativity-nojs-input">{messages.noScript.requestedStateTitle}</h2>
          <p>
            {messages.noScript.stateLabels.relativeSpeed}:{" "}
            {numeric(initialState.relative_speed_fraction_c, locale)} c
          </p>
          <p>
            {messages.noScript.stateLabels.properTime}:{" "}
            {numeric(initialState.proper_time_s, locale, "s")}
          </p>
          <p>
            {messages.noScript.stateLabels.properLength}:{" "}
            {numeric(initialState.proper_length_m, locale, "m")}
          </p>
          <p>
            {messages.noScript.stateLabels.separation}:{" "}
            {numeric(initialState.simultaneous_event_separation_m, locale, "m")}
          </p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="relativity-nojs-unavailable">
            <h2 id="relativity-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <p>{messages.noScript.unavailableDescription}</p>
          </section>
        ) : (
          <>
            <section aria-labelledby="relativity-nojs-result">
              <h2 id="relativity-nojs-result">{messages.noScript.result.title}</h2>
              <p>
                {messages.noScript.result.modelVersion}: {initialCalculation.model_version}
              </p>
              <p>
                {messages.noScript.result.relativeSpeed}:{" "}
                {numeric(initialCalculation.relative_speed_m_s, locale, "m/s")}
              </p>
              <p>
                {messages.noScript.result.lorentzFactor}:{" "}
                {numeric(initialCalculation.lorentz_factor, locale)}
              </p>
            </section>
            <section aria-labelledby="relativity-nojs-time">
              <h2 id="relativity-nojs-time">{messages.noScript.result.timeTitle}</h2>
              <p>
                {messages.noScript.result.dilatedInterval}:{" "}
                {numeric(initialCalculation.dilated_time_s, locale, "s")}
              </p>
              <p>{initialCalculation.time_dilation_note}</p>
            </section>
            <section aria-labelledby="relativity-nojs-length">
              <h2 id="relativity-nojs-length">{messages.noScript.result.lengthTitle}</h2>
              <p>
                {messages.noScript.result.movingLength}:{" "}
                {numeric(initialCalculation.contracted_length_m, locale, "m")}
              </p>
              <p>{initialCalculation.length_contraction_note}</p>
            </section>
            <section aria-labelledby="relativity-nojs-simultaneity">
              <h2 id="relativity-nojs-simultaneity">
                {messages.noScript.result.simultaneityTitle}
              </h2>
              <p>
                {messages.noScript.result.simultaneityOffset}:{" "}
                {numeric(initialCalculation.simultaneity_offset_s, locale, "s")}
              </p>
              <p>{initialCalculation.simultaneity_interpretation}</p>
            </section>
          </>
        )}
        <section aria-labelledby="relativity-nojs-light-cone">
          <h2 id="relativity-nojs-light-cone">{messages.lightCone.noScriptTitle}</h2>
          <p>{RELATIVITY_LIGHT_CONE.note}</p>
          <p>
            {formatMessageTemplate(messages.lightCone.noScriptCoordinateConvention, {
              coordinateSystem: RELATIVITY_LIGHT_CONE.coordinate_system,
            })}
          </p>
          <ul>
            {RELATIVITY_LIGHT_CONE.segments.map((segment) => (
              <li key={segment.id}>
                {segment.id}: ({segment.x0}, {segment.ct0}) → ({segment.x1}, {segment.ct1})
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="relativity-nojs-gravity">
          <h2 id="relativity-nojs-gravity">{messages.gravity.noScriptTitle}</h2>
          <p>
            <a href="/lab/black-hole-relativity">{messages.gravity.noScriptLink}</a>{" "}
            {messages.gravity.noScriptSuffix}
          </p>
        </section>
        <section aria-labelledby="relativity-nojs-model">
          <h2 id="relativity-nojs-model">{messages.model.title}</h2>
          <h3>{messages.model.assumptions}</h3>
          <ul>
            {RELATIVITY_VISUALIZATIONS_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{messages.model.limitations}</h3>
          <ul>
            {RELATIVITY_VISUALIZATIONS_DEFINITION.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{messages.model.equations}</h3>
          <ul>
            {RELATIVITY_VISUALIZATIONS_DEFINITION.equations.map((equation) => (
              <li key={equation.id}>
                <strong>{equation.id}:</strong> <code>{equation.expression}</code> —{" "}
                {equation.meaning}
              </li>
            ))}
          </ul>
          <h3>{messages.model.reviewedSources}</h3>
          <SourceList messages={messages.model} />
        </section>
      </article>
    </noscript>
  );
}
