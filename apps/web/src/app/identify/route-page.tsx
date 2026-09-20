import type { Metadata } from "next";
import { identificationCapabilitiesEndpoint, requestEndpoint } from "@lumina/api-client";

import type { PublishedLocale } from "../../lib/i18n/locales";
import type { IdentifyMessages } from "../../lib/i18n/messages/types";
import { resolveWebApiOrigin } from "../../lib/server/api-origin";
import { IdentifyView } from "./identify-view";

export function createIdentifyMetadata(messages: IdentifyMessages): Metadata {
  return {
    description: messages.metadata.description,
    robots: { index: false, follow: false },
    title: messages.metadata.title,
  };
}

export default async function IdentifyPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: IdentifyMessages }>) {
  const configured = resolveWebApiOrigin();
  if (!configured.valid) {
    return <IdentifyUnavailable messages={messages} reason="apiOrigin" />;
  }

  const outcome = await requestEndpoint(configured.origin, identificationCapabilitiesEndpoint);
  if (outcome.kind !== "ok") {
    return <IdentifyUnavailable messages={messages} reason="policy" />;
  }

  return (
    <IdentifyView
      apiOrigin={configured.origin}
      capabilities={outcome.data}
      locale={locale}
      messages={messages}
    />
  );
}

function IdentifyUnavailable({
  messages,
  reason,
}: Readonly<{
  messages: IdentifyMessages;
  reason: keyof IdentifyMessages["unavailable"]["reasons"];
}>) {
  return (
    <div className="space-y-8">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.unavailable.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.unavailable.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.unavailable.description}</p>
      </header>
      <section
        aria-labelledby="identify-unavailable-heading"
        className="border border-[var(--border)] p-5 sm:p-7"
      >
        <h2 className="text-2xl font-semibold" id="identify-unavailable-heading">
          {messages.unavailable.heading}
        </h2>
        <p className="mt-3 leading-7 text-[var(--muted)]">{messages.unavailable.reasons[reason]}</p>
      </section>
    </div>
  );
}
