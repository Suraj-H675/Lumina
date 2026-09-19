import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import OfflineStoragePage, {
  createOfflineStorageMetadata,
} from "../../../offline/storage/route-page";

export const metadata = createOfflineStorageMetadata(enMessages.offline.storage);

export default function EnglishOfflineStoragePage() {
  return <OfflineStoragePage locale={DEFAULT_LOCALE} messages={enMessages.offline.storage} />;
}
