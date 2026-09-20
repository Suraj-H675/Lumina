import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import RadialVelocityPage, {
  createRadialVelocityMetadata,
} from "../../../lab/radial-velocity/route-page";

export const dynamic = "force-dynamic";

export const metadata = createRadialVelocityMetadata(enMessages.simulationLabs.radialVelocity);

type EnglishRadialVelocityPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishRadialVelocityPage(props: EnglishRadialVelocityPageProps) {
  return (
    <RadialVelocityPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.radialVelocity}
    />
  );
}
