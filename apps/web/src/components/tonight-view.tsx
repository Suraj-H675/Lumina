"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { entityTypeLabel } from "../lib/catalog-display";
import {
  useCollectionsData,
  useCollectionsStatus,
  type CollectionsStatus,
} from "../lib/collections-store";
import {
  isValidNightDate,
  localDateString,
  localInstantForNightTime,
  observerGeolocationErrorMessage,
  parseObserverLocationInputs,
  computeNightBoundaries,
  type NightEvent,
  type NightBoundaries,
  type ObserverLocation,
  type TargetEvent,
} from "../lib/observation/domain";
import {
  analyzeTonightCollection,
  fallbackTonightCollectionId,
  initialTonightCollectionId,
  sortTonightTargets,
  type TonightAnalysis,
  type TonightDetailCandidate,
  type TonightSort,
  type TonightTargetIdentity,
  type TonightUnresolvedTarget,
} from "../lib/tonight/domain";
import {
  loadTonightCatalogueDetails,
  TonightCatalogueLoadAborted,
} from "../lib/tonight/catalogue-loader";
import {
  CollectionLoadingNote,
  CorruptedStoragePanel,
  StorageUnavailableNote,
} from "./collection-state-blocks";

type TonightViewProps = Readonly<{
  apiOrigin?: string;
  initialDate?: string;
}>;

type DetailLoadState =
  | Readonly<{ completed: number; key: string; status: "loading"; total: number }>
  | Readonly<{ key: string; results: Array<TonightDetailCandidate>; status: "success" }>;

const EMPTY_ITEMS: ReadonlyArray<{
  canonical_name: string;
  entity_type: TonightTargetIdentity["entity_type"];
  saved_at: string;
  slug: string;
}> = [];

const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--background)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70";
const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]";
const INPUT_CLASS =
  "min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]";

function useBrowserDate(initialDate: string | undefined): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => initialDate ?? localDateString(new Date()),
    () => initialDate ?? "",
  );
}

function useBrowserTimeZone(): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
}

function formatDateLabel(nightDate: string, timeZone: string): string {
  const instant = localInstantForNightTime(nightDate, "12:00");
  if (instant === null) return nightDate;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone,
    year: "numeric",
  }).format(instant);
}

function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(instant);
}

function formatAltitude(altitude: number): string {
  const value = `${altitude.toFixed(1)}°`;
  return value.replace("-", "−");
}

function formatAzimuth(azimuth: number, compass: string): string {
  return `${azimuth.toFixed(1)}° · ${compass}`;
}

function formatNightEvent(event: NightEvent, timeZone: string): string {
  return event.kind === "time" ? formatTime(event.instant, timeZone) : "Unavailable";
}

function formatTargetEvent(event: TargetEvent, timeZone: string): string {
  if (event.kind === "time" && event.instant !== undefined)
    return formatTime(event.instant, timeZone);
  if (event.kind === "circumpolar") return "Circumpolar from this latitude";
  if (event.kind === "never-rises") return "Never rises from this latitude";
  if (event.kind === "not-during-night") return "No event during this observing night";
  return "Unavailable";
}

function plannerHref(slug: string, nightDate: string): string {
  const params = new URLSearchParams({ object: slug, date: nightDate });
  return `/observe?${params.toString()}`;
}

function objectHref(slug: string): string {
  return `/objects/${slug}`;
}

function useTonightDetailLoad(
  apiOrigin: string | undefined,
  collectionId: string | null,
  items: ReadonlyArray<TonightTargetIdentity>,
  retryToken: number,
): DetailLoadState | null {
  const [state, setState] = useState<DetailLoadState | null>(null);
  const itemKey = items
    .map((item) => `${item.slug}\u001e${item.canonical_name}\u001e${item.entity_type}`)
    .join("\u001f");
  const loadKey = `${apiOrigin ?? ""}\u001f${collectionId ?? ""}\u001f${itemKey}\u001f${retryToken}`;

  useEffect(() => {
    if (collectionId === null || items.length === 0) return;

    const controller = new AbortController();
    void loadTonightCatalogueDetails(items, {
      ...(apiOrigin === undefined ? {} : { origin: apiOrigin }),
      onProgress: ({ completed, total }) => {
        if (!controller.signal.aborted)
          setState({ completed, key: loadKey, status: "loading", total });
      },
      signal: controller.signal,
    })
      .then((results) => {
        if (!controller.signal.aborted) setState({ key: loadKey, results, status: "success" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || error instanceof TonightCatalogueLoadAborted) return;
        // The loader isolates provider failures per item. This branch is only
        // a defensive boundary for unexpected local failures.
        if (!controller.signal.aborted) {
          setState({
            key: loadKey,
            results: items.map((item) => ({ item, kind: "catalogue-unavailable" })),
            status: "success",
          });
        }
      });

    return () => controller.abort();
    // Item identity, collection selection, and explicit retry are the only
    // inputs that can trigger detail work. Date/location/sort never do.
  }, [apiOrigin, collectionId, itemKey, items, loadKey, retryToken]);

  if (collectionId === null || items.length === 0) return null;
  if (state?.key === loadKey) return state;
  return { completed: 0, key: loadKey, status: "loading", total: items.length };
}

function CollectionScope({
  collectionsStatus,
  selectedCollectionId,
  collections,
  onChange,
}: Readonly<{
  collections: ReadonlyArray<Readonly<{ id: string; items: ReadonlyArray<unknown>; name: string }>>;
  collectionsStatus: CollectionsStatus;
  onChange: (collectionId: string) => void;
  selectedCollectionId: string | null;
}>) {
  return (
    <section aria-labelledby="tonight-collection-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 className="text-xl font-semibold" id="tonight-collection-heading">
          Collection scope
        </h2>
        <span className="text-sm text-[var(--muted)]">One collection at a time</span>
      </div>
      {collectionsStatus === "loading" ? <CollectionLoadingNote /> : null}
      {collectionsStatus === "unavailable" ? <StorageUnavailableNote context="page" /> : null}
      {collectionsStatus === "corrupted" ? <CorruptedStoragePanel /> : null}
      {collectionsStatus === "ready" && collections.length === 0 ? (
        <div className="max-w-xl rounded-lg border border-dashed border-[var(--border-strong)] px-6 py-7">
          <h3 className="text-lg font-semibold">Save objects to use Tonight</h3>
          <p className="mt-2 leading-7 text-[var(--muted)]">
            Save objects to a Collection first, then Tonight can compare their observing geometry
            for one location and night.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className={PRIMARY_BUTTON_CLASS} href="/collections">
              Open Collections
            </Link>
            <Link className={SECONDARY_BUTTON_CLASS} href="/explore">
              Explore objects
            </Link>
          </div>
        </div>
      ) : null}
      {collectionsStatus === "ready" && collections.length > 0 && selectedCollectionId !== null ? (
        <div className="max-w-2xl space-y-2">
          <label
            className="block text-sm font-medium text-[var(--foreground)]"
            htmlFor="tonight-collection"
          >
            Collection to analyze
          </label>
          <select
            className={INPUT_CLASS.replace("font-mono", "")}
            id="tonight-collection"
            onChange={(event) => onChange(event.target.value)}
            value={selectedCollectionId}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name} · {collection.items.length} saved
              </option>
            ))}
          </select>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Tonight reads this browser-local collection. It does not combine every collection or
            change saved data.
          </p>
        </div>
      ) : null}
      {collectionsStatus === "ready" && collections.length > 0 && selectedCollectionId === null ? (
        <div className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-6">
          <h3 className="text-lg font-semibold">No non-empty collection is available</h3>
          <p className="mt-2 leading-7 text-[var(--muted)]">
            The selected collection was deleted and no other saved objects remain available for this
            comparison.
          </p>
          <Link className={`${SECONDARY_BUTTON_CLASS} mt-4`} href="/collections">
            Manage Collections
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function ObserverSetup({
  location,
  latitude,
  longitude,
  locationError,
  geoBusy,
  onLatitudeChange,
  onLongitudeChange,
  onManualSubmit,
  onGeolocation,
}: Readonly<{
  geoBusy: boolean;
  latitude: string;
  location: ObserverLocation | null;
  locationError: string;
  longitude: string;
  onGeolocation: () => void;
  onLatitudeChange: (value: string) => void;
  onLongitudeChange: (value: string) => void;
  onManualSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <section aria-labelledby="tonight-location-heading" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 className="text-xl font-semibold" id="tonight-location-heading">
          Observer location
        </h2>
        <span className="text-sm text-[var(--muted)]">Used locally for astronomy</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <p className="text-sm leading-6 text-[var(--muted)]">
            Your precise location stays in this browser. It is not sent to Lumina&apos;s catalogue
            API.
          </p>
          <button
            className={`${PRIMARY_BUTTON_CLASS} mt-4`}
            disabled={geoBusy}
            onClick={onGeolocation}
            type="button"
          >
            {geoBusy ? "Looking up location…" : "Use my location"}
          </button>
          {location !== null ? (
            <p className="mt-4 text-sm text-[var(--foreground)]">
              Current location {location.latitude.toFixed(3)}°, {location.longitude.toFixed(3)}°
            </p>
          ) : null}
          {locationError !== "" ? (
            <p className="mt-3 text-sm text-[var(--focus)]" role="alert">
              {locationError}
            </p>
          ) : null}
        </div>
        <form
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
          onSubmit={onManualSubmit}
        >
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--foreground)]">
              Enter coordinates manually
            </legend>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm text-[var(--muted)]" htmlFor="tonight-latitude">
                <span className="block">Latitude</span>
                <input
                  aria-describedby="tonight-coordinate-help"
                  className={INPUT_CLASS}
                  id="tonight-latitude"
                  inputMode="decimal"
                  onChange={(event) => onLatitudeChange(event.target.value)}
                  placeholder="12.972"
                  type="text"
                  value={latitude}
                />
              </label>
              <label
                className="space-y-1.5 text-sm text-[var(--muted)]"
                htmlFor="tonight-longitude"
              >
                <span className="block">Longitude</span>
                <input
                  aria-describedby="tonight-coordinate-help"
                  className={INPUT_CLASS}
                  id="tonight-longitude"
                  inputMode="decimal"
                  onChange={(event) => onLongitudeChange(event.target.value)}
                  placeholder="77.594"
                  type="text"
                  value={longitude}
                />
              </label>
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]" id="tonight-coordinate-help">
              Latitude −90° to 90° · longitude −180° to 180°. No city lookup is used.
            </p>
            <button className={`${SECONDARY_BUTTON_CLASS} mt-4`} type="submit">
              Calculate with these coordinates
            </button>
          </fieldset>
        </form>
      </div>
    </section>
  );
}

function NightSetup({
  activeNightDate,
  timeZone,
  onDateChange,
}: Readonly<{
  activeNightDate: string;
  onDateChange: (value: string) => void;
  timeZone: string;
}>) {
  return (
    <section aria-labelledby="tonight-night-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 className="text-xl font-semibold" id="tonight-night-heading">
          Night settings
        </h2>
        <span className="text-sm text-[var(--muted)]">Times shown in {timeZone}</span>
      </div>
      <div className="max-w-2xl space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <label className="space-y-1.5 text-sm text-[var(--muted)]" htmlFor="tonight-date">
          <span className="block font-medium text-[var(--foreground)]">Night of</span>
          <input
            className={INPUT_CLASS}
            id="tonight-date"
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={activeNightDate}
          />
          <span className="block text-xs leading-5">
            The evening beginning on this local date, continuing into the next morning.
          </span>
        </label>
        {isValidNightDate(activeNightDate) ? (
          <p className="pt-2 text-sm text-[var(--muted)]">
            Selected night: {formatDateLabel(activeNightDate, timeZone)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function NightSummary({
  analysis,
  collectionName,
  commonNight,
  nightDate,
  targetCount,
  timeZone,
}: Readonly<{
  analysis: TonightAnalysis | null;
  collectionName: string;
  commonNight: NightBoundaries | null;
  nightDate: string;
  targetCount: number;
  timeZone: string;
}>) {
  const summary = analysis?.summary;
  const darkness = commonNight?.astronomicalDarkness;
  return (
    <section aria-labelledby="tonight-summary-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 className="text-xl font-semibold" id="tonight-summary-heading">
          Night summary
        </h2>
        <span className="text-sm text-[var(--muted)]">{timeZone}</span>
      </div>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Night of{" "}
        <span className="font-medium text-[var(--foreground)]">
          {formatDateLabel(nightDate, timeZone)}
        </span>{" "}
        · collection <span className="font-medium text-[var(--foreground)]">{collectionName}</span>
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Astronomical dusk
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {commonNight === null
              ? "Unavailable"
              : formatNightEvent(commonNight.astronomicalDusk, timeZone)}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Astronomical dawn
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {commonNight === null
              ? "Unavailable"
              : formatNightEvent(commonNight.astronomicalDawn, timeZone)}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Darkness
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {darkness === undefined
              ? "Calculating"
              : darkness === null
                ? "Unavailable for this night"
                : "Sun below −18°"}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Saved targets
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">{targetCount}</dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Scientifically analyzed
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {summary?.scientificallyAnalyzedCount ?? "Waiting"}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Above horizon
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {summary?.aboveHorizonCount ?? "Waiting"}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Unavailable / unresolved
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {summary?.unavailableOrUnresolvedCount ?? "Waiting"}
          </dd>
        </div>
      </dl>
      {commonNight !== null && commonNight.astronomicalDarkness === null ? (
        <p
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--muted)]"
          role="status"
        >
          No astronomical darkness for this selected night. Tonight does not rank targets using a
          different twilight definition.
        </p>
      ) : null}
    </section>
  );
}

function EventDetails({
  target,
  timeZone,
}: Readonly<{ target: TonightAnalysis["aboveHorizon"][number]; timeZone: string }>) {
  return (
    <details className="mt-3 rounded-md border border-[var(--border)] px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--foreground)]">
        Rise, transit, set, and source
      </summary>
      <dl className="grid gap-3 pb-2 pt-2 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Rise
          </dt>
          <dd className="mt-1 text-sm text-[var(--foreground)]">
            {formatTargetEvent(target.targetEvents.rise, timeZone)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Meridian transit
          </dt>
          <dd className="mt-1 text-sm text-[var(--foreground)]">
            {formatTargetEvent(target.targetEvents.transit, timeZone)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Set
          </dt>
          <dd className="mt-1 text-sm text-[var(--foreground)]">
            {formatTargetEvent(target.targetEvents.set, timeZone)}
          </dd>
        </div>
      </dl>
      <p className="border-t border-[var(--border)] pb-1 pt-3 text-xs leading-5 text-[var(--muted)]">
        {target.coordinate.source.provider.name} · {target.coordinate.source.dataset.name} (
        {target.coordinate.source.dataset.release_version}) · source record{" "}
        <span className="font-mono">{target.coordinate.source.source_record_id}</span>. Gaia DR3
        ICRS catalogue position at reference epoch J2016.0; proper motion is not propagated.
      </p>
    </details>
  );
}

function MoonLine({ target }: Readonly<{ target: TonightAnalysis["aboveHorizon"][number] }>) {
  if (target.moon === null)
    return (
      <p className="text-sm text-[var(--muted)]">Moon context unavailable for this peak instant.</p>
    );
  const moonHorizon = target.moon.position.altitude < 0 ? "below" : "above";
  return (
    <p className="text-sm leading-6 text-[var(--muted)]">
      Moon at peak: {Math.round(target.moon.illuminationFraction * 100)}% illuminated ·{" "}
      {formatAltitude(target.moon.position.altitude)} {moonHorizon} the geometric horizon ·{" "}
      {target.moon.targetSeparationDegrees.toFixed(1)}° target–Moon separation
    </p>
  );
}

function TargetRow({
  nightDate,
  target,
  timeZone,
}: Readonly<{
  nightDate: string;
  target: TonightAnalysis["aboveHorizon"][number];
  timeZone: string;
}>) {
  return (
    <li
      className="min-w-0 border-b border-[var(--border)] py-5 first:pt-0 last:border-b-0 last:pb-0"
      data-testid="tonight-target-row"
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="min-w-0 truncate text-lg font-semibold tracking-tight">
              <Link
                className="text-[var(--foreground)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
                href={objectHref(target.item.slug)}
              >
                {target.item.canonical_name}
              </Link>
            </h3>
            <span className="text-sm text-[var(--muted)]">
              {entityTypeLabel(target.item.entity_type)}
            </span>
          </div>
          <p className="text-sm leading-6 text-[var(--foreground)]">
            <span className="font-medium">
              Highest sampled altitude during astronomical darkness
            </span>{" "}
            <span className="font-mono">{formatAltitude(target.peak.altitude)}</span> at{" "}
            <span className="font-mono">{formatTime(target.peak.instant, timeZone)}</span>
          </p>
          <p className="text-sm text-[var(--muted)]">
            Azimuth at peak: {formatAzimuth(target.peak.azimuth, target.peak.compass)}
          </p>
          <MoonLine target={target} />
          <EventDetails target={target} timeZone={timeZone} />
        </div>
        <Link
          className={`${SECONDARY_BUTTON_CLASS} shrink-0 no-underline`}
          href={plannerHref(target.item.slug, nightDate)}
        >
          Open planner
        </Link>
      </div>
    </li>
  );
}

function TargetList({
  nightDate,
  targets,
  timeZone,
  title,
  description,
  secondary = false,
}: Readonly<{
  description: string;
  nightDate: string;
  secondary?: boolean;
  targets: ReadonlyArray<TonightAnalysis["aboveHorizon"][number]>;
  timeZone: string;
  title: string;
}>) {
  return (
    <section
      aria-labelledby={`${secondary ? "tonight-below" : "tonight-above"}-heading`}
      className="space-y-4"
    >
      <div>
        <h2
          className="text-xl font-semibold"
          id={`${secondary ? "tonight-below" : "tonight-above"}-heading`}
        >
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>
      </div>
      <ol
        className="m-0 list-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-5 sm:px-5"
        data-testid={secondary ? "tonight-below-list" : "tonight-primary-list"}
      >
        {targets.map((target) => (
          <TargetRow
            key={target.item.slug}
            nightDate={nightDate}
            target={target}
            timeZone={timeZone}
          />
        ))}
      </ol>
    </section>
  );
}

function unresolvedReason(target: TonightUnresolvedTarget): string {
  if (target.kind === "missing-coordinate") return "Planning coordinates unavailable.";
  if (target.kind === "multiple-coordinate-sources") return "Multiple accepted coordinate sources.";
  if (target.kind === "catalogue-not-found") return "Current catalogue object unavailable.";
  if (target.kind === "catalogue-unavailable") return "Catalogue detail unavailable.";
  return "Night geometry unavailable.";
}

function UnresolvedList({
  nightDate,
  targets,
}: Readonly<{
  nightDate: string;
  targets: ReadonlyArray<TonightUnresolvedTarget>;
}>) {
  if (targets.length === 0) return null;
  return (
    <section aria-labelledby="tonight-unresolved-heading" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold" id="tonight-unresolved-heading">
          Not included in the ordering
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          {targets.length} saved {targets.length === 1 ? "object is" : "objects are"} not in the
          factual order. The reason is shown for each object.
        </p>
      </div>
      <ul className="m-0 list-none divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 sm:px-5">
        {targets.map((target) => (
          <li
            className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            key={target.item.slug}
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--foreground)]">
                {target.item.canonical_name}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {unresolvedReason(target)}
                {target.coordinateSourceCount !== undefined
                  ? ` (${target.coordinateSourceCount} accepted pairs)`
                  : ""}
              </p>
            </div>
            <Link
              className={`${SECONDARY_BUTTON_CLASS} shrink-0 no-underline`}
              href={plannerHref(target.item.slug, nightDate)}
            >
              {target.kind === "multiple-coordinate-sources"
                ? "Inspect in planner"
                : "Open planner"}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-5 text-[var(--muted)]">
        Current catalogue detail is authoritative; the saved collection snapshot is used only to
        identify an object while it loads or when the current object is unavailable.
      </p>
    </section>
  );
}

function NoDarknessTargets({
  nightDate,
  targets,
}: Readonly<{ nightDate: string; targets: ReadonlyArray<{ item: TonightTargetIdentity }> }>) {
  if (targets.length === 0) return null;
  return (
    <section aria-labelledby="tonight-no-darkness-targets-heading" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold" id="tonight-no-darkness-targets-heading">
          Saved targets
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          These objects have current catalogue details, but no sampled astronomical-darkness maximum
          exists for this selected night. Open the detailed planner to inspect the night boundaries.
        </p>
      </div>
      <ul className="m-0 list-none divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 sm:px-5">
        {targets.map((target) => (
          <li
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4"
            key={target.item.slug}
          >
            <span className="truncate font-medium text-[var(--foreground)]">
              {target.item.canonical_name}
            </span>
            <Link
              className={`${SECONDARY_BUTTON_CLASS} shrink-0 no-underline`}
              href={plannerHref(target.item.slug, nightDate)}
            >
              Open planner
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnalysisResults({
  analysis,
  detailLoad,
  nightDate,
  onRetry,
  sort,
  timeZone,
}: Readonly<{
  analysis: TonightAnalysis | null;
  detailLoad: DetailLoadState;
  nightDate: string;
  onRetry: () => void;
  sort: TonightSort;
  timeZone: string;
}>) {
  if (detailLoad.status === "loading") {
    return (
      <p
        aria-live="polite"
        className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5 text-sm text-[var(--muted)]"
        role="status"
      >
        Loading {detailLoad.total} saved {detailLoad.total === 1 ? "object" : "objects"}…{" "}
        {detailLoad.completed} of {detailLoad.total} catalogue details loaded.
      </p>
    );
  }
  if (analysis === null) {
    return (
      <p
        aria-live="polite"
        className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5 text-sm text-[var(--muted)]"
        role="status"
      >
        Choose a valid night and observer location to calculate Tonight&apos;s geometry.
      </p>
    );
  }

  const primary = sortTonightTargets(analysis.aboveHorizon, sort);
  const below = sortTonightTargets(analysis.belowHorizon, sort);
  const hasCatalogueFailures = analysis.unresolved.some(
    (target) => target.kind === "catalogue-not-found" || target.kind === "catalogue-unavailable",
  );

  return (
    <div className="space-y-10">
      {hasCatalogueFailures ? (
        <div
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4"
          role="status"
        >
          <p className="text-sm text-[var(--muted)]">
            Some saved objects could not be loaded from the current catalogue. Remaining objects
            stay usable; nothing was replaced with collection snapshot measurements.
          </p>
          <button className={`${SECONDARY_BUTTON_CLASS} mt-3`} onClick={onRetry} type="button">
            Retry catalogue loading
          </button>
        </div>
      ) : null}
      {analysis.night.astronomicalDarkness !== null ? (
        <p
          className="max-w-3xl text-sm leading-6 text-[var(--muted)]"
          id="tonight-ordering-explanation"
        >
          Ordered by highest sampled altitude during astronomical darkness. This is not an
          observability score. Ties use peak instant, then canonical name.
        </p>
      ) : null}
      {analysis.night.astronomicalDarkness !== null && primary.length > 0 ? (
        <TargetList
          description="A target is in this section when its sampled maximum during astronomical darkness is above 0° geometric altitude."
          nightDate={nightDate}
          targets={primary}
          timeZone={timeZone}
          title="Above the geometric horizon during astronomical darkness"
        />
      ) : null}
      {analysis.night.astronomicalDarkness !== null && below.length > 0 ? (
        <TargetList
          description="These targets have a sampled darkness maximum at or below 0°. Signed altitude is preserved."
          nightDate={nightDate}
          secondary
          targets={below}
          timeZone={timeZone}
          title="Below the geometric horizon throughout the sampled astronomical-darkness window"
        />
      ) : null}
      {analysis.night.astronomicalDarkness === null ? (
        <NoDarknessTargets nightDate={nightDate} targets={analysis.notRanked} />
      ) : null}
      <UnresolvedList nightDate={nightDate} targets={analysis.unresolved} />
      {analysis.night.astronomicalDarkness !== null &&
      primary.length === 0 &&
      below.length === 0 &&
      analysis.unresolved.length === 0 ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-sm text-[var(--muted)]">
          No target geometry was available to order for this selected night.
        </p>
      ) : null}
    </div>
  );
}

export function TonightView({ apiOrigin, initialDate }: TonightViewProps) {
  const router = useRouter();
  const collectionsStatus = useCollectionsStatus();
  const collectionsData = useCollectionsData();
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [nightDate, setNightDate] = useState(initialDate ?? "");
  const [location, setLocation] = useState<ObserverLocation | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationError, setLocationError] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [sort, setSort] = useState<TonightSort>("highest-altitude");
  const [retryToken, setRetryToken] = useState(0);
  const browserDate = useBrowserDate(initialDate);
  const activeNightDate = nightDate || browserDate;
  const timeZone = useBrowserTimeZone();

  useEffect(() => {
    if (
      collectionsStatus !== "ready" ||
      selectedCollectionId !== null ||
      collectionsData.collections.length === 0
    )
      return;
    // This is intentionally local UI memory, not derived data: it preserves
    // the initial collection when that collection later becomes empty, while
    // the canonical store continues to own all persisted collection state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize ephemeral selection after the external store hydrates
    setSelectedCollectionId(initialTonightCollectionId(collectionsData.collections));
  }, [collectionsData.collections, collectionsStatus, selectedCollectionId]);

  useEffect(() => {
    if (!isValidNightDate(activeNightDate) || typeof window === "undefined") return;
    const params = new URLSearchParams({ date: activeNightDate });
    const nextSearch = `?${params.toString()}`;
    if (window.location.search !== nextSearch)
      void router.replace(`/tonight${nextSearch}`, { scroll: false });
  }, [activeNightDate, router]);

  const resolvedCollectionId = useMemo(() => {
    if (collectionsStatus !== "ready") return null;
    const preferredCollectionId =
      selectedCollectionId ?? initialTonightCollectionId(collectionsData.collections);
    const selectedExists =
      preferredCollectionId !== null &&
      collectionsData.collections.some((collection) => collection.id === preferredCollectionId);
    if (selectedExists) return preferredCollectionId;
    return preferredCollectionId === null
      ? initialTonightCollectionId(collectionsData.collections)
      : fallbackTonightCollectionId(collectionsData.collections);
  }, [collectionsData.collections, collectionsStatus, selectedCollectionId]);
  const selectedCollection = collectionsData.collections.find(
    (collection) => collection.id === resolvedCollectionId,
  );
  const selectedItems = selectedCollection?.items ?? EMPTY_ITEMS;
  const targetIdentities = useMemo(
    () =>
      selectedItems.map((item) => ({
        canonical_name: item.canonical_name,
        entity_type: item.entity_type,
        slug: item.slug,
      })),
    [selectedItems],
  );
  const detailLoad = useTonightDetailLoad(
    apiOrigin,
    selectedCollection?.id ?? null,
    targetIdentities,
    retryToken,
  );
  const commonNight = useMemo(
    () =>
      location !== null && isValidNightDate(activeNightDate)
        ? computeNightBoundaries(location, activeNightDate)
        : null,
    [activeNightDate, location],
  );
  const analysis = useMemo(
    () =>
      detailLoad?.status === "success" && location !== null && isValidNightDate(activeNightDate)
        ? analyzeTonightCollection(detailLoad.results, location, activeNightDate)
        : null,
    [activeNightDate, detailLoad, location],
  );

  const handleManualLocation = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = parseObserverLocationInputs(latitude, longitude);
      if (parsed === null) {
        setLocation(null);
        setLocationError("Enter a latitude from −90 to 90 and a longitude from −180 to 180.");
        return;
      }
      setLocation(parsed);
      setLocationError("");
    },
    [latitude, longitude],
  );

  const handleGeolocation = useCallback(() => {
    setLocationError("");
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationError(
        "This browser does not support location access. Enter coordinates manually.",
      );
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setLocation(next);
        setLatitude(String(next.latitude));
        setLongitude(String(next.longitude));
        setLocationError("");
        setGeoBusy(false);
      },
      (error) => {
        setLocationError(observerGeolocationErrorMessage(error.code));
        setGeoBusy(false);
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
    );
  }, []);

  return (
    <div className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Selected-night comparison
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Tonight</h1>
        <p className="max-w-3xl text-lg leading-8 text-[var(--muted)]">
          Compare the saved objects in one Collection for one observer location and selected night.
          Lumina exposes the geometry behind the order; it does not calculate a composite observing
          score or choose a target for you.
        </p>
      </header>

      <CollectionScope
        collections={collectionsData.collections}
        collectionsStatus={collectionsStatus}
        onChange={(collectionId) => {
          setSelectedCollectionId(collectionId);
          setRetryToken(0);
        }}
        selectedCollectionId={resolvedCollectionId}
      />

      {selectedCollection !== undefined ? (
        <>
          <ObserverSetup
            geoBusy={geoBusy}
            latitude={latitude}
            location={location}
            locationError={locationError}
            longitude={longitude}
            onGeolocation={handleGeolocation}
            onLatitudeChange={setLatitude}
            onLongitudeChange={setLongitude}
            onManualSubmit={handleManualLocation}
          />
          <NightSetup
            activeNightDate={activeNightDate}
            onDateChange={setNightDate}
            timeZone={timeZone}
          />
          {isValidNightDate(activeNightDate) && location !== null ? (
            <NightSummary
              analysis={analysis}
              collectionName={selectedCollection.name}
              commonNight={commonNight}
              nightDate={activeNightDate}
              targetCount={selectedItems.length}
              timeZone={timeZone}
            />
          ) : null}
          {selectedItems.length === 0 ? (
            <section
              aria-labelledby="tonight-empty-collection-heading"
              className="max-w-xl rounded-lg border border-dashed border-[var(--border-strong)] px-6 py-7"
            >
              <h2 className="text-xl font-semibold" id="tonight-empty-collection-heading">
                This collection has no saved objects
              </h2>
              <p className="mt-2 leading-7 text-[var(--muted)]">
                Save objects in Collections first, then return here to compare their selected-night
                geometry.
              </p>
              <Link
                className={`${SECONDARY_BUTTON_CLASS} mt-4 no-underline`}
                href={`/collections/${selectedCollection.id}`}
              >
                Manage collection
              </Link>
            </section>
          ) : location === null ? (
            <section
              aria-live="polite"
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5"
            >
              <h2 className="text-xl font-semibold">
                Add a location to calculate Tonight&apos;s geometry
              </h2>
              <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                Choose Use my location or enter latitude and longitude. No astronomical calculation
                begins until a valid observer location is available.
              </p>
            </section>
          ) : !isValidNightDate(activeNightDate) ? (
            <section
              aria-live="polite"
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5"
            >
              <h2 className="text-xl font-semibold">Choose a valid night</h2>
              <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                Use the date control above to select the local evening to analyze.
              </p>
            </section>
          ) : detailLoad !== null ? (
            <section aria-labelledby="tonight-results-heading" className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-2">
                <div>
                  <h2 className="text-2xl font-semibold" id="tonight-results-heading">
                    Night geometry
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Current catalogue details are loaded by saved object slug; collection snapshots
                    are not scientific data.
                  </p>
                </div>
                <label
                  className="flex min-h-11 items-center gap-2 text-sm text-[var(--muted)]"
                  htmlFor="tonight-sort"
                >
                  <span className="whitespace-nowrap">Order by</span>
                  <select
                    className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                    id="tonight-sort"
                    onChange={(event) => setSort(event.target.value as TonightSort)}
                    value={sort}
                  >
                    <option value="highest-altitude">Highest altitude</option>
                    <option value="peak-time">Peak time</option>
                    <option value="name">Name</option>
                  </select>
                </label>
              </div>
              <AnalysisResults
                analysis={analysis}
                detailLoad={detailLoad}
                nightDate={activeNightDate}
                onRetry={() => setRetryToken((token) => token + 1)}
                sort={sort}
                timeZone={timeZone}
              />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
