import { enMessages } from "../../../lib/i18n/messages/en";
import OfflinePage, { createOfflineMetadata } from "../../offline/route-page";

export const metadata = createOfflineMetadata(enMessages.offline.landing);

export default function EnglishOfflinePage() {
  return <OfflinePage messages={enMessages.offline.landing} />;
}
