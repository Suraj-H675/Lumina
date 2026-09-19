import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteShell } from "../components/site-shell";
import { loadPublishedDictionary } from "../lib/i18n/dictionaries";
import { localeDefinition, type PublishedLocale } from "../lib/i18n/locales";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lumina — Foundation",
    template: "%s — Lumina",
  },
  description:
    "Lumina is a free, scientifically grounded platform for exploring space. Its first public capability is a provenance-first astronomical catalogue you can search and browse.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070f",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
  locale: PublishedLocale;
}>;

export async function LocaleRootLayout({ children, locale }: RootLayoutProps) {
  const definition = localeDefinition(locale);
  const messages = await loadPublishedDictionary(locale);

  return (
    <html dir={definition.direction} lang={definition.languageTag}>
      <body>
        <SiteShell locale={locale} messages={messages.shell}>
          {children}
        </SiteShell>
      </body>
    </html>
  );
}
