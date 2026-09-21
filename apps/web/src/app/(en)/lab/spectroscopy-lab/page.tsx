import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import SpectroscopyLabPage, {
  createSpectroscopyLabMetadata,
} from "../../../lab/spectroscopy-lab/route-page";

export const dynamic = "force-dynamic";

export const metadata = createSpectroscopyLabMetadata(enMessages.simulationLabs.spectroscopyLab);

type EnglishSpectroscopyLabPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishSpectroscopyLabPage(props: EnglishSpectroscopyLabPageProps) {
  return (
    <SpectroscopyLabPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.spectroscopyLab}
    />
  );
}
