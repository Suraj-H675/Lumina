import { collectionSaveMessageSlice } from "../../../lib/collections-messages";
import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import ComparePage, { generateMetadata } from "../../compare/route-page";

export { generateMetadata };

const collectionSaveMessages = collectionSaveMessageSlice(enMessages.collections);

export default function EnglishComparePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>) {
  return (
    <ComparePage
      collectionSaveMessages={collectionSaveMessages}
      locale={DEFAULT_LOCALE}
      searchParams={searchParams}
    />
  );
}
