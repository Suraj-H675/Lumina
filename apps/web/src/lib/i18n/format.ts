import { localeDefinition, type Locale } from "./locales";
import type { CountMessageTemplates } from "./messages/types";

const MESSAGE_PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;

export function formatMessageTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  const used = new Set<string>();
  const rendered = template.replace(MESSAGE_PLACEHOLDER_PATTERN, (_match, placeholder: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, placeholder)) {
      throw new TypeError(`Localization message is missing a value for {${placeholder}}.`);
    }
    used.add(placeholder);
    return String(values[placeholder]);
  });

  for (const placeholder of Object.keys(values)) {
    if (!used.has(placeholder)) {
      throw new TypeError(`Localization message does not contain {${placeholder}}.`);
    }
  }
  return rendered;
}

export function formatCountMessage(
  templates: CountMessageTemplates,
  count: number,
  locale: Locale,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const category = new Intl.PluralRules(localeDefinition(locale).intlTag).select(count);
  const template = category === "one" ? templates.one : templates.other;
  return formatMessageTemplate(template, {
    ...values,
    count: formatLocaleNumber(count, locale),
  });
}

export function formatLocaleDateTime(
  value: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(localeDefinition(locale).intlTag, options).format(value);
}

export function formatLocaleList(
  values: ReadonlyArray<string>,
  locale: Locale,
  options?: Intl.ListFormatOptions,
): string {
  return new Intl.ListFormat(localeDefinition(locale).intlTag, options).format(values);
}

export function formatLocaleNumber(
  value: number | bigint,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeDefinition(locale).intlTag, options).format(value);
}
