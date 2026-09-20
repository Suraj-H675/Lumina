import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import CollectionsPage, { createCollectionsMetadata } from "../../collections/route-page";

export const metadata = createCollectionsMetadata(enMessages.collections.metadata);

export default function EnglishCollectionsPage() {
  return <CollectionsPage locale={DEFAULT_LOCALE} messages={enMessages.collections} />;
}
