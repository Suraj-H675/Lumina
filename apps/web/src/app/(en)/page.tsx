import { enMessages } from "../../lib/i18n/messages/en";
import { MissionControlRoute, missionControlMetadata } from "../route-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = missionControlMetadata(enMessages.missionControl);

export default function EnglishMissionControlPage() {
  return <MissionControlRoute messages={enMessages.missionControl} />;
}
