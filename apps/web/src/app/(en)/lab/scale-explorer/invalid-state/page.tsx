import { DEFAULT_LOCALE } from "../../../../../lib/i18n/locales";
import { enMessages } from "../../../../../lib/i18n/messages/en";
import InvalidScaleExplorerStatePage, {
  createInvalidScaleExplorerStateMetadata,
} from "../../../../lab/scale-explorer/invalid-state/route-page";

export const metadata = createInvalidScaleExplorerStateMetadata(
  enMessages.simulationLabs.scaleExplorer,
);

export default function EnglishInvalidScaleExplorerStatePage() {
  return (
    <InvalidScaleExplorerStatePage
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.scaleExplorer}
      presentationModeMessages={enMessages.presentationMode}
    />
  );
}
