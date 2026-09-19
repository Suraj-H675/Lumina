import { DEFAULT_LOCALE } from "../lib/i18n/locales";
import { enMessages } from "../lib/i18n/messages/en";
import { LocaleRootLayout } from "./locale-root-layout";
import NotFound from "./route-not-found";

export default function GlobalNotFound() {
  return (
    <LocaleRootLayout locale={DEFAULT_LOCALE}>
      <NotFound messages={enMessages.routeBoundaries.notFound} />
    </LocaleRootLayout>
  );
}
