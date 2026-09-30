"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

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
  parseObserverLocationInputs,
  computeNightBoundaries,
  coordinateProfileForSource,
  type NightEvent,
  type NightBoundaries,
  type ObserverLocation,
  type TargetEvent,
} from "../lib/observation/domain";
import {
  formatObservationDateLabel,
  formatObservationTime,
  useBrowserDate,
  useBrowserTimeZone,
} from "../lib/observation/presentation";
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
import styles from "./tonight-view.module.css";

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

const PRIMARY_BUTTON_CLASS = styles.primaryButton;
const SECONDARY_BUTTON_CLASS = styles.secondaryButton;

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
    ? formatObservationTime(event.instant, timeZone, locale)
    : messages.statusUnavailable;
}

function formatTargetEvent(
  event: TargetEvent,
  timeZone: string,
  locale: PublishedLocale,
  messages: TonightMessages["events"],
): string {
  if (event.kind === "time" && event.instant !== undefined)
    return formatObservationTime(event.instant, timeZone, locale);
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
    <section aria-labelledby="tonight-collection-heading" className={styles.briefSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{messages.heading}</p>
        <h2 className={styles.sectionTitle} id="tonight-collection-heading">
          {messages.heading}
        </h2>
        <p className={styles.sectionSummary}>{messages.summary}</p>
      </div>
      <div className={styles.sectionBody}>
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
          <div className={styles.emptyState}>
            <h3>{messages.emptyTitle}</h3>
            <p>{messages.emptyDescription}</p>
            <div className={styles.actionRow}>
              <Link className={PRIMARY_BUTTON_CLASS} href="/collections">
                {messages.openCollections}
              </Link>
              <Link className={SECONDARY_BUTTON_CLASS} href="/explore">
                {messages.exploreObjects}
              </Link>
            </div>
          </div>
        ) : null}
        {collectionsStatus === "ready" &&
        collections.length > 0 &&
        selectedCollectionId !== null ? (
          <div className={styles.selectBlock}>
            <label className={styles.label} htmlFor="tonight-collection">
              <span className={styles.labelStrong}>{messages.selectLabel}</span>
              <select
                className={styles.select}
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
            </label>
            <p className={styles.usageNote}>{messages.usageNote}</p>
          </div>
        ) : null}
        {collectionsStatus === "ready" &&
        collections.length > 0 &&
        selectedCollectionId === null ? (
          <div className={styles.emptyState}>
            <h3>{messages.noNonEmptyTitle}</h3>
            <p>{messages.noNonEmptyDescription}</p>
            <div className={styles.actionRow}>
              <Link className={SECONDARY_BUTTON_CLASS} href="/collections">
                {messages.manageCollections}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
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
    <section aria-labelledby="tonight-location-heading" className={styles.briefSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{messages.heading}</p>
        <h2 className={styles.sectionTitle} id="tonight-location-heading">
          {messages.heading}
        </h2>
        <p className={styles.sectionSummary}>{messages.summary}</p>
      </div>
      <div className={styles.setupGrid}>
        <div className={styles.setupPanel}>
          <p className={styles.setupCopy}>{messages.privacyNote}</p>
          <div className={styles.actionRow}>
            <button
              className={PRIMARY_BUTTON_CLASS}
              disabled={geoBusy}
              onClick={onGeolocation}
              type="button"
            >
              {geoBusy ? messages.lookingUp : messages.useMyLocation}
            </button>
          </div>
          {location !== null ? (
            <p className={styles.currentLocation}>
              {formatMessageTemplate(messages.currentLocation, {
                latitude: formatLocaleFixedNumber(location.latitude, 3, locale),
                longitude: formatLocaleFixedNumber(location.longitude, 3, locale),
              })}
            </p>
          ) : null}
          {locationError !== "" ? (
            <p className={styles.error} role="alert">
              {locationError}
            </p>
          ) : null}
        </div>
        <form className={styles.setupPanel} onSubmit={onManualSubmit}>
          <fieldset className={styles.fieldset}>
            <legend>{messages.manualLegend}</legend>
            <div className={styles.coordinateGrid}>
              <label className={styles.label} htmlFor="tonight-latitude">
                <span>{messages.latitudeLabel}</span>
                <input
                  aria-describedby="tonight-coordinate-help"
                  className={styles.input}
                  id="tonight-latitude"
                  inputMode="decimal"
                  onChange={(event) => onLatitudeChange(event.target.value)}
                  placeholder="12.972"
                  type="text"
                  value={latitude}
                />
              </label>
              <label className={styles.label} htmlFor="tonight-longitude">
                <span>{messages.longitudeLabel}</span>
                <input
                  aria-describedby="tonight-coordinate-help"
                  className={styles.input}
                  id="tonight-longitude"
                  inputMode="decimal"
                  onChange={(event) => onLongitudeChange(event.target.value)}
                  placeholder="77.594"
                  type="text"
                  value={longitude}
                />
              </label>
            </div>
            <p className={styles.help} id="tonight-coordinate-help">
              {messages.coordinateHelp}
            </p>
            <div className={styles.actionRow}>
              <button className={SECONDARY_BUTTON_CLASS} type="submit">
                {messages.calculateAction}
              </button>
            </div>
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
    <section aria-labelledby="tonight-night-heading" className={styles.briefSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{messages.heading}</p>
        <h2 className={styles.sectionTitle} id="tonight-night-heading">
          {messages.heading}
        </h2>
        <p className={styles.sectionSummary}>
          {formatMessageTemplate(messages.timesShown, { timeZone })}
        </p>
      </div>
      <div className={styles.nightControl}>
        <label className={styles.label} htmlFor="tonight-date">
          <span className={styles.labelStrong}>{messages.nightOf}</span>
          <input
            className={styles.input}
            id="tonight-date"
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={activeNightDate}
          />
          <span className={styles.help}>{messages.dateHelp}</span>
        </label>
        {isValidNightDate(activeNightDate) ? (
          <p className={styles.nightSelected}>
            {formatMessageTemplate(messages.selectedNight, {
              date: formatObservationDateLabel(activeNightDate, timeZone, locale),
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
    <section aria-labelledby="tonight-summary-heading" className={styles.summary}>
      <div className={styles.summaryLead}>
        <p className={styles.sectionEyebrow}>{messages.heading}</p>
        <h2 className={styles.sectionTitle} id="tonight-summary-heading">
          {messages.heading}
        </h2>
        <p className={styles.summaryContext}>
          {formatMessageTemplate(messages.nightAndCollection, {
            collectionName,
            date: formatObservationDateLabel(nightDate, timeZone, locale),
          })}
          {" · "}
          {timeZone}
        </p>
      </div>
      <div>
        <dl className={styles.metricGrid}>
          <div className={styles.metric}>
            <dt>{messages.astronomicalDusk}</dt>
            <dd>
              {commonNight === null
                ? messages.unavailable
                : formatNightEvent(commonNight.astronomicalDusk, timeZone, locale, eventMessages)}
            </dd>
          </div>
          <div className={styles.metric}>
            <dt>{messages.astronomicalDawn}</dt>
            <dd>
              {commonNight === null
                ? messages.unavailable
                : formatNightEvent(commonNight.astronomicalDawn, timeZone, locale, eventMessages)}
            </dd>
          </div>
          <div className={styles.metric}>
            <dt>{messages.darkness}</dt>
            <dd>
              {darkness === undefined
                ? messages.calculating
                : darkness === null
                  ? messages.unavailableForNight
                  : messages.sunBelowEighteen}
            </dd>
          </div>
          <div className={styles.metric}>
            <dt>{messages.savedTargets}</dt>
            <dd>{formatLocaleNumber(targetCount, locale)}</dd>
          </div>
          <div className={styles.metric}>
            <dt>{messages.scientificallyAnalyzed}</dt>
            <dd>
              {summary === undefined
                ? messages.waiting
                : formatLocaleNumber(summary.scientificallyAnalyzedCount, locale)}
            </dd>
          </div>
          <div className={styles.metric}>
            <dt>{messages.aboveHorizon}</dt>
            <dd>
              {summary === undefined
                ? messages.waiting
                : formatLocaleNumber(summary.aboveHorizonCount, locale)}
            </dd>
          </div>
          <div className={styles.metric}>
            <dt>{messages.unavailableUnresolved}</dt>
            <dd>
              {summary === undefined
                ? messages.waiting
                : formatLocaleNumber(summary.unavailableOrUnresolvedCount, locale)}
            </dd>
          </div>
        </dl>
        {commonNight !== null && commonNight.astronomicalDarkness === null ? (
          <p className={styles.statusText} role="status">
            {messages.noDarkness}
          </p>
        ) : null}
      </div>
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
    <details className={styles.details}>
      <summary>{messages.detailsSummary}</summary>
      <dl className={styles.eventGrid}>
        <div>
          <dt>{messages.rise}</dt>
          <dd>{formatTargetEvent(target.targetEvents.rise, timeZone, locale, messages)}</dd>
        </div>
        <div>
          <dt>{messages.meridianTransit}</dt>
          <dd>{formatTargetEvent(target.targetEvents.transit, timeZone, locale, messages)}</dd>
        </div>
        <div>
          <dt>{messages.set}</dt>
          <dd>{formatTargetEvent(target.targetEvents.set, timeZone, locale, messages)}</dd>
        </div>
      </dl>
      <p className={styles.sourceLine}>
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
  if (target.moon === null) return <p className={styles.moonLine}>{messages.moonUnavailable}</p>;
  const moonHorizon = target.moon.position.altitude < 0 ? messages.moonBelow : messages.moonAbove;
  return (
    <p className={styles.moonLine}>
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
    return <p className={styles.weatherLine}>{messages.contextUnavailable}</p>;
  }
  return (
    <div className={styles.weatherFactsWrap} data-testid="tonight-weather-facts">
      <p className={styles.weatherLine}>
        {formatMessageTemplate(messages.peakSummary, {
          cloudCover: formatWeatherPercent(hour.cloudCover, locale, messages),
          precipitation: formatWeatherPercent(hour.precipitationProbability, locale, messages),
          time: formatObservationTime(hour.instant, timeZone, locale),
        })}
      </p>
      <details className={styles.details}>
        <summary>{messages.moreFacts}</summary>
        <dl className={styles.weatherFacts}>
          <div>
            <dt>{messages.visibilityLabel}</dt>
            <dd>{formatWeatherVisibility(hour.visibilityMeters, locale, messages)}</dd>
          </div>
          <div>
            <dt>{messages.humidityLabel}</dt>
            <dd>{formatWeatherPercent(hour.relativeHumidity, locale, messages)}</dd>
          </div>
          <div>
            <dt>{messages.windLabel}</dt>
            <dd>{formatWeatherWind(hour.windSpeedKmh, locale, messages)}</dd>
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
    <li className={styles.targetRow} data-testid="tonight-target-row">
      <div className={styles.targetTop}>
        <div>
          <div className={styles.targetIdentity}>
            <h3 className={styles.targetName}>
              <Link href={objectHref(target.item.slug)}>{target.item.canonical_name}</Link>
            </h3>
            <span className={styles.targetType}>{entityTypeMessages[target.item.entity_type]}</span>
          </div>
          <div className={styles.targetGeometry}>
            <p className={styles.targetPrimary}>
              {formatMessageTemplate(messages.target.highestAltitude, {
                altitude: formatAltitude(target.peak.altitude, locale, messages.target),
                time: formatObservationTime(target.peak.instant, timeZone, locale),
              })}
            </p>
            <p className={styles.targetSecondary}>
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
          </div>
          <EventDetails
            coordinateDisclosureMessages={coordinateDisclosureMessages}
            locale={locale}
            messages={messages.events}
            target={target}
            timeZone={timeZone}
          />
        </div>
        <Link className={SECONDARY_BUTTON_CLASS} href={plannerHref(target.item.slug, nightDate)}>
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
      className={styles.targetSection}
    >
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{title}</p>
        <h2
          className={styles.targetListTitle}
          id={`${secondary ? "tonight-below" : "tonight-above"}-heading`}
        >
          {title}
        </h2>
        <p className={styles.targetListDescription}>{description}</p>
      </div>
      <ol
        className={styles.targetList}
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
    <section aria-labelledby="tonight-unresolved-heading" className={styles.targetSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{messages.unresolvedTitle}</p>
        <h2 className={styles.targetListTitle} id="tonight-unresolved-heading">
          {messages.unresolvedTitle}
        </h2>
        <p className={styles.targetListDescription}>
          {formatCountMessage(messages.unresolvedSummary, targets.length, locale)}
        </p>
      </div>
      <div>
        <ul className={styles.stateList}>
          {targets.map((target) => (
            <li className={styles.stateRow} key={target.item.slug}>
              <div>
                <p className={styles.stateName}>{target.item.canonical_name}</p>
                <p className={styles.stateReason}>
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
                className={SECONDARY_BUTTON_CLASS}
                href={plannerHref(target.item.slug, nightDate)}
              >
                {target.kind === "multiple-coordinate-sources"
                  ? messages.inspectPlanner
                  : messages.openPlanner}
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.authoritativeNote}>{messages.authoritativeNote}</p>
      </div>
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
    <section aria-labelledby="tonight-no-darkness-targets-heading" className={styles.targetSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{messages.noDarknessTitle}</p>
        <h2 className={styles.targetListTitle} id="tonight-no-darkness-targets-heading">
          {messages.noDarknessTitle}
        </h2>
        <p className={styles.targetListDescription}>{messages.noDarknessDescription}</p>
      </div>
      <ul className={styles.stateList}>
        {targets.map((target) => (
          <li className={styles.stateRow} key={target.item.slug}>
            <span className={styles.stateName}>{target.item.canonical_name}</span>
            <Link
              className={SECONDARY_BUTTON_CLASS}
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
    <div className={styles.weatherAttribution}>
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
        <a href={WEATHER_PROVIDER_URL} rel="noreferrer" target="_blank">
          {formatMessageTemplate(messages.providerLink, { provider: WEATHER_PROVIDER_NAME })}
        </a>{" "}
        ·{" "}
        <a href={WEATHER_PROVIDER_LICENSE_URL} rel="noreferrer" target="_blank">
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
    <section aria-labelledby="tonight-weather-heading" className={styles.weather}>
      <div className={styles.weatherIntro}>
        <h3 className={styles.weatherTitle} id="tonight-weather-heading">
          {messages.heading}
        </h3>
        <p>{messages.intro}</p>
      </div>
      <div className={styles.weatherBody}>
        {weather.availability !== "allowed" ? (
          <p className={styles.weatherState}>{messages.dateUnavailable}</p>
        ) : weather.status === "idle" ? (
          <div className={styles.weatherState}>
            <p>
              {formatMessageTemplate(messages.consentPrompt, {
                digits: formatLocaleNumber(2, locale),
                provider: WEATHER_PROVIDER_NAME,
              })}
            </p>
            <div className={styles.actionRow}>
              <button className={PRIMARY_BUTTON_CLASS} onClick={weather.enable} type="button">
                {messages.loadAction}
              </button>
            </div>
          </div>
        ) : weather.status === "loading" ? (
          <p aria-live="polite" className={styles.weatherState} role="status">
            {messages.loading}
          </p>
        ) : weather.status === "unavailable" ? (
          <div className={styles.weatherState}>
            <p role="alert">{messages.failure}</p>
            <div className={styles.actionRow}>
              <button className={SECONDARY_BUTTON_CLASS} onClick={weather.retry} type="button">
                {messages.retry}
              </button>
            </div>
          </div>
        ) : weather.forecast !== undefined ? (
          <p aria-live="polite" className={styles.weatherState} role="status">
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
      </div>
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
      <p aria-live="polite" className={styles.statusPanel} role="status">
        {formatCountMessage(messages.analysis.loading, detailLoad.total, locale, {
          completed: formatLocaleNumber(detailLoad.completed, locale),
        })}
      </p>
    );
  }
  if (analysis === null) {
    return (
      <p aria-live="polite" className={styles.statusPanel} role="status">
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
    <div className={styles.analysisStack}>
      {hasCatalogueFailures ? (
        <div className={styles.catalogueFailure} role="status">
          <p>{messages.analysis.catalogueFailure}</p>
          <div className={styles.actionRow}>
            <button className={SECONDARY_BUTTON_CLASS} onClick={onRetry} type="button">
              {messages.analysis.retryCatalogue}
            </button>
          </div>
        </div>
      ) : null}
      {analysis.night.astronomicalDarkness !== null ? (
        <p className={styles.orderingExplanation} id="tonight-ordering-explanation">
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
        <p className={styles.statusPanel}>{messages.analysis.emptyOrdering}</p>
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
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.header.eyebrow}</p>
          <h1 className={styles.title}>{messages.header.title}</h1>
        </div>
        <p className={styles.intro}>{messages.header.intro}</p>
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
              className={styles.emptyState}
            >
              <h2 id="tonight-empty-collection-heading">{messages.emptyCollection.title}</h2>
              <p>{messages.emptyCollection.description}</p>
              <Link
                className={SECONDARY_BUTTON_CLASS}
                href={`/collections/${selectedCollection.id}`}
              >
                {messages.emptyCollection.manageAction}
              </Link>
            </section>
          ) : location === null ? (
            <section aria-live="polite" className={styles.statusPanel}>
              <h2>{messages.locationRequired.title}</h2>
              <p>{messages.locationRequired.description}</p>
            </section>
          ) : !isValidNightDate(activeNightDate) ? (
            <section aria-live="polite" className={styles.statusPanel}>
              <h2>{messages.invalidNight.title}</h2>
              <p>{messages.invalidNight.description}</p>
            </section>
          ) : detailLoad !== null ? (
            <section aria-labelledby="tonight-results-heading" className={styles.results}>
              <div className={styles.resultsHeader}>
                <div>
                  <h2 className={styles.resultsTitle} id="tonight-results-heading">
                    {messages.resultsHeader.heading}
                  </h2>
                  <p className={styles.resultsSummary}>{messages.resultsHeader.summary}</p>
                </div>
                <label className={styles.sortLabel} htmlFor="tonight-sort">
                  <span>{messages.resultsHeader.orderBy}</span>
                  <select
                    className={styles.select}
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
