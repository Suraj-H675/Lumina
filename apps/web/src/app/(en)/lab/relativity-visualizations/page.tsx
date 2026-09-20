import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import RelativityVisualizationsPage, {
  createRelativityVisualizationsMetadata,
} from "../../../lab/relativity-visualizations/route-page";

export const dynamic = "force-dynamic";

export const metadata = createRelativityVisualizationsMetadata(
  enMessages.simulationLabs.relativityVisualizations,
);

type EnglishRelativityVisualizationsPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishRelativityVisualizationsPage(
  props: EnglishRelativityVisualizationsPageProps,
) {
  return (
    <RelativityVisualizationsPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.relativityVisualizations}
    />
  );
}
