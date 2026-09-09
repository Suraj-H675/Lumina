"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_HR_DIAGRAM_STATE,
  HR_DIAGRAM_AUDIENCE_MODES,
  HR_DIAGRAM_CLUSTERS,
  HR_DIAGRAM_DEFINITION,
  HR_DIAGRAM_RECORDS,
  HR_DIAGRAM_SOURCES,
  HR_DIAGRAM_SPECTRAL_CLASSES,
  HR_DIAGRAM_STAGE_GROUPS,
  HR_DIAGRAM_VIEWS,
  cmdColourXFraction,
  cmdMagnitudeYFraction,
  displayUncertainty,
  displayXFraction,
  displayYFraction,
  encodeHRDiagramState,
  filterHRDiagramRecords,
  physicalLuminosityYFraction,
  physicalTemperatureXFraction,
  selectedHRDiagramRecord,
  type HRDiagramAudienceMode,
  type HRDiagramCluster,
  type HRDiagramRecord,
  type HRDiagramStageGroup,
  type HRDiagramState,
  type HRDiagramView,
  verifyHRDiagramBrowserArtifact,
} from "../lib/simulations/hr-diagram-explorer";
import { LearningModeSelector } from "./learning-mode-selector";

type HRDiagramExplorerEnhancedProps = Readonly<{
  initialState: HRDiagramState;
  initialStateInvalid: boolean;
}>;

const CLUSTER_LABELS: Record<HRDiagramCluster, string> = {
  pleiades: "Pleiades",
  hyades: "Hyades",
  praesepe: "Praesepe",
  m67: "M 67",
};

const STAGE_LABELS: Record<HRDiagramStageGroup, string> = {
  main_sequence: "Main sequence",
  turnoff_transition: "Turn-off / pre-RGB transition",
  red_giant_branch: "Red giant branch",
};

const MODE_COPY: Record<
  HRDiagramAudienceMode,
  Readonly<{ introduction: string; question: string }>
> = {
  explorer: {
    introduction:
      "Compare the same curated Gaia DR3 records in two alternate source-variable views. Select a point or a table row to inspect its source-published values and intervals.",
    question:
      "What changes when you switch views, and what stays the same about the selected source record?",
  },
  student: {
    introduction:
      "The physical H-R view puts hotter effective temperatures on the left and higher luminosities upward. The Gaia colour–magnitude view uses observed BP−RP and absolute G magnitude instead; Lumina does not convert between the axes.",
    question:
      "Why can a star keep the same identity and source values while its plotted coordinates change between views?",
  },
  "deep-dive": {
    introduction:
      "Every marker is a reviewed Gaia DR3 record selected by a frozen, source-backed algorithm. Stage groups are derived only from the raw Gaia FLAME stage index; they are not inferred from plot position.",
    question:
      "Which displayed values are source-published, and which operations are only presentation transforms?",
  },
};

const VIEW_LABELS: Record<HRDiagramView, string> = {
  physical_hr: "Physical H-R view",
  gaia_cmd: "Gaia colour–magnitude view",
};

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

function stateUrl(state: HRDiagramState): string {
  const url = new URL(window.location.href);
  url.pathname = "/lab/hr-diagram-explorer";
  url.search = `?state=${encodeURIComponent(encodeHRDiagramState(state))}`;
  return url.toString();
}

function replaceBrowserState(state: HRDiagramState | null): void {
  const url = new URL(window.location.href);
  url.pathname = "/lab/hr-diagram-explorer";
  if (state === null) url.searchParams.delete("state");
  else url.searchParams.set("state", encodeHRDiagramState(state));
  window.history.replaceState(null, "", url);
}

function toggleValue<T extends string>(
  values: ReadonlyArray<T>,
  value: T,
  canonicalOrder: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const next = values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
  return canonicalOrder.filter((entry) => next.includes(entry));
}

function displayAxisLabels(view: HRDiagramView): Readonly<{
  x: string;
  y: string;
  xDirection: string;
  yDirection: string;
}> {
  return view === "physical_hr"
    ? {
        x: "Effective temperature, T_eff (K)",
        y: "Luminosity (L☉)",
        xDirection: "hotter / higher temperature ← left; cooler / lower temperature → right",
        yDirection: "higher luminosity ↑; lower luminosity ↓",
      }
    : {
        x: "Gaia BP−RP colour (mag)",
        y: "Gaia absolute G magnitude, M_G (mag)",
        xDirection: "bluer / smaller BP−RP ← left; redder / larger BP−RP → right",
        yDirection: "smaller, more-negative magnitude ↑; larger magnitude ↓",
      };
}

function selectedStarLabel(record: HRDiagramRecord): string {
  return `${record.designation}, ${record.cluster_label}, spectral class ${record.spectral_class}, ${STAGE_LABELS[record.stage_group]}`;
}

function FilterGroup<T extends string>({
  legend,
  values,
  selected,
  labels,
  onToggle,
  groupId,
}: Readonly<{
  legend: string;
  values: ReadonlyArray<T>;
  selected: ReadonlyArray<T>;
  labels: Readonly<Record<T, string>>;
  onToggle: (value: T) => void;
  groupId: string;
}>) {
  return (
    <fieldset className="min-w-0 rounded-md border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {values.map((value) => {
          const inputId = `${groupId}-${value}`;
          return (
            <label
              className="flex min-h-11 items-center gap-2 text-sm"
              htmlFor={inputId}
              key={value}
            >
              <input
                checked={selected.includes(value)}
                className="h-4 w-4"
                id={inputId}
                onChange={() => onToggle(value)}
                type="checkbox"
              />
              <span>{labels[value]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PlotFigure({
  view,
  records,
  selected,
  selectedIsVisible,
}: Readonly<{
  view: HRDiagramView;
  records: ReadonlyArray<HRDiagramRecord>;
  selected: HRDiagramRecord;
  selectedIsVisible: boolean;
}>) {
  const axes = displayAxisLabels(view);
  const plot = { left: 76, top: 28, width: 610, height: 330 };
  const selectedUncertainty = selectedIsVisible ? displayUncertainty(selected, view) : null;
  const selectedX = plot.left + displayXFraction(selected, view) * plot.width;
  const selectedY = plot.top + displayYFraction(selected, view) * plot.height;
  const xTicks =
    view === "physical_hr"
      ? [50000, 20000, 10000, 5000, 2500].map((value) => ({
          value,
          fraction: physicalTemperatureXFraction(value),
          label: `${value.toLocaleString()} K`,
        }))
      : [-0.5, 0.5, 1.5, 2.5, 3.5, 4].map((value) => ({
          value,
          fraction: cmdColourXFraction(value),
          label: value.toFixed(1),
        }));
  const yTicks =
    view === "physical_hr"
      ? [1e5, 1e3, 10, 0.1, 1e-3].map((value) => ({
          value,
          fraction: physicalLuminosityYFraction(value),
          label: value >= 1 ? `${value.toLocaleString()} L☉` : `${value} L☉`,
        }))
      : [-5, 0, 5, 10, 15].map((value) => ({
          value,
          fraction: cmdMagnitudeYFraction(value),
          label: `${value} mag`,
        }));

  return (
    <figure className="space-y-3" data-testid="hr-diagram-plot">
      <svg
        aria-labelledby="hr-diagram-plot-title hr-diagram-plot-description"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 760 430"
      >
        <title id="hr-diagram-plot-title">{VIEW_LABELS[view]}</title>
        <desc id="hr-diagram-plot-description">
          {records.length} curated Gaia DR3 stars. {axes.xDirection}. {axes.yDirection}. The
          keyboard-accessible table below is the complete semantic alternative and selects the same
          records represented by these markers.
        </desc>
        <rect
          aria-hidden="true"
          fill="none"
          height={plot.height}
          stroke="var(--border-strong)"
          width={plot.width}
          x={plot.left}
          y={plot.top}
        />
        {xTicks.map((tick) => {
          const x = plot.left + tick.fraction * plot.width;
          return (
            <g aria-hidden="true" key={`x-${tick.value}`}>
              <line
                stroke="var(--border)"
                x1={x}
                x2={x}
                y1={plot.top}
                y2={plot.top + plot.height}
              />
              <text
                fill="var(--muted)"
                fontSize="11"
                textAnchor="middle"
                x={x}
                y={plot.top + plot.height + 20}
              >
                {tick.label}
              </text>
            </g>
          );
        })}
        {yTicks.map((tick) => {
          const y = plot.top + tick.fraction * plot.height;
          return (
            <g aria-hidden="true" key={`y-${tick.value}`}>
              <line
                stroke="var(--border)"
                x1={plot.left}
                x2={plot.left + plot.width}
                y1={y}
                y2={y}
              />
              <text fill="var(--muted)" fontSize="11" textAnchor="end" x={plot.left - 8} y={y + 4}>
                {tick.label}
              </text>
            </g>
          );
        })}
        {records.map((record) => {
          const x = plot.left + displayXFraction(record, view) * plot.width;
          const y = plot.top + displayYFraction(record, view) * plot.height;
          const isSelected = record.star_id === selected.star_id;
          return (
            <circle
              aria-hidden="true"
              cx={x}
              cy={y}
              data-star-id={record.star_id}
              fill={isSelected ? "var(--accent)" : "var(--link)"}
              key={record.star_id}
              r={isSelected ? 6 : 4}
              stroke="var(--foreground)"
              strokeWidth={isSelected ? 2 : 0.7}
            >
              <title>
                {selectedStarLabel(record)}. Select the corresponding row in the accessible data
                table below.
              </title>
            </circle>
          );
        })}
        {selectedUncertainty === null || selectedUncertainty.x === null ? null : (
          <line
            aria-hidden="true"
            stroke="var(--accent)"
            strokeWidth="2"
            x1={plot.left + selectedUncertainty.x[0] * plot.width}
            x2={plot.left + selectedUncertainty.x[1] * plot.width}
            y1={selectedY}
            y2={selectedY}
          />
        )}
        {selectedUncertainty === null ? null : (
          <line
            aria-hidden="true"
            stroke="var(--accent)"
            strokeWidth="2"
            x1={selectedX}
            x2={selectedX}
            y1={plot.top + selectedUncertainty.y[0] * plot.height}
            y2={plot.top + selectedUncertainty.y[1] * plot.height}
          />
        )}
        <text
          fill="var(--foreground)"
          fontSize="13"
          fontWeight="600"
          textAnchor="middle"
          x={plot.left + plot.width / 2}
          y="414"
        >
          {axes.x}
        </text>
        <text
          fill="var(--foreground)"
          fontSize="13"
          fontWeight="600"
          textAnchor="middle"
          transform={`rotate(-90 18 ${plot.top + plot.height / 2})`}
          x="18"
          y={plot.top + plot.height / 2}
        >
          {axes.y}
        </text>
      </svg>
      <figcaption className="text-sm leading-6 text-[var(--muted)]">
        {axes.xDirection}. {axes.yDirection}. The selected star&apos;s source-published asymmetric
        percentile intervals are shown on the plot when it is inside the active filters and remain
        in the detail panel otherwise. Marker position is a disclosed display transform; marker
        density is not population density.
      </figcaption>
    </figure>
  );
}

function SelectedStarDetail({
  record,
  outsideFilters,
}: Readonly<{ record: HRDiagramRecord; outsideFilters: boolean }>) {
  return (
    <section aria-labelledby="hr-selected-heading" className="space-y-4">
      <div>
        <h2 id="hr-selected-heading">Selected star</h2>
        <p className="text-[var(--muted)]">
          {record.designation} · {record.cluster_label} · spectral class {record.spectral_class} ·{" "}
          {STAGE_LABELS[record.stage_group]}
        </p>
        {outsideFilters ? (
          <p className="rounded-md border border-[var(--border)] p-3" role="note">
            This selected star is outside the active filters. Its detail is retained; it is not
            shown as a normal filtered point.
          </p>
        ) : null}
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt>Gaia DR3 source ID</dt>
          <dd>{record.gaia_source_id}</dd>
        </div>
        <div>
          <dt>Gaia designation</dt>
          <dd>{record.designation}</dd>
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
          <dt>Spectral class / flags_esphs</dt>
          <dd>
            {record.spectral_class} / {record.flags_esphs}
          </dd>
        </div>
        <div>
          <dt>Stage group / raw evolstage_flame</dt>
          <dd>
            {STAGE_LABELS[record.stage_group]} / {record.evolstage_flame}
          </dd>
        </div>
        <div>
          <dt>flags_flame</dt>
          <dd>{record.flags_flame}</dd>
        </div>
        <div>
          <dt>Effective temperature, T_eff</dt>
          <dd>
            {formatTemperature(record.teff_k_p50)}; p16–p84 {formatTemperature(record.teff_k_p16)}{" "}
            to {formatTemperature(record.teff_k_p84)}
          </dd>
        </div>
        <div>
          <dt>Luminosity</dt>
          <dd>
            {formatLuminosity(record.luminosity_lsun_p50)}; p16–p84{" "}
            {formatLuminosity(record.luminosity_lsun_p16)} to{" "}
            {formatLuminosity(record.luminosity_lsun_p84)}
          </dd>
        </div>
        <div>
          <dt>Gaia BP−RP</dt>
          <dd>{formatColour(record.bp_rp_mag)}; no synthetic colour interval</dd>
        </div>
        <div>
          <dt>Gaia absolute G magnitude, M_G</dt>
          <dd>
            {formatMagnitude(record.mg_gspphot_mag_p50)}; p16–p84{" "}
            {formatMagnitude(record.mg_gspphot_mag_p16)} to{" "}
            {formatMagnitude(record.mg_gspphot_mag_p84)}
          </dd>
        </div>
        <div>
          <dt>Apparent Gaia G magnitude</dt>
          <dd>{formatMagnitude(record.phot_g_mean_mag)}</dd>
        </div>
        <div>
          <dt>Parallax / uncertainty</dt>
          <dd>
            {formatParallax(record.parallax_mas)} / {formatParallax(record.parallax_error_mas)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function RecordsTable({
  records,
  selectedStarId,
  onSelect,
}: Readonly<{
  records: ReadonlyArray<HRDiagramRecord>;
  selectedStarId: string;
  onSelect: (starId: string) => void;
}>) {
  return (
    <div
      aria-label="Filtered Gaia stellar records"
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table>
        <caption>
          {records.length} filtered records. The selected row is identified in text; source values
          are not encoded by colour alone.
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
          {records.map((record) => {
            const selected = record.star_id === selectedStarId;
            return (
              <tr aria-selected={selected} key={record.star_id}>
                <th scope="row">
                  <button
                    aria-label={`Select ${selectedStarLabel(record)}`}
                    className="min-h-11 text-left font-semibold text-[var(--link)] underline"
                    onClick={() => onSelect(record.star_id)}
                    type="button"
                  >
                    {record.designation}
                    {selected ? " (selected)" : ""}
                  </button>
                </th>
                <td>{record.cluster_label}</td>
                <td>{record.spectral_class}</td>
                <td>{STAGE_LABELS[record.stage_group]}</td>
                <td>{formatTemperature(record.teff_k_p50)}</td>
                <td>{formatLuminosity(record.luminosity_lsun_p50)}</td>
                <td>{formatColour(record.bp_rp_mag)}</td>
                <td>{formatMagnitude(record.mg_gspphot_mag_p50)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModelSurface({ mode }: Readonly<{ mode: HRDiagramAudienceMode }>) {
  return (
    <section aria-labelledby="hr-model-heading" className="space-y-4">
      <h2 id="hr-model-heading">Model, assumptions, and provenance</h2>
      <p>
        <strong>Model version:</strong> {HR_DIAGRAM_DEFINITION.model_version}. This is the fixed{" "}
        {HR_DIAGRAM_DEFINITION.dataset_id} dataset: 128 curated Gaia DR3 records, equalized to 32
        per cluster. Marker density is not a population-density estimate.
      </p>
      <p>
        The plotted central values are published Gaia quantities. Lumina does not convert BP−RP to
        temperature, M_G to luminosity, plot position to classification, or source data into age,
        mass, radius, lifetime, or future evolution. FLAME stage groups are model-derived
        educational groupings of the source-published stage index.
      </p>
      <p>
        Cluster filters use the reviewed Hunt &amp; Reffert catalogue rows. The selected-star detail
        preserves that source row&apos;s membership probability and inrj/inrt flags; a catalogue
        association is not a Lumina-recomputed membership claim.
      </p>
      <h3>Display relationships</h3>
      <dl>
        {Object.entries(HR_DIAGRAM_DEFINITION.calculation_module.equations).map(
          ([name, equation]) => (
            <div key={name}>
              <dt>{name.replaceAll("_", " ")}</dt>
              <dd>{equation}</dd>
            </div>
          ),
        )}
      </dl>
      <p>
        These logarithmic and linear maps are visualization transforms only. The H-R and CMD views
        are alternate source-variable views, not exact conversions. Gaia uncertainty values for
        T_eff, luminosity, and M_G retain their asymmetric p16/p50/p84 semantics; BP−RP has no
        synthesized uncertainty in v1.
      </p>
      {mode !== "explorer" ? (
        <>
          <h3>{mode === "student" ? "Reading the diagram" : "Deep-dive data boundary"}</h3>
          {mode === "student" ? (
            <p>
              The broad main sequence, turn-off transition, and red-giant-branch concepts help
              describe stellar populations, but the plot does not draw classification polygons.
              Spectral class comes from Gaia tags, while stage group comes from the separate FLAME
              index and its documented boundaries. Cluster membership comes from Hunt &amp; Reffert,
              not from a star&apos;s position.
            </p>
          ) : (
            <ul>
              <li>Gaia fields: teff_gspphot, lum_flame, mg_gspphot, bp_rp, and source flags.</li>
              <li>Stage boundaries: 100, 360, 490, and 1290 in evolstage_flame.</li>
              <li>
                Eligibility requires Gaia spectral-class primary probability above 0.5 via
                flags_esphs.
              </li>
              <li>
                Selection is deterministic round-robin across non-empty (stage_group,
                spectral_class) cells, ordered by numeric source_id.
              </li>
            </ul>
          )}
        </>
      ) : null}
      <h3>Assumptions and limitations</h3>
      <ul>
        {HR_DIAGRAM_DEFINITION.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
        {HR_DIAGRAM_DEFINITION.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
      <h3>Sources</h3>
      <ul>
        {HR_DIAGRAM_DEFINITION.references.map((sourceId) => {
          const source = sourceForId(sourceId);
          return source === undefined ? (
            <li key={sourceId}>Unavailable source record: {sourceId}</li>
          ) : (
            <li key={sourceId}>
              <a className="text-[var(--link)] underline" href={source.url} rel="noreferrer">
                {source.title}
              </a>{" "}
              ({source.organization_or_authors}; {source.dataset_or_release})
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Interactive enhancement over the complete server-rendered semantic representation. */
export function HRDiagramExplorerEnhanced({
  initialState,
  initialStateInvalid,
}: HRDiagramExplorerEnhancedProps) {
  const [state, setState] = useState<HRDiagramState>(initialState);
  const [stateInvalid, setStateInvalid] = useState(initialStateInvalid);
  const [artifactIntegrityInvalid, setArtifactIntegrityInvalid] = useState(false);
  const [mode, setMode] = useState<HRDiagramAudienceMode>(HR_DIAGRAM_AUDIENCE_MODES[0]);
  useEffect(() => {
    let active = true;
    void verifyHRDiagramBrowserArtifact()
      .then((verified) => {
        if (active && verified === false) setArtifactIntegrityInvalid(true);
      })
      .catch(() => {
        if (active) setArtifactIntegrityInvalid(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const records = useMemo(() => filterHRDiagramRecords(state), [state]);
  const selected = useMemo(() => selectedHRDiagramRecord(state), [state]);
  const selectedIsVisible = records.some((record) => record.star_id === selected.star_id);
  const shareUrl = stateUrl(state);

  function updateState(next: HRDiagramState): void {
    setState(next);
    setStateInvalid(false);
    replaceBrowserState(next);
  }

  function selectStar(starId: string): void {
    updateState({ ...state, selected_star_id: starId });
  }

  function reset(): void {
    const next = {
      ...DEFAULT_HR_DIAGRAM_STATE,
      spectral_classes: [...DEFAULT_HR_DIAGRAM_STATE.spectral_classes],
      stage_groups: [...DEFAULT_HR_DIAGRAM_STATE.stage_groups],
      clusters: [...DEFAULT_HR_DIAGRAM_STATE.clusters],
    };
    setState(next);
    setStateInvalid(false);
    replaceBrowserState(null);
  }

  return (
    <article className="space-y-10" data-testid="hr-diagram-explorer">
      <header className="max-w-4xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Phase 3B / Vertical 4
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">H-R Diagram Explorer</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{MODE_COPY[mode].introduction}</p>
        <p className="rounded-md border border-[var(--border)] p-4 text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">Learning prompt:</strong>{" "}
          {MODE_COPY[mode].question}
        </p>
      </header>

      {stateInvalid ? (
        <aside
          aria-label="The shared H-R Diagram Explorer state was not valid"
          className="rounded-md border border-[var(--border)] p-4"
          role="alert"
        >
          <h2 className="text-lg font-semibold">
            The shared H-R Diagram Explorer state was not valid
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            The exact field set, version, filter values, view, or selected star was rejected. No
            partially accepted scientific state was used.
          </p>
          <button
            className="mt-3 min-h-11 rounded-sm border border-[var(--border-strong)] px-4 font-semibold"
            onClick={reset}
            type="button"
          >
            Reset to default state
          </button>
        </aside>
      ) : null}

      {artifactIntegrityInvalid ? (
        <div
          aria-label="The reviewed H-R Diagram data could not be verified"
          className="rounded-md border border-[var(--border)] p-4"
          role="alert"
        >
          <h2 className="text-lg font-semibold">
            The reviewed H-R Diagram data could not be verified
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            The static stellar artifact did not match its reviewed integrity record. Scientific
            results are withheld until the reviewed artifact is restored.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="hr-controls-heading" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="hr-controls-heading">Explore the curated sample</h2>
                <p className="text-[var(--muted)]">
                  {records.length} of {HR_DIAGRAM_RECORDS.length} stars match the active filters.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold" htmlFor="hr-view-select">
                  Diagram view
                </label>
                <select
                  className="min-h-11 rounded-sm border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base"
                  id="hr-view-select"
                  onChange={(event) =>
                    updateState({ ...state, view: event.target.value as HRDiagramView })
                  }
                  value={state.view}
                >
                  {HR_DIAGRAM_VIEWS.map((view) => (
                    <option key={view} value={view}>
                      {VIEW_LABELS[view]}
                    </option>
                  ))}
                </select>
                <button
                  className="min-h-11 rounded-sm border border-[var(--border-strong)] px-4 font-semibold"
                  onClick={reset}
                  type="button"
                >
                  Reset
                </button>
              </div>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {displayAxisLabels(state.view).xDirection}. {displayAxisLabels(state.view).yDirection}
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              <FilterGroup
                groupId="hr-spectral"
                labels={{ O: "O", B: "B", A: "A", F: "F", G: "G", K: "K", M: "M" }}
                legend="Spectral class (OR)"
                onToggle={(value) =>
                  updateState({
                    ...state,
                    spectral_classes: toggleValue(
                      state.spectral_classes,
                      value,
                      HR_DIAGRAM_SPECTRAL_CLASSES,
                    ),
                  })
                }
                selected={state.spectral_classes}
                values={HR_DIAGRAM_SPECTRAL_CLASSES}
              />
              <FilterGroup
                groupId="hr-stage"
                labels={STAGE_LABELS}
                legend="Stage group (OR)"
                onToggle={(value) =>
                  updateState({
                    ...state,
                    stage_groups: toggleValue(state.stage_groups, value, HR_DIAGRAM_STAGE_GROUPS),
                  })
                }
                selected={state.stage_groups}
                values={HR_DIAGRAM_STAGE_GROUPS}
              />
              <FilterGroup
                groupId="hr-cluster"
                labels={CLUSTER_LABELS}
                legend="Cluster (OR)"
                onToggle={(value) =>
                  updateState({
                    ...state,
                    clusters: toggleValue(state.clusters, value, HR_DIAGRAM_CLUSTERS),
                  })
                }
                selected={state.clusters}
                values={HR_DIAGRAM_CLUSTERS}
              />
            </div>
            <LearningModeSelector onChange={setMode} />
          </section>

          <PlotFigure
            records={records}
            selected={selected}
            selectedIsVisible={selectedIsVisible}
            view={state.view}
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold" htmlFor="hr-keyboard-star-selector">
              Keyboard star selector
            </label>
            <select
              className="min-h-11 min-w-0 max-w-full rounded-sm border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base"
              id="hr-keyboard-star-selector"
              onChange={(event) => selectStar(event.target.value)}
              value={state.selected_star_id}
            >
              {records.map((record) => (
                <option key={record.star_id} value={record.star_id}>
                  {selectedStarLabel(record)}
                </option>
              ))}
              {!selectedIsVisible ? (
                <option value={selected.star_id}>
                  {selectedStarLabel(selected)} (outside filters)
                </option>
              ) : null}
            </select>
            <span className="text-sm text-[var(--muted)]">
              This control provides keyboard access to every currently plotted record without
              requiring 128 separate SVG tab stops.
            </span>
          </div>

          <section
            aria-labelledby="hr-legend-heading"
            className="rounded-md border border-[var(--border)] p-4"
          >
            <h2 id="hr-legend-heading" className="text-lg font-semibold">
              Reading the plot
            </h2>
            <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
              <li>Each point is one curated Gaia DR3 source record.</li>
              <li>Selected points are also named in the table and detail panel.</li>
              <li>Stage and spectral class are source-backed labels, not plot-position regions.</li>
              <li>Point density has no population-demographic meaning.</li>
            </ul>
          </section>

          <SelectedStarDetail outsideFilters={!selectedIsVisible} record={selected} />

          <section aria-labelledby="hr-table-heading" className="space-y-4">
            <div>
              <h2 id="hr-table-heading">Accessible data table</h2>
              <p className="text-[var(--muted)]">
                The table is the complete non-visual alternative to the SVG. Select any row to
                update the selected star without changing filters.
              </p>
            </div>
            <RecordsTable
              onSelect={selectStar}
              records={records}
              selectedStarId={selected.star_id}
            />
          </section>

          <ModelSurface mode={mode} />

          <section
            aria-labelledby="hr-share-heading"
            className="rounded-md border border-[var(--border)] p-4"
          >
            <h2 id="hr-share-heading">Serializable view state</h2>
            <p className="mt-2 text-[var(--muted)]">
              The URL stores only the versioned view, selected source ID, and filter arrays. Derived
              values, presentation mode, hover, and focus are not serialized.
            </p>
            <p className="mt-2 break-all text-sm">
              <a className="text-[var(--link)] underline" href={shareUrl}>
                Open this exact view state
              </a>
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Model: {HR_DIAGRAM_DEFINITION.model_version}; share schema:{" "}
              {HR_DIAGRAM_DEFINITION.share_schema_version}.
            </p>
          </section>

          <p className="text-sm text-[var(--muted)]">
            JavaScript enhances filtering and selection. The route also includes a complete semantic
            table, selected-star detail, assumptions, limitations, and provenance for no-JavaScript
            use.
            <Link className="ml-1 text-[var(--link)] underline" href="/lab">
              Return to Lab index
            </Link>
          </p>
        </>
      )}
    </article>
  );
}
