import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import StellarLaboratoryPage, {
  createStellarLaboratoryMetadata,
} from "../../../lab/stellar-laboratory/route-page";

export const dynamic = "force-dynamic";

export const metadata = createStellarLaboratoryMetadata(
  enMessages.simulationLabs.stellarLaboratory,
);

type EnglishStellarLaboratoryPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishStellarLaboratoryPage(props: EnglishStellarLaboratoryPageProps) {
  return (
    <StellarLaboratoryPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.stellarLaboratory}
    />
  );
}
