import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteShell } from "../components/site-shell";
import { loadPublishedDictionary } from "../lib/i18n/dictionaries";
import { localeDefinition, type PublishedLocale } from "../lib/i18n/locales";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nova-Lumina",
    template: "%s — Nova-Lumina",
  },
  description:
    "Nova-Lumina is a free, public, scientifically grounded platform for learning about and exploring space through reviewed data, deterministic models, observation tools, and source-aware current information.",
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
