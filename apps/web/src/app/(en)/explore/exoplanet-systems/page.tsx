import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import ExoplanetSystemsPage, {
  createExoplanetSystemsMetadata,
} from "../../../explore/exoplanet-systems/route-page";

export const metadata = createExoplanetSystemsMetadata(enMessages.explore.exoplanetSystems);

export default function EnglishExoplanetSystemsPage() {
  return (
    <ExoplanetSystemsPage locale={DEFAULT_LOCALE} messages={enMessages.explore.exoplanetSystems} />
  );
}
