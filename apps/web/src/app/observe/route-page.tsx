import type { Metadata } from "next";

import { ObserveExperience } from "../../components/observe-experience";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type {
  JournalEntryMessages,
  ObservationPlannerMessages,
  SavedObservationPlanMessages,
} from "../../lib/i18n/messages/types";
import { isValidNightDate } from "../../lib/observation/domain";
import { resolveWebApiOrigin } from "../../lib/server/api-origin";
import { loadObjectBySlugPerRequest } from "../../lib/server/catalog";

export function createObserveMetadata(messages: ObservationPlannerMessages["metadata"]): Metadata {
  return {
    description: messages.description,
    title: messages.title,
  };
}

type ObservePageProps = Readonly<{
  journalEntryMessages: JournalEntryMessages;
  plannerLocale: PublishedLocale;
  plannerMessages: ObservationPlannerMessages;
  savedPlanLocale: PublishedLocale;
  savedPlanMessages: SavedObservationPlanMessages;
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ObservePage({
  journalEntryMessages,
  plannerLocale,
  plannerMessages,
  savedPlanLocale,
  savedPlanMessages,
  searchParams,
}: ObservePageProps) {
  const params = await searchParams;
  const hasSavedParam = Object.prototype.hasOwnProperty.call(params, "saved");
  const initialSavedId = hasSavedParam ? (firstValue(params.saved)?.trim() ?? "") : undefined;
  const rawSlug = firstValue(params.object)?.trim().toLowerCase() ?? "";
  const slug = rawSlug.length > 0 ? rawSlug : null;
  const rawDate = firstValue(params.date);
  const initialDate = rawDate !== undefined && isValidNightDate(rawDate) ? rawDate : undefined;
  const outcome = hasSavedParam || slug === null ? null : await loadObjectBySlugPerRequest(slug);
  const configured = resolveWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  return (
    <ObserveExperience
      {...(apiOrigin === undefined ? {} : { apiOrigin })}
      detail={outcome?.kind === "ok" ? outcome.detail : null}
      {...(initialDate === undefined ? {} : { initialDate })}
      {...(initialSavedId === undefined ? {} : { initialSavedId })}
      journalEntryMessages={journalEntryMessages}
      locale={plannerLocale}
      messages={plannerMessages}
      savedPlanLocale={savedPlanLocale}
      savedPlanMessages={savedPlanMessages}
      slug={hasSavedParam ? null : slug}
      targetUnavailable={outcome !== null && outcome.kind !== "ok"}
    />
  );
}
