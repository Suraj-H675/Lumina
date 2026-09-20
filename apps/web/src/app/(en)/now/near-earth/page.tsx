import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import NearEarthPage, { createNearEarthMetadata } from "../../../now/near-earth/route-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = createNearEarthMetadata(enMessages.spaceNow.nearEarth);

export default function EnglishNearEarthPage() {
  return (
    <NearEarthPage
      locale={DEFAULT_LOCALE}
      messages={enMessages.spaceNow.nearEarth}
      retrievalMessages={enMessages.spaceNow.retrieval}
    />
  );
}
