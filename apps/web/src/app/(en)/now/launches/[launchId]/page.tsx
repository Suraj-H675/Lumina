import { DEFAULT_LOCALE } from "../../../../../lib/i18n/locales";
import { enMessages } from "../../../../../lib/i18n/messages/en";
import LaunchPage, { createLaunchMetadata } from "../../../../now/launches/[launchId]/route-page";

type LaunchPageProps = Readonly<{
  params: Promise<Readonly<{ launchId: string }>>;
}>;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function generateMetadata(props: LaunchPageProps) {
  return createLaunchMetadata(props, enMessages.spaceNow.launches);
}

export default function EnglishLaunchPage({ params }: LaunchPageProps) {
  return (
    <LaunchPage locale={DEFAULT_LOCALE} messages={enMessages.spaceNow.launches} params={params} />
  );
}
