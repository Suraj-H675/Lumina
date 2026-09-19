import { enMessages } from "../../../../lib/i18n/messages/en";
import TelescopeBuilderPage, { metadata } from "../../../lab/telescope-builder/route-page";

export const dynamic = "force-dynamic";
export { metadata };

type EnglishTelescopeBuilderPageProps = Omit<
  Parameters<typeof TelescopeBuilderPage>[0],
  "presentationModeMessages"
>;

export default function EnglishTelescopeBuilderPage(props: EnglishTelescopeBuilderPageProps) {
  return <TelescopeBuilderPage {...props} presentationModeMessages={enMessages.presentationMode} />;
}
