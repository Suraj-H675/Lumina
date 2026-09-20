import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import IdentifyPage, { createIdentifyMetadata } from "../../identify/route-page";

export const dynamic = "force-dynamic";

export const metadata = createIdentifyMetadata(enMessages.identify);

export default function EnglishIdentifyPage() {
  return <IdentifyPage locale={DEFAULT_LOCALE} messages={enMessages.identify} />;
}
