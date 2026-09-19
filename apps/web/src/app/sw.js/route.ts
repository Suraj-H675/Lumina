import { buildLuminaServiceWorkerSource } from "../../lib/pwa-service-worker";

export function GET(): Response {
  return new Response(buildLuminaServiceWorkerSource(), {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
