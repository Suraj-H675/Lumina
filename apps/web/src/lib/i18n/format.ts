import { localeDefinition, type Locale } from "./locales";

export function formatLocaleDateTime(
  value: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(localeDefinition(locale).intlTag, options).format(value);
}

export function formatLocaleNumber(
  value: number | bigint,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeDefinition(locale).intlTag, options).format(value);
}
