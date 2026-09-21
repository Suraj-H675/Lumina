import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import EclipseSimulatorPage, {
  createEclipseSimulatorMetadata,
} from "../../../lab/eclipse-simulator/route-page";

export const dynamic = "force-dynamic";

export const metadata = createEclipseSimulatorMetadata(enMessages.simulationLabs.eclipseSimulator);

type EnglishEclipseSimulatorPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishEclipseSimulatorPage(props: EnglishEclipseSimulatorPageProps) {
  return (
    <EclipseSimulatorPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.eclipseSimulator}
    />
  );
}
