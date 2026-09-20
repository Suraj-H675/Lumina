import type { Metadata } from "next";
import Link from "next/link";

import { entityTypeLabel } from "../../../lib/catalog-display";
import { formatCoordinateDisclosure } from "../../../lib/i18n/coordinate-disclosure";
import type { CoordinateDisclosureMessages } from "../../../lib/i18n/messages/types";
import {
  loadDeepSkyBrowse,
  loadDeepSkySelection,
  type DeepSkySelectionOutcome,
} from "../../../lib/server/deep-sky";
import { ATLAS_LAYERS, atlasLayerById, type AtlasLayerId } from "../../../lib/wwt/atlas";
import { DeepSkyAtlas } from "./deep-sky-atlas";

export const metadata: Metadata = {
  title: "Deep-sky atlas",
  description:
    "Browse Lumina's reviewed galaxies, nebulae, and clusters, then optionally view them with credited WorldWide Telescope survey imagery.",
};

type DeepSkyPageProps = Readonly<{
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  searchParams: Promise<Readonly<{ layer?: string | string[]; object?: string | string[] }>>;
}>;

type SingleParam =
  Readonly<{ kind: "missing" | "invalid" }> | Readonly<{ kind: "value"; value: string }>;

function singleParam(value: string | string[] | undefined): SingleParam {
  if (value === undefined) return { kind: "missing" };
  if (Array.isArray(value)) {
    if (value.length !== 1) return { kind: "invalid" };
    const onlyValue = value[0];
    if (onlyValue === undefined) return { kind: "invalid" };
    value = onlyValue;
  }
  const trimmed = value.trim();
  return trimmed === "" ? { kind: "missing" } : { kind: "value", value: trimmed };
}

function selectionForInvalidQuery(): DeepSkySelectionOutcome {
  return { kind: "invalid-object" };
}

export default async function DeepSkyPage({
  coordinateDisclosureMessages,
  searchParams,
}: DeepSkyPageProps) {
  const params = await searchParams;
  const objectParam = singleParam(params.object);
  const layerParam = singleParam(params.layer);

  const requestedLayer = layerParam.kind === "value" ? atlasLayerById(layerParam.value) : undefined;
  const invalidLayer =
    layerParam.kind === "invalid" || (layerParam.kind === "value" && requestedLayer === null);
  const activeLayer = requestedLayer ?? ATLAS_LAYERS[0]!;

  const [browse, selection] = await Promise.all([
    loadDeepSkyBrowse(),
    objectParam.kind === "value"
      ? loadDeepSkySelection(objectParam.value)
      : Promise.resolve(
          objectParam.kind === "invalid" ? selectionForInvalidQuery() : ({ kind: "none" } as const),
        ),
  ]);

  const target =
    selection.kind === "ready"
      ? {
          declinationDegrees: selection.coordinate.declinationDegrees,
          name: selection.detail.canonical_name,
          rightAscensionDegrees: selection.coordinate.rightAscensionDegrees,
        }
      : null;

  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--muted)] underline underline-offset-4"
          href="/explore"
        >
          ← Explore catalogue
        </Link>
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Advanced atlas · Phase 5A
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Deep-sky atlas</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Browse reviewed galaxies, nebulae, and clusters from Lumina&apos;s catalogue. The optional
          WorldWide Telescope view is a renderer only: object identity, coordinates, epoch, and
          provenance continue to come from Lumina&apos;s reviewed data.
        </p>
      </header>

      {invalidLayer ? (
        <p className="border border-[var(--border)] p-4" role="alert">
          The requested survey layer is not part of Lumina&apos;s reviewed atlas inventory. Visible
          DSS2 is shown instead.
        </p>
      ) : null}

      <section aria-labelledby="deep-sky-browse-heading" className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 className="text-2xl font-semibold" id="deep-sky-browse-heading">
            Reviewed deep-sky catalogue
          </h2>
          <span className="text-sm text-[var(--muted)]">Galaxies · nebulae · clusters</span>
        </div>
        <DeepSkyBrowse
          browse={browse}
          layerId={activeLayer.id}
          selectedSlug={
            selection.kind === "none" ? null : "slug" in selection ? selection.slug : null
          }
        />
      </section>

      <SelectedObject
        coordinateDisclosureMessages={coordinateDisclosureMessages}
        selection={selection}
      />

      <DeepSkyAtlas initialLayerId={activeLayer.id} target={target} />

      <section aria-labelledby="survey-links-heading" className="space-y-4">
        <h2 className="text-2xl font-semibold" id="survey-links-heading">
          Reviewed survey layers
        </h2>
        <p className="max-w-3xl leading-7 text-[var(--muted)]">
          These links are safe shareable atlas state. They contain only a closed layer identifier
          and, when selected, the catalogue object slug — never observer coordinates or viewing
          time.
        </p>
        <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
          {ATLAS_LAYERS.map((layer) => {
            const selectedSlug = "slug" in selection ? selection.slug : undefined;
            const href = deepSkyHref(selectedSlug, layer.id);
            return (
              <li className="border border-[var(--border)] p-4" key={layer.id}>
                <Link className="font-semibold text-[var(--link)] underline" href={href}>
                  {layer.label}
                </Link>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{layer.interpretation}</p>
                <p className="mt-2 text-sm">{layer.creditText}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function DeepSkyBrowse({
  browse,
  layerId,
  selectedSlug,
}: Readonly<{
  browse: Awaited<ReturnType<typeof loadDeepSkyBrowse>>;
  layerId: AtlasLayerId;
  selectedSlug: string | null;
}>) {
  if (browse.kind === "unavailable") {
    return (
      <div className="border border-[var(--border)] p-5" role="status">
        <h3 className="text-xl font-semibold">Deep-sky catalogue temporarily unavailable</h3>
        <p className="mt-2 text-[var(--muted)]">
          Lumina could not load any of the bounded galaxy, nebula, or cluster slices. No substitute
          objects are shown.
        </p>
      </div>
    );
  }
  if (browse.items.length === 0) {
    return (
      <p className="text-[var(--muted)]">No reviewed deep-sky objects are currently published.</p>
    );
  }

  return (
    <>
      {browse.unavailableTypes.length > 0 ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          Partial catalogue: {browse.unavailableTypes.map(entityTypeLabel).join(", ")} could not be
          loaded, while the available types remain usable.
        </p>
      ) : null}
      {browse.truncatedTypes.length > 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Bounded atlas slice: additional {browse.truncatedTypes.map(entityTypeLabel).join(", ")}{" "}
          are available through the main catalogue.
        </p>
      ) : null}
      <ul
        aria-label="Deep-sky objects"
        className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
      >
        {browse.items.map((item) => {
          const selected = item.slug === selectedSlug;
          return (
            <li key={item.id}>
              <Link
                aria-current={selected ? "page" : undefined}
                className="flex min-h-20 flex-col justify-center border border-[var(--border)] bg-[var(--surface)] px-4 py-3 no-underline hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                href={deepSkyHref(item.slug, layerId)}
              >
                <span className="font-semibold text-[var(--foreground)]">
                  {item.canonical_name}
                </span>
                <span className="text-sm text-[var(--muted)]">
                  {entityTypeLabel(item.entity_type)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SelectedObject({
  coordinateDisclosureMessages,
  selection,
}: Readonly<{
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  selection: DeepSkySelectionOutcome;
}>) {
  if (selection.kind === "none") {
    return (
      <section
        aria-labelledby="selected-object-heading"
        className="border border-[var(--border)] p-5 sm:p-7"
      >
        <h2 className="text-2xl font-semibold" id="selected-object-heading">
          Select an object
        </h2>
        <p className="mt-2 max-w-3xl leading-7 text-[var(--muted)]">
          Choose a reviewed deep-sky object above to expose its accepted catalogue coordinates and
          provenance before using the optional atlas renderer.
        </p>
      </section>
    );
  }
  if (selection.kind === "invalid-object") {
    return (
      <SelectionProblem title="That atlas object is not valid">
        Choose a galaxy, nebula, or cluster from the reviewed list above.
      </SelectionProblem>
    );
  }
  if (selection.kind === "unavailable") {
    return (
      <SelectionProblem title="Selected object unavailable">
        Lumina could not reload the selected catalogue object, so the atlas will not invent
        coordinates.
      </SelectionProblem>
    );
  }
  if (selection.kind === "coordinate-unavailable") {
    return (
      <SelectionProblem
        title={`${selection.detail.canonical_name} has no accepted atlas coordinate`}
      >
        The canonical object remains valid, but Lumina does not currently have one complete reviewed
        coordinate pair that this renderer may use.
      </SelectionProblem>
    );
  }
  if (selection.kind === "coordinate-ambiguous") {
    return (
      <SelectionProblem
        title={`${selection.detail.canonical_name} has multiple accepted coordinate pairs`}
      >
        The atlas will not choose between scientifically distinct coordinate sources automatically.
        Use the observation planner for the detailed source choice.
      </SelectionProblem>
    );
  }

  const { coordinate, detail, coordinateDisclosure, slug } = selection;
  return (
    <section
      aria-labelledby="selected-object-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Selected catalogue object
        </p>
        <h2 className="text-3xl font-semibold" id="selected-object-heading">
          {detail.canonical_name}
        </h2>
        <p className="text-[var(--muted)]">{entityTypeLabel(detail.entity_type)}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CoordinateFact label="Right ascension" value={`${coordinate.originalRightAscension}°`} />
        <CoordinateFact label="Declination" value={`${coordinate.originalDeclination}°`} />
        <CoordinateFact label="Reference epoch" value={`J${coordinate.epoch.toFixed(1)}`} />
        <CoordinateFact label="Coordinate source" value={coordinate.source.provider.name} />
      </dl>
      <div className="space-y-2 text-sm leading-6 text-[var(--muted)]">
        <p>{formatCoordinateDisclosure(coordinateDisclosure, coordinateDisclosureMessages)}</p>
        <p>
          Dataset: {coordinate.source.dataset.name} ({coordinate.source.dataset.release_version}) ·
          source record <span className="font-mono">{coordinate.source.source_record_id}</span>.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
          href={`/objects/${encodeURIComponent(slug)}`}
        >
          Open canonical object page
        </Link>
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
          href={`/observe?object=${encodeURIComponent(slug)}`}
        >
          Open observation planner
        </Link>
      </div>
    </section>
  );
}

function CoordinateFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg">{value}</dd>
    </div>
  );
}

function SelectionProblem({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section
      aria-labelledby="selected-object-heading"
      className="border border-[var(--border)] p-5 sm:p-7"
      role="status"
    >
      <h2 className="text-2xl font-semibold" id="selected-object-heading">
        {title}
      </h2>
      <p className="mt-2 max-w-3xl leading-7 text-[var(--muted)]">{children}</p>
    </section>
  );
}

function deepSkyHref(slug: string | undefined, layerId: AtlasLayerId): string {
  const query = new URLSearchParams({ layer: layerId });
  if (slug !== undefined) query.set("object", slug);
  return `/explore/deep-sky?${query.toString()}`;
}
