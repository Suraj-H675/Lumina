import "server-only";

import { normalizeApiOrigin } from "@lumina/api-client";

const DEVELOPMENT_API_ORIGIN = "http://127.0.0.1:8000";

export type WebApiOriginConfiguration =
  Readonly<{ origin: string; valid: true }> | Readonly<{ valid: false }>;

export function resolveWebApiOrigin(
  configuredValue = process.env.LUMINA_WEB_API_ORIGIN,
  environment: string | undefined = process.env.NODE_ENV,
): WebApiOriginConfiguration {
  const value =
    configuredValue === undefined || configuredValue === ""
      ? environment === "production"
        ? undefined
        : DEVELOPMENT_API_ORIGIN
      : configuredValue;
  if (value === undefined) return { valid: false };

  const normalized = normalizeApiOrigin(value);
  return normalized.valid ? normalized : { valid: false };
}
