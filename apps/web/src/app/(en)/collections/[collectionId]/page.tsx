import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import CollectionPage, {
  createCollectionDetailMetadata,
} from "../../../collections/[collectionId]/route-page";

export const metadata = createCollectionDetailMetadata(enMessages.collections.metadata);

export default function EnglishCollectionPage({
  params,
}: Readonly<{ params: Promise<Readonly<{ collectionId: string }>> }>) {
  return (
    <CollectionPage
      entityTypeMessages={enMessages.entityTypes}
      locale={DEFAULT_LOCALE}
      messages={enMessages.collections}
      params={params}
    />
  );
}
