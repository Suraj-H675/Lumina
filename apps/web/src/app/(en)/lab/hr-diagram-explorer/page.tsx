import { enMessages } from "../../../../lib/i18n/messages/en";
import HRDiagramExplorerPage, { metadata } from "../../../lab/hr-diagram-explorer/route-page";

export const dynamic = "force-dynamic";
export { metadata };

type EnglishHRDiagramExplorerPageProps = Omit<
  Parameters<typeof HRDiagramExplorerPage>[0],
  "presentationModeMessages"
>;

export default function EnglishHRDiagramExplorerPage(props: EnglishHRDiagramExplorerPageProps) {
  return (
    <HRDiagramExplorerPage {...props} presentationModeMessages={enMessages.presentationMode} />
  );
}
