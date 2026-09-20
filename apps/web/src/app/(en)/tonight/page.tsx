import { DEFAULT_LOCALE } from "../../../lib/i18n/locales";
import { enMessages } from "../../../lib/i18n/messages/en";
import TonightPage, { createTonightMetadata } from "../../tonight/route-page";

export const metadata = createTonightMetadata(enMessages.tonight);

export default function EnglishTonightPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Readonly<{ date?: string | string[] }>> }>) {
  return (
    <TonightPage
      collectionStateMessages={{
        failures: enMessages.collections.failures,
        shared: enMessages.collections.shared,
      }}
      coordinateDisclosureMessages={enMessages.coordinateDisclosure}
      entityTypeMessages={enMessages.entityTypes}
      locale={DEFAULT_LOCALE}
      messages={enMessages.tonight}
      searchParams={searchParams}
    />
  );
}
