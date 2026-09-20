import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import SatellitesPage, { createSatellitesMetadata } from "../../../now/satellites/route-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = createSatellitesMetadata(enMessages.spaceNow.satellites);

export default function EnglishSatellitesPage() {
  return <SatellitesPage locale={DEFAULT_LOCALE} messages={enMessages.spaceNow.satellites} />;
}
