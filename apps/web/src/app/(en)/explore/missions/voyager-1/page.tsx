import { DEFAULT_LOCALE } from "../../../../../lib/i18n/locales";
import { enMessages } from "../../../../../lib/i18n/messages/en";
import VoyagerOnePage, {
  createVoyagerMetadata,
} from "../../../../explore/missions/voyager-1/route-page";

export const metadata = createVoyagerMetadata(enMessages.explore.voyager);

export default function EnglishVoyagerOnePage() {
  return <VoyagerOnePage locale={DEFAULT_LOCALE} messages={enMessages.explore.voyager} />;
}
