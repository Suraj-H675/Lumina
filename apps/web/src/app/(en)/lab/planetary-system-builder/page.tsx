import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import PlanetarySystemBuilderPage, {
  createPlanetarySystemBuilderMetadata,
} from "../../../lab/planetary-system-builder/route-page";

export const dynamic = "force-dynamic";

export const metadata = createPlanetarySystemBuilderMetadata(
  enMessages.simulationLabs.planetarySystemBuilder,
);

type EnglishPlanetarySystemBuilderPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishPlanetarySystemBuilderPage(
  props: EnglishPlanetarySystemBuilderPageProps,
) {
  return (
    <PlanetarySystemBuilderPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.planetarySystemBuilder}
    />
  );
}
