import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import ObservePage, { createObserveMetadata } from "../../observe/route-page";

export const metadata = createObserveMetadata(enMessages.observationPlanner.metadata);

export default function EnglishObservePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>) {
  return (
    <ObservePage
      catalogueSearchMessages={enMessages.catalogueSearch}
      coordinateDisclosureMessages={enMessages.coordinateDisclosure}
      journalEntryMessages={enMessages.journal.entry}
      plannerLocale={DEFAULT_LOCALE}
      plannerMessages={enMessages.observationPlanner}
      savedPlanLocale={DEFAULT_LOCALE}
      savedPlanMessages={enMessages.savedObservationPlan}
      searchParams={searchParams}
    />
  );
}
