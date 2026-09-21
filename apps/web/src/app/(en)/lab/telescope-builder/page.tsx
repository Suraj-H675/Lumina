import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import TelescopeBuilderPage, {
  createTelescopeBuilderMetadata,
} from "../../../lab/telescope-builder/route-page";

export const dynamic = "force-dynamic";
export const metadata = createTelescopeBuilderMetadata(enMessages.simulationLabs.telescopeBuilder);

type EnglishTelescopeBuilderPageProps = Omit<
  Parameters<typeof TelescopeBuilderPage>[0],
  "locale" | "messages" | "presentationModeMessages"
>;

export default function EnglishTelescopeBuilderPage(props: EnglishTelescopeBuilderPageProps) {
  return (
    <TelescopeBuilderPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.telescopeBuilder}
      presentationModeMessages={enMessages.presentationMode}
    />
  );
}
