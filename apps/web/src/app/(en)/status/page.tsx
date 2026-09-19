import { enMessages } from "../../../lib/i18n/messages/en";
import StatusPage from "../../status/route-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function EnglishStatusPage() {
  return <StatusPage messages={enMessages.status} />;
}
