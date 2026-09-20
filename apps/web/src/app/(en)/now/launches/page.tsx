import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import LaunchesPage, { createLaunchesMetadata } from "../../../now/launches/route-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = createLaunchesMetadata(enMessages.spaceNow.launches);

export default function EnglishLaunchesPage() {
  return <LaunchesPage locale={DEFAULT_LOCALE} messages={enMessages.spaceNow.launches} />;
}
