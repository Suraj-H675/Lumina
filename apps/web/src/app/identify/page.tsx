import type { Metadata } from "next";
import { identificationCapabilitiesEndpoint, requestEndpoint } from "@lumina/api-client";

import { resolveWebApiOrigin } from "../../lib/server/api-origin";
import { IdentifyView } from "./identify-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Identify an astronomical image",
  description:
    "Upload an astronomical image for Lumina's private identification workflow. Remote plate solving is used only when explicitly enabled and consented to.",
};

export default async function IdentifyPage() {
  const configured = resolveWebApiOrigin();
  if (!configured.valid) {
    return <IdentifyUnavailable reason="No safe API origin is configured for private uploads." />;
  }

  const outcome = await requestEndpoint(configured.origin, identificationCapabilitiesEndpoint);
  if (outcome.kind !== "ok") {
    return <IdentifyUnavailable reason="Identification policy is temporarily unavailable." />;
  }

  return <IdentifyView apiOrigin={configured.origin} capabilities={outcome.data} />;
}

function IdentifyUnavailable({ reason }: Readonly<{ reason: string }>) {
  return (
    <div className="space-y-8">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Identify · Private image processing
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Identify an astronomical image
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Upload infrastructure is private and optional. Core Lumina remains available when this
          feature is offline.
        </p>
      </header>
      <section
        aria-labelledby="identify-unavailable-heading"
        className="border border-[var(--border)] p-5 sm:p-7"
      >
        <h2 className="text-2xl font-semibold" id="identify-unavailable-heading">
          Identification unavailable
        </h2>
        <p className="mt-3 leading-7 text-[var(--muted)]">{reason}</p>
      </section>
    </div>
  );
}
