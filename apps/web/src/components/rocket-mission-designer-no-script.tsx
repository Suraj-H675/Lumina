import type { RocketMissionDesignerCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { RocketMissionDesignerMessages } from "../lib/i18n/messages/types";
import {
  ROCKET_MISSION_DESIGNER_DEFINITION,
  ROCKET_MISSION_DESIGNER_SOURCES,
  type RocketMissionDesignerState,
} from "../lib/simulations/rocket-mission-designer";

type RocketMissionDesignerNoScriptProps = Readonly<{
  initialState: RocketMissionDesignerState;
  initialStateInvalid: boolean;
  initialCalculation: RocketMissionDesignerCalculationResponse | null;
  locale: PublishedLocale;
  messages: RocketMissionDesignerMessages;
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

function SourceList({ messages }: Readonly<{ messages: RocketMissionDesignerMessages["model"] }>) {
  return (
    <ul>
      {ROCKET_MISSION_DESIGNER_DEFINITION.references.map((sourceId) => {
        const source = ROCKET_MISSION_DESIGNER_SOURCES.find(
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

export function RocketMissionDesignerNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: RocketMissionDesignerNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.noScript.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="rocket-nojs-invalid">
            <h2 id="rocket-nojs-invalid">{messages.invalidState.title}</h2>
            <p>{messages.invalidState.description}</p>
          </section>
        ) : null}
        <section aria-labelledby="rocket-nojs-input">
          <h2 id="rocket-nojs-input">{messages.noScript.requestedTitle}</h2>
          <p>
            {messages.noScript.stateLabels.gravityBody}: {initialState.gravity_body}
          </p>
          <p>
            {messages.noScript.stateLabels.reference}: {initialState.delta_v_reference_id}
          </p>
          <p>
            {messages.noScript.stateLabels.payload}:{" "}
            {numeric(initialState.payload_mass_kg, locale, "kg")}
          </p>
          <table>
            <caption>{messages.noScript.inputCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{messages.noScript.inputHeaders.stage}</th>
                <th scope="col">{messages.noScript.inputHeaders.dryMass}</th>
                <th scope="col">{messages.noScript.inputHeaders.propellant}</th>
                <th scope="col">{messages.noScript.inputHeaders.isp}</th>
                <th scope="col">{messages.noScript.inputHeaders.thrust}</th>
              </tr>
            </thead>
            <tbody>
              {initialState.stages.map((stage, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{numeric(stage.dry_mass_kg, locale)}</td>
                  <td>{numeric(stage.propellant_mass_kg, locale)}</td>
                  <td>{numeric(stage.specific_impulse_s, locale)}</td>
                  <td>{numeric(stage.thrust_n, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="rocket-nojs-unavailable">
            <h2 id="rocket-nojs-unavailable">{messages.noScript.unavailableTitle}</h2>
            <p>{messages.noScript.unavailableDescription}</p>
          </section>
        ) : (
          <>
            <section aria-labelledby="rocket-nojs-result">
              <h2 id="rocket-nojs-result">{messages.noScript.resultTitle}</h2>
              <p>
                {messages.noScript.modelVersion}: {initialCalculation.model_version}
              </p>
              <p>
                {messages.noScript.resultLabels.totalIdealDeltaV}:{" "}
                {numeric(initialCalculation.total_ideal_delta_v_m_s, locale, "m/s")}
              </p>
              <p>
                {messages.noScript.resultLabels.selectedGravity}:{" "}
                {numeric(initialCalculation.selected_surface_gravity_m_s2, locale, "m/s²")}
              </p>
              <table>
                <caption>{messages.noScript.stageCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{messages.noScript.resultStageHeaders.stage}</th>
                    <th scope="col">{messages.noScript.resultStageHeaders.ignitionMass}</th>
                    <th scope="col">{messages.noScript.resultStageHeaders.burnoutMass}</th>
                    <th scope="col">{messages.noScript.resultStageHeaders.idealDeltaV}</th>
                    <th scope="col">{messages.noScript.resultStageHeaders.twr}</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.stages.map((stage) => (
                    <tr key={stage.index}>
                      <td>{stage.index}</td>
                      <td>{numeric(stage.ignition_mass_kg, locale)}</td>
                      <td>{numeric(stage.burnout_before_jettison_mass_kg, locale)}</td>
                      <td>{numeric(stage.ideal_delta_v_m_s, locale)}</td>
                      <td>{numeric(stage.surface_gravity_thrust_to_weight, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                {messages.noScript.resultLabels.launchMass}:{" "}
                {numeric(initialCalculation.mass_fractions.launch_mass_kg, locale, "kg")};{" "}
                {messages.noScript.resultLabels.propellantFraction}:{" "}
                {numeric(
                  initialCalculation.mass_fractions.propellant_fraction_of_launch_mass,
                  locale,
                )}
                ; {messages.noScript.resultLabels.payloadFraction}:{" "}
                {numeric(initialCalculation.mass_fractions.payload_fraction_of_launch_mass, locale)}
                .
              </p>
            </section>
            <section aria-labelledby="rocket-nojs-payload">
              <h2 id="rocket-nojs-payload">{messages.noScript.payloadTitle}</h2>
              <p>{messages.noScript.payloadDescription}</p>
              <table>
                <caption>{messages.noScript.payloadCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{messages.payload.headers.multiplier}</th>
                    <th scope="col">{messages.payload.headers.payload}</th>
                    <th scope="col">{messages.payload.headers.totalDeltaV}</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.payload_tradeoff.map((point) => (
                    <tr key={point.payload_multiplier}>
                      <td>{numeric(point.payload_multiplier, locale)}</td>
                      <td>{numeric(point.payload_mass_kg, locale)}</td>
                      <td>{numeric(point.total_ideal_delta_v_m_s, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section aria-labelledby="rocket-nojs-reference">
              <h2 id="rocket-nojs-reference">{messages.noScript.referenceTitle}</h2>
              <p>{initialCalculation.reference_comparison.label}</p>
              <p>
                {messages.referenceResult.labels.value}:{" "}
                {numeric(
                  initialCalculation.reference_comparison.reference_value_m_s,
                  locale,
                  "m/s",
                )}
              </p>
              <p>
                {messages.noScript.referenceDifference}:{" "}
                {numeric(
                  initialCalculation.reference_comparison.ideal_delta_v_difference_m_s,
                  locale,
                  "m/s",
                )}
              </p>
              <p>{initialCalculation.reference_comparison.interpretation}</p>
              <p>{initialCalculation.model_note}</p>
            </section>
          </>
        )}
        <section aria-labelledby="rocket-nojs-model">
          <h2 id="rocket-nojs-model">{messages.model.title}</h2>
          <p>{ROCKET_MISSION_DESIGNER_DEFINITION.default_preset}</p>
          <h3>{messages.model.limitations}</h3>
          <ul>
            {ROCKET_MISSION_DESIGNER_DEFINITION.limitations.map((item) => (
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
