import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import JournalPage, { createJournalMetadata } from "../../journal/route-page";

export const metadata = createJournalMetadata(enMessages.journal);

export default function EnglishJournalPage() {
  return <JournalPage locale={DEFAULT_LOCALE} messages={enMessages.journal} />;
}
