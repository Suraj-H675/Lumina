import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import BlackHoleRelativityPage, {
  createBlackHoleRelativityMetadata,
} from "../../../lab/black-hole-relativity/route-page";

export const dynamic = "force-dynamic";

export const metadata = createBlackHoleRelativityMetadata(
  enMessages.simulationLabs.blackHoleRelativity,
);

type EnglishBlackHoleRelativityPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishBlackHoleRelativityPage(props: EnglishBlackHoleRelativityPageProps) {
  return (
    <BlackHoleRelativityPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.blackHoleRelativity}
    />
  );
}
