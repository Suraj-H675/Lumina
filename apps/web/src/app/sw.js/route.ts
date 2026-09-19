import { buildLuminaServiceWorkerSource } from "../../lib/pwa-service-worker";
import { DEFAULT_LOCALE, localeDefinition } from "../../lib/i18n/locales";
import { enMessages } from "../../lib/i18n/messages/en";

export function GET(): Response {
  return new Response(
    buildLuminaServiceWorkerSource({
      languageTag: localeDefinition(DEFAULT_LOCALE).languageTag,
      offlineMessages: enMessages.offline.landing,
    }),
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'",
        "Content-Type": "application/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
