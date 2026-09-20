import { enMessages } from "../../../../lib/i18n/messages/en";
import DeepSkyPage, { metadata } from "../../../explore/deep-sky/route-page";

export { metadata };

export default function EnglishDeepSkyPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<{ layer?: string | string[]; object?: string | string[] }>>;
}>) {
  return (
    <DeepSkyPage
      coordinateDisclosureMessages={enMessages.coordinateDisclosure}
      searchParams={searchParams}
    />
  );
}
