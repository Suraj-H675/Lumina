"use client";

import { useSyncExternalStore } from "react";

import { formatLocaleDateTime } from "../i18n/format";
import type { PublishedLocale } from "../i18n/locales";
import { localDateString, localInstantForNightTime } from "./domain";

export function useBrowserDate(initialDate: string | undefined): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => initialDate ?? localDateString(new Date()),
    () => initialDate ?? "",
  );
}

export function useBrowserTimeZone(): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
}

export function formatObservationDateLabel(
  nightDate: string,
  timeZone: string,
  locale: PublishedLocale,
): string {
  const instant = localInstantForNightTime(nightDate, "12:00");
  if (instant === null) return nightDate;
  return formatLocaleDateTime(instant, locale, {
    day: "numeric",
    month: "short",
    timeZone,
    year: "numeric",
  });
}

export function formatObservationTime(
  instant: Date,
  timeZone: string,
  locale: PublishedLocale,
): string {
  return formatLocaleDateTime(instant, locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

export function formatObservationShortTime(
  instant: Date,
  timeZone: string,
  locale: PublishedLocale,
): string {
  return formatLocaleDateTime(instant, locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}
