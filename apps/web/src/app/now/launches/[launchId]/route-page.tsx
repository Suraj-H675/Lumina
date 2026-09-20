import type { Metadata } from "next";
import Link from "next/link";

import { formatMessageTemplate } from "../../../../lib/i18n/format";
import type { PublishedLocale } from "../../../../lib/i18n/locales";
import type { LaunchCenterMessages } from "../../../../lib/i18n/messages/types";
import { loadNowLaunch } from "../../../../lib/server/space-now";
import { LaunchDetailView } from "./launch-detail-view";

type LaunchPageProps = Readonly<{
  params: Promise<Readonly<{ launchId: string }>>;
}>;

export async function createLaunchMetadata(
  { params }: LaunchPageProps,
  messages: LaunchCenterMessages,
): Promise<Metadata> {
  const { launchId } = await params;
  const outcome = await loadNowLaunch(launchId);
  if (outcome.kind === "not-found") return { title: messages.detail.metadataNotFoundTitle };
  if (outcome.kind !== "ok" || outcome.data.launch === null) {
    return { title: messages.detail.metadataUnavailableTitle };
  }
  return {
    title: outcome.data.launch.name,
    description: formatMessageTemplate(messages.detail.metadataDescription, {
      name: outcome.data.launch.name,
    }),
  };
}

export default async function LaunchPage({
  locale,
  messages,
  params,
}: LaunchPageProps &
  Readonly<{
    locale: PublishedLocale;
    messages: LaunchCenterMessages;
  }>) {
  const { launchId } = await params;
  const outcome = await loadNowLaunch(launchId);
  if (outcome.kind === "not-found") {
    return (
      <section className="max-w-2xl space-y-5" role="status">
        <h1 className="text-3xl font-semibold">{messages.detail.notFoundTitle}</h1>
        <p className="leading-7 text-[var(--muted)]">{messages.detail.notFoundDescription}</p>
        <Link
          className="inline-flex min-h-11 items-center text-[var(--link)] underline"
          href="/now/launches"
        >
          {messages.common.backToLaunchCenter}
        </Link>
      </section>
    );
  }
  return <LaunchDetailView locale={locale} messages={messages} outcome={outcome} />;
}
