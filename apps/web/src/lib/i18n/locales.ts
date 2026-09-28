export const PUBLISHED_LOCALES = ["en"] as const;
export type PublishedLocale = (typeof PUBLISHED_LOCALES)[number];

export const DEFAULT_LOCALE: PublishedLocale = "en";

export type LocaleDirection = "ltr" | "rtl";

export type LocaleDefinition = Readonly<{
  direction: LocaleDirection;
  displayName: string;
  intlTag: string;
  languageTag: string;
}>;

const LOCALE_DEFINITIONS: Readonly<Record<PublishedLocale, LocaleDefinition>> = {
  en: {
    direction: "ltr",
    displayName: "English",
    intlTag: "en-US",
    languageTag: "en",
  },
};

export function isPublishedLocale(value: unknown): value is PublishedLocale {
  return typeof value === "string" && (PUBLISHED_LOCALES as readonly string[]).includes(value);
}

export function localeDefinition(locale: string): LocaleDefinition {
  if (!isPublishedLocale(locale)) throw new TypeError(`Unknown Nova-Lumina locale: ${locale}`);
  return LOCALE_DEFINITIONS[locale];
}
