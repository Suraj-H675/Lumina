import {
  TELESCOPE_CONSTANTS,
  TELESCOPE_DEFINITION,
  TELESCOPE_PRESETS,
  TELESCOPE_SOURCES,
  TELESCOPE_WARNING_COPY,
  type TelescopeBuilderState,
} from "../lib/simulations/telescope-builder";
import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { TelescopeBuilderMessages } from "../lib/i18n/messages/types";
import type { TelescopeBuilderCalculationResponse } from "@lumina/api-client";

type TelescopeBuilderNoScriptProps = Readonly<{
  initialState: TelescopeBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: TelescopeBuilderCalculationResponse | null;
  locale: PublishedLocale;
  messages: TelescopeBuilderMessages;
}>;

function format(value: number, locale: PublishedLocale, digits = 2): string {
  return formatLocaleFixedNumber(value, digits, locale);
}

function sourceForId(id: string) {
  return TELESCOPE_SOURCES.find((source) => source.id === id);
}

function SourceReferences({
  messages,
  sourceIds,
}: Readonly<{
  messages: TelescopeBuilderMessages["model"];
  sourceIds: ReadonlyArray<string>;
}>) {
  return (
    <ul>
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.sourceUnavailable, { sourceId })}</>
            ) : (
              <>
                <a href={source.url} rel="noreferrer">
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

function ResultRows({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: TelescopeBuilderMessages["noScript"]["result"];
  result: TelescopeBuilderCalculationResponse;
}>) {
  return (
    <tbody>
      <tr>
        <th scope="row">{messages.labels.effectiveFocalLength}</th>
        <td>{format(result.effective_focal_length_mm, locale)} mm</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.nativeFocalRatio}</th>
        <td>f/{format(result.native_focal_ratio, locale)}</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.effectiveFocalRatio}</th>
        <td>f/{format(result.effective_focal_ratio, locale)}</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.magnification}</th>
        <td>{format(result.magnification_x, locale, 1)}×</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.trueField}</th>
        <td>{format(result.approx_true_field_deg, locale)}°</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.exitPupil}</th>
        <td>{format(result.exit_pupil_mm, locale)} mm</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.dawesReference}</th>
        <td>{format(result.dawes_limit_arcsec, locale)} arcsec</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.rayleighReference}</th>
        <td>{format(result.rayleigh_limit_arcsec, locale)} arcsec</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.collectingAreaRatio}</th>
        <td>{format(result.ideal_light_gathering_ratio_vs_7mm_pupil, locale, 1)}×</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.targetAngularSize}</th>
        <td>{format(result.target_angular_size_deg, locale)}°</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.targetFieldFraction}</th>
        <td>{format(result.target_field_fraction * 100, locale, 1)}%</td>
      </tr>
      <tr>
        <th scope="row">{messages.labels.targetFit}</th>
        <td>{result.target_fit}</td>
      </tr>
    </tbody>
  );
}

/** Server-rendered semantic alternative that remains useful when JavaScript is disabled. */
export function TelescopeBuilderNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
  locale,
  messages,
}: TelescopeBuilderNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>{messages.noScript.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>

        {initialStateInvalid ? (
          <aside aria-label={messages.invalidState.title} role="alert">
            <h2 id="no-script-invalid-telescope-state-heading">{messages.invalidState.title}</h2>
            <p>{messages.noScript.invalidDescription}</p>
          </aside>
        ) : null}

        <section aria-labelledby="no-script-telescope-state-heading">
          <h2 id="no-script-telescope-state-heading">{messages.noScript.currentState.title}</h2>
          <dl>
            <div>
              <dt>{messages.noScript.currentState.aperture}</dt>
              <dd>{format(initialState.aperture_mm, locale)} mm</dd>
            </div>
            <div>
              <dt>{messages.noScript.currentState.telescopeFocalLength}</dt>
              <dd>{format(initialState.telescope_focal_length_mm, locale)} mm</dd>
            </div>
            <div>
              <dt>{messages.noScript.currentState.telescopeType}</dt>
              <dd>{initialState.telescope_type}</dd>
            </div>
            <div>
              <dt>{messages.noScript.currentState.eyepieceFocalLength}</dt>
              <dd>{format(initialState.eyepiece_focal_length_mm, locale)} mm</dd>
            </div>
            <div>
              <dt>{messages.noScript.currentState.eyepieceApparentField}</dt>
              <dd>{format(initialState.eyepiece_apparent_field_deg, locale)}°</dd>
            </div>
            <div>
              <dt>{messages.noScript.currentState.modifier}</dt>
              <dd>
                {initialState.optical_modifier_kind},{" "}
                {format(initialState.optical_modifier_factor, locale, 2)}×
              </dd>
            </div>
            <div>
              <dt>{messages.noScript.currentState.targetAngularExtent}</dt>
              <dd>{format(initialState.target_angular_size_arcmin, locale, 2)} arcmin</dd>
            </div>
          </dl>
        </section>

        {initialCalculation === null ? (
          <section aria-labelledby="no-script-telescope-unavailable-heading" role="alert">
            <h2 id="no-script-telescope-unavailable-heading">
              {messages.noScript.unavailableTitle}
            </h2>
            <p>{messages.noScript.unavailableDescription}</p>
          </section>
        ) : (
          <section aria-labelledby="no-script-telescope-results-heading">
            <h2 id="no-script-telescope-results-heading">{messages.noScript.result.title}</h2>
            <table>
              <caption>{messages.noScript.result.caption}</caption>
              <ResultRows
                locale={locale}
                messages={messages.noScript.result}
                result={initialCalculation}
              />
            </table>
            {initialCalculation.warning_codes.length > 0 ? (
              <div role="note">
                <h3>{messages.noScript.result.warningsTitle}</h3>
                <ul>
                  {initialCalculation.warning_codes.map((warning) => (
                    <li key={warning}>
                      <strong>{warning}:</strong> {TELESCOPE_WARNING_COPY[warning]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>{messages.noScript.result.noWarnings}</p>
            )}
          </section>
        )}

        <section aria-labelledby="no-script-telescope-model-heading">
          <h2 id="no-script-telescope-model-heading">{messages.noScript.model.title}</h2>
          <p>
            <strong>{messages.noScript.model.modelVersionLabel}</strong>{" "}
            {formatMessageTemplate(messages.noScript.model.modelVersionSummary, {
              modelVersion: TELESCOPE_DEFINITION.model_version,
              schemaVersion: formatLocaleNumber(TELESCOPE_DEFINITION.share_schema_version, locale),
            })}
          </p>
          <h3>{messages.noScript.model.equations}</h3>
          <dl>
            {Object.entries(TELESCOPE_DEFINITION.calculation_module.equations).map(
              ([name, equation]) => (
                <div key={name}>
                  <dt>{name.replaceAll("_", " ")}</dt>
                  <dd>{equation}</dd>
                </div>
              ),
            )}
          </dl>
          <h3>{messages.noScript.model.validityAndAssumptions}</h3>
          <ul>
            {TELESCOPE_DEFINITION.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
          <p>{TELESCOPE_DEFINITION.telescope_type_disclosure}</p>
          <p>{TELESCOPE_DEFINITION.modifier_semantics}</p>
          <p>{TELESCOPE_DEFINITION.target_fit_definition}</p>
          <h3>{messages.noScript.model.limitations}</h3>
          <ul>
            {TELESCOPE_DEFINITION.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <p>
            <strong>{messages.noScript.model.frozenConstantsLabel}</strong>{" "}
            {Object.entries(TELESCOPE_CONSTANTS)
              .map(([key, value]) => `${key}=${value}`)
              .join("; ")}
            .{" "}
            {formatMessageTemplate(messages.noScript.model.defaultPresetSummary, {
              presets: Object.keys(TELESCOPE_PRESETS).join(", "),
            })}
          </p>
          <h3>{messages.noScript.model.references}</h3>
          <SourceReferences messages={messages.model} sourceIds={TELESCOPE_DEFINITION.references} />
        </section>
      </article>
    </noscript>
  );
}
