import { enMessages } from "../../../../../lib/i18n/messages/en";
import ScaleExplorerNodePage, {
  generateStaticParams,
  metadata,
} from "../../../../lab/scale-explorer/[nodeId]/route-page";

export { generateStaticParams, metadata };
export const dynamicParams = false;

type EnglishScaleExplorerNodePageProps = Omit<
  Parameters<typeof ScaleExplorerNodePage>[0],
  "presentationModeMessages"
>;

export default function EnglishScaleExplorerNodePage(props: EnglishScaleExplorerNodePageProps) {
  return (
    <ScaleExplorerNodePage {...props} presentationModeMessages={enMessages.presentationMode} />
  );
}
