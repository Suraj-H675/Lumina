import { collectionSaveMessageSlice } from "../../../lib/collections-messages";
import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import ExplorePage, { metadata } from "../../explore/route-page";

export { metadata };

const collectionSaveMessages = collectionSaveMessageSlice(enMessages.collections);

export default function EnglishExplorePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<{ cursor?: string | string[]; q?: string | string[] }>>;
}>) {
  return (
    <ExplorePage
      collectionSaveMessages={collectionSaveMessages}
      locale={DEFAULT_LOCALE}
      searchParams={searchParams}
    />
  );
}
