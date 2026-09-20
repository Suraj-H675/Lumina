import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import TransitMethodPage, {
  createTransitMethodMetadata,
} from "../../../lab/transit-method/route-page";

export const dynamic = "force-dynamic";

export const metadata = createTransitMethodMetadata(enMessages.simulationLabs.transitMethod);

type EnglishTransitMethodPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishTransitMethodPage(props: EnglishTransitMethodPageProps) {
  return (
    <TransitMethodPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.transitMethod}
    />
  );
}
