import type { OrbitSandboxCalculationResponse } from "@lumina/api-client";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { OrbitSandboxMessages } from "../lib/i18n/messages/types";
import {
  ORBIT_DEFINITION,
  ORBIT_SOURCES,
  type OrbitSandboxState,
} from "../lib/simulations/orbit-sandbox";

type OrbitSandboxNoScriptProps = Readonly<{
  initialState: OrbitSandboxState;
  initialStateInvalid: boolean;
  initialCalculation: OrbitSandboxCalculationResponse | null;
  locale: PublishedLocale;
  messages: OrbitSandboxMessages;
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

function SourceList({ messages }: Readonly<{ messages: OrbitSandboxMessages["model"] }>) {
  return (
    <ul>
      {ORBIT_DEFINITION.references.map((sourceId) => {
        const source = ORBIT_SOURCES.find((candidate) => candidate.id === sourceId);
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
  messages: OrbitSandboxMessages;
  result: OrbitSandboxCalculationResponse;
}>) {
  const labels = messages.result.labels;
  const classification = {
    bound: messages.classification.bound,
    collision: messages.classification.collision,
    escape: messages.classification.escape,
    parabolic_near: messages.classification.parabolicNear,
  }[result.classification];
  return (
    <table>
      <caption>{messages.result.noScriptCaption}</caption>
      <tbody>
        <tr>
          <th scope="row">{labels.classification}</th>
          <td>{classification}</td>
        </tr>
        <tr>
          <th scope="row">{labels.eccentricity}</th>
          <td>{numeric(result.eccentricity, locale, messages.notApplicable)}</td>
        </tr>
        <tr>
          <th scope="row">{labels.specificOrbitalEnergy}</th>
          <td>
            {numeric(
              result.specific_orbital_energy_j_per_kg,
              locale,
              messages.notApplicable,
              "J/kg",
            )}
          </td>
        </tr>
        <tr>
          <th scope="row">{labels.specificAngularMomentum}</th>
          <td>
            {numeric(
              result.specific_angular_momentum_m2_per_s,
              locale,
              messages.notApplicable,
              "m²/s",
            )}
          </td>
        </tr>
        <tr>
          <th scope="row">{labels.semiMajorAxis}</th>
          <td>{numeric(result.semi_major_axis_m, locale, messages.notApplicable, "m")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.period}</th>
          <td>{numeric(result.period_s, locale, messages.notApplicable, "s")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.periapsis}</th>
          <td>{numeric(result.periapsis_m, locale, messages.notApplicable, "m")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.apoapsis}</th>
          <td>{numeric(result.apoapsis_m, locale, messages.notApplicable, "m")}</td>
        </tr>
        <tr>
          <th scope="row">{messages.noScript.collisionTimeLabel}</th>
          <td>{numeric(result.collision_time_s, locale, messages.notApplicable, "s")}</td>
        </tr>
        <tr>
          <th scope="row">{labels.trajectorySamples}</th>
          <td>{formatLocaleNumber(result.trajectory.length, locale)}</td>
        </tr>
        <tr>
          <th scope="row">{labels.maxSpecificEnergyDrift}</th>
          <td>
            {numeric(result.max_specific_energy_drift_fraction, locale, messages.notApplicable)}
          </td>
        </tr>
        <tr>
          <th scope="row">{labels.maxAngularMomentumDrift}</th>
          <td>
            {numeric(
              result.max_specific_angular_momentum_drift_fraction,
              locale,
              messages.notApplicable,
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function OrbitSandboxNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: OrbitSandboxNoScriptProps) {
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
        <section aria-labelledby="orbit-noscript-state">
          <h2 id="orbit-noscript-state">{messages.noScript.currentStateTitle}</h2>
          <dl>
            <div>
              <dt>{messages.noScript.stateLabels.centralMass}</dt>
              <dd>{numeric(initialState.central_mass_kg, locale, messages.notApplicable, "kg")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.centralRadius}</dt>
              <dd>{numeric(initialState.central_radius_m, locale, messages.notApplicable, "m")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.secondaryMass}</dt>
              <dd>
                {numeric(initialState.orbiting_body_mass_kg, locale, messages.notApplicable, "kg")}
              </dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.initialPosition}</dt>
              <dd>
                ({numeric(initialState.position_x_m, locale, messages.notApplicable, "m")},{" "}
                {numeric(initialState.position_y_m, locale, messages.notApplicable, "m")})
              </dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.initialVelocity}</dt>
              <dd>
                ({numeric(initialState.velocity_x_m_s, locale, messages.notApplicable, "m/s")},{" "}
                {numeric(initialState.velocity_y_m_s, locale, messages.notApplicable, "m/s")})
              </dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.duration}</dt>
              <dd>{numeric(initialState.duration_s, locale, messages.notApplicable, "s")}</dd>
            </div>
            <div>
              <dt>{messages.noScript.stateLabels.timeStep}</dt>
              <dd>{numeric(initialState.time_step_s, locale, messages.notApplicable, "s")}</dd>
            </div>
          </dl>
        </section>
        {initialCalculation === null ? (
          <section role="alert">
            <h2>{messages.result.unavailableNoScriptTitle}</h2>
            <p>{messages.result.unavailableNoScriptDescription}</p>
          </section>
        ) : (
          <section aria-labelledby="orbit-noscript-result">
            <h2 id="orbit-noscript-result">{messages.result.noScriptTitle}</h2>
            <p>
              {formatMessageTemplate(messages.result.model, {
                modelVersion: initialCalculation.model_version,
              })}
            </p>
            <ResultTable locale={locale} messages={messages} result={initialCalculation} />
          </section>
        )}
        <section aria-labelledby="orbit-noscript-model">
          <h2 id="orbit-noscript-model">{messages.noScript.modelTitle}</h2>
          <p>{ORBIT_DEFINITION.calculation_module.valid_domain}</p>
          <p>{ORBIT_DEFINITION.calculation_module.numerical_policy}</p>
          <h3>{messages.model.equations}</h3>
          <dl>
            {Object.entries(ORBIT_DEFINITION.calculation_module.equations).map(
              ([name, equation]) => (
                <div key={name}>
                  <dt>{name.replaceAll("_", " ")}</dt>
                  <dd>{equation}</dd>
                </div>
              ),
            )}
          </dl>
          <h3>{messages.model.assumptions}</h3>
          <ul>
            {ORBIT_DEFINITION.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>{messages.model.limitations}</h3>
          <ul>
            {ORBIT_DEFINITION.limitations.map((item) => (
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
