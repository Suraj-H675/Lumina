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

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("127.")
  );
}

/**
 * Resolve the browser-visible public API origin independently of the private server-to-server
 * origin. Production clients must never receive loopback or plaintext HTTP targets.
 */
export function resolvePublicWebApiOrigin(
  configuredValue = process.env.LUMINA_WEB_PUBLIC_API_ORIGIN,
  environment: string | undefined = process.env.NODE_ENV,
  allowInsecureLoopback = process.env.LUMINA_E2E_COORDINATION_FILE !== undefined,
): WebApiOriginConfiguration {
  const value =
    configuredValue === undefined || configuredValue === ""
      ? environment === "production"
        ? undefined
        : DEVELOPMENT_API_ORIGIN
      : configuredValue;
  if (value === undefined) return { valid: false };

  const normalized = normalizeApiOrigin(value);
  if (!normalized.valid) return { valid: false };
  if (environment !== "production") return normalized;

  const url = new URL(normalized.origin);
  if (allowInsecureLoopback && isLoopbackHostname(url.hostname)) return normalized;
  return url.protocol === "https:" && !isLoopbackHostname(url.hostname)
    ? normalized
    : { valid: false };
}
