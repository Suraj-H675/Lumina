import { collectionSaveMessageSlice } from "../../../../lib/collections-messages";
import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import ObjectPage, { createObjectMetadata } from "../../../objects/[slug]/route-page";

export function generateMetadata({
  params,
}: Readonly<{ params: Promise<Readonly<{ slug: string }>> }>) {
  return createObjectMetadata({ params }, enMessages.object.metadata, enMessages.entityTypes);
}

const collectionSaveMessages = collectionSaveMessageSlice(enMessages.collections);

export default function EnglishObjectPage({
  params,
}: Readonly<{ params: Promise<Readonly<{ slug: string }>> }>) {
  return (
    <ObjectPage
      collectionSaveMessages={collectionSaveMessages}
      entityTypeMessages={enMessages.entityTypes}
      journalEntryMessages={enMessages.journal.entry}
      locale={DEFAULT_LOCALE}
      messages={enMessages.object}
      params={params}
    />
  );
}
