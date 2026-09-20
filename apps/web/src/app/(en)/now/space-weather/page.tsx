import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import SpaceWeatherPage, {
  createSpaceWeatherMetadata,
} from "../../../now/space-weather/route-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = createSpaceWeatherMetadata(enMessages.spaceNow.spaceWeather);

export default function EnglishSpaceWeatherPage() {
  return <SpaceWeatherPage locale={DEFAULT_LOCALE} messages={enMessages.spaceNow.spaceWeather} />;
}
