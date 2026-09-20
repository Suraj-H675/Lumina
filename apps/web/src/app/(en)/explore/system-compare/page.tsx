import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import SystemScaleComparePage, {
  createSystemScaleCompareMetadata,
} from "../../../explore/system-compare/route-page";

export const metadata = createSystemScaleCompareMetadata(enMessages.explore.systemScaleCompare);

export default function EnglishSystemScaleComparePage() {
  return (
    <SystemScaleComparePage
      locale={DEFAULT_LOCALE}
      messages={enMessages.explore.systemScaleCompare}
    />
  );
}
