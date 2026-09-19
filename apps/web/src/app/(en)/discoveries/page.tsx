import { enMessages } from "../../../lib/i18n/messages/en";
import { DiscoveriesRoute, discoveriesMetadata } from "../../discoveries/route-page";

export const metadata = discoveriesMetadata(enMessages.discoveries);

export default function EnglishDiscoveriesPage() {
  return <DiscoveriesRoute messages={enMessages.discoveries} />;
}
