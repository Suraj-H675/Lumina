export type PwaRequestKind =
  "cache-document" | "cache-static" | "network-only" | "pass-through" | "saved-plan-navigation";

export type PwaRequestDescriptor = Readonly<{
  appOrigin: string;
  method: string;
  mode: string;
  requestUrl: string;
}>;

export const LUMINA_PWA_CACHE_PREFIX = "lumina-pwa-";
export const LUMINA_PWA_CACHE_VERSION = "v1";
export const LUMINA_PWA_DOCUMENT_CACHE = `${LUMINA_PWA_CACHE_PREFIX}documents-${LUMINA_PWA_CACHE_VERSION}`;
export const LUMINA_PWA_STATIC_CACHE = `${LUMINA_PWA_CACHE_PREFIX}static-${LUMINA_PWA_CACHE_VERSION}`;
export const LUMINA_PWA_METADATA_CACHE = `${LUMINA_PWA_CACHE_PREFIX}metadata-${LUMINA_PWA_CACHE_VERSION}`;
export const LUMINA_PWA_METADATA_PATH = "/__lumina_pwa_metadata__";
export const LUMINA_PWA_CONNECTIVITY_PATH = "/__lumina_pwa_connectivity__";
const SAVED_PLAN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const LUMINA_PWA_NETWORK_ONLY_BASE_PATHS = [
  "/api",
  "/identify",
  "/now",
  "/participate",
  "/status",
] as const;
export const LUMINA_PWA_CACHEABLE_DOCUMENT_BASE_PATHS = ["/explore", "/learn", "/offline"] as const;

function pathIsOrUnder(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function isNetworkOnlyPwaPath(pathname: string): boolean {
  return LUMINA_PWA_NETWORK_ONLY_BASE_PATHS.some((basePath) => pathIsOrUnder(pathname, basePath));
}

export function isCacheablePwaDocumentPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/observe") return true;
  if (pathname.startsWith("/objects/")) return true;
  return LUMINA_PWA_CACHEABLE_DOCUMENT_BASE_PATHS.some((basePath) =>
    pathIsOrUnder(pathname, basePath),
  );
}

export function isSavedPlanNavigation(url: URL): boolean {
  if (url.pathname !== "/observe") return false;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "saved") return false;
  const values = url.searchParams.getAll("saved");
  return values.length === 1 && SAVED_PLAN_ID_PATTERN.test(values[0] ?? "");
}

export function classifyPwaRequest({
  appOrigin,
  method,
  mode,
  requestUrl,
}: PwaRequestDescriptor): PwaRequestKind {
  if (method.toUpperCase() !== "GET") return "pass-through";

  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return "pass-through";
  }

  if (url.origin !== appOrigin) return "pass-through";

  if (isNetworkOnlyPwaPath(url.pathname)) return "network-only";

  if (mode === "navigate") {
    if (isSavedPlanNavigation(url)) return "saved-plan-navigation";
    if (url.search !== "") return "network-only";
    return isCacheablePwaDocumentPath(url.pathname) ? "cache-document" : "network-only";
  }

  if (url.pathname.startsWith("/_next/static/")) return "cache-static";

  return "pass-through";
}

export function luminaPwaMetadataUrl(origin: string, pathname: string): string {
  const url = new URL(LUMINA_PWA_METADATA_PATH, origin);
  url.searchParams.set("path", pathname);
  return url.href;
}

export function luminaPwaConnectivityUrl(origin: string): string {
  return new URL(LUMINA_PWA_CONNECTIVITY_PATH, origin).href;
}
