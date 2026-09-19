import { enMessages } from "../../lib/i18n/messages/en";
import NotFound from "../route-not-found";

export default function EnglishNotFound() {
  return <NotFound messages={enMessages.routeBoundaries.notFound} />;
}
