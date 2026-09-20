import { collectionSaveMessageSlice } from "../../../lib/collections-messages";
import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import ExplorePage, { createExploreMetadata } from "../../explore/route-page";

export const metadata = createExploreMetadata(enMessages.explore);

const collectionSaveMessages = collectionSaveMessageSlice(enMessages.collections);

export default function EnglishExplorePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<{ cursor?: string | string[]; q?: string | string[] }>>;
}>) {
  return (
    <ExplorePage
      catalogueSearchMessages={enMessages.catalogueSearch}
      collectionSaveMessages={collectionSaveMessages}
      locale={DEFAULT_LOCALE}
      messages={enMessages.explore}
      searchParams={searchParams}
    />
  );
}
