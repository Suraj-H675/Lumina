"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  formatLocaleDateTime,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SavedObservationPlanMessages } from "../lib/i18n/messages/types";
import {
  SavedPlanStorageError,
  deleteSavedObservationPlan,
  getSavedObservationPlan,
} from "../lib/journal/database";
import type { SavedObservationPlan } from "../lib/observation/saved-plan";
import routeStyles from "./route-state.module.css";
import styles from "./saved-observation-plan-view.module.css";

type LoadedState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "loaded"; plan: SavedObservationPlan }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "corrupted" }>
  | Readonly<{ kind: "error" }>
  | Readonly<{ kind: "deleted" }>;

function formatInstant(instant: string, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(new Date(instant), locale, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone,
    timeZoneName: "short",
    year: "numeric",
  });
}

function formatNightDate(value: string, locale: PublishedLocale): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return formatLocaleDateTime(date, locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function formatEvent(
  event:
    | SavedObservationPlan["planner"]["night"]["sunset"]
    | SavedObservationPlan["planner"]["target_events"]["rise"],
  timeZone: string,
  locale: PublishedLocale,
  messages: SavedObservationPlanMessages["events"],
): string {
  if (event.kind === "time") return formatInstant(event.instant_utc, timeZone, locale);
  if (event.kind === "circumpolar") return messages.circumpolar;
  if (event.kind === "never-rises") return messages.neverRises;
  if (event.kind === "not-during-night") return messages.notDuringNight;
  return messages.unavailable;
}

function classifyReadFailure(error: unknown): LoadedState {
  if (error instanceof SavedPlanStorageError) {
    if (error.reason === "invalid-plan") return { kind: "invalid" };
    if (error.reason === "storage-unavailable") return { kind: "unavailable" };
    if (error.reason === "storage-corrupted") return { kind: "corrupted" };
  }
  return { kind: "error" };
}

function EmptySavedPlanState({
  kind,
  messages,
}: Readonly<{
  kind: Exclude<LoadedState["kind"], "loaded" | "loading">;
  messages: SavedObservationPlanMessages;
}>) {
  const content = messages.states[kind === "error" ? "error" : kind];

  return (
    <section className={routeStyles.state}>
      <h1 className={routeStyles.title}>{content.heading}</h1>
      <p className={routeStyles.description}>{content.body}</p>
      <Link className={routeStyles.action} href="/observe">
        {messages.actions.openPlanner}
      </Link>
    </section>
  );
}

export function SavedObservationPlanView({
  locale,
  messages,
  savedId,
}: Readonly<{
  locale: PublishedLocale;
  messages: SavedObservationPlanMessages;
  savedId: string;
}>) {
  const [state, setState] = useState<LoadedState>({ kind: "loading" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getSavedObservationPlan(savedId)
      .then((plan) => {
        if (!cancelled) setState(plan === null ? { kind: "missing" } : { kind: "loaded", plan });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(classifyReadFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [savedId]);

  const deletePlan = useCallback(async () => {
    setDeleteError("");
    try {
      await deleteSavedObservationPlan(savedId);
      setState({ kind: "deleted" });
      setConfirmDelete(false);
    } catch {
      setDeleteError(messages.delete.failure);
    }
  }, [messages.delete.failure, savedId]);

  if (state.kind === "loading") {
    return (
      <section
        aria-live="polite"
        className={`${routeStyles.state} ${routeStyles.loading}`}
        role="status"
      >
        <h1 className={routeStyles.title}>{messages.loading.title}</h1>
        <p className={routeStyles.description}>{messages.loading.description}</p>
        <div aria-hidden="true" className={routeStyles.loadingRail} />
      </section>
    );
  }
  if (state.kind !== "loaded") {
    return <EmptySavedPlanState kind={state.kind} messages={messages} />;
  }

  const { plan } = state;
  const selected = plan.planner.selected;
  const max = plan.planner.max_during_darkness;
  const source = plan.coordinate_source;
  const repeatHref = `/observe?object=${encodeURIComponent(plan.target.slug)}&date=${encodeURIComponent(plan.night_date)}`;

  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{plan.target.canonical_name}</h1>
          <p className={styles.intro}>{messages.snapshotDescription}</p>
        </div>
        <p className={styles.heroMeta}>
          {formatMessageTemplate(messages.snapshotSummary, {
            nightDate: formatNightDate(plan.night_date, locale),
            savedAt: formatInstant(plan.created_at, plan.time_zone, locale),
            timeZone: plan.time_zone,
          })}
        </p>
      </header>

      <section aria-labelledby="saved-observer-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>01</p>
          <h2 className={styles.sectionTitle} id="saved-observer-heading">
            {messages.observer.title}
          </h2>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.factGrid}>
            <div className={styles.fact}>
              <p className={styles.factLabel}>{messages.observer.locationLabel}</p>
              <p className={`${styles.factValue} ${styles.dataValue}`}>
                {formatMessageTemplate(messages.observer.locationValue, {
                  latitude: formatLocaleNumber(plan.observer.latitude_deg, locale, {
                    maximumFractionDigits: 6,
                    minimumFractionDigits: 6,
                  }),
                  longitude: formatLocaleNumber(plan.observer.longitude_deg, locale, {
                    maximumFractionDigits: 6,
                    minimumFractionDigits: 6,
                  }),
                })}
              </p>
              <p className={styles.factNote}>{messages.observer.storedLocal}</p>
            </div>
            <div className={styles.fact}>
              <p className={styles.factLabel}>{messages.observer.selectedTimeLabel}</p>
              <p className={styles.factValue}>
                {formatInstant(plan.selected_time_utc, plan.time_zone, locale)}
              </p>
            </div>
            <div className={styles.fact}>
              <p className={styles.factLabel}>{messages.observer.skyPositionLabel}</p>
              <p className={`${styles.factValue} ${styles.dataValue}`}>
                {formatMessageTemplate(messages.observer.altitudeValue, {
                  altitude: formatLocaleNumber(selected.position.altitude_deg, locale, {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: 1,
                  }),
                })}
              </p>
              <p className={`${styles.factValue} ${styles.dataValue}`}>
                {formatMessageTemplate(messages.observer.azimuthValue, {
                  azimuth: formatLocaleNumber(selected.position.azimuth_deg, locale, {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: 1,
                  }),
                  compass: selected.position.compass,
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="saved-night-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>02</p>
          <h2 className={styles.sectionTitle} id="saved-night-heading">
            {messages.night.title}
          </h2>
        </div>
        <div className={styles.sectionBody}>
          {max !== null ? (
            <p className={styles.nightSummary}>
              {formatMessageTemplate(messages.night.highestAltitude, {
                altitude: formatLocaleNumber(max.altitude_deg, locale, {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                }),
                instant: formatInstant(max.instant_utc, plan.time_zone, locale),
              })}
            </p>
          ) : (
            <p className={styles.nightSummary}>{messages.night.darknessUnavailable}</p>
          )}
          <dl className={styles.eventGrid}>
            {(
              [
                [messages.events.rise, plan.planner.target_events.rise],
                [messages.events.transit, plan.planner.target_events.transit],
                [messages.events.set, plan.planner.target_events.set],
              ] as const
            ).map(([label, event]) => (
              <div className={styles.eventFact} key={label}>
                <dt className={styles.factLabel}>{label}</dt>
                <dd className={styles.factValue}>
                  {formatEvent(event, plan.time_zone, locale, messages.events)}
                </dd>
              </div>
            ))}
          </dl>
          <dl className={styles.nightGrid}>
            {(
              [
                [messages.events.sunsetGeometric, plan.planner.night.sunset],
                [messages.events.astronomicalDusk, plan.planner.night.astronomical_dusk],
                [messages.events.astronomicalDawn, plan.planner.night.astronomical_dawn],
                [messages.events.sunriseGeometric, plan.planner.night.sunrise],
              ] as const
            ).map(([label, event]) => (
              <div className={styles.eventFact} key={label}>
                <dt className={styles.factLabel}>{label}</dt>
                <dd className={styles.factValue}>
                  {formatEvent(event, plan.time_zone, locale, messages.events)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="saved-samples-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>03</p>
          <h2 className={styles.sectionTitle} id="saved-samples-heading">
            {messages.samples.title}
          </h2>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.tableFrame}>
            <table aria-label={messages.samples.label} className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{messages.samples.savedInstant}</th>
                  <th scope="col">{messages.samples.altitudeGeometric}</th>
                </tr>
              </thead>
              <tbody>
                {plan.planner.altitude_samples.map((sample) => (
                  <tr key={sample.instant_utc}>
                    <td>{formatInstant(sample.instant_utc, plan.time_zone, locale)}</td>
                    <td className={styles.dataValue}>
                      {formatLocaleNumber(sample.altitude_deg, locale, {
                        maximumFractionDigits: 1,
                        minimumFractionDigits: 1,
                      })}
                      °
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="saved-source-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>04</p>
          <h2 className={styles.sectionTitle} id="saved-source-heading">
            {messages.source.title}
          </h2>
        </div>
        <div className={`${styles.sectionBody} ${styles.sourceBlock}`}>
          <p>
            {formatMessageTemplate(messages.source.datasetSummary, {
              datasetName: source.dataset_name,
              providerName: source.provider_name,
              referenceEpoch: formatLocaleNumber(source.reference_epoch, locale, {
                maximumFractionDigits: 1,
                minimumFractionDigits: 1,
              }),
              referenceEpochLabel: messages.source.referenceEpochLabel,
              releaseVersion: source.dataset_release_version,
              sourceRecordId: source.source_record_id,
              sourceRecordLabel: messages.source.sourceRecordLabel,
            })}
          </p>
          <p>
            astronomy-engine {plan.model.astronomy_engine_version} ·{" "}
            {formatMessageTemplate(messages.source.calculationDescription, {
              solarAltitude: formatLocaleNumber(
                plan.model.astronomical_darkness_solar_altitude_deg,
                locale,
              ),
            })}
          </p>
        </div>
      </section>

      <div className={styles.actions}>
        <Link className={styles.action} href={repeatHref}>
          {messages.actions.planAgain}
        </Link>
        <button
          className={styles.dangerAction}
          onClick={() => setConfirmDelete(true)}
          type="button"
        >
          {messages.actions.deletePlan}
        </button>
      </div>

      {confirmDelete ? (
        <section aria-labelledby="delete-saved-plan-heading" className={styles.deletePanel}>
          <h2 id="delete-saved-plan-heading">{messages.delete.title}</h2>
          <p>{messages.delete.description}</p>
          <div className={styles.deleteActions}>
            <button className={styles.dangerAction} onClick={() => void deletePlan()} type="button">
              {messages.actions.confirmDelete}
            </button>
            <button className={styles.action} onClick={() => setConfirmDelete(false)} type="button">
              {messages.actions.cancelDelete}
            </button>
          </div>
        </section>
      ) : null}
      {deleteError !== "" ? (
        <p className={styles.error} role="alert">
          {deleteError}
        </p>
      ) : null}
    </article>
  );
}
