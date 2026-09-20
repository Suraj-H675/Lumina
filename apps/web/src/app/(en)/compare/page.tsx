import { collectionSaveMessageSlice } from "../../../lib/collections-messages";
import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import ComparePage, { createCompareMetadata } from "../../compare/route-page";

export function generateMetadata({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>) {
  return createCompareMetadata({ searchParams }, enMessages.compare.metadata);
}

const collectionSaveMessages = collectionSaveMessageSlice(enMessages.collections);

export default function EnglishComparePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>) {
  return (
    <ComparePage
      collectionSaveMessages={collectionSaveMessages}
      entityTypeMessages={enMessages.entityTypes}
      locale={DEFAULT_LOCALE}
      messages={enMessages.compare}
      searchParams={searchParams}
    />
  );
}
