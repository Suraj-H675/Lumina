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

type HRDiagramExplorerNoScriptProps = Readonly<{
  initialState: HRDiagramState;
  initialStateInvalid: boolean;
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

function formatTemperature(value: number): string {
  return `${value.toFixed(0)} K`;
}

function formatLuminosity(value: number): string {
  return `${value.toFixed(3)} L☉`;
}

function formatMagnitude(value: number): string {
  return `${value.toFixed(3)} mag`;
}

function formatColour(value: number): string {
  return `${value.toFixed(3)} mag`;
}

function formatParallax(value: number): string {
  return `${value.toFixed(3)} mas`;
}

function sourceForId(id: string) {
  return HR_DIAGRAM_SOURCES.find((source) => source.id === id);
}

function SourceReferences() {
  return (
    <ul>
      {HR_DIAGRAM_DEFINITION.references.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>Unavailable source record: {sourceId}</>
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

function ViewDescription({ view }: Readonly<{ view: HRDiagramView }>) {
  return view === "physical_hr" ? (
    <p>
      Physical H-R view: effective temperature is logarithmic and hotter stars are on the left;
      luminosity is logarithmic and increases upward. The values are Gaia source-published
      quantities, not conversions made by Lumina.
    </p>
  ) : (
    <p>
      Gaia colour–magnitude view: published BP−RP colour increases from left to right, while
      absolute G magnitude is vertically reversed so smaller, more-negative magnitudes appear
      higher. This is an alternate source-variable view, not a conversion from the physical H-R
      values.
    </p>
  );
}

function StateSummary({ state }: Readonly<{ state: HRDiagramState }>) {
  return (
    <dl>
      <div>
        <dt>View</dt>
        <dd>{state.view === "physical_hr" ? "Physical H-R" : "Gaia colour–magnitude"}</dd>
      </div>
      <div>
        <dt>Selected star</dt>
        <dd>{state.selected_star_id}</dd>
      </div>
      <div>
        <dt>Active spectral classes</dt>
        <dd>{state.spectral_classes.join(", ") || "none"}</dd>
      </div>
      <div>
        <dt>Active stage groups</dt>
        <dd>{state.stage_groups.map((stage) => STAGE_LABELS[stage]).join(", ") || "none"}</dd>
      </div>
      <div>
        <dt>Active clusters</dt>
        <dd>{state.clusters.map((cluster) => CLUSTER_LABELS[cluster]).join(", ") || "none"}</dd>
      </div>
    </dl>
  );
}

function RecordTable({
  records,
  selectedStarId,
}: Readonly<{ records: ReadonlyArray<HRDiagramRecord>; selectedStarId: string }>) {
  return (
    <div
      aria-label="Filtered Gaia stellar records"
      role="region"
      style={{ overflowX: "auto" }}
      tabIndex={0}
    >
      <table>
        <caption>
          {records.length} filtered curated Gaia DR3 records. Values are source-published; stage
          group is Lumina&apos;s frozen grouping of the raw FLAME stage index.
        </caption>
        <thead>
          <tr>
            <th scope="col">Gaia designation</th>
            <th scope="col">Cluster</th>
            <th scope="col">Spectral class</th>
            <th scope="col">Stage group</th>
            <th scope="col">T_eff (K)</th>
            <th scope="col">Luminosity (L☉)</th>
            <th scope="col">BP−RP (mag)</th>
            <th scope="col">M_G (mag)</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.star_id} aria-selected={record.star_id === selectedStarId}>
              <th scope="row">
                {record.designation}
                {record.star_id === selectedStarId ? " (selected)" : ""}
              </th>
              <td>{record.cluster_label}</td>
              <td>{record.spectral_class}</td>
              <td>{STAGE_LABELS[record.stage_group]}</td>
              <td>{formatTemperature(record.teff_k_p50)}</td>
              <td>{formatLuminosity(record.luminosity_lsun_p50)}</td>
              <td>{formatColour(record.bp_rp_mag)}</td>
              <td>{formatMagnitude(record.mg_gspphot_mag_p50)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectedStarDetail({ record }: Readonly<{ record: HRDiagramRecord }>) {
  return (
    <section aria-labelledby="hr-no-script-selected-heading">
      <h2 id="hr-no-script-selected-heading">Selected star detail</h2>
      <p>
        {record.designation} is selected. Its values remain available even when the active filters
        exclude it.
      </p>
      <dl>
        <div>
          <dt>Gaia DR3 source ID</dt>
          <dd>{record.gaia_source_id}</dd>
        </div>
        <div>
          <dt>Cluster catalogue record</dt>
          <dd>
            {record.cluster_label}; Hunt &amp; Reffert 2024 catalogue ID{" "}
            {record.membership.catalogue_id}; source Prob{" "}
            {record.membership.membership_probability.toFixed(4)}; inrj={record.membership.inrj};
            inrt={record.membership.inrt}
          </dd>
        </div>
        <div>
          <dt>Spectral class / Gaia flags_esphs</dt>
          <dd>
            {record.spectral_class} / {record.flags_esphs}
          </dd>
        </div>
        <div>
          <dt>Stage group / raw Gaia evolstage_flame</dt>
          <dd>
            {STAGE_LABELS[record.stage_group]} / {record.evolstage_flame}
          </dd>
        </div>
        <div>
          <dt>Gaia flags_flame</dt>
          <dd>{record.flags_flame}</dd>
        </div>
        <div>
          <dt>Effective temperature, T_eff</dt>
          <dd>
            {formatTemperature(record.teff_k_p50)}; source p16–p84{" "}
            {formatTemperature(record.teff_k_p16)} to {formatTemperature(record.teff_k_p84)}
          </dd>
        </div>
        <div>
          <dt>Luminosity</dt>
          <dd>
            {formatLuminosity(record.luminosity_lsun_p50)}; source p16–p84{" "}
            {formatLuminosity(record.luminosity_lsun_p16)} to{" "}
            {formatLuminosity(record.luminosity_lsun_p84)}
          </dd>
        </div>
        <div>
          <dt>Gaia BP−RP</dt>
          <dd>{formatColour(record.bp_rp_mag)}; no Lumina colour uncertainty is synthesized</dd>
        </div>
        <div>
          <dt>Gaia absolute G magnitude, M_G</dt>
          <dd>
            {formatMagnitude(record.mg_gspphot_mag_p50)}; source p16–p84{" "}
            {formatMagnitude(record.mg_gspphot_mag_p16)} to{" "}
            {formatMagnitude(record.mg_gspphot_mag_p84)}
          </dd>
        </div>
        <div>
          <dt>Apparent Gaia G magnitude</dt>
          <dd>{formatMagnitude(record.phot_g_mean_mag)}</dd>
        </div>
        <div>
          <dt>Parallax / parallax uncertainty</dt>
          <dd>
            {formatParallax(record.parallax_mas)} / {formatParallax(record.parallax_error_mas)}
          </dd>
        </div>
        {record.ag_gspphot_mag === null ? null : (
          <div>
            <dt>A_G / E(BP−RP)</dt>
            <dd>
              {record.ag_gspphot_mag.toFixed(3)} mag /{" "}
              {record.ebpminrp_gspphot_mag?.toFixed(3) ?? "not supplied"} mag
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
}: HRDiagramExplorerNoScriptProps) {
  const records = filterHRDiagramRecords(initialState);
  const selected = selectedHRDiagramRecord(initialState);
  const selectedIsVisible = records.some((record) => record.star_id === selected.star_id);

  return (
    <noscript>
      <article>
        <header>
          <p>Phase 3B / Vertical 4</p>
          <h1>H-R Diagram Explorer</h1>
          <p>
            Explore a curated Gaia DR3 stellar sample in two alternate views: physical H-R
            quantities and Gaia colour–magnitude quantities. This complete text and table result
            remains available without JavaScript.
          </p>
        </header>

        {initialStateInvalid ? (
          <aside aria-label="The shared H-R Diagram Explorer state was not valid" role="alert">
            <h2 id="hr-no-script-invalid-state-heading">
              The shared H-R Diagram Explorer state was not valid
            </h2>
            <p>
              The requested version, view, selected star, filter values, exact field set, or
              serialized form was rejected. The displayed state is the separately labelled default
              reset state.
            </p>
            <p>
              <a href="/lab/hr-diagram-explorer">Reset to the default explorer state</a>
            </p>
          </aside>
        ) : null}

        <section aria-labelledby="hr-no-script-state-heading">
          <h2 id="hr-no-script-state-heading">Current explorer state</h2>
          <StateSummary state={initialState} />
          <ViewDescription view={initialState.view} />
          <p>
            {records.length} of {HR_DIAGRAM_RECORDS.length} curated stars match the active filters.
            Within each filter dimension values are ORed; dimensions are ANDed. An empty filter
            dimension shows zero records.
          </p>
          {!selectedIsVisible ? (
            <p role="note">
              The selected star is outside the active filters. Its detail remains below and it is
              not included in the filtered table.
            </p>
          ) : null}
        </section>

        <SelectedStarDetail record={selected} />

        <section aria-labelledby="hr-no-script-data-heading">
          <h2 id="hr-no-script-data-heading">Text and data result</h2>
          <RecordTable records={records} selectedStarId={selected.star_id} />
        </section>

        <section aria-labelledby="hr-no-script-model-heading">
          <h2 id="hr-no-script-model-heading">Model, assumptions, limitations, and sources</h2>
          <p>
            <strong>Model:</strong> {HR_DIAGRAM_DEFINITION.model_version}; dataset{" "}
            {HR_DIAGRAM_DEFINITION.dataset_id}; Gaia DR3. This is a fixed, curated sample of 128
            source records, not a complete or population-representative survey.
          </p>
          <p>{HR_DIAGRAM_DEFINITION.uncertainty_semantics}</p>
          <h3>What this explorer does not derive</h3>
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
          <h3>Assumptions and limitations</h3>
          <ul>
            {HR_DIAGRAM_DEFINITION.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
            {HR_DIAGRAM_DEFINITION.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <h3>References and provenance</h3>
          <SourceReferences />
        </section>
      </article>
    </noscript>
  );
}
