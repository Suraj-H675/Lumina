import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import RocketMissionDesignerPage, {
  createRocketMissionDesignerMetadata,
} from "../../../lab/rocket-mission-designer/route-page";

export const dynamic = "force-dynamic";

export const metadata = createRocketMissionDesignerMetadata(
  enMessages.simulationLabs.rocketMissionDesigner,
);

type EnglishRocketMissionDesignerPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishRocketMissionDesignerPage(
  props: EnglishRocketMissionDesignerPageProps,
) {
  return (
    <RocketMissionDesignerPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.rocketMissionDesigner}
    />
  );
}
