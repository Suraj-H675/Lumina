import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import ScaleExplorerPage, {
  createScaleExplorerMetadata,
} from "../../../lab/scale-explorer/route-page";

export const metadata = createScaleExplorerMetadata(enMessages.simulationLabs.scaleExplorer);

export default function EnglishScaleExplorerPage() {
  return (
    <ScaleExplorerPage
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.scaleExplorer}
      presentationModeMessages={enMessages.presentationMode}
    />
  );
}
