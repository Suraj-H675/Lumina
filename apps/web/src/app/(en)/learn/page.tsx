import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import { LearnLandingRoute, learnLandingMetadata } from "../../learn/route-page";

export const metadata = learnLandingMetadata(enMessages.learn.landing);

export default function EnglishLearnLandingPage() {
  return <LearnLandingRoute locale={DEFAULT_LOCALE} messages={enMessages.learn} />;
}
