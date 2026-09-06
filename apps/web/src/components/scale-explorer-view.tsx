"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

const categoryLabels: Record<ScaleNodeCategory, string> = {
  cosmological: "Cosmological scale",
  galaxy: "Galaxy scale",
  moon: "Moon scale",
  planet: "Planet scale",
  star: "Star scale",
};

const quantityLabels: Record<ScaleExplorerNode["characteristic_quantity"], string> = {
  diameter: "characteristic diameter",
  width: "characteristic width",
  "observable-extent": "observable-universe extent",
};

const statusLabels: Record<ScaleExplorerNode["value_status"], string> = {
  approximate: "Approximate",
  "derived-approximate": "Derived approximate value",
  "model-based": "Model-based estimate",
  reported: "Reported source value",
};

const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--foreground)] no-underline transition-colors motion-reduce:transition-none hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-55";

function formatSourceValue(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function sourceQuantityLabel(node: ScaleExplorerNode): string {
  switch (node.source_quantity) {
    case "radius":
      return "source radius";
    case "diameter":
      return "source diameter";
    case "width":
      return "source width";
    case "extent":
      return "source extent";
  }
}

function formatDisplayPosition(positionPercent: number): string {
  return `approximately ${Math.round(positionPercent)}%`;
}

function sourceForId(id: string) {
  return SCALE_EXPLORER_SOURCES.find((source) => source.id === id);
}

function nodeLabel(entry: ScaleExplorerPositionedNode): string {
  return `${entry.node.name}, ${entry.node.display_value} ${quantityLabels[entry.node.characteristic_quantity]}`;
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

function ScaleTrack({ model }: Readonly<{ model: ReturnType<typeof buildScaleExplorerModel> }>) {
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
          Smallest curated node
        </span>
        <span className="absolute bottom-2 right-4 text-xs font-semibold text-[var(--muted)]">
          Largest curated node
        </span>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Selected marker:{" "}
        <strong className="text-[var(--foreground)]">{model.selected.node.name}</strong>. Marker
        spacing is logarithmic; markers are not physical positions.
      </p>
      <div
        aria-label="Relative scale track legend"
        className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)]"
        role="group"
      >
        <span className="inline-flex min-h-11 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-7 w-3 rounded-sm border-2 border-[var(--focus)] bg-[var(--accent)]"
          />
          Selected node marker
        </span>
        <span className="inline-flex min-h-11 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-1 rounded-full bg-[var(--muted)]"
          />
          Other curated node marker
        </span>
        <span className="inline-flex min-h-11 items-center">
          Display coordinate: 0–100% (normalized, dimensionless)
        </span>
      </div>
    </div>
  );
}

function SourceList({ sourceIds }: Readonly<{ sourceIds: ReadonlyArray<string> }>) {
  return (
    <ul className="m-0 grid list-disc gap-2 pl-5 text-sm leading-6 text-[var(--muted)]">
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <span>Source record unavailable for {sourceId}.</span>
            ) : (
              <>
                <span className="font-semibold">
                  {source.source_type === "official-agency" ? "Agency source" : "Education source"}
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
                  ({source.organization_or_authors}; {source.claim_scope}; retrieved{" "}
                  {source.retrieved_at}; data date: {source.data_date})
                </span>
                <span className="mt-1 block text-xs leading-5">
                  Dataset/release: {source.dataset_or_release}; record/reference:{" "}
                  {source.record_reference}; terms/licence: {source.terms_or_licence}
                </span>
                <span className="mt-1 block text-xs leading-5">Citation: {source.citation}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SourceLinkList({ sourceIds }: Readonly<{ sourceIds: ReadonlyArray<string> }>) {
  return (
    <ul className="m-0 grid gap-1 pl-0 text-xs leading-5 text-[var(--muted)]">
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <span>Unavailable: {sourceId}</span>
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

function ComparisonEvidence({ comparison }: Readonly<{ comparison: ScaleExplorerComparison }>) {
  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-5">
      <h3>Comparison evidence</h3>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Algorithm: <code className="text-[var(--foreground)]">{comparison.algorithm_id}</code> v
        {comparison.algorithm_version}; output unit: {comparison.unit}.
      </p>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Input node IDs:{" "}
        <code className="break-all text-[var(--foreground)]">
          {comparison.input_node_ids.join(", ")}
        </code>
      </p>
      <p className="text-sm font-semibold text-[var(--muted)]">Input source records</p>
      <SourceList sourceIds={comparison.input_source_ids} />
      <p className="text-sm leading-6 text-[var(--muted)]">Rounding: {comparison.rounding}</p>
    </div>
  );
}

type ScaleExplorerTransitionContract = NonNullable<
  ScaleExplorerNode["transition_explanation"]["derived_quantity"]
>;

function TransitionCalculationContract({
  contract,
}: Readonly<{ contract: ScaleExplorerTransitionContract }>) {
  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-5">
      <h3>Transition calculation contract</h3>
      <dl className="grid gap-3 text-sm leading-6 text-[var(--muted)] sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Algorithm</dt>
          <dd className="mt-1">
            <code className="text-[var(--foreground)]">{contract.algorithm_id}</code> v
            {contract.algorithm_version}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Units</dt>
          <dd className="mt-1">
            inputs: {contract.input_unit}; output: {contract.output_unit}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold">Input node IDs</dt>
          <dd className="mt-1 break-words font-mono text-xs text-[var(--foreground)]">
            {contract.input_node_ids.join(", ")}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold">Valid domain</dt>
          <dd className="mt-1">{contract.valid_domain}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold">Numerical tolerance</dt>
          <dd className="mt-1">{contract.numerical_tolerance}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold">Learner-facing rounding</dt>
          <dd className="mt-1">{contract.learner_facing_rounding}</dd>
        </div>
        <div>
          <dt className="font-semibold">Test references</dt>
          <dd className="mt-1 break-words font-mono text-xs text-[var(--foreground)]">
            {contract.test_references.join(", ")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Generated</dt>
          <dd className="mt-1">{contract.generated_at}</dd>
        </div>
      </dl>
      <p className="text-sm font-semibold text-[var(--muted)]">Input source records</p>
      <SourceList sourceIds={contract.input_source_ids} />
    </div>
  );
}

function NodeTable({
  model,
  onSelect,
}: Readonly<{
  model: ReturnType<typeof buildScaleExplorerModel>;
  onSelect: (nodeId: ScaleExplorerState["node_id"]) => void;
}>) {
  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="min-w-[60rem] w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          All curated Scale Explorer nodes in increasing characteristic-size order. Select a row to
          move the model to that node.
        </caption>
        <thead className="bg-[var(--surface)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-semibold" scope="col">
              Node
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              Characteristic size
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              Comparison
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              Source status
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              Evidence
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
                      Selected
                    </span>
                  ) : null}
                </th>
                <td className="px-4 py-3 align-top text-[var(--foreground)]">
                  {entry.node.display_value}
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {quantityLabels[entry.node.characteristic_quantity]}
                  </span>
                </td>
                <td className="max-w-sm px-4 py-3 align-top leading-6 text-[var(--muted)]">
                  {entry.comparison.text}
                </td>
                <td className="px-4 py-3 align-top leading-6 text-[var(--muted)]">
                  {statusLabels[entry.node.value_status]}
                  <span className="mt-1 block text-xs">
                    {formatDisplayPosition(entry.position_percent)} on track
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="block text-xs font-semibold text-[var(--muted)]">
                    Characteristic value
                  </span>
                  <SourceLinkList sourceIds={entry.node.source_ids} />
                  <span className="mt-2 block text-xs font-semibold text-[var(--muted)]">
                    Transition explanation
                  </span>
                  <SourceLinkList sourceIds={entry.node.transition_explanation.source_ids} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ScaleExplorerView({ initialState, initialStateInvalid }: ScaleExplorerViewProps) {
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
    setMessage("Scale Explorer reset to Earth.");
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
        setMessage("Share link copied. It contains only the model version and selected node.");
        return;
      }
    } catch {
      // The visible URL remains available for manual copying when clipboard
      // permission is unavailable.
    }
    setMessage("Share link ready below. Copy it manually; no personal data is included.");
  }

  return (
    <article className="space-y-12">
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm text-[var(--muted)]">
          <li>Space Lab</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Scale Explorer</li>
        </ol>
      </nav>

      <header className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          First Phase 3B lab
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Scale Explorer</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Move from the Moon and planets to the Sun, the Milky Way, and the observable universe. The
          track tells a story about characteristic size; it is not a map of where objects are.
        </p>
      </header>

      <LearningModeSelector onChange={setMode} />

      {invalidNotice ? (
        <aside
          aria-labelledby="invalid-scale-state-heading"
          className="max-w-3xl space-y-3 rounded-md border border-[var(--focus)] bg-[var(--surface)] px-5 py-4"
          role="alert"
        >
          <h2 id="invalid-scale-state-heading">The shared scale state was not valid</h2>
          <p className="leading-7 text-[var(--muted)]">
            Lumina could not use that version, node, field set, or serialized form. Earth is shown
            as an explicit safe default; reset or choose a node to create a valid canonical share
            state.
          </p>
        </aside>
      ) : null}

      <section aria-labelledby="scale-objective-heading" className="max-w-3xl space-y-4">
        <h2 id="scale-objective-heading">What this lab demonstrates</h2>
        <p className="leading-7 text-[var(--muted)]">{copy.introduction}</p>
        <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 leading-7 text-[var(--foreground)]">
          <strong>Think about:</strong> {copy.prompt}
        </p>
        <ul className="m-0 grid list-disc gap-2 pl-6 leading-7 text-[var(--muted)]">
          {SCALE_EXPLORER_DEFINITION.learning_objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="scale-controls-heading" className="max-w-3xl space-y-5">
        <div className="space-y-2">
          <h2 id="scale-controls-heading">Choose a scale node</h2>
          <p className="leading-7 text-[var(--muted)]" id="scale-control-help">
            This control moves between {SCALE_EXPLORER_NODES.length} reviewed nodes in increasing
            characteristic-size order. There is no interpolation between the curated cases.
          </p>
        </div>
        <div className="space-y-3">
          <label className="font-semibold" htmlFor="scale-node-slider">
            Curated scale position
          </label>
          <input
            aria-describedby="scale-control-help"
            aria-label="Curated scale position"
            aria-valuetext={`${model.selected.index + 1} of ${model.nodes.length}: ${nodeLabel(model.selected)}`}
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
            Node {model.selected.index + 1} of {model.nodes.length}: {model.selected.node.name}
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
            Previous node
          </button>
          <button className={buttonClassName} onClick={handleReset} type="button">
            Reset to Earth
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
            Next node
          </button>
        </div>
      </section>

      <section aria-labelledby="scale-visual-heading" className="space-y-5">
        <div className="space-y-2">
          <h2 id="scale-visual-heading">Relative scale track</h2>
          <p className="max-w-3xl leading-7 text-[var(--muted)]">
            The markers show relative position on a base-10 logarithmic display from the smallest to
            the largest curated characteristic size. The track is a diagram, not a physical
            arrangement and not a distance scale.
          </p>
        </div>
        <ScaleTrack model={model} />
      </section>

      <section
        aria-labelledby="selected-scale-heading"
        className="max-w-3xl space-y-5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-6"
      >
        <div aria-atomic="true" aria-live="polite" role="status">
          <p className="text-sm font-semibold text-[var(--accent)]">Selected node</p>
          <h2 id="selected-scale-heading">{model.selected.node.name}</h2>
          <p className="mt-2 text-lg leading-8 text-[var(--foreground)]">
            {model.selected.node.display_value}{" "}
            {quantityLabels[model.selected.node.characteristic_quantity]}
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Category</dt>
            <dd className="mt-1">{categoryLabels[model.selected.node.category]}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Value status</dt>
            <dd className="mt-1">{statusLabels[model.selected.node.value_status]}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Source value</dt>
            <dd className="mt-1">
              {formatSourceValue(model.selected.node.source_value)}{" "}
              {model.selected.node.source_unit}{" "}
              <span className="text-sm text-[var(--muted)]">
                ({sourceQuantityLabel(model.selected.node)})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Display position</dt>
            <dd className="mt-1">
              {formatDisplayPosition(model.selected.position_percent)} of this curated track
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-semibold text-[var(--muted)]">Comparison</dt>
            <dd className="mt-1 leading-7">{model.selected.comparison.text}</dd>
          </div>
        </dl>
        <ComparisonEvidence comparison={model.selected.comparison} />
        <p className="leading-7 text-[var(--muted)]">{model.selected.node.source_basis}</p>
        <p className="leading-7 text-[var(--foreground)]">
          {model.selected.node.transition_explanation.text}
        </p>
        {model.selected.node.transition_explanation.derived_quantity !== undefined ? (
          <TransitionCalculationContract
            contract={model.selected.node.transition_explanation.derived_quantity}
          />
        ) : null}
        <div className="grid gap-6 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
          <div className="space-y-2">
            <h3>Characteristic value evidence</h3>
            <SourceList sourceIds={model.selected.node.source_ids} />
          </div>
          <div className="space-y-2">
            <h3>Transition evidence</h3>
            <SourceList sourceIds={model.selected.node.transition_explanation.source_ids} />
          </div>
        </div>
        <aside
          aria-labelledby="scale-reading-heading"
          className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-4"
        >
          <h3 id="scale-reading-heading">Reading this result</h3>
          <p className="leading-7 text-[var(--muted)]">{copy.result_explanation}</p>
          {model.selected.comparison.kind === "calculated-ratio" ? (
            <p className="text-sm leading-6 text-[var(--muted)]">
              Calculated from {model.selected.node.name} and{" "}
              {model.nodes.find(
                (entry) => entry.node.id === model.selected.comparison.reference_node_id,
              )?.node.name ?? "the reference node"}{" "}
              characteristic sizes. The ratio is dimensionless; the displayed sentence is rounded to
              two significant figures.
            </p>
          ) : null}
        </aside>
        <div className="space-y-3 border-t border-[var(--border)] pt-5">
          <h3>Entity and source links</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">
            These are official NASA reference pages for the selected entity or size claim. They are
            not Lumina catalogue records.
          </p>
          <ul className="m-0 grid list-disc gap-2 pl-5 text-sm leading-6">
            {model.selected.node.entity_links.map((link) => (
              <li key={link.href}>
                <span className="mr-1 text-sm text-[var(--muted)]">
                  {link.kind === "entity-reference" ? "Entity reference:" : "Source reference:"}
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
          <h2 id="scale-alternative-heading">Text and data alternative</h2>
          <p className="max-w-3xl leading-7 text-[var(--muted)]">
            This table represents the same model state without relying on the visual track. Every
            row keeps its source unit, characteristic quantity, comparison, and model position.
          </p>
        </div>
        <NodeTable model={model} onSelect={selectNode} />
      </section>

      <section aria-labelledby="scale-model-heading" className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <h2 id="scale-model-heading">Model and assumptions</h2>
          <p className="leading-7 text-[var(--muted)]">
            {copy.model_note} {SCALE_EXPLORER_DEFINITION.visualization_module} This is an
            educational model, not an operational, research-grade, navigation, or measurement
            system.
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Model version</dt>
            <dd className="mt-1 font-mono text-sm">{SCALE_EXPLORER_MODEL_VERSION}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Content review</dt>
            <dd className="mt-1 leading-7">
              {SCALE_EXPLORER_DEFINITION.status}; version {SCALE_EXPLORER_DEFINITION.version};
              reviewed by {SCALE_EXPLORER_DEFINITION.reviewed_by.join(", ")} on{" "}
              {SCALE_EXPLORER_DEFINITION.reviewed_at.slice(0, 10)}.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Input</dt>
            <dd className="mt-1 leading-7">
              {SCALE_EXPLORER_DEFINITION.input_schema.name}: one of the curated node IDs; unit is{" "}
              {SCALE_EXPLORER_DEFINITION.input_schema.unit}.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Valid range</dt>
            <dd className="mt-1 leading-7">
              Exactly {SCALE_EXPLORER_NODES.length} discrete IDs:{" "}
              {SCALE_EXPLORER_NODES.map((entry) => entry.name).join(", ")}. Unknown IDs and
              in-between values are rejected; there is no interpolation.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-[var(--muted)]">Share state shape</dt>
            <dd className="mt-1 leading-7">
              <code className="text-sm text-[var(--foreground)]">
                model_version + node_id + schema version
              </code>
              ; only those three fields are accepted, with no unknown fields.
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-semibold text-[var(--muted)]">Output</dt>
            <dd className="mt-1 leading-7">
              {SCALE_EXPLORER_DEFINITION.output_schema.join("; ")}.
            </dd>
          </div>
        </dl>
        <div className="space-y-3">
          <h3>{mode === "explorer" ? "How the scale is built" : "Relationships used"}</h3>
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
            <h3>Maths to notice</h3>
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
            <h3>Derived quantity contracts</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  Characteristic-size algorithm
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
                  Characteristic-size inputs
                </dt>
                <dd className="mt-1 leading-7">
                  {SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size.inputs}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">Comparison algorithm</dt>
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
                <dt className="text-sm font-semibold text-[var(--muted)]">Comparison inputs</dt>
                <dd className="mt-1 leading-7">
                  {SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison.inputs}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  Characteristic-size valid domain
                </dt>
                <dd className="mt-1 leading-7">
                  {SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size.valid_domain}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">Valid domain</dt>
                <dd className="mt-1 leading-7">
                  {SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison.valid_domain}.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">Numerical tolerance</dt>
                <dd className="mt-1 leading-7">
                  {
                    SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison
                      .numerical_tolerance
                  }
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--muted)]">
                  Characteristic-size tolerance
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
              Automated validation fixtures:{" "}
              {SCALE_EXPLORER_DEFINITION.validation_fixtures.join(", ")}.
            </p>
          </div>
        ) : null}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <h3>Assumptions</h3>
            <ul className="m-0 grid list-disc gap-2 pl-5 leading-7 text-[var(--muted)]">
              {SCALE_EXPLORER_DEFINITION.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            <h3>Known limitations</h3>
            <ul className="m-0 grid list-disc gap-2 pl-5 leading-7 text-[var(--muted)]">
              {SCALE_EXPLORER_DEFINITION.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-3">
          <h3>References</h3>
          {mode === "deep-dive" ? (
            <SourceList sourceIds={SCALE_EXPLORER_DEFINITION.references} />
          ) : (
            <SourceLinkList sourceIds={SCALE_EXPLORER_DEFINITION.references} />
          )}
        </div>
      </section>

      <section
        aria-labelledby="scale-share-heading"
        className="max-w-3xl space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 id="scale-share-heading">Share this scale position</h2>
        <p className="leading-7 text-[var(--muted)]">
          The reproducible state contains model version {SCALE_EXPLORER_MODEL_VERSION}, schema
          version {SCALE_EXPLORER_DEFINITION.share_schema_version}, and the selected node ID. It
          does not save an account, location, or personal data.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className={buttonClassName} onClick={() => void handleShare()} type="button">
            Copy share link
          </button>
          <Link className={buttonClassName} href="/learn">
            Continue learning
          </Link>
        </div>
        {shareUrl !== null ? (
          <label className="block space-y-2" htmlFor="scale-share-url">
            <span className="text-sm font-semibold">Share link</span>
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
