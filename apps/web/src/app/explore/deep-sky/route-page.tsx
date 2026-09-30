import type { Metadata } from "next";
import Link from "next/link";

import { formatCoordinateDisclosure } from "../../../lib/i18n/coordinate-disclosure";
import { formatLocaleList, formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type {
  CoordinateDisclosureMessages,
  DeepSkyMessages,
  EntityTypeMessages,
} from "../../../lib/i18n/messages/types";
import {
  loadDeepSkyBrowse,
  loadDeepSkySelection,
  type DeepSkySelectionOutcome,
} from "../../../lib/server/deep-sky";
import { ATLAS_LAYERS, atlasLayerById, type AtlasLayerId } from "../../../lib/wwt/atlas";
import { DeepSkyAtlas } from "./deep-sky-atlas";
import styles from "./deep-sky.module.css";

export function createDeepSkyMetadata(messages: DeepSkyMessages): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type DeepSkyPageProps = Readonly<{
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: DeepSkyMessages;
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
  entityTypeMessages,
  locale,
  messages,
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
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link className={styles.backLink} href="/explore">
            {messages.header.backToExplore}
          </Link>
          <p className={styles.eyebrow}>{messages.header.eyebrow}</p>
          <h1 className={styles.title}>{messages.header.title}</h1>
          <p className={styles.intro}>{messages.header.intro}</p>
        </div>
        <div className={styles.heroAside}>
          <span>{messages.browse.summary}</span>
          <span>{messages.layers.title}</span>
        </div>
      </header>

      {invalidLayer ? (
        <p className={styles.alert} role="alert">
          {messages.invalidLayer}
        </p>
      ) : null}

      <section aria-labelledby="deep-sky-browse-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="deep-sky-browse-heading">
            {messages.browse.title}
          </h2>
        </div>
        <div className={styles.sectionBody}>
          <DeepSkyBrowse
            browse={browse}
            entityTypeMessages={entityTypeMessages}
            layerId={activeLayer.id}
            locale={locale}
            messages={messages.browse}
            selectedSlug={
              selection.kind === "none" ? null : "slug" in selection ? selection.slug : null
            }
          />
        </div>
      </section>

      <SelectedObject
        coordinateDisclosureMessages={coordinateDisclosureMessages}
        entityTypeMessages={entityTypeMessages}
        messages={messages.selection}
        selection={selection}
      />

      <DeepSkyAtlas initialLayerId={activeLayer.id} messages={messages.atlas} target={target} />

      <section aria-labelledby="survey-links-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="survey-links-heading">
            {messages.layers.title}
          </h2>
          <p className={styles.sectionSummary}>{messages.layers.description}</p>
        </div>
        <ul className={styles.layerList}>
          {ATLAS_LAYERS.map((layer) => {
            const selectedSlug = "slug" in selection ? selection.slug : undefined;
            const href = deepSkyHref(selectedSlug, layer.id);
            return (
              <li className={styles.layerItem} key={layer.id}>
                <div>
                  <Link className={styles.layerLink} href={href}>
                    {layer.label}
                  </Link>
                  <p className={styles.layerCredit}>{layer.creditText}</p>
                </div>
                <p className={styles.layerDescription}>{layer.interpretation}</p>
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
  entityTypeMessages,
  layerId,
  locale,
  messages,
  selectedSlug,
}: Readonly<{
  browse: Awaited<ReturnType<typeof loadDeepSkyBrowse>>;
  entityTypeMessages: EntityTypeMessages;
  layerId: AtlasLayerId;
  locale: PublishedLocale;
  messages: DeepSkyMessages["browse"];
  selectedSlug: string | null;
}>) {
  if (browse.kind === "unavailable") {
    return (
      <div className={styles.statePanel} role="status">
        <h3>{messages.unavailableTitle}</h3>
        <p>{messages.unavailableDescription}</p>
      </div>
    );
  }
  if (browse.items.length === 0) {
    return <p className={styles.statusText}>{messages.empty}</p>;
  }

  return (
    <>
      {browse.unavailableTypes.length > 0 ? (
        <p className={styles.statusText} role="status">
          {formatMessageTemplate(messages.unavailableTypes, {
            types: formatLocaleList(
              browse.unavailableTypes.map((entityType) => entityTypeMessages[entityType]),
              locale,
              { type: "unit" },
            ),
          })}
        </p>
      ) : null}
      {browse.truncatedTypes.length > 0 ? (
        <p className={styles.statusText}>
          {formatMessageTemplate(messages.boundedSlice, {
            types: formatLocaleList(
              browse.truncatedTypes.map((entityType) => entityTypeMessages[entityType]),
              locale,
              { type: "unit" },
            ),
          })}
        </p>
      ) : null}
      <ul aria-label={messages.ariaLabel} className={styles.objectList}>
        {browse.items.map((item) => {
          const selected = item.slug === selectedSlug;
          return (
            <li className={styles.objectItem} key={item.id}>
              <Link
                aria-current={selected ? "page" : undefined}
                className={styles.objectLink}
                href={deepSkyHref(item.slug, layerId)}
              >
                <span className={styles.objectName}>{item.canonical_name}</span>
                <span className={styles.objectType}>{entityTypeMessages[item.entity_type]}</span>
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
  entityTypeMessages,
  messages,
  selection,
}: Readonly<{
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  entityTypeMessages: EntityTypeMessages;
  messages: DeepSkyMessages["selection"];
  selection: DeepSkySelectionOutcome;
}>) {
  if (selection.kind === "none") {
    return (
      <section aria-labelledby="selected-object-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="selected-object-heading">
            {messages.selectTitle}
          </h2>
        </div>
        <div className={styles.statePanel}>
          <p>{messages.selectDescription}</p>
        </div>
      </section>
    );
  }
  if (selection.kind === "invalid-object") {
    return (
      <SelectionProblem title={messages.invalidTitle}>
        {messages.invalidDescription}
      </SelectionProblem>
    );
  }
  if (selection.kind === "unavailable") {
    return (
      <SelectionProblem title={messages.unavailableTitle}>
        {messages.unavailableDescription}
      </SelectionProblem>
    );
  }
  if (selection.kind === "coordinate-unavailable") {
    return (
      <SelectionProblem
        title={formatMessageTemplate(messages.coordinateUnavailableTitle, {
          objectName: selection.detail.canonical_name,
        })}
      >
        {messages.coordinateUnavailableDescription}
      </SelectionProblem>
    );
  }
  if (selection.kind === "coordinate-ambiguous") {
    return (
      <SelectionProblem
        title={formatMessageTemplate(messages.coordinateAmbiguousTitle, {
          objectName: selection.detail.canonical_name,
        })}
      >
        {messages.coordinateAmbiguousDescription}
      </SelectionProblem>
    );
  }

  const { coordinate, detail, coordinateDisclosure, slug } = selection;
  return (
    <section aria-labelledby="selected-object-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <p className={styles.selectedEyebrow}>{messages.selectedEyebrow}</p>
        <h2 className={styles.sectionTitle} id="selected-object-heading">
          {detail.canonical_name}
        </h2>
        <p className={styles.sectionSummary}>{entityTypeMessages[detail.entity_type]}</p>
      </div>
      <div className={styles.selectedPanel}>
        <dl className={styles.factGrid}>
          <CoordinateFact
            label={messages.rightAscensionLabel}
            value={`${coordinate.originalRightAscension}°`}
          />
          <CoordinateFact
            label={messages.declinationLabel}
            value={`${coordinate.originalDeclination}°`}
          />
          <CoordinateFact
            label={messages.referenceEpochLabel}
            value={`J${coordinate.epoch.toFixed(1)}`}
          />
          <CoordinateFact
            label={messages.coordinateSourceLabel}
            value={coordinate.source.provider.name}
          />
        </dl>
        <div className={styles.disclosure}>
          <p>{formatCoordinateDisclosure(coordinateDisclosure, coordinateDisclosureMessages)}</p>
          <p>
            {messages.datasetLabel}: {coordinate.source.dataset.name} (
            {coordinate.source.dataset.release_version}) · {messages.sourceRecordLabel}{" "}
            <span className={styles.factValue}>{coordinate.source.source_record_id}</span>.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.action} href={`/objects/${encodeURIComponent(slug)}`}>
            {messages.openObject}
          </Link>
          <Link className={styles.action} href={`/observe?object=${encodeURIComponent(slug)}`}>
            {messages.openPlanner}
          </Link>
        </div>
      </div>
    </section>
  );
}

function CoordinateFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
}

function SelectionProblem({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section aria-labelledby="selected-object-heading" className={styles.section} role="status">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="selected-object-heading">
          {title}
        </h2>
      </div>
      <div className={styles.statePanel}>
        <p>{children}</p>
      </div>
    </section>
  );
}

function deepSkyHref(slug: string | undefined, layerId: AtlasLayerId): string {
  const query = new URLSearchParams({ layer: layerId });
  if (slug !== undefined) query.set("object", slug);
  return `/explore/deep-sky?${query.toString()}`;
}
