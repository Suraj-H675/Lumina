import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import OrbitSandboxPage, {
  createOrbitSandboxMetadata,
} from "../../../lab/orbit-sandbox/route-page";

export const dynamic = "force-dynamic";

export const metadata = createOrbitSandboxMetadata(enMessages.simulationLabs.orbitSandbox);

type EnglishOrbitSandboxPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default function EnglishOrbitSandboxPage(props: EnglishOrbitSandboxPageProps) {
  return (
    <OrbitSandboxPage
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.orbitSandbox}
    />
  );
}
