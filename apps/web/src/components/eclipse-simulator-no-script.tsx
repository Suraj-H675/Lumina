import type { EclipseSimulatorCalculationResponse } from "@lumina/api-client";

import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { EclipseSimulatorMessages } from "../lib/i18n/messages/types";
import {
  ECLIPSE_SIMULATOR_DEFINITION,
  ECLIPSE_SIMULATOR_SOURCES,
  type EclipseSimulatorState,
} from "../lib/simulations/eclipse-simulator";

type EclipseSimulatorNoScriptProps = Readonly<{
  initialState: EclipseSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: EclipseSimulatorCalculationResponse | null;
  locale: PublishedLocale;
  messages: EclipseSimulatorMessages;
}>;

function number(value: number, locale: PublishedLocale, suffix = ""): string {
  const result = formatLocaleNumber(value, locale, { maximumSignificantDigits: 7 });
  return suffix ? `${result} ${suffix}` : result;
}

function SourceList({ messages }: Readonly<{ messages: EclipseSimulatorMessages["model"] }>) {
  return (
    <ul>
      {ECLIPSE_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = ECLIPSE_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
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

function Safety({ messages }: Readonly<{ messages: EclipseSimulatorMessages["safety"] }>) {
  const source = ECLIPSE_SIMULATOR_SOURCES.find((item) => item.id === "nasa-eclipse-safety");
  return (
    <section aria-labelledby="eclipse-nojs-safety">
      <h2 id="eclipse-nojs-safety">{messages.title}</h2>
      <p>
        Simulator output never determines whether direct Solar viewing is safe. Partial and annular
        phases require proper Solar viewing protection; cameras, binoculars, and telescopes require
        appropriate Solar filters on the Sun-facing optics.
      </p>
      {source ? <a href={source.url}>{messages.link}</a> : null}
    </section>
  );
}

export function EclipseSimulatorNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: EclipseSimulatorNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.noScript.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>
        <Safety messages={messages.safety} />
        {initialStateInvalid ? (
          <section aria-labelledby="eclipse-nojs-invalid">
            <h2 id="eclipse-nojs-invalid">{messages.invalidState.title}</h2>
            <p>{messages.invalidState.description}</p>
          </section>
        ) : null}
        <section aria-labelledby="eclipse-nojs-input">
          <h2 id="eclipse-nojs-input">{messages.noScript.observerTitle}</h2>
          <p>
            {messages.noScript.utcInstant}: {initialState.at_utc}
          </p>
          <p>
            {formatMessageTemplate(messages.noScript.observerLocation, {
              latitude: number(initialState.latitude_deg, locale),
              longitude: number(initialState.longitude_deg, locale),
              elevation: number(initialState.elevation_m, locale),
            })}
          </p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="eclipse-nojs-unavailable">
            <h2 id="eclipse-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <p>{messages.noScript.unavailableDescription}</p>
          </section>
        ) : (
          <section aria-labelledby="eclipse-nojs-result">
            <h2 id="eclipse-nojs-result">{messages.noScript.resultTitle}</h2>
            <p>
              {messages.noScript.modelVersion}: {initialCalculation.model_version}
            </p>
            <table>
              <caption>{messages.noScript.resultCaption}</caption>
              <tbody>
                <tr>
                  <th scope="row">{messages.noScript.resultLabels.phase}</th>
                  <td>{initialCalculation.instant.phase}</td>
                </tr>
                <tr>
                  <th scope="row">{messages.noScript.resultLabels.shadow}</th>
                  <td>{initialCalculation.instant.shadow_region}</td>
                </tr>
                <tr>
                  <th scope="row">{messages.noScript.resultLabels.sunRadius}</th>
                  <td>
                    {number(initialCalculation.instant.sun_angular_radius_deg, locale, "deg")}
                  </td>
                </tr>
                <tr>
                  <th scope="row">{messages.noScript.resultLabels.moonRadius}</th>
                  <td>
                    {number(initialCalculation.instant.moon_angular_radius_deg, locale, "deg")}
                  </td>
                </tr>
                <tr>
                  <th scope="row">{messages.noScript.resultLabels.centerSeparation}</th>
                  <td>{number(initialCalculation.instant.center_separation_deg, locale, "deg")}</td>
                </tr>
                <tr>
                  <th scope="row">{messages.noScript.resultLabels.obscuration}</th>
                  <td>
                    {number(initialCalculation.instant.obscuration_fraction * 100, locale, "%")}
                  </td>
                </tr>
                <tr>
                  <th scope="row">{messages.noScript.resultLabels.sunAltitude}</th>
                  <td>{number(initialCalculation.instant.sun_altitude_deg, locale, "deg")}</td>
                </tr>
              </tbody>
            </table>
            {initialCalculation.local_event ? (
              <>
                <h3>{messages.noScript.eventTitle}</h3>
                <p>
                  {messages.noScript.eventLabels.partialBegin}:{" "}
                  {initialCalculation.local_event.partial_begin_utc}
                </p>
                {initialCalculation.local_event.central_begin_utc ? (
                  <p>
                    {messages.noScript.eventLabels.centralBegin}:{" "}
                    {initialCalculation.local_event.central_begin_utc}
                  </p>
                ) : null}
                <p>
                  {messages.noScript.eventLabels.maximum}:{" "}
                  {initialCalculation.local_event.maximum_utc}
                </p>
                {initialCalculation.local_event.central_end_utc ? (
                  <p>
                    {messages.noScript.eventLabels.centralEnd}:{" "}
                    {initialCalculation.local_event.central_end_utc}
                  </p>
                ) : null}
                <p>
                  {messages.noScript.eventLabels.partialEnd}:{" "}
                  {initialCalculation.local_event.partial_end_utc}
                </p>
              </>
            ) : (
              <p>{messages.noScript.noEvent}</p>
            )}
            <p>{initialCalculation.ephemeris_note}</p>
            <p>{initialCalculation.timing_note}</p>
          </section>
        )}
        <section aria-labelledby="eclipse-nojs-model">
          <h2 id="eclipse-nojs-model">{messages.noScript.monthlyQuestion}</h2>
          <p>
            NASA explains that the Moon&apos;s orbit is inclined by roughly five degrees to the
            ecliptic, so at most new moons the lunar shadow passes above or below Earth.
          </p>
          <h3>{messages.noScript.modelLimitations}</h3>
          <ul>
            {ECLIPSE_SIMULATOR_DEFINITION.limitations.map((item) => (
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
