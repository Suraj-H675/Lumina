import { enMessages } from "../../../../lib/i18n/messages/en";
import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import DeepSkyPage, { createDeepSkyMetadata } from "../../../explore/deep-sky/route-page";

export const metadata = createDeepSkyMetadata(enMessages.deepSky);

export default function EnglishDeepSkyPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<{ layer?: string | string[]; object?: string | string[] }>>;
}>) {
  return (
    <DeepSkyPage
      coordinateDisclosureMessages={enMessages.coordinateDisclosure}
      entityTypeMessages={enMessages.entityTypes}
      locale={DEFAULT_LOCALE}
      messages={enMessages.deepSky}
      searchParams={searchParams}
    />
  );
}
