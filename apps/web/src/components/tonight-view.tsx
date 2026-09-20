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

import {
  useCollectionsData,
  useCollectionsStatus,
  type CollectionsStatus,
} from "../lib/collections-store";
import { formatCoordinateDisclosure } from "../lib/i18n/coordinate-disclosure";
import {
  formatCountMessage,
  formatLocaleDateTime,
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type {
  CollectionStateMessages,
  CoordinateDisclosureMessages,
  EntityTypeMessages,
  TonightMessages,
} from "../lib/i18n/messages/types";
import {
  coordinateDisclosureForProfile,
  isValidNightDate,
  localDateString,
  localInstantForNightTime,
  parseObserverLocationInputs,
  computeNightBoundaries,
  coordinateProfileForSource,
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
  WEATHER_PROVIDER_LICENSE_URL,
  WEATHER_PROVIDER_NAME,
  WEATHER_PROVIDER_URL,
  nearestWeatherHour,
  type WeatherForecast,
} from "../lib/weather/domain";
import {
  useObservationWeather,
  type ObservationWeatherState,
} from "../lib/weather/use-observation-weather";
import {
  CollectionLoadingNote,
  CorruptedStoragePanel,
  StorageUnavailableNote,
} from "./collection-state-blocks";

type TonightViewProps = Readonly<{
  apiOrigin?: string;
  collectionStateMessages: CollectionStateMessages;
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  entityTypeMessages: EntityTypeMessages;
  initialDate?: string;
  locale: PublishedLocale;
  messages: TonightMessages;
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

function formatDateLabel(nightDate: string, timeZone: string, locale: PublishedLocale): string {
  const instant = localInstantForNightTime(nightDate, "12:00");
  if (instant === null) return nightDate;
  return formatLocaleDateTime(instant, locale, {
    day: "numeric",
    month: "short",
    timeZone,
    year: "numeric",
  });
}

function formatTime(instant: Date, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(instant, locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function formatAltitude(
  altitude: number,
  locale: PublishedLocale,
  messages: TonightMessages["target"],
): string {
  const value = formatLocaleFixedNumber(altitude, 1, locale).replace("-", "−");
  return formatMessageTemplate(messages.altitude, { value });
}

function formatAzimuth(
  azimuth: number,
  compass: string,
  locale: PublishedLocale,
  messages: TonightMessages["target"],
): string {
  return formatMessageTemplate(messages.azimuth, {
    compass,
    value: formatLocaleFixedNumber(azimuth, 1, locale),
  });
}

function formatWeatherPercent(
  value: number | null,
  locale: PublishedLocale,
  messages: TonightMessages["weather"],
): string {
  return value === null
    ? messages.unavailableValue
    : formatMessageTemplate(messages.percentValue, {
        value: formatLocaleNumber(Math.round(value), locale, {
          maximumFractionDigits: 0,
          useGrouping: false,
        }),
      });
}

function formatWeatherVisibility(
  meters: number | null,
  locale: PublishedLocale,
  messages: TonightMessages["weather"],
): string {
  if (meters === null) return messages.unavailableValue;
  const kilometres = meters / 1_000;
  return formatMessageTemplate(messages.visibilityKilometres, {
    value: formatLocaleFixedNumber(kilometres, kilometres >= 10 ? 0 : 1, locale),
  });
}

function formatWeatherWind(
  value: number | null,
  locale: PublishedLocale,
  messages: TonightMessages["weather"],
): string {
  return value === null
    ? messages.unavailableValue
    : formatMessageTemplate(messages.windKmh, {
        value: formatLocaleNumber(Math.round(value), locale, {
          maximumFractionDigits: 0,
          useGrouping: false,
        }),
      });
}

function formatNightEvent(
  event: NightEvent,
  timeZone: string,
  locale: PublishedLocale,
  messages: TonightMessages["events"],
): string {
  return event.kind === "time"
    ? formatTime(event.instant, timeZone, locale)
    : messages.statusUnavailable;
}

function formatTargetEvent(
  event: TargetEvent,
  timeZone: string,
  locale: PublishedLocale,
  messages: TonightMessages["events"],
): string {
  if (event.kind === "time" && event.instant !== undefined)
    return formatTime(event.instant, timeZone, locale);
  if (event.kind === "circumpolar") return messages.statusCircumpolar;
  if (event.kind === "never-rises") return messages.statusNeverRises;
  if (event.kind === "not-during-night") return messages.statusNotDuringNight;
  return messages.statusUnavailable;
}

function geolocationErrorMessage(code: number, messages: TonightMessages["location"]): string {
  if (code === 1) return messages.geolocationDenied;
  if (code === 2) return messages.geolocationUnavailable;
  if (code === 3) return messages.geolocationTimeout;
  return messages.geolocationGeneric;
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
  collectionStateMessages,
  collectionsStatus,
  selectedCollectionId,
  collections,
  locale,
  messages,
  onChange,
}: Readonly<{
  collections: ReadonlyArray<Readonly<{ id: string; items: ReadonlyArray<unknown>; name: string }>>;
  collectionStateMessages: CollectionStateMessages;
  collectionsStatus: CollectionsStatus;
  locale: PublishedLocale;
  messages: TonightMessages["collection"];
  onChange: (collectionId: string) => void;
  selectedCollectionId: string | null;
}>) {
  return (
    <section aria-labelledby="tonight-collection-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 className="text-xl font-semibold" id="tonight-collection-heading">
          {messages.heading}
        </h2>
        <span className="text-sm text-[var(--muted)]">{messages.summary}</span>
      </div>
      {collectionsStatus === "loading" ? (
        <CollectionLoadingNote messages={collectionStateMessages.shared} />
      ) : null}
      {collectionsStatus === "unavailable" ? (
        <StorageUnavailableNote context="page" messages={collectionStateMessages.shared} />
      ) : null}
      {collectionsStatus === "corrupted" ? (
        <CorruptedStoragePanel messages={collectionStateMessages} />
      ) : null}
      {collectionsStatus === "ready" && collections.length === 0 ? (
        <div className="max-w-xl rounded-lg border border-dashed border-[var(--border-strong)] px-6 py-7">
          <h3 className="text-lg font-semibold">{messages.emptyTitle}</h3>
          <p className="mt-2 leading-7 text-[var(--muted)]">{messages.emptyDescription}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className={PRIMARY_BUTTON_CLASS} href="/collections">
              {messages.openCollections}
            </Link>
            <Link className={SECONDARY_BUTTON_CLASS} href="/explore">
              {messages.exploreObjects}
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
            {messages.selectLabel}
          </label>
          <select
            className={INPUT_CLASS.replace("font-mono", "")}
            id="tonight-collection"
            onChange={(event) => onChange(event.target.value)}
            value={selectedCollectionId}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {formatCountMessage(messages.optionSaved, collection.items.length, locale, {
                  name: collection.name,
                })}
              </option>
            ))}
          </select>
          <p className="text-sm leading-6 text-[var(--muted)]">{messages.usageNote}</p>
        </div>
      ) : null}
      {collectionsStatus === "ready" && collections.length > 0 && selectedCollectionId === null ? (
        <div className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-6">
          <h3 className="text-lg font-semibold">{messages.noNonEmptyTitle}</h3>
          <p className="mt-2 leading-7 text-[var(--muted)]">{messages.noNonEmptyDescription}</p>
          <Link className={`${SECONDARY_BUTTON_CLASS} mt-4`} href="/collections">
            {messages.manageCollections}
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
  locale,
  messages,
  onLatitudeChange,
  onLongitudeChange,
  onManualSubmit,
  onGeolocation,
}: Readonly<{
  geoBusy: boolean;
  latitude: string;
  location: ObserverLocation | null;
  locationError: string;
  locale: PublishedLocale;
  longitude: string;
  messages: TonightMessages["location"];
  onGeolocation: () => void;
  onLatitudeChange: (value: string) => void;
  onLongitudeChange: (value: string) => void;
  onManualSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <section aria-labelledby="tonight-location-heading" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 className="text-xl font-semibold" id="tonight-location-heading">
          {messages.heading}
        </h2>
        <span className="text-sm text-[var(--muted)]">{messages.summary}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <p className="text-sm leading-6 text-[var(--muted)]">{messages.privacyNote}</p>
          <button
            className={`${PRIMARY_BUTTON_CLASS} mt-4`}
            disabled={geoBusy}
            onClick={onGeolocation}
            type="button"
          >
            {geoBusy ? messages.lookingUp : messages.useMyLocation}
          </button>
          {location !== null ? (
            <p className="mt-4 text-sm text-[var(--foreground)]">
              {formatMessageTemplate(messages.currentLocation, {
                latitude: formatLocaleFixedNumber(location.latitude, 3, locale),
                longitude: formatLocaleFixedNumber(location.longitude, 3, locale),
              })}
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
              {messages.manualLegend}
            </legend>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm text-[var(--muted)]" htmlFor="tonight-latitude">
                <span className="block">{messages.latitudeLabel}</span>
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
                <span className="block">{messages.longitudeLabel}</span>
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
              {messages.coordinateHelp}
            </p>
            <button className={`${SECONDARY_BUTTON_CLASS} mt-4`} type="submit">
              {messages.calculateAction}
            </button>
          </fieldset>
        </form>
      </div>
    </section>
  );
}

function NightSetup({
  activeNightDate,
  locale,
  messages,
  timeZone,
  onDateChange,
}: Readonly<{
  activeNightDate: string;
  locale: PublishedLocale;
  messages: TonightMessages["night"];
  onDateChange: (value: string) => void;
  timeZone: string;
}>) {
  return (
    <section aria-labelledby="tonight-night-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 className="text-xl font-semibold" id="tonight-night-heading">
          {messages.heading}
        </h2>
        <span className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.timesShown, { timeZone })}
        </span>
      </div>
      <div className="max-w-2xl space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <label className="space-y-1.5 text-sm text-[var(--muted)]" htmlFor="tonight-date">
          <span className="block font-medium text-[var(--foreground)]">{messages.nightOf}</span>
          <input
            className={INPUT_CLASS}
            id="tonight-date"
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={activeNightDate}
          />
          <span className="block text-xs leading-5">{messages.dateHelp}</span>
        </label>
        {isValidNightDate(activeNightDate) ? (
          <p className="pt-2 text-sm text-[var(--muted)]">
            {formatMessageTemplate(messages.selectedNight, {
              date: formatDateLabel(activeNightDate, timeZone, locale),
            })}
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
  eventMessages,
  locale,
  messages,
  nightDate,
  targetCount,
  timeZone,
}: Readonly<{
  analysis: TonightAnalysis | null;
  collectionName: string;
  commonNight: NightBoundaries | null;
  eventMessages: TonightMessages["events"];
  locale: PublishedLocale;
  messages: TonightMessages["summary"];
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
          {messages.heading}
        </h2>
        <span className="text-sm text-[var(--muted)]">{timeZone}</span>
      </div>
      <p className="text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.nightAndCollection, {
          collectionName,
          date: formatDateLabel(nightDate, timeZone, locale),
        })}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.astronomicalDusk}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {commonNight === null
              ? messages.unavailable
              : formatNightEvent(commonNight.astronomicalDusk, timeZone, locale, eventMessages)}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.astronomicalDawn}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {commonNight === null
              ? messages.unavailable
              : formatNightEvent(commonNight.astronomicalDawn, timeZone, locale, eventMessages)}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.darkness}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {darkness === undefined
              ? messages.calculating
              : darkness === null
                ? messages.unavailableForNight
                : messages.sunBelowEighteen}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.savedTargets}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {formatLocaleNumber(targetCount, locale)}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.scientificallyAnalyzed}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {summary === undefined
              ? messages.waiting
              : formatLocaleNumber(summary.scientificallyAnalyzedCount, locale)}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.aboveHorizon}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {summary === undefined
              ? messages.waiting
              : formatLocaleNumber(summary.aboveHorizonCount, locale)}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.unavailableUnresolved}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {summary === undefined
              ? messages.waiting
              : formatLocaleNumber(summary.unavailableOrUnresolvedCount, locale)}
          </dd>
        </div>
      </dl>
      {commonNight !== null && commonNight.astronomicalDarkness === null ? (
        <p
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--muted)]"
          role="status"
        >
          {messages.noDarkness}
        </p>
      ) : null}
    </section>
  );
}

function EventDetails({
  coordinateDisclosureMessages,
  locale,
  messages,
  target,
  timeZone,
}: Readonly<{
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  locale: PublishedLocale;
  messages: TonightMessages["events"];
  target: TonightAnalysis["aboveHorizon"][number];
  timeZone: string;
}>) {
  const profile = coordinateProfileForSource(target.coordinate.source);
  const disclosure =
    profile === null
      ? coordinateDisclosureMessages.reviewedWithoutEpoch
      : formatCoordinateDisclosure(
          coordinateDisclosureForProfile(profile),
          coordinateDisclosureMessages,
        );
  return (
    <details className="mt-3 rounded-md border border-[var(--border)] px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--foreground)]">
        {messages.detailsSummary}
      </summary>
      <dl className="grid gap-3 pb-2 pt-2 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.rise}
          </dt>
          <dd className="mt-1 text-sm text-[var(--foreground)]">
            {formatTargetEvent(target.targetEvents.rise, timeZone, locale, messages)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.meridianTransit}
          </dt>
          <dd className="mt-1 text-sm text-[var(--foreground)]">
            {formatTargetEvent(target.targetEvents.transit, timeZone, locale, messages)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.set}
          </dt>
          <dd className="mt-1 text-sm text-[var(--foreground)]">
            {formatTargetEvent(target.targetEvents.set, timeZone, locale, messages)}
          </dd>
        </div>
      </dl>
      <p className="border-t border-[var(--border)] pb-1 pt-3 text-xs leading-5 text-[var(--muted)]">
        {formatMessageTemplate(messages.sourceLine, {
          dataset: target.coordinate.source.dataset.name,
          disclosure,
          provider: target.coordinate.source.provider.name,
          recordId: target.coordinate.source.source_record_id,
          release: target.coordinate.source.dataset.release_version,
        })}
      </p>
    </details>
  );
}

function MoonLine({
  locale,
  messages,
  target,
}: Readonly<{
  locale: PublishedLocale;
  messages: TonightMessages["target"];
  target: TonightAnalysis["aboveHorizon"][number];
}>) {
  if (target.moon === null)
    return <p className="text-sm text-[var(--muted)]">{messages.moonUnavailable}</p>;
  const moonHorizon = target.moon.position.altitude < 0 ? messages.moonBelow : messages.moonAbove;
  return (
    <p className="text-sm leading-6 text-[var(--muted)]">
      {formatMessageTemplate(messages.moonLine, {
        altitude: formatAltitude(target.moon.position.altitude, locale, messages),
        horizon: moonHorizon,
        illumination: formatLocaleNumber(
          Math.round(target.moon.illuminationFraction * 100),
          locale,
          {
            maximumFractionDigits: 0,
            useGrouping: false,
          },
        ),
        separation: formatLocaleFixedNumber(target.moon.targetSeparationDegrees, 1, locale),
      })}
    </p>
  );
}

function WeatherLine({
  forecast,
  locale,
  messages,
  target,
  timeZone,
}: Readonly<{
  forecast: WeatherForecast;
  locale: PublishedLocale;
  messages: TonightMessages["weather"];
  target: TonightAnalysis["aboveHorizon"][number];
  timeZone: string;
}>) {
  const hour = nearestWeatherHour(forecast.hours, target.peak.instant);
  if (hour === null) {
    return <p className="text-sm text-[var(--muted)]">{messages.contextUnavailable}</p>;
  }
  return (
    <div className="space-y-2" data-testid="tonight-weather-facts">
      <p className="text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.peakSummary, {
          cloudCover: formatWeatherPercent(hour.cloudCover, locale, messages),
          precipitation: formatWeatherPercent(hour.precipitationProbability, locale, messages),
          time: formatTime(hour.instant, timeZone, locale),
        })}
      </p>
      <details className="rounded-md border border-[var(--border)] px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--foreground)]">
          {messages.moreFacts}
        </summary>
        <dl className="grid gap-3 pb-2 pt-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
              {messages.visibilityLabel}
            </dt>
            <dd className="mt-1 text-sm text-[var(--foreground)]">
              {formatWeatherVisibility(hour.visibilityMeters, locale, messages)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
              {messages.humidityLabel}
            </dt>
            <dd className="mt-1 text-sm text-[var(--foreground)]">
              {formatWeatherPercent(hour.relativeHumidity, locale, messages)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
              {messages.windLabel}
            </dt>
            <dd className="mt-1 text-sm text-[var(--foreground)]">
              {formatWeatherWind(hour.windSpeedKmh, locale, messages)}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

function TargetRow({
  coordinateDisclosureMessages,
  entityTypeMessages,
  forecast,
  locale,
  messages,
  nightDate,
  target,
  timeZone,
}: Readonly<{
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  entityTypeMessages: EntityTypeMessages;
  forecast?: WeatherForecast;
  locale: PublishedLocale;
  messages: Pick<TonightMessages, "events" | "lists" | "target" | "weather">;
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
              {entityTypeMessages[target.item.entity_type]}
            </span>
          </div>
          <p className="text-sm leading-6 text-[var(--foreground)]">
            {formatMessageTemplate(messages.target.highestAltitude, {
              altitude: formatAltitude(target.peak.altitude, locale, messages.target),
              time: formatTime(target.peak.instant, timeZone, locale),
            })}
          </p>
          <p className="text-sm text-[var(--muted)]">
            {formatMessageTemplate(messages.target.azimuthAtPeak, {
              azimuth: formatAzimuth(
                target.peak.azimuth,
                target.peak.compass,
                locale,
                messages.target,
              ),
            })}
          </p>
          <MoonLine locale={locale} messages={messages.target} target={target} />
          {forecast !== undefined ? (
            <WeatherLine
              forecast={forecast}
              locale={locale}
              messages={messages.weather}
              target={target}
              timeZone={timeZone}
            />
          ) : null}
          <EventDetails
            coordinateDisclosureMessages={coordinateDisclosureMessages}
            locale={locale}
            messages={messages.events}
            target={target}
            timeZone={timeZone}
          />
        </div>
        <Link
          className={`${SECONDARY_BUTTON_CLASS} shrink-0 no-underline`}
          href={plannerHref(target.item.slug, nightDate)}
        >
          {messages.lists.openPlanner}
        </Link>
      </div>
    </li>
  );
}

function TargetList({
  coordinateDisclosureMessages,
  entityTypeMessages,
  forecast,
  locale,
  messages,
  nightDate,
  targets,
  timeZone,
  title,
  description,
  secondary = false,
}: Readonly<{
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  description: string;
  entityTypeMessages: EntityTypeMessages;
  forecast?: WeatherForecast;
  locale: PublishedLocale;
  messages: Pick<TonightMessages, "events" | "lists" | "target" | "weather">;
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
            coordinateDisclosureMessages={coordinateDisclosureMessages}
            entityTypeMessages={entityTypeMessages}
            {...(forecast === undefined ? {} : { forecast })}
            key={target.item.slug}
            locale={locale}
            messages={messages}
            nightDate={nightDate}
            target={target}
            timeZone={timeZone}
          />
        ))}
      </ol>
    </section>
  );
}

function unresolvedReason(
  target: TonightUnresolvedTarget,
  messages: TonightMessages["lists"]["unresolvedReasons"],
): string {
  if (target.kind === "missing-coordinate") return messages.missingCoordinate;
  if (target.kind === "multiple-coordinate-sources") return messages.multipleCoordinateSources;
  if (target.kind === "catalogue-not-found") return messages.catalogueNotFound;
  if (target.kind === "catalogue-unavailable") return messages.catalogueUnavailable;
  return messages.geometryUnavailable;
}

function UnresolvedList({
  locale,
  messages,
  nightDate,
  targets,
}: Readonly<{
  locale: PublishedLocale;
  messages: TonightMessages["lists"];
  nightDate: string;
  targets: ReadonlyArray<TonightUnresolvedTarget>;
}>) {
  if (targets.length === 0) return null;
  return (
    <section aria-labelledby="tonight-unresolved-heading" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold" id="tonight-unresolved-heading">
          {messages.unresolvedTitle}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          {formatCountMessage(messages.unresolvedSummary, targets.length, locale)}
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
                {unresolvedReason(target, messages.unresolvedReasons)}
                {target.coordinateSourceCount !== undefined ? (
                  <>
                    {" "}
                    {formatCountMessage(
                      messages.acceptedPairs,
                      target.coordinateSourceCount,
                      locale,
                    )}
                  </>
                ) : null}
              </p>
            </div>
            <Link
              className={`${SECONDARY_BUTTON_CLASS} shrink-0 no-underline`}
              href={plannerHref(target.item.slug, nightDate)}
            >
              {target.kind === "multiple-coordinate-sources"
                ? messages.inspectPlanner
                : messages.openPlanner}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-5 text-[var(--muted)]">{messages.authoritativeNote}</p>
    </section>
  );
}

function NoDarknessTargets({
  messages,
  nightDate,
  targets,
}: Readonly<{
  messages: TonightMessages["lists"];
  nightDate: string;
  targets: ReadonlyArray<{ item: TonightTargetIdentity }>;
}>) {
  if (targets.length === 0) return null;
  return (
    <section aria-labelledby="tonight-no-darkness-targets-heading" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold" id="tonight-no-darkness-targets-heading">
          {messages.noDarknessTitle}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          {messages.noDarknessDescription}
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
              {messages.openPlanner}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatRetrievedAt(instant: Date, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(instant, locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
}

function TonightWeatherAttribution({
  consented,
  fetchedAt,
  locale,
  messages,
  timeZone,
}: Readonly<{
  consented: boolean;
  fetchedAt: Date | undefined;
  locale: PublishedLocale;
  messages: TonightMessages["weather"];
  timeZone: string;
}>) {
  return (
    <div className="space-y-2 text-xs leading-5 text-[var(--muted)]">
      {consented ? (
        <p>
          {formatMessageTemplate(messages.consentDisclosure, {
            digits: formatLocaleNumber(2, locale),
            provider: WEATHER_PROVIDER_NAME,
          })}
        </p>
      ) : null}
      <p>
        {formatMessageTemplate(
          fetchedAt === undefined
            ? messages.providerSummary
            : messages.providerSummaryWithRetrieved,
          {
            provider: WEATHER_PROVIDER_NAME,
            ...(fetchedAt === undefined
              ? {}
              : { retrievedAt: formatRetrievedAt(fetchedAt, timeZone, locale) }),
          },
        )}{" "}
        <a
          className="font-medium text-[var(--link)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--foreground)]"
          href={WEATHER_PROVIDER_URL}
          rel="noreferrer"
          target="_blank"
        >
          {formatMessageTemplate(messages.providerLink, { provider: WEATHER_PROVIDER_NAME })}
        </a>{" "}
        ·{" "}
        <a
          className="text-[var(--link)] underline underline-offset-2"
          href={WEATHER_PROVIDER_LICENSE_URL}
          rel="noreferrer"
          target="_blank"
        >
          {messages.licenceLink}
        </a>
      </p>
    </div>
  );
}

function TonightWeatherPanel({
  locale,
  messages,
  weather,
  timeZone,
}: Readonly<{
  locale: PublishedLocale;
  messages: TonightMessages["weather"];
  timeZone: string;
  weather: ObservationWeatherState;
}>) {
  const consented = weather.status !== "idle";
  return (
    <section aria-labelledby="tonight-weather-heading" className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold" id="tonight-weather-heading">
          {messages.heading}
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{messages.intro}</p>
      </div>
      {weather.availability !== "allowed" ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]">
          {messages.dateUnavailable}
        </p>
      ) : weather.status === "idle" ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <p className="text-sm leading-6 text-[var(--muted)]">
            {formatMessageTemplate(messages.consentPrompt, {
              digits: formatLocaleNumber(2, locale),
              provider: WEATHER_PROVIDER_NAME,
            })}
          </p>
          <button className={`${PRIMARY_BUTTON_CLASS} mt-4`} onClick={weather.enable} type="button">
            {messages.loadAction}
          </button>
        </div>
      ) : weather.status === "loading" ? (
        <p
          aria-live="polite"
          className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]"
          role="status"
        >
          {messages.loading}
        </p>
      ) : weather.status === "unavailable" ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4">
          <p className="text-sm text-[var(--muted)]" role="alert">
            {messages.failure}
          </p>
          <button
            className={`${SECONDARY_BUTTON_CLASS} mt-3`}
            onClick={weather.retry}
            type="button"
          >
            {messages.retry}
          </button>
        </div>
      ) : weather.forecast !== undefined ? (
        <p
          aria-live="polite"
          className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]"
          role="status"
        >
          {messages.loaded}
        </p>
      ) : null}
      <TonightWeatherAttribution
        consented={consented}
        fetchedAt={weather.forecast?.fetchedAt}
        locale={locale}
        messages={messages}
        timeZone={timeZone}
      />
    </section>
  );
}

function AnalysisResults({
  analysis,
  coordinateDisclosureMessages,
  detailLoad,
  entityTypeMessages,
  locale,
  location,
  messages,
  nightDate,
  onRetry,
  sort,
  timeZone,
}: Readonly<{
  analysis: TonightAnalysis | null;
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  detailLoad: DetailLoadState;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  location: ObserverLocation;
  messages: TonightMessages;
  nightDate: string;
  onRetry: () => void;
  sort: TonightSort;
  timeZone: string;
}>) {
  const weather = useObservationWeather({ location, nightDate });
  if (detailLoad.status === "loading") {
    return (
      <p
        aria-live="polite"
        className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5 text-sm text-[var(--muted)]"
        role="status"
      >
        {formatCountMessage(messages.analysis.loading, detailLoad.total, locale, {
          completed: formatLocaleNumber(detailLoad.completed, locale),
        })}
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
        {messages.analysis.prompt}
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
          <p className="text-sm text-[var(--muted)]">{messages.analysis.catalogueFailure}</p>
          <button className={`${SECONDARY_BUTTON_CLASS} mt-3`} onClick={onRetry} type="button">
            {messages.analysis.retryCatalogue}
          </button>
        </div>
      ) : null}
      {analysis.night.astronomicalDarkness !== null ? (
        <p
          className="max-w-3xl text-sm leading-6 text-[var(--muted)]"
          id="tonight-ordering-explanation"
        >
          {messages.analysis.orderingExplanation}
        </p>
      ) : null}
      <TonightWeatherPanel
        locale={locale}
        messages={messages.weather}
        timeZone={timeZone}
        weather={weather}
      />
      {analysis.night.astronomicalDarkness !== null && primary.length > 0 ? (
        <TargetList
          coordinateDisclosureMessages={coordinateDisclosureMessages}
          description={messages.lists.aboveDescription}
          entityTypeMessages={entityTypeMessages}
          {...(weather.forecast === undefined ? {} : { forecast: weather.forecast })}
          locale={locale}
          messages={messages}
          nightDate={nightDate}
          targets={primary}
          timeZone={timeZone}
          title={messages.lists.aboveTitle}
        />
      ) : null}
      {analysis.night.astronomicalDarkness !== null && below.length > 0 ? (
        <TargetList
          coordinateDisclosureMessages={coordinateDisclosureMessages}
          description={messages.lists.belowDescription}
          entityTypeMessages={entityTypeMessages}
          locale={locale}
          messages={messages}
          nightDate={nightDate}
          secondary
          targets={below}
          timeZone={timeZone}
          title={messages.lists.belowTitle}
        />
      ) : null}
      {analysis.night.astronomicalDarkness === null ? (
        <NoDarknessTargets
          messages={messages.lists}
          nightDate={nightDate}
          targets={analysis.notRanked}
        />
      ) : null}
      <UnresolvedList
        locale={locale}
        messages={messages.lists}
        nightDate={nightDate}
        targets={analysis.unresolved}
      />
      {analysis.night.astronomicalDarkness !== null &&
      primary.length === 0 &&
      below.length === 0 &&
      analysis.unresolved.length === 0 ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-sm text-[var(--muted)]">
          {messages.analysis.emptyOrdering}
        </p>
      ) : null}
    </div>
  );
}

export function TonightView({
  apiOrigin,
  collectionStateMessages,
  coordinateDisclosureMessages,
  entityTypeMessages,
  initialDate,
  locale,
  messages,
}: TonightViewProps) {
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
        setLocationError(messages.location.invalidCoordinates);
        return;
      }
      setLocation(parsed);
      setLocationError("");
    },
    [latitude, longitude, messages.location.invalidCoordinates],
  );

  const handleGeolocation = useCallback(() => {
    setLocationError("");
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationError(messages.location.unsupported);
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
        setLocationError(geolocationErrorMessage(error.code, messages.location));
        setGeoBusy(false);
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
    );
  }, [messages.location]);

  return (
    <div className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="max-w-3xl text-lg leading-8 text-[var(--muted)]">{messages.header.intro}</p>
      </header>

      <CollectionScope
        collectionStateMessages={collectionStateMessages}
        collections={collectionsData.collections}
        collectionsStatus={collectionsStatus}
        locale={locale}
        messages={messages.collection}
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
            locale={locale}
            longitude={longitude}
            messages={messages.location}
            onGeolocation={handleGeolocation}
            onLatitudeChange={setLatitude}
            onLongitudeChange={setLongitude}
            onManualSubmit={handleManualLocation}
          />
          <NightSetup
            activeNightDate={activeNightDate}
            locale={locale}
            messages={messages.night}
            onDateChange={setNightDate}
            timeZone={timeZone}
          />
          {isValidNightDate(activeNightDate) && location !== null ? (
            <NightSummary
              analysis={analysis}
              collectionName={selectedCollection.name}
              commonNight={commonNight}
              eventMessages={messages.events}
              locale={locale}
              messages={messages.summary}
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
                {messages.emptyCollection.title}
              </h2>
              <p className="mt-2 leading-7 text-[var(--muted)]">
                {messages.emptyCollection.description}
              </p>
              <Link
                className={`${SECONDARY_BUTTON_CLASS} mt-4 no-underline`}
                href={`/collections/${selectedCollection.id}`}
              >
                {messages.emptyCollection.manageAction}
              </Link>
            </section>
          ) : location === null ? (
            <section
              aria-live="polite"
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5"
            >
              <h2 className="text-xl font-semibold">{messages.locationRequired.title}</h2>
              <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                {messages.locationRequired.description}
              </p>
            </section>
          ) : !isValidNightDate(activeNightDate) ? (
            <section
              aria-live="polite"
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5"
            >
              <h2 className="text-xl font-semibold">{messages.invalidNight.title}</h2>
              <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                {messages.invalidNight.description}
              </p>
            </section>
          ) : detailLoad !== null ? (
            <section aria-labelledby="tonight-results-heading" className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-2">
                <div>
                  <h2 className="text-2xl font-semibold" id="tonight-results-heading">
                    {messages.resultsHeader.heading}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {messages.resultsHeader.summary}
                  </p>
                </div>
                <label
                  className="flex min-h-11 items-center gap-2 text-sm text-[var(--muted)]"
                  htmlFor="tonight-sort"
                >
                  <span className="whitespace-nowrap">{messages.resultsHeader.orderBy}</span>
                  <select
                    className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                    id="tonight-sort"
                    onChange={(event) => setSort(event.target.value as TonightSort)}
                    value={sort}
                  >
                    <option value="highest-altitude">
                      {messages.resultsHeader.sortHighestAltitude}
                    </option>
                    <option value="peak-time">{messages.resultsHeader.sortPeakTime}</option>
                    <option value="name">{messages.resultsHeader.sortName}</option>
                  </select>
                </label>
              </div>
              <AnalysisResults
                analysis={analysis}
                coordinateDisclosureMessages={coordinateDisclosureMessages}
                detailLoad={detailLoad}
                entityTypeMessages={entityTypeMessages}
                locale={locale}
                messages={messages}
                nightDate={activeNightDate}
                location={location}
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
