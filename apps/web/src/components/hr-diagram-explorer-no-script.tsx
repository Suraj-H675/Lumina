import {
  HR_DIAGRAM_DEFINITION,
  HR_DIAGRAM_RECORDS,
  HR_DIAGRAM_SOURCES,
  filterHRDiagramRecords,
  selectedHRDiagramRecord,
  type HRDiagramRecord,
  type HRDiagramState,
  type HRDiagramView,
} from "../lib/simulations/hr-diagram-explorer";
import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { HRDiagramExplorerMessages } from "../lib/i18n/messages/types";

type HRDiagramExplorerNoScriptProps = Readonly<{
  initialState: HRDiagramState;
  initialStateInvalid: boolean;
  locale: PublishedLocale;
  messages: HRDiagramExplorerMessages;
}>;

const CLUSTER_LABELS = {
  pleiades: "Pleiades",
  hyades: "Hyades",
  praesepe: "Praesepe",
  m67: "M 67",
} as const;

const STAGE_LABELS = {
  main_sequence: "Main sequence",
  turnoff_transition: "Turn-off / pre-RGB transition",
  red_giant_branch: "Red giant branch",
} as const;

function formatTemperature(value: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber(value, 0, locale)} K`;
}

function formatLuminosity(value: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber(value, 3, locale)} L☉`;
}

function formatMagnitude(value: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber(value, 3, locale)} mag`;
}

function formatColour(value: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber(value, 3, locale)} mag`;
}

function formatParallax(value: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber(value, 3, locale)} mas`;
}

function sourceForId(id: string) {
  return HR_DIAGRAM_SOURCES.find((source) => source.id === id);
}

function SourceReferences({ messages }: Readonly<{ messages: HRDiagramExplorerMessages }>) {
  return (
    <ul>
      {HR_DIAGRAM_DEFINITION.references.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.model.sourceUnavailable, { sourceId })}</>
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

function ViewDescription({
  messages,
  view,
}: Readonly<{
  messages: HRDiagramExplorerMessages["noScript"];
  view: HRDiagramView;
}>) {
  return (
    <p>
      {view === "physical_hr"
        ? messages.viewDescriptions.physicalHr
        : messages.viewDescriptions.gaiaCmd}
    </p>
  );
}

function StateSummary({
  messages,
  state,
}: Readonly<{
  messages: HRDiagramExplorerMessages["noScript"];
  state: HRDiagramState;
}>) {
  return (
    <dl>
      <div>
        <dt>{messages.state.view}</dt>
        <dd>{state.view === "physical_hr" ? messages.views.physicalHr : messages.views.gaiaCmd}</dd>
      </div>
      <div>
        <dt>{messages.state.selectedStar}</dt>
        <dd>{state.selected_star_id}</dd>
      </div>
      <div>
        <dt>{messages.state.activeSpectralClasses}</dt>
        <dd>{state.spectral_classes.join(", ") || messages.state.none}</dd>
      </div>
      <div>
        <dt>{messages.state.activeStageGroups}</dt>
        <dd>
          {state.stage_groups.map((stage) => STAGE_LABELS[stage]).join(", ") || messages.state.none}
        </dd>
      </div>
      <div>
        <dt>{messages.state.activeClusters}</dt>
        <dd>
          {state.clusters.map((cluster) => CLUSTER_LABELS[cluster]).join(", ") ||
            messages.state.none}
        </dd>
      </div>
    </dl>
  );
}

function RecordTable({
  locale,
  messages,
  records,
  selectedStarId,
}: Readonly<{
  locale: PublishedLocale;
  messages: HRDiagramExplorerMessages;
  records: ReadonlyArray<HRDiagramRecord>;
  selectedStarId: string;
}>) {
  return (
    <div
      aria-label={messages.table.ariaLabel}
      role="region"
      style={{ overflowX: "auto" }}
      tabIndex={0}
    >
      <table>
        <caption>
          {formatMessageTemplate(messages.noScript.tableCaption, {
            count: formatLocaleNumber(records.length, locale),
          })}
        </caption>
        <thead>
          <tr>
            <th scope="col">{messages.table.headers.designation}</th>
            <th scope="col">{messages.table.headers.cluster}</th>
            <th scope="col">{messages.table.headers.spectralClass}</th>
            <th scope="col">{messages.table.headers.stageGroup}</th>
            <th scope="col">{messages.table.headers.temperature}</th>
            <th scope="col">{messages.table.headers.luminosity}</th>
            <th scope="col">{messages.table.headers.colour}</th>
            <th scope="col">{messages.table.headers.magnitude}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.star_id} aria-selected={record.star_id === selectedStarId}>
              <th scope="row">
                {record.designation}
                {record.star_id === selectedStarId ? messages.table.selectedSuffix : ""}
              </th>
              <td>{record.cluster_label}</td>
              <td>{record.spectral_class}</td>
              <td>{STAGE_LABELS[record.stage_group]}</td>
              <td>{formatTemperature(record.teff_k_p50, locale)}</td>
              <td>{formatLuminosity(record.luminosity_lsun_p50, locale)}</td>
              <td>{formatColour(record.bp_rp_mag, locale)}</td>
              <td>{formatMagnitude(record.mg_gspphot_mag_p50, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectedStarDetail({
  locale,
  messages,
  record,
}: Readonly<{
  locale: PublishedLocale;
  messages: HRDiagramExplorerMessages["noScript"]["detail"];
  record: HRDiagramRecord;
}>) {
  return (
    <section aria-labelledby="hr-no-script-selected-heading">
      <h2 id="hr-no-script-selected-heading">{messages.title}</h2>
      <p>{formatMessageTemplate(messages.summary, { designation: record.designation })}</p>
      <dl>
        <div>
          <dt>{messages.labels.sourceId}</dt>
          <dd>{record.gaia_source_id}</dd>
        </div>
        <div>
          <dt>{messages.labels.clusterRecord}</dt>
          <dd>
            {formatMessageTemplate(messages.membershipSummary, {
              catalogueId: record.membership.catalogue_id,
              cluster: record.cluster_label,
              inrj: String(record.membership.inrj),
              inrt: String(record.membership.inrt),
              probability: formatLocaleFixedNumber(
                record.membership.membership_probability,
                4,
                locale,
              ),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.labels.spectralFlags}</dt>
          <dd>
            {record.spectral_class} / {record.flags_esphs}
          </dd>
        </div>
        <div>
          <dt>{messages.labels.stageRaw}</dt>
          <dd>
            {STAGE_LABELS[record.stage_group]} / {record.evolstage_flame}
          </dd>
        </div>
        <div>
          <dt>{messages.labels.flagsFlame}</dt>
          <dd>{record.flags_flame}</dd>
        </div>
        <div>
          <dt>{messages.labels.temperature}</dt>
          <dd>
            {formatMessageTemplate(messages.percentileInterval, {
              lower: formatTemperature(record.teff_k_p16, locale),
              median: formatTemperature(record.teff_k_p50, locale),
              upper: formatTemperature(record.teff_k_p84, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.labels.luminosity}</dt>
          <dd>
            {formatMessageTemplate(messages.percentileInterval, {
              lower: formatLuminosity(record.luminosity_lsun_p16, locale),
              median: formatLuminosity(record.luminosity_lsun_p50, locale),
              upper: formatLuminosity(record.luminosity_lsun_p84, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.labels.colour}</dt>
          <dd>
            {formatMessageTemplate(messages.colourNoInterval, {
              value: formatColour(record.bp_rp_mag, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.labels.magnitude}</dt>
          <dd>
            {formatMessageTemplate(messages.percentileInterval, {
              lower: formatMagnitude(record.mg_gspphot_mag_p16, locale),
              median: formatMagnitude(record.mg_gspphot_mag_p50, locale),
              upper: formatMagnitude(record.mg_gspphot_mag_p84, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.labels.apparentMagnitude}</dt>
          <dd>{formatMagnitude(record.phot_g_mean_mag, locale)}</dd>
        </div>
        <div>
          <dt>{messages.labels.parallax}</dt>
          <dd>
            {formatParallax(record.parallax_mas, locale)} /{" "}
            {formatParallax(record.parallax_error_mas, locale)}
          </dd>
        </div>
        {record.ag_gspphot_mag === null ? null : (
          <div>
            <dt>{messages.labels.agExtinction}</dt>
            <dd>
              {formatLocaleFixedNumber(record.ag_gspphot_mag, 3, locale)} mag /{" "}
              {record.ebpminrp_gspphot_mag === null
                ? messages.notSupplied
                : formatLocaleFixedNumber(record.ebpminrp_gspphot_mag, 3, locale)}{" "}
              mag
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** Complete semantic output for the default and serialized state when JavaScript is disabled. */
export function HRDiagramExplorerNoScript({
  initialState,
  initialStateInvalid,
  locale,
  messages,
}: HRDiagramExplorerNoScriptProps) {
  const records = filterHRDiagramRecords(initialState);
  const selected = selectedHRDiagramRecord(initialState);
  const selectedIsVisible = records.some((record) => record.star_id === selected.star_id);

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
            <h2 id="hr-no-script-invalid-state-heading">{messages.invalidState.title}</h2>
            <p>{messages.noScript.invalidDescription}</p>
            <p>
              <a href="/lab/hr-diagram-explorer">{messages.noScript.resetLink}</a>
            </p>
          </aside>
        ) : null}

        <section aria-labelledby="hr-no-script-state-heading">
          <h2 id="hr-no-script-state-heading">{messages.noScript.state.title}</h2>
          <StateSummary messages={messages.noScript} state={initialState} />
          <ViewDescription messages={messages.noScript} view={initialState.view} />
          <p>
            {formatMessageTemplate(messages.noScript.state.countSummary, {
              count: formatLocaleNumber(records.length, locale),
              total: formatLocaleNumber(HR_DIAGRAM_RECORDS.length, locale),
            })}
          </p>
          {!selectedIsVisible ? <p role="note">{messages.noScript.state.outsideFilters}</p> : null}
        </section>

        <SelectedStarDetail locale={locale} messages={messages.noScript.detail} record={selected} />

        <section aria-labelledby="hr-no-script-data-heading">
          <h2 id="hr-no-script-data-heading">{messages.noScript.dataTitle}</h2>
          <RecordTable
            locale={locale}
            messages={messages}
            records={records}
            selectedStarId={selected.star_id}
          />
        </section>

        <section aria-labelledby="hr-no-script-model-heading">
          <h2 id="hr-no-script-model-heading">{messages.noScript.model.title}</h2>
          <p>
            <strong>{messages.noScript.model.modelLabel}</strong>{" "}
            {HR_DIAGRAM_DEFINITION.model_version}; dataset {HR_DIAGRAM_DEFINITION.dataset_id}; Gaia
            DR3. This is a fixed, curated sample of 128 source records, not a complete or
            population-representative survey.
          </p>
          <p>{HR_DIAGRAM_DEFINITION.uncertainty_semantics}</p>
          <h3>{messages.noScript.model.underivedTitle}</h3>
          <p>
            Lumina does not convert BP−RP to temperature, M_G to luminosity, or plot position to
            spectral class, evolutionary stage, age, mass, radius, lifetime, or future evolution.
            The physical H-R and Gaia colour–magnitude views are alternate source-variable views.
          </p>
          <p>
            Cluster filters use the reviewed Hunt &amp; Reffert catalogue rows. The selected-star
            detail preserves the source row&apos;s membership probability and inrj/inrt flags; a
            catalogue association is not a Lumina-recomputed membership claim.
          </p>
          <h3>{messages.noScript.model.assumptionsAndLimitations}</h3>
          <ul>
            {HR_DIAGRAM_DEFINITION.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
            {HR_DIAGRAM_DEFINITION.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <h3>{messages.noScript.model.references}</h3>
          <SourceReferences messages={messages} />
        </section>
      </article>
    </noscript>
  );
}
