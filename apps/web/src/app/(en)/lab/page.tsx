import { enMessages } from "../../../lib/i18n/messages/en";
import LabPage, { createLabMetadata } from "../../lab/route-page";

export const metadata = createLabMetadata(enMessages.labIndex);

export default function EnglishLabPage() {
  return <LabPage messages={enMessages.labIndex} />;
}
