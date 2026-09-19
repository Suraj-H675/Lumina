export const KNOWN_LOCALES = ["en", "es"] as const;
export type Locale = (typeof KNOWN_LOCALES)[number];

export const PUBLISHED_LOCALES = ["en"] as const;
export type PublishedLocale = (typeof PUBLISHED_LOCALES)[number];

export const DEFAULT_LOCALE: PublishedLocale = "en";

export type LocaleDirection = "ltr" | "rtl";
export type LocalePublication = "draft" | "published";

export type TranslationReview = Readonly<{
  reviewedAt: string;
  reviewer: string;
  sourceRevision: string;
}>;

export type LocaleDefinition = Readonly<{
  direction: LocaleDirection;
  displayName: string;
  intlTag: string;
  languageTag: string;
  publication: LocalePublication;
  translationReview: TranslationReview | null;
}>;

const LOCALE_DEFINITIONS: Readonly<Record<Locale, LocaleDefinition>> = {
  en: {
    direction: "ltr",
    displayName: "English",
    intlTag: "en-US",
    languageTag: "en",
    publication: "published",
    translationReview: null,
  },
  es: {
    direction: "ltr",
    displayName: "Español",
    intlTag: "es-ES",
    languageTag: "es",
    publication: "draft",
    translationReview: null,
  },
};

export function isKnownLocale(value: unknown): value is Locale {
  return typeof value === "string" && (KNOWN_LOCALES as readonly string[]).includes(value);
}

export function isPublishedLocale(value: unknown): value is PublishedLocale {
  return (
    isKnownLocale(value) &&
    LOCALE_DEFINITIONS[value].publication === "published" &&
    (PUBLISHED_LOCALES as readonly string[]).includes(value)
  );
}

export function localeDefinition(locale: string): LocaleDefinition {
  if (!isKnownLocale(locale)) throw new TypeError(`Unknown Lumina locale: ${locale}`);
  return LOCALE_DEFINITIONS[locale];
}
