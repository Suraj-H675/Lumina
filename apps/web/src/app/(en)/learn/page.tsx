import { enMessages } from "../../../lib/i18n/messages/en";
import { LearnLandingRoute, learnLandingMetadata } from "../../learn/route-page";

export const metadata = learnLandingMetadata(enMessages.learn.landing);

export default function EnglishLearnLandingPage() {
  return <LearnLandingRoute messages={enMessages.learn.landing} />;
}
