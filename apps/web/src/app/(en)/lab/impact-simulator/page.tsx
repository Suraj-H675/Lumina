import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import ImpactSimulatorPage, {
  createImpactSimulatorMetadata,
} from "../../../lab/impact-simulator/route-page";

export const dynamic = "force-dynamic";

export const metadata = createImpactSimulatorMetadata(enMessages.simulationLabs.impactSimulator);

type EnglishImpactSimulatorPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishImpactSimulatorPage(props: EnglishImpactSimulatorPageProps) {
  return (
    <ImpactSimulatorPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.impactSimulator}
    />
  );
}
