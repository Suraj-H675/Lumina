import { collectionSaveMessageSlice } from "../../../../lib/collections-messages";
import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import ObjectPage, { generateMetadata } from "../../../objects/[slug]/route-page";

export { generateMetadata };

const collectionSaveMessages = collectionSaveMessageSlice(enMessages.collections);

export default function EnglishObjectPage({
  params,
}: Readonly<{ params: Promise<Readonly<{ slug: string }>> }>) {
  return (
    <ObjectPage
      collectionSaveMessages={collectionSaveMessages}
      journalEntryMessages={enMessages.journal.entry}
      locale={DEFAULT_LOCALE}
      params={params}
    />
  );
}
