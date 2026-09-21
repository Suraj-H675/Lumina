"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { HRDiagramExplorerMessages } from "../lib/i18n/messages/types";
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
  locale: PublishedLocale;
  messages: HRDiagramExplorerMessages;
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

function viewLabel(view: HRDiagramView, messages: HRDiagramExplorerMessages): string {
  return view === "physical_hr" ? messages.views.physicalHr : messages.views.gaiaCmd;
}

function displayAxisLabels(
  view: HRDiagramView,
  messages: HRDiagramExplorerMessages,
): Readonly<{
  x: string;
  y: string;
  xDirection: string;
  yDirection: string;
}> {
  return view === "physical_hr" ? messages.axes.physicalHr : messages.axes.gaiaCmd;
}

function selectedStarLabel(record: HRDiagramRecord, messages: HRDiagramExplorerMessages): string {
  return formatMessageTemplate(messages.selectedStarLabel, {
    cluster: record.cluster_label,
    designation: record.designation,
    spectralClass: record.spectral_class,
    stage: STAGE_LABELS[record.stage_group],
  });
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
  locale,
  messages,
  view,
  records,
  selected,
  selectedIsVisible,
}: Readonly<{
  locale: PublishedLocale;
  messages: HRDiagramExplorerMessages;
  view: HRDiagramView;
  records: ReadonlyArray<HRDiagramRecord>;
  selected: HRDiagramRecord;
  selectedIsVisible: boolean;
}>) {
  const axes = displayAxisLabels(view, messages);
  const plot = { left: 76, top: 28, width: 610, height: 330 };
  const selectedUncertainty = selectedIsVisible ? displayUncertainty(selected, view) : null;
  const selectedX = plot.left + displayXFraction(selected, view) * plot.width;
  const selectedY = plot.top + displayYFraction(selected, view) * plot.height;
  const xTicks =
    view === "physical_hr"
      ? [50000, 20000, 10000, 5000, 2500].map((value) => ({
          value,
          fraction: physicalTemperatureXFraction(value),
          label: `${formatLocaleNumber(value, locale)} K`,
        }))
      : [-0.5, 0.5, 1.5, 2.5, 3.5, 4].map((value) => ({
          value,
          fraction: cmdColourXFraction(value),
          label: formatLocaleFixedNumber(value, 1, locale),
        }));
  const yTicks =
    view === "physical_hr"
      ? [1e5, 1e3, 10, 0.1, 1e-3].map((value) => ({
          value,
          fraction: physicalLuminosityYFraction(value),
          label:
            value >= 1
              ? `${formatLocaleNumber(value, locale)} L☉`
              : `${formatLocaleNumber(value, locale, {
                  maximumFractionDigits: 20,
                  useGrouping: false,
                })} L☉`,
        }))
      : [-5, 0, 5, 10, 15].map((value) => ({
          value,
          fraction: cmdMagnitudeYFraction(value),
          label: `${formatLocaleNumber(value, locale, { useGrouping: false })} mag`,
        }));

  return (
    <figure className="space-y-3" data-testid="hr-diagram-plot">
      <svg
        aria-labelledby="hr-diagram-plot-title hr-diagram-plot-description"
        className="h-auto w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)]"
        role="img"
        viewBox="0 0 760 430"
      >
        <title id="hr-diagram-plot-title">{viewLabel(view, messages)}</title>
        <desc id="hr-diagram-plot-description">
          {formatMessageTemplate(messages.plot.description, {
            count: formatLocaleNumber(records.length, locale),
            xDirection: axes.xDirection,
            yDirection: axes.yDirection,
          })}
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
                {formatMessageTemplate(messages.plot.markerSelectSuffix, {
                  star: selectedStarLabel(record, messages),
                })}
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
        {formatMessageTemplate(messages.plot.caption, {
          xDirection: axes.xDirection,
          yDirection: axes.yDirection,
        })}
      </figcaption>
    </figure>
  );
}

function SelectedStarDetail({
  locale,
  messages,
  record,
  outsideFilters,
}: Readonly<{
  locale: PublishedLocale;
  messages: HRDiagramExplorerMessages;
  record: HRDiagramRecord;
  outsideFilters: boolean;
}>) {
  return (
    <section aria-labelledby="hr-selected-heading" className="space-y-4">
      <div>
        <h2 id="hr-selected-heading">{messages.detail.title}</h2>
        <p className="text-[var(--muted)]">
          {formatMessageTemplate(messages.detail.summary, {
            cluster: record.cluster_label,
            designation: record.designation,
            spectralClass: record.spectral_class,
            stage: STAGE_LABELS[record.stage_group],
          })}
        </p>
        {outsideFilters ? (
          <p className="rounded-md border border-[var(--border)] p-3" role="note">
            {messages.detail.outsideFilters}
          </p>
        ) : null}
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt>{messages.detail.labels.sourceId}</dt>
          <dd>{record.gaia_source_id}</dd>
        </div>
        <div>
          <dt>{messages.detail.labels.designation}</dt>
          <dd>{record.designation}</dd>
        </div>
        <div>
          <dt>{messages.detail.labels.clusterRecord}</dt>
          <dd>
            {formatMessageTemplate(messages.detail.membershipSummary, {
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
          <dt>{messages.detail.labels.spectralFlags}</dt>
          <dd>
            {record.spectral_class} / {record.flags_esphs}
          </dd>
        </div>
        <div>
          <dt>{messages.detail.labels.stageRaw}</dt>
          <dd>
            {STAGE_LABELS[record.stage_group]} / {record.evolstage_flame}
          </dd>
        </div>
        <div>
          <dt>{messages.detail.labels.flagsFlame}</dt>
          <dd>{record.flags_flame}</dd>
        </div>
        <div>
          <dt>{messages.detail.labels.temperature}</dt>
          <dd>
            {formatMessageTemplate(messages.detail.percentileInterval, {
              lower: formatTemperature(record.teff_k_p16, locale),
              median: formatTemperature(record.teff_k_p50, locale),
              upper: formatTemperature(record.teff_k_p84, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.detail.labels.luminosity}</dt>
          <dd>
            {formatMessageTemplate(messages.detail.percentileInterval, {
              lower: formatLuminosity(record.luminosity_lsun_p16, locale),
              median: formatLuminosity(record.luminosity_lsun_p50, locale),
              upper: formatLuminosity(record.luminosity_lsun_p84, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.detail.labels.colour}</dt>
          <dd>
            {formatMessageTemplate(messages.detail.colourNoInterval, {
              value: formatColour(record.bp_rp_mag, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.detail.labels.magnitude}</dt>
          <dd>
            {formatMessageTemplate(messages.detail.percentileInterval, {
              lower: formatMagnitude(record.mg_gspphot_mag_p16, locale),
              median: formatMagnitude(record.mg_gspphot_mag_p50, locale),
              upper: formatMagnitude(record.mg_gspphot_mag_p84, locale),
            })}
          </dd>
        </div>
        <div>
          <dt>{messages.detail.labels.apparentMagnitude}</dt>
          <dd>{formatMagnitude(record.phot_g_mean_mag, locale)}</dd>
        </div>
        <div>
          <dt>{messages.detail.labels.parallax}</dt>
          <dd>
            {formatParallax(record.parallax_mas, locale)} /{" "}
            {formatParallax(record.parallax_error_mas, locale)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function RecordsTable({
  locale,
  messages,
  records,
  selectedStarId,
  onSelect,
}: Readonly<{
  locale: PublishedLocale;
  messages: HRDiagramExplorerMessages;
  records: ReadonlyArray<HRDiagramRecord>;
  selectedStarId: string;
  onSelect: (starId: string) => void;
}>) {
  return (
    <div
      aria-label={messages.table.ariaLabel}
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table>
        <caption>
          {formatMessageTemplate(messages.table.caption, {
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
          {records.map((record) => {
            const selected = record.star_id === selectedStarId;
            return (
              <tr aria-selected={selected} key={record.star_id}>
                <th scope="row">
                  <button
                    aria-label={formatMessageTemplate(messages.table.selectAria, {
                      star: selectedStarLabel(record, messages),
                    })}
                    className="min-h-11 text-left font-semibold text-[var(--link)] underline"
                    onClick={() => onSelect(record.star_id)}
                    type="button"
                  >
                    {record.designation}
                    {selected ? messages.table.selectedSuffix : ""}
                  </button>
                </th>
                <td>{record.cluster_label}</td>
                <td>{record.spectral_class}</td>
                <td>{STAGE_LABELS[record.stage_group]}</td>
                <td>{formatTemperature(record.teff_k_p50, locale)}</td>
                <td>{formatLuminosity(record.luminosity_lsun_p50, locale)}</td>
                <td>{formatColour(record.bp_rp_mag, locale)}</td>
                <td>{formatMagnitude(record.mg_gspphot_mag_p50, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModelSurface({
  messages,
  mode,
}: Readonly<{
  messages: HRDiagramExplorerMessages;
  mode: HRDiagramAudienceMode;
}>) {
  return (
    <section aria-labelledby="hr-model-heading" className="space-y-4">
      <h2 id="hr-model-heading">{messages.model.title}</h2>
      <p>
        <strong>{messages.model.modelLabel}</strong> {HR_DIAGRAM_DEFINITION.model_version}. This is
        the fixed {HR_DIAGRAM_DEFINITION.dataset_id} dataset: 128 curated Gaia DR3 records,
        equalized to 32 per cluster. Marker density is not a population-density estimate.
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
      <h3>{messages.model.displayRelationships}</h3>
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
      <h3>{messages.model.assumptionsAndLimitations}</h3>
      <ul>
        {HR_DIAGRAM_DEFINITION.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
        {HR_DIAGRAM_DEFINITION.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
      <h3>{messages.model.sources}</h3>
      <ul>
        {HR_DIAGRAM_DEFINITION.references.map((sourceId) => {
          const source = sourceForId(sourceId);
          return source === undefined ? (
            <li key={sourceId}>
              {formatMessageTemplate(messages.model.sourceUnavailable, { sourceId })}
            </li>
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
  locale,
  messages,
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
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{MODE_COPY[mode].introduction}</p>
        <p className="rounded-md border border-[var(--border)] p-4 text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">{messages.header.learningPrompt}</strong>{" "}
          {MODE_COPY[mode].question}
        </p>
      </header>

      {stateInvalid ? (
        <aside
          aria-label={messages.invalidState.title}
          className="rounded-md border border-[var(--border)] p-4"
          role="alert"
        >
          <h2 className="text-lg font-semibold">{messages.invalidState.title}</h2>
          <p className="mt-2 text-[var(--muted)]">{messages.invalidState.description}</p>
          <button
            className="mt-3 min-h-11 rounded-sm border border-[var(--border-strong)] px-4 font-semibold"
            onClick={reset}
            type="button"
          >
            {messages.actions.resetDefault}
          </button>
        </aside>
      ) : null}

      {artifactIntegrityInvalid ? (
        <div
          aria-label={messages.artifactIntegrity.title}
          className="rounded-md border border-[var(--border)] p-4"
          role="alert"
        >
          <h2 className="text-lg font-semibold">{messages.artifactIntegrity.title}</h2>
          <p className="mt-2 text-[var(--muted)]">{messages.artifactIntegrity.description}</p>
        </div>
      ) : (
        <>
          <section aria-labelledby="hr-controls-heading" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="hr-controls-heading">{messages.controls.title}</h2>
                <p className="text-[var(--muted)]">
                  {formatMessageTemplate(messages.controls.countSummary, {
                    count: formatLocaleNumber(records.length, locale),
                    total: formatLocaleNumber(HR_DIAGRAM_RECORDS.length, locale),
                  })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold" htmlFor="hr-view-select">
                  {messages.controls.viewLabel}
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
                      {viewLabel(view, messages)}
                    </option>
                  ))}
                </select>
                <button
                  className="min-h-11 rounded-sm border border-[var(--border-strong)] px-4 font-semibold"
                  onClick={reset}
                  type="button"
                >
                  {messages.actions.reset}
                </button>
              </div>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {displayAxisLabels(state.view, messages).xDirection}.{" "}
              {displayAxisLabels(state.view, messages).yDirection}
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              <FilterGroup
                groupId="hr-spectral"
                labels={{ O: "O", B: "B", A: "A", F: "F", G: "G", K: "K", M: "M" }}
                legend={messages.controls.spectralLegend}
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
                legend={messages.controls.stageLegend}
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
                legend={messages.controls.clusterLegend}
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
            locale={locale}
            messages={messages}
            records={records}
            selected={selected}
            selectedIsVisible={selectedIsVisible}
            view={state.view}
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold" htmlFor="hr-keyboard-star-selector">
              {messages.controls.keyboardLabel}
            </label>
            <select
              className="min-h-11 min-w-0 max-w-full rounded-sm border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base"
              id="hr-keyboard-star-selector"
              onChange={(event) => selectStar(event.target.value)}
              value={state.selected_star_id}
            >
              {records.map((record) => (
                <option key={record.star_id} value={record.star_id}>
                  {selectedStarLabel(record, messages)}
                </option>
              ))}
              {!selectedIsVisible ? (
                <option value={selected.star_id}>
                  {selectedStarLabel(selected, messages)}
                  {messages.controls.outsideFiltersSuffix}
                </option>
              ) : null}
            </select>
            <span className="text-sm text-[var(--muted)]">{messages.controls.keyboardHelp}</span>
          </div>

          <section
            aria-labelledby="hr-legend-heading"
            className="rounded-md border border-[var(--border)] p-4"
          >
            <h2 id="hr-legend-heading" className="text-lg font-semibold">
              {messages.legend.title}
            </h2>
            <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
              <li>{messages.legend.items.point}</li>
              <li>{messages.legend.items.selected}</li>
              <li>{messages.legend.items.sourceBacked}</li>
              <li>{messages.legend.items.density}</li>
            </ul>
          </section>

          <SelectedStarDetail
            locale={locale}
            messages={messages}
            outsideFilters={!selectedIsVisible}
            record={selected}
          />

          <section aria-labelledby="hr-table-heading" className="space-y-4">
            <div>
              <h2 id="hr-table-heading">{messages.table.title}</h2>
              <p className="text-[var(--muted)]">{messages.table.description}</p>
            </div>
            <RecordsTable
              locale={locale}
              messages={messages}
              onSelect={selectStar}
              records={records}
              selectedStarId={selected.star_id}
            />
          </section>

          <ModelSurface messages={messages} mode={mode} />

          <section
            aria-labelledby="hr-share-heading"
            className="rounded-md border border-[var(--border)] p-4"
          >
            <h2 id="hr-share-heading">{messages.share.title}</h2>
            <p className="mt-2 text-[var(--muted)]">{messages.share.description}</p>
            <p className="mt-2 break-all text-sm">
              <a className="text-[var(--link)] underline" href={shareUrl}>
                {messages.share.link}
              </a>
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {formatMessageTemplate(messages.share.modelSummary, {
                modelVersion: HR_DIAGRAM_DEFINITION.model_version,
                schemaVersion: formatLocaleNumber(
                  HR_DIAGRAM_DEFINITION.share_schema_version,
                  locale,
                ),
              })}
            </p>
          </section>

          <p className="text-sm text-[var(--muted)]">
            {messages.footer.description}
            <Link className="ml-1 text-[var(--link)] underline" href="/lab">
              {messages.footer.link}
            </Link>
          </p>
        </>
      )}
    </article>
  );
}
