import { enMessages } from "../../../../lib/i18n/messages/en";
import SeasonsSimulatorPage, { metadata } from "../../../lab/seasons-simulator/route-page";

export const dynamic = "force-dynamic";
export { metadata };

type EnglishSeasonsSimulatorPageProps = Omit<
  Parameters<typeof SeasonsSimulatorPage>[0],
  "presentationModeMessages"
>;

export default function EnglishSeasonsSimulatorPage(props: EnglishSeasonsSimulatorPageProps) {
  return <SeasonsSimulatorPage {...props} presentationModeMessages={enMessages.presentationMode} />;
}
