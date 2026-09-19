import { enMessages } from "../../../../../lib/i18n/messages/en";
import InvalidScaleExplorerStatePage, {
  metadata,
} from "../../../../lab/scale-explorer/invalid-state/route-page";

export { metadata };

export default function EnglishInvalidScaleExplorerStatePage() {
  return <InvalidScaleExplorerStatePage presentationModeMessages={enMessages.presentationMode} />;
}
