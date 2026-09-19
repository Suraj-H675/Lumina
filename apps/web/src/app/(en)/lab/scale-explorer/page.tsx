import { enMessages } from "../../../../lib/i18n/messages/en";
import ScaleExplorerPage, { metadata } from "../../../lab/scale-explorer/route-page";

export { metadata };

export default function EnglishScaleExplorerPage() {
  return <ScaleExplorerPage presentationModeMessages={enMessages.presentationMode} />;
}
