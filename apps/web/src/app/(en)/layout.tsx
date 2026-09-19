import type { ReactNode } from "react";

import { DEFAULT_LOCALE } from "../../lib/i18n/locales";
import { LocaleRootLayout } from "../locale-root-layout";

export { metadata, viewport } from "../locale-root-layout";

type EnglishLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function EnglishLayout({ children }: EnglishLayoutProps) {
  return <LocaleRootLayout locale={DEFAULT_LOCALE}>{children}</LocaleRootLayout>;
}
