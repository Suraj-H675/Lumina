import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import SeasonsSimulatorPage, {
  createSeasonsSimulatorMetadata,
} from "../../../lab/seasons-simulator/route-page";

export const dynamic = "force-dynamic";
export const metadata = createSeasonsSimulatorMetadata(enMessages.simulationLabs.seasonsSimulator);

type EnglishSeasonsSimulatorPageProps = Omit<
  Parameters<typeof SeasonsSimulatorPage>[0],
  "locale" | "messages" | "presentationModeMessages"
>;

export default function EnglishSeasonsSimulatorPage(props: EnglishSeasonsSimulatorPageProps) {
  return (
    <SeasonsSimulatorPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.seasonsSimulator}
      presentationModeMessages={enMessages.presentationMode}
    />
  );
}
