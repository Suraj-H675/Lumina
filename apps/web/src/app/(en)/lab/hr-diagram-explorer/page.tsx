import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import HRDiagramExplorerPage, {
  createHRDiagramExplorerMetadata,
} from "../../../lab/hr-diagram-explorer/route-page";

export const dynamic = "force-dynamic";
export const metadata = createHRDiagramExplorerMetadata(
  enMessages.simulationLabs.hrDiagramExplorer,
);

type EnglishHRDiagramExplorerPageProps = Omit<
  Parameters<typeof HRDiagramExplorerPage>[0],
  "locale" | "messages" | "presentationModeMessages"
>;

export default function EnglishHRDiagramExplorerPage(props: EnglishHRDiagramExplorerPageProps) {
  return (
    <HRDiagramExplorerPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.hrDiagramExplorer}
      presentationModeMessages={enMessages.presentationMode}
    />
  );
}
