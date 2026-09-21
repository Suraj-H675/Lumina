import { DEFAULT_LOCALE } from "../../../../../lib/i18n/locales";
import { enMessages } from "../../../../../lib/i18n/messages/en";
import ScaleExplorerNodePage, {
  createScaleExplorerNodeMetadata,
  generateStaticParams,
} from "../../../../lab/scale-explorer/[nodeId]/route-page";

export { generateStaticParams };
export const metadata = createScaleExplorerNodeMetadata(enMessages.simulationLabs.scaleExplorer);
export const dynamicParams = false;

type EnglishScaleExplorerNodePageProps = Omit<
  Parameters<typeof ScaleExplorerNodePage>[0],
  "locale" | "messages" | "presentationModeMessages"
>;

export default function EnglishScaleExplorerNodePage(props: EnglishScaleExplorerNodePageProps) {
  return (
    <ScaleExplorerNodePage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.scaleExplorer}
      presentationModeMessages={enMessages.presentationMode}
    />
  );
}
