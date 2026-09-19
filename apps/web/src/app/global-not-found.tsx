import { DEFAULT_LOCALE } from "../lib/i18n/locales";
import { LocaleRootLayout } from "./locale-root-layout";
import NotFound from "./route-not-found";

export default function GlobalNotFound() {
  return (
    <LocaleRootLayout locale={DEFAULT_LOCALE}>
      <NotFound />
    </LocaleRootLayout>
  );
}
