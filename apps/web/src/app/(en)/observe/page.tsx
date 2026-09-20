import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import ObservePage, { metadata } from "../../observe/route-page";

export { metadata };

export default function EnglishObservePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>) {
  return (
    <ObservePage
      savedPlanLocale={DEFAULT_LOCALE}
      savedPlanMessages={enMessages.savedObservationPlan}
      searchParams={searchParams}
    />
  );
}
