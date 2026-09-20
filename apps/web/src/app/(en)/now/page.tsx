import { enMessages } from "../../../lib/i18n/messages/en";
import SpaceNowPage, { createSpaceNowMetadata } from "../../now/route-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = createSpaceNowMetadata(enMessages.spaceNow);

export default function EnglishSpaceNowPage() {
  return <SpaceNowPage messages={enMessages.spaceNow} />;
}
