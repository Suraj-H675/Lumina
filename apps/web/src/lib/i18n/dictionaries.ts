import "server-only";

import type { PublishedLocale } from "./locales";
import type { LuminaMessages } from "./messages/types";

const publishedDictionaryLoaders = {
  en: () => import("./messages/en").then((module) => module.enMessages),
} satisfies Readonly<Record<PublishedLocale, () => Promise<LuminaMessages>>>;

export async function loadPublishedDictionary(locale: PublishedLocale): Promise<LuminaMessages> {
  return await publishedDictionaryLoaders[locale]();
}
