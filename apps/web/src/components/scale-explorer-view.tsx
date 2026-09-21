"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ScaleExplorerMessages } from "../lib/i18n/messages/types";
import type { AudienceMode } from "../lib/learning/content";
import { LearningModeSelector } from "./learning-mode-selector";
import {
  DEFAULT_SCALE_EXPLORER_STATE,
  SCALE_EXPLORER_DEFINITION,
  SCALE_EXPLORER_MODEL_VERSION,
  SCALE_EXPLORER_NODES,
  SCALE_EXPLORER_SOURCES,
  buildScaleExplorerModel,
  decodeScaleExplorerState,
  encodeScaleExplorerState,
  type ScaleExplorerComparison,
  type ScaleExplorerNode,
  type ScaleExplorerPositionedNode,
  type ScaleExplorerState,
  type ScaleNodeCategory,
} from "../lib/simulations/scale-explorer";

type ScaleExplorerViewProps = Readonly<{
  initialState: ScaleExplorerState;
  initialStateInvalid: boolean;
  locale: PublishedLocale;
  messages: ScaleExplorerMessages;
}>;

const modeCopy: Record<
  AudienceMode,
  Readonly<{
    introduction: string;
    prompt: string;
    result_explanation: string;
    model_note: string;
  }>
> = {
  explorer: {
    introduction:
      "Move one node at a time. Notice that the objects do not sit evenly spaced: each step can represent a very different change in size.",
    prompt: "What changes when you move from a planet to a star, then to a galaxy?",
    result_explanation:
      "Use this value as a familiar anchor: it describes the selected node's characteristic size, while the track shows where that size falls in the curated story.",
    model_note:
      "Explorer mode keeps the model explanation concise. The same cited values and deterministic calculations are used in every presentation mode.",
  },
  student: {
    introduction:
      "The track uses a logarithmic position so several orders of magnitude can share one readable view. The selected value remains the cited characteristic size.",
    prompt: "Why would an ordinary linear ruler hide most of these comparisons?",
    result_explanation:
      "A radius is half a diameter. For ratio comparisons, Lumina converts the selected and reference characteristic sizes to metres, then divides the selected size by the reference size.",
    model_note:
      "Student mode foregrounds the vocabulary: characteristic size, radius, diameter, ratio, and order of magnitude. It does not change the underlying facts.",
  },
  "deep-dive": {
    introduction:
      "The model converts each source value to metres for ordering, then applies a base-10 logarithmic normalization between the curated minimum and maximum. That position is a display coordinate, not a physical measurement.",
    prompt:
      "Which assumptions become important when a galaxy width and a planetary diameter share a scale track?",
    result_explanation:
      "The selected comparison is a deterministic, dimensionless ratio when a reference node is defined. Source values are approximate, so the learner-facing sentence is rounded to two significant figures.",
    model_note:
      "Deep Dive mode exposes the model boundary: source quantities are converted to SI metres, ratios are calculated from canonical characteristic sizes, and log10 normalization creates display coordinates only.",
  },
};

const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--foreground)] no-underline transition-colors motion-reduce:transition-none hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-55";

function categoryLabel(
  category: ScaleNodeCategory,
  messages: ScaleExplorerMessages["categories"],
): string {
  return messages[category];
}

function quantityLabel(
  quantity: ScaleExplorerNode["characteristic_quantity"],
  messages: ScaleExplorerMessages["quantities"],
): string {
  switch (quantity) {
    case "diameter":
      return messages.diameter;
    case "width":
      return messages.width;
    case "observable-extent":
      return messages.observableExtent;
  }
}

function sourceQuantityLabel(
  node: ScaleExplorerNode,
  messages: ScaleExplorerMessages["sourceQuantities"],
): string {
  switch (node.source_quantity) {
    case "radius":
      return messages.radius;
    case "diameter":
      return messages.diameter;
    case "width":
      return messages.width;
    case "extent":
      return messages.extent;
  }
}

function statusLabel(
  status: ScaleExplorerNode["value_status"],
  messages: ScaleExplorerMessages["statuses"],
): string {
  switch (status) {
    case "approximate":
      return messages.approximate;
    case "derived-approximate":
      return messages.derivedApproximate;
    case "model-based":
      return messages.modelBased;
    case "reported":
      return messages.reported;
  }
}

function formatDisplayPosition(
  positionPercent: number,
  locale: PublishedLocale,
  messages: ScaleExplorerMessages,
): string {
  return formatMessageTemplate(messages.result.displayPositionValue, {
    percent: formatLocaleNumber(Math.round(positionPercent), locale),
  });
}

function sourceForId(id: string) {
  return SCALE_EXPLORER_SOURCES.find((source) => source.id === id);
}

function nodeLabel(entry: ScaleExplorerPositionedNode, messages: ScaleExplorerMessages): string {
  return `${entry.node.name}, ${entry.node.display_value} ${quantityLabel(
    entry.node.characteristic_quantity,
    messages.quantities,
  )}`;
}

const SCALE_EXPLORER_ROUTE = "/lab/scale-explorer";

function buildShareUrl(state: ScaleExplorerState): string {
  const url = new URL(window.location.href);
  // Share state has one canonical server-rendered route. This keeps a direct static node route
  // from disagreeing with the selected state when JavaScript is disabled.
  url.pathname = SCALE_EXPLORER_ROUTE;
  url.search = "";
  url.hash = "";
  url.searchParams.set("state", encodeScaleExplorerState(state));
  return url.toString();
}

function replaceBrowserState(state: ScaleExplorerState | null): void {
  const url = new URL(window.location.href);
  // Keep interactive updates reproducible by sending state-bearing URLs through the root proxy.
  url.pathname = SCALE_EXPLORER_ROUTE;
  url.search = "";
  url.hash = "";
  if (state !== null) url.searchParams.set("state", encodeScaleExplorerState(state));
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event("scale-explorer-state-change"));
}

type BrowserStateSelection = Readonly<{
  state: ScaleExplorerState;
  invalid: boolean;
}>;

function browserStateSelection(
  pathname: string,
  search: string,
  fallbackState: ScaleExplorerState,
  fallbackInvalid: boolean,
): BrowserStateSelection {
  // Static node routes are source-of-truth fallbacks and do not accept serialized query state.
  // Interactive changes canonicalize to the root route before state is read.
  if (pathname !== SCALE_EXPLORER_ROUTE) {
    return { state: fallbackState, invalid: fallbackInvalid };
  }
  const values = new URLSearchParams(search).getAll("state");
  if (values.length === 0) {
    return { state: fallbackState, invalid: fallbackInvalid };
  }
  if (values.length !== 1) {
    return { state: DEFAULT_SCALE_EXPLORER_STATE, invalid: true };
  }
  const decoded = decodeScaleExplorerState(values[0]);
  return decoded === null
    ? { state: DEFAULT_SCALE_EXPLORER_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

function ScaleTrack({
  messages,
  model,
}: Readonly<{
  messages: ScaleExplorerMessages["track"];
  model: ReturnType<typeof buildScaleExplorerModel>;
}>) {
  return (
    <div className="space-y-3">
      <div
        aria-hidden="true"
        className="relative h-28 overflow-hidden rounded-md border border-[var(--border)] bg-[linear-gradient(90deg,var(--surface),var(--surface-hover))]"
      >
        <div className="absolute inset-x-4 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--border-strong)]">
          {model.nodes.map((entry) => {
            const selected = entry.node.id === model.selected.node.id;
            return (
              <span
                className={
                  selected
                    ? "absolute top-1/2 h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-[var(--focus)] bg-[var(--accent)]"
                    : "absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--muted)]"
                }
                key={entry.node.id}
                style={{ left: `${entry.position_percent}%` }}
              />
            );
          })}
        </div>
        <span className="absolute bottom-2 left-4 text-xs font-semibold text-[var(--muted)]">
          {messages.smallest}
        </span>
        <span className="absolute bottom-2 right-4 text-xs font-semibold text-[var(--muted)]">
          {messages.largest}
        </span>
      </div>
      <p className="text-sm text-[var(--muted)]">
        {formatMessageTemplate(messages.markerSummary, { node: model.selected.node.name })}
      </p>
      <div
        aria-label={messages.legendAriaLabel}
        className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)]"
        role="group"
      >
        <span className="inline-flex min-h-11 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-7 w-3 rounded-sm border-2 border-[var(--focus)] bg-[var(--accent)]"
          />
          {messages.selectedMarker}
        </span>
        <span className="inline-flex min-h-11 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-1 rounded-full bg-[var(--muted)]"
          />
          {messages.otherMarker}
        </span>
        <span className="inline-flex min-h-11 items-center">{messages.coordinate}</span>
      </div>
    </div>
  );
}

function SourceList({
  messages,
  sourceIds,
}: Readonly<{
  messages: ScaleExplorerMessages["sources"];
  sourceIds: ReadonlyArray<string>;
}>) {
  return (
    <ul className="m-0 grid list-disc gap-2 pl-5 text-sm leading-6 text-[var(--muted)]">
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <span>{formatMessageTemplate(messages.unavailable, { sourceId })}</span>
            ) : (
              <>
                <span className="font-semibold">
                  {source.source_type === "official-agency" ? messages.agency : messages.education}
                  :{" "}
                </span>
                <code className="mr-2 break-all text-xs text-[var(--foreground)]">{source.id}</code>
                <a
                  className="inline-flex min-h-11 items-center py-2 font-medium text-[var(--link)] underline"
                  href={source.url}
                >
                  {source.title}
                </a>{" "}
                <span>
                  {formatMessageTemplate(messages.details, {
                    authors: source.organization_or_authors,
                    claimScope: source.claim_scope,
                    dataDate: source.data_date,
                    retrievedAt: source.retrieved_at,
                  })}
                </span>
                <span className="mt-1 block text-xs leading-5">
                  {formatMessageTemplate(messages.metadata, {
                    dataset: source.dataset_or_release,
                    record: source.record_reference,
                    terms: source.terms_or_licence,
                  })}
                </span>
                <span className="mt-1 block text-xs leading-5">
                  {formatMessageTemplate(messages.citation, { citation: source.citation })}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SourceLinkList({
  messages,
  sourceIds,
}: Readonly<{
  messages: ScaleExplorerMessages["sources"];
  sourceIds: ReadonlyArray<string>;
}>) {
  return (
    <ul className="m-0 grid gap-1 pl-0 text-xs leading-5 text-[var(--muted)]">
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <span>{formatMessageTemplate(messages.unavailableShort, { sourceId })}</span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-2">
                <code className="break-all text-[var(--foreground)]">{source.id}</code>
                <a
                  className="inline-flex min-h-11 items-center py-2 text-[var(--link)] underline"
                  href={source.url}
                >
                  {source.title}
                </a>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ComparisonEvidence({
  comparison,
  messages,
}: Readonly<{
  comparison: ScaleExplorerComparison;
  messages: ScaleExplorerMessages;
}>) {
  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-5">
      <h3>{messages.comparisonEvidence.title}</h3>
      <p className="text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.comparisonEvidence.summary, {
          algorithm: comparison.algorithm_id,
          unit: comparison.unit,
          version: comparison.algorithm_version,
        })}
      </p>
      <p className="text-sm leading-6 text-[var(--muted)]">
        {messages.comparisonEvidence.inputNodeIds}:{" "}
        <code className="break-all text-[var(--foreground)]">
          {comparison.input_node_ids.join(", ")}
        </code>
      </p>
      <p className="text-sm font-semibold text-[var(--muted)]">
        {messages.comparisonEvidence.inputSourceRecords}
      </p>
      <SourceList messages={messages.sources} sourceIds={comparison.input_source_ids} />
      <p className="text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.comparisonEvidence.rounding, {
          rounding: comparison.rounding,
        })}
      </p>
    </div>
  );
}

type ScaleExplorerTransitionContract = NonNullable<
  ScaleExplorerNode["transition_explanation"]["derived_quantity"]
>;

function TransitionCalculationContract({
  contract,
  messages,
}: Readonly<{
  contract: ScaleExplorerTransitionContract;
  messages: ScaleExplorerMessages;
}>) {
  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-5">
      <h3>{messages.transitionContract.title}</h3>
      <dl className="grid gap-3 text-sm leading-6 text-[var(--muted)] sm:grid-cols-2">
        <div>
          <dt className="font-semibold">{messages.transitionContract.algorithm}</dt>
          <dd className="mt-1">
            <code className="text-[var(--foreground)]">{contract.algorithm_id}</code> v
            {contract.algorithm_version}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{messages.transitionContract.units}</dt>
          <dd className="mt-1">
            {formatMessageTemplate(messages.transitionContract.unitsValue, {
              input: contract.input_unit,
              output: contract.output_unit,
            })}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold">{messages.transitionContract.inputNodeIds}</dt>
          <dd className="mt-1 break-words font-mono text-xs text-[var(--foreground)]">
            {contract.input_node_ids.join(", ")}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold">{messages.transitionContract.validDomain}</dt>
          <dd className="mt-1">{contract.valid_domain}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold">{messages.transitionContract.numericalTolerance}</dt>
          <dd className="mt-1">{contract.numerical_tolerance}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold">{messages.transitionContract.learnerFacingRounding}</dt>
          <dd className="mt-1">{contract.learner_facing_rounding}</dd>
        </div>
        <div>
          <dt className="font-semibold">{messages.transitionContract.testReferences}</dt>
          <dd className="mt-1 break-words font-mono text-xs text-[var(--foreground)]">
            {contract.test_references.join(", ")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{messages.transitionContract.generated}</dt>
          <dd className="mt-1">{contract.generated_at}</dd>
        </div>
      </dl>
      <p className="text-sm font-semibold text-[var(--muted)]">
        {messages.transitionContract.inputSourceRecords}
      </p>
      <SourceList messages={messages.sources} sourceIds={contract.input_source_ids} />
    </div>
  );
}

function NodeTable({
  locale,
  messages,
  model,
  onSelect,
}: Readonly<{
  locale: PublishedLocale;
  messages: ScaleExplorerMessages;
  model: ReturnType<typeof buildScaleExplorerModel>;
  onSelect: (nodeId: ScaleExplorerState["node_id"]) => void;
}>) {
  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="min-w-[60rem] w-full border-collapse text-left text-sm">
        <caption className="sr-only">{messages.table.caption}</caption>
        <thead className="bg-[var(--surface)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-semibold" scope="col">
              {messages.table.headers.node}
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              {messages.table.headers.characteristicSize}
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              {messages.table.headers.comparison}
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              {messages.table.headers.sourceStatus}
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              {messages.table.headers.evidence}
            </th>
          </tr>
        </thead>
        <tbody>
          {model.nodes.map((entry) => {
            const selected = entry.node.id === model.selected.node.id;
            return (
              <tr
                className={
                  selected
                    ? "border-t border-[var(--accent)] bg-[var(--surface-hover)]"
                    : "border-t border-[var(--border)]"
                }
                key={entry.node.id}
              >
                <th className="px-4 py-3 align-top font-semibold" scope="row">
                  <button
                    aria-current={selected ? "true" : undefined}
                    className="min-h-11 min-w-11 text-left text-[var(--foreground)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
                    onClick={() => onSelect(entry.node.id)}
                    type="button"
                  >
                    {entry.node.name}
                  </button>
                  {selected ? (
                    <span className="mt-1 block text-xs font-semibold text-[var(--accent)]">
                      {messages.table.selected}
                    </span>
                  ) : null}
                </th>
                <td className="px-4 py-3 align-top text-[var(--foreground)]">
                  {entry.node.display_value}
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {quantityLabel(entry.node.characteristic_quantity, messages.quantities)}
                  </span>
                </td>
                <td className="max-w-sm px-4 py-3 align-top leading-6 text-[var(--muted)]">
                  {entry.comparison.text}
                </td>
                <td className="px-4 py-3 align-top leading-6 text-[var(--muted)]">
                  {statusLabel(entry.node.value_status, messages.statuses)}
                  <span className="mt-1 block text-xs">
                    {formatMessageTemplate(messages.table.onTrack, {
                      percent: formatLocaleNumber(Math.round(entry.position_percent), locale),
                    })}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="block text-xs font-semibold text-[var(--muted)]">
                    {messages.table.characteristicValue}
                  </span>
                  <SourceLinkList messages={messages.sources} sourceIds={entry.node.source_ids} />
                  <span className="mt-2 block text-xs font-semibold text-[var(--muted)]">
                    {messages.table.transitionExplanation}
                  </span>
                  <SourceLinkList
                    messages={messages.sources}
                    sourceIds={entry.node.transition_explanation.source_ids}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ScaleExplorerView({
  initialState,
  initialStateInvalid,
  locale,
  messages,
}: ScaleExplorerViewProps) {
  const [state, setState] = useState<ScaleExplorerState>(initialState);
  const [invalidNotice, setInvalidNotice] = useState(initialStateInvalid);
  const [mode, setMode] = useState<AudienceMode>("explorer");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const syncFromUrl = () => {
      const selection = browserStateSelection(
        window.location.pathname,
        window.location.search,
        initialState,
        initialStateInvalid,
      );
      setState(selection.state);
      setInvalidNotice(selection.invalid);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener("scale-explorer-state-change", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener("scale-explorer-state-change", syncFromUrl);
    };
  }, [initialState, initialStateInvalid]);

  const selectNode = useCallback((nodeId: ScaleExplorerState["node_id"]) => {
    const nextState: ScaleExplorerState = {
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      node_id: nodeId,
      version: 1,
    };
    setShareUrl(null);
    setMessage("");
    replaceBrowserState(nextState);
  }, []);

  const model = useMemo(() => buildScaleExplorerModel(state), [state]);
  const copy = modeCopy[mode];

  function handleSliderChange(rawIndex: string): void {
    const index = Number(rawIndex);
    if (!Number.isInteger(index)) return;
    const entry = model.nodes[index];
    if (entry === undefined) return;
    selectNode(entry.node.id);
  }

  function handleReset(): void {
    setShareUrl(null);
    setMessage(messages.share.reset);
    replaceBrowserState(null);
    // The synchronous URL event above may restore a direct route's fallback state; reset wins.
    setState(DEFAULT_SCALE_EXPLORER_STATE);
    setInvalidNotice(false);
  }

  async function handleShare(): Promise<void> {
    const url = buildShareUrl(state);
    setShareUrl(url);
    try {
      if (typeof navigator.clipboard !== "undefined") {
        await navigator.clipboard.writeText(url);
        setMessage(messages.share.copied);
        return;
      }
    } catch {
      // The visible URL remains available for manual copying when clipboard
      // permission is unavailable.
    }
    setMessage(messages.share.ready);
  }

  return (
    <article className="space-y-12">
      <nav aria-label={messages.header.breadcrumbAriaLabel}>
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm text-[var(--muted)]">
          <li>{messages.header.labBreadcrumb}</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{messages.header.title}</li>
        </ol>
      </nav>

      <header className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.header.intro}</p>
      </header>

      <LearningModeSelector onChange={setMode} />

      {invalidNotice ? (
        <aside
          aria-labelledby="invalid-scale-state-heading"
          className="max-w-3xl space-y-3 rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
          role="alert"
        >
          <h2 id="invalid-scale-state-heading">{messages.invalidState.title}</h2>
          <p className="leading-7 text-[var(--muted)]">{messages.invalidState.description}</p>
        </aside>
      ) : null}

      <section aria-labelledby="scale-objective-heading" className="max-w-3xl space-y-4">
        <h2 id="scale-objective-heading">{messages.objective.title}</h2>
        <p className="leading-7 text-[var(--muted)]">{copy.introduction}</p>
        <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 leading-7 text-[var(--foreground)]">
          <strong>{messages.objective.thinkAbout}</strong> {copy.prompt}
        </p>
        <ul className="m-0 grid list-disc gap-2 pl-6 leading-7 text-[var(--muted)]">
          {SCALE_EXPLORER_DEFINITION.learning_objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="scale-controls-heading" className="max-w-3xl space-y-5">
        <div className="space-y-2">
          <h2 id="scale-controls-heading">{messages.controls.title}</h2>
          <p className="leading-7 text-[var(--muted)]" id="scale-control-help">
            {formatMessageTemplate(messages.controls.description, {
              count: formatLocaleNumber(SCALE_EXPLORER_NODES.length, locale),
            })}
          </p>
        </div>
        <div className="space-y-3">
          <label className="font-semibold" htmlFor="scale-node-slider">
            {messages.controls.sliderLabel}
          </label>
          <input
            aria-describedby="scale-control-help"
            aria-label={messages.controls.sliderLabel}
            aria-valuetext={formatMessageTemplate(messages.controls.sliderAriaValue, {
              count: formatLocaleNumber(model.nodes.length, locale),
              index: formatLocaleNumber(model.selected.index + 1, locale),
              node: nodeLabel(model.selected, messages),
            })}
            className="block min-h-11 w-full accent-[var(--accent)]"
            id="scale-node-slider"
            max={model.nodes.length - 1}
            min={0}
            onChange={(event) => handleSliderChange(event.target.value)}
            step={1}
            type="range"
            value={model.selected.index}
          />
          <p className="text-sm text-[var(--muted)]">
            {formatMessageTemplate(messages.controls.nodeSummary, {
              count: formatLocaleNumber(model.nodes.length, locale),
              index: formatLocaleNumber(model.selected.index + 1, locale),
              node: model.selected.node.name,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className={buttonClassName}
            disabled={model.selected.previous === undefined}
            onClick={() => {
              const previous = model.selected.previous;
              if (previous !== undefined) selectNode(previous.node.id);
            }}
            type="button"
          >
            {messages.actions.previousNode}
          </button>
          <button className={buttonClassName} onClick={handleReset} type="button">
            {messages.actions.reset}
          </button>
          <button
            className={buttonClassName}
            disabled={model.selected.next === undefined}
            onClick={() => {
              const next = model.selected.next;
              if (next !== undefined) selectNode(next.node.id);
            }}
            type="button"
          >
            {messages.actions.nextNode}
          </button>
        </div>
      </section>

      <section aria-labelledby="scale-visual-heading" className="space-y-5">
        <div className="space-y-2">
          <h2 id="scale-visual-heading">{messages.track.title}</h2>
          <p className="max-w-3xl leading-7 text-[var(--muted)]">{messages.track.description}</p>
        </div>
        <ScaleTrack messages={messages.track} model={model} />
      </section>

      <section
        aria-labelledby="selected-scale-heading"
        className="max-w-3xl space-y-5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-6"
      >
        <div aria-atomic="true" aria-live="polite" role="status">
          <p className="text-sm font-semibold text-[var(--accent)]">
            {messages.result.selectedNode}
          </p>
          <h2 id="selected-scale-heading">{model.selected.node.name}</h2>
          <p className="mt-2 text-lg leading-8 text-[var(--foreground)]">
            {model.selected.node.display_value}{" "}
            {quantityLabel(model.selected.node.characteristic_quantity, messages.quantities)}
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.result.category}
            </dt>
            <dd className="mt-1">
              {categoryLabel(model.selected.node.category, messages.categories)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.result.valueStatus}
            </dt>
            <dd className="mt-1">
              {statusLabel(model.selected.node.value_status, messages.statuses)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.result.sourceValue}
            </dt>
            <dd className="mt-1">
              {formatLocaleNumber(model.selected.node.source_value, locale)}{" "}
              {model.selected.node.source_unit}{" "}
              <span className="text-sm text-[var(--muted)]">
                ({sourceQuantityLabel(model.selected.node, messages.sourceQuantities)})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.result.displayPosition}
            </dt>
            <dd className="mt-1">
              {formatDisplayPosition(model.selected.position_percent, locale, messages)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.result.comparison}
            </dt>
            <dd className="mt-1 leading-7">{model.selected.comparison.text}</dd>
          </div>
        </dl>
        <ComparisonEvidence comparison={model.selected.comparison} messages={messages} />
        <p className="leading-7 text-[var(--muted)]">{model.selected.node.source_basis}</p>
        <p className="leading-7 text-[var(--foreground)]">
          {model.selected.node.transition_explanation.text}
        </p>
        {model.selected.node.transition_explanation.derived_quantity !== undefined ? (
          <TransitionCalculationContract
            contract={model.selected.node.transition_explanation.derived_quantity}
            messages={messages}
          />
        ) : null}
        <div className="grid gap-6 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
          <div className="space-y-2">
            <h3>{messages.result.characteristicEvidence}</h3>
            <SourceList messages={messages.sources} sourceIds={model.selected.node.source_ids} />
          </div>
          <div className="space-y-2">
            <h3>{messages.result.transitionEvidence}</h3>
            <SourceList
              messages={messages.sources}
              sourceIds={model.selected.node.transition_explanation.source_ids}
            />
          </div>
        </div>
        <aside
          aria-labelledby="scale-reading-heading"
          className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-4"
        >
          <h3 id="scale-reading-heading">{messages.result.readingTitle}</h3>
          <p className="leading-7 text-[var(--muted)]">{copy.result_explanation}</p>
          {model.selected.comparison.kind === "calculated-ratio" ? (
            <p className="text-sm leading-6 text-[var(--muted)]">
              {formatMessageTemplate(messages.result.calculatedComparison, {
                reference:
                  model.nodes.find(
                    (entry) => entry.node.id === model.selected.comparison.reference_node_id,
                  )?.node.name ?? messages.result.referenceFallback,
                selected: model.selected.node.name,
              })}
            </p>
          ) : null}
        </aside>
        <div className="space-y-3 border-t border-[var(--border)] pt-5">
          <h3>{messages.entityLinks.title}</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">
            {messages.entityLinks.description}
          </p>
          <ul className="m-0 grid list-disc gap-2 pl-5 text-sm leading-6">
            {model.selected.node.entity_links.map((link) => (
              <li key={link.href}>
                <span className="mr-1 text-sm text-[var(--muted)]">
                  {link.kind === "entity-reference"
                    ? messages.entityLinks.entityReference
                    : messages.entityLinks.sourceReference}
                </span>
                <a
                  className="inline-flex min-h-11 items-center py-2 text-[var(--link)] underline"
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="scale-alternative-heading" className="space-y-5">
        <div className="space-y-2">
          <h2 id="scale-alternative-heading">{messages.dataAlternative.title}</h2>
          <p className="max-w-3xl leading-7 text-[var(--muted)]">
            {messages.dataAlternative.description}
          </p>
        </div>
        <NodeTable locale={locale} messages={messages} model={model} onSelect={selectNode} />
      </section>

      <section aria-labelledby="scale-model-heading" className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <h2 id="scale-model-heading">{messages.model.title}</h2>
          <p className="leading-7 text-[var(--muted)]">
            {copy.model_note} {SCALE_EXPLORER_DEFINITION.visualization_module}{" "}
            {messages.model.disclaimer}
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.model.modelVersion}
            </dt>
            <dd className="mt-1 font-mono text-sm">{SCALE_EXPLORER_MODEL_VERSION}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.model.contentReview}
            </dt>
            <dd className="mt-1 leading-7">
              {formatMessageTemplate(messages.model.contentReviewValue, {
                reviewedAt: SCALE_EXPLORER_DEFINITION.reviewed_at.slice(0, 10),
                reviewers: SCALE_EXPLORER_DEFINITION.reviewed_by.join(", "),
                status: SCALE_EXPLORER_DEFINITION.status,
                version: formatLocaleNumber(SCALE_EXPLORER_DEFINITION.version, locale),
              })}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">{messages.model.input}</dt>
            <dd className="mt-1 leading-7">
              {formatMessageTemplate(messages.model.inputValue, {
                name: SCALE_EXPLORER_DEFINITION.input_schema.name,
                unit: SCALE_EXPLORER_DEFINITION.input_schema.unit,
              })}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.model.validRange}
            </dt>
            <dd className="mt-1 leading-7">
              {formatMessageTemplate(messages.model.validRangeValue, {
                count: formatLocaleNumber(SCALE_EXPLORER_NODES.length, locale),
                nodes: SCALE_EXPLORER_NODES.map((entry) => entry.name).join(", "),
              })}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">
              {messages.model.shareStateShape}
            </dt>
            <dd className="mt-1 leading-7">
              <code className="text-sm text-[var(--foreground)]">
                model_version + node_id + schema version
              </code>
              ; {messages.model.shareStateSuffix}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-semibold text-[var(--muted)]">{messages.model.output}</dt>
            <dd className="mt-1 leading-7">
              {SCALE_EXPLORER_DEFINITION.output_schema.join("; ")}.
            </dd>
          </div>
        </dl>
        <div className="space-y-3">
          <h3>
            {mode === "explorer" ? messages.model.howScaleBuilt : messages.model.relationshipsUsed}
          </h3>
          {mode === "explorer" ? (
            <p className="leading-7 text-[var(--muted)]">
              Source values are converted to metres for ordering. The comparison method{" "}
              <code className="text-sm text-[var(--foreground)]">
                {SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison.algorithm_id} v
                {SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison.algorithm_version}
              </code>{" "}
              is used only where a reference node is defined; the track coordinate is logarithmic
              and dimensionless.
            </p>
          ) : (
            <ul className="m-0 grid list-disc gap-2 pl-5 leading-7 text-[var(--muted)]">
              {SCALE_EXPLORER_DEFINITION.calculation_module.relationships.map((relationship) => (
                <li key={relationship}>
                  <code className="text-sm text-[var(--foreground)]">{relationship}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
        {mode === "student" ? (
          <div className="space-y-3">
            <h3>{messages.model.mathsToNotice}</h3>
            <ul className="m-0 grid list-disc gap-2 pl-5 leading-7 text-[var(--muted)]">
              <li>
                <code className="text-sm text-[var(--foreground)]">
                  characteristic diameter = 2 × radius
                </code>{" "}
                for the radius-backed planet entries.
              </li>
              <li>
                <code className="text-sm text-[var(--foreground)]">
                  selected size ÷ reference size = dimensionless ratio
                </code>
                .
              </li>
              <li>
                Logarithmic position uses the base-10 logarithm between the curated endpoints; it is
                a display coordinate, not a physical location.
              </li>
            </ul>
          </div>
        ) : null}
        {mode === "deep-dive" ? (
          <div className="space-y-3">
            <h3>{messages.model.derivedQuantityContracts}</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  {messages.model.characteristicSizeAlgorithm}
                </dt>
                <dd className="mt-1 leading-7">
                  <code className="text-sm text-[var(--foreground)]">
                    {SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size.algorithm_id}{" "}
                    v
                    {
                      SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size
                        .algorithm_version
                    }
                  </code>
                  ; output{" "}
                  {SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size.output_unit}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  {messages.model.characteristicSizeInputs}
                </dt>
                <dd className="mt-1 leading-7">
                  {SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size.inputs}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  {messages.model.comparisonAlgorithm}
                </dt>
                <dd className="mt-1 leading-7">
                  <code className="text-sm text-[var(--foreground)]">
                    {SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison.algorithm_id} v
                    {
                      SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison
                        .algorithm_version
                    }
                  </code>
                  ; output{" "}
                  {SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison.output_unit}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  {messages.model.comparisonInputs}
                </dt>
                <dd className="mt-1 leading-7">
                  {SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison.inputs}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  {messages.model.characteristicSizeValidDomain}
                </dt>
                <dd className="mt-1 leading-7">
                  {SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size.valid_domain}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  {messages.model.validDomain}
                </dt>
                <dd className="mt-1 leading-7">
                  {SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison.valid_domain}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  {messages.model.numericalTolerance}
                </dt>
                <dd className="mt-1 leading-7">
                  {
                    SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison
                      .numerical_tolerance
                  }
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  {messages.model.characteristicSizeTolerance}
                </dt>
                <dd className="mt-1 leading-7">
                  {
                    SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size
                      .numerical_tolerance
                  }
                </dd>
              </div>
            </dl>
            <p className="text-sm leading-6 text-[var(--muted)]">
              {formatMessageTemplate(messages.model.automatedValidationFixtures, {
                fixtures: SCALE_EXPLORER_DEFINITION.validation_fixtures.join(", "),
              })}
            </p>
          </div>
        ) : null}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <h3>{messages.model.assumptions}</h3>
            <ul className="m-0 grid list-disc gap-2 pl-5 leading-7 text-[var(--muted)]">
              {SCALE_EXPLORER_DEFINITION.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            <h3>{messages.model.knownLimitations}</h3>
            <ul className="m-0 grid list-disc gap-2 pl-5 leading-7 text-[var(--muted)]">
              {SCALE_EXPLORER_DEFINITION.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-3">
          <h3>{messages.model.references}</h3>
          {mode === "deep-dive" ? (
            <SourceList
              messages={messages.sources}
              sourceIds={SCALE_EXPLORER_DEFINITION.references}
            />
          ) : (
            <SourceLinkList
              messages={messages.sources}
              sourceIds={SCALE_EXPLORER_DEFINITION.references}
            />
          )}
        </div>
      </section>

      <section
        aria-labelledby="scale-share-heading"
        className="max-w-3xl space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 id="scale-share-heading">{messages.share.title}</h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.share.description, {
            modelVersion: SCALE_EXPLORER_MODEL_VERSION,
            schemaVersion: formatLocaleNumber(
              SCALE_EXPLORER_DEFINITION.share_schema_version,
              locale,
            ),
          })}
        </p>
        <div className="flex flex-wrap gap-3">
          <button className={buttonClassName} onClick={() => void handleShare()} type="button">
            {messages.actions.copyShareLink}
          </button>
          <Link className={buttonClassName} href="/learn">
            {messages.actions.continueLearning}
          </Link>
        </div>
        {shareUrl !== null ? (
          <label className="block space-y-2" htmlFor="scale-share-url">
            <span className="text-sm font-semibold">{messages.share.label}</span>
            <input
              className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-sm text-[var(--foreground)]"
              id="scale-share-url"
              readOnly
              value={shareUrl}
            />
          </label>
        ) : null}
        <p aria-live="polite" className="min-h-6 text-sm text-[var(--muted)]" role="status">
          {message}
        </p>
      </section>
    </article>
  );
}
