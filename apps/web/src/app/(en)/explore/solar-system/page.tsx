import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import SolarSystemPage, {
  createSolarSystemDistanceMetadata,
} from "../../../explore/solar-system/route-page";

export const metadata = createSolarSystemDistanceMetadata(enMessages.explore.solarSystemDistance);

export default function EnglishSolarSystemPage() {
  return (
    <SolarSystemPage locale={DEFAULT_LOCALE} messages={enMessages.explore.solarSystemDistance} />
  );
}
