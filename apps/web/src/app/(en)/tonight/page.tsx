import { enMessages } from "../../../lib/i18n/messages/en";
import TonightPage, { metadata } from "../../tonight/route-page";

export { metadata };

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
      searchParams={searchParams}
    />
  );
}
