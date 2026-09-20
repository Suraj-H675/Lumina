import { enMessages } from "../../../lib/i18n/messages/en";
import LearningLoading from "../../learn/route-loading";

export default function EnglishLearningLoading() {
  return <LearningLoading message={enMessages.learn.routeState.loading} />;
}
