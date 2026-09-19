import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import ParticipatePage, { createParticipateMetadata } from "../../participate/route-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = createParticipateMetadata(enMessages.participate);

export default function EnglishParticipatePage() {
  return <ParticipatePage locale={DEFAULT_LOCALE} messages={enMessages.participate} />;
}
