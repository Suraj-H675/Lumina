import type { Metadata } from "next";
import Link from "next/link";

import { ObjectNotFoundView } from "../../../components/object-not-found-view";
import { ObjectView } from "../../../components/object-view";
import { formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type {
  CollectionSaveMessages,
  EntityTypeMessages,
  JournalEntryMessages,
  ObjectMessages,
} from "../../../lib/i18n/messages/types";
import { loadObjectBySlugPerRequest } from "../../../lib/server/catalog";

type ObjectRoutePageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

type ObjectPageProps = Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  entityTypeMessages: EntityTypeMessages;
  journalEntryMessages: JournalEntryMessages;
  locale: PublishedLocale;
  messages: ObjectMessages;
  params: ObjectRoutePageProps["params"];
}>;

export async function createObjectMetadata(
  { params }: ObjectRoutePageProps,
  messages: ObjectMessages["metadata"],
  entityTypeMessages: EntityTypeMessages,
): Promise<Metadata> {
  const { slug } = await params;
  const outcome = await loadObjectBySlugPerRequest(slug);
  if (outcome.kind === "object-not-found") {
    return { title: messages.notFoundTitle };
  }
  if (outcome.kind !== "ok") {
    return { title: messages.unavailableTitle };
  }
  const name = outcome.detail.canonical_name;
  // Truthful identity-only template; descriptions are never invented.
  return {
    title: name,
    description: formatMessageTemplate(messages.description, {
      entityType: entityTypeMessages[outcome.detail.entity_type],
      name,
    }),
  };
}

export default async function ObjectPage({
  collectionSaveMessages,
  entityTypeMessages,
  journalEntryMessages,
  locale,
  messages,
  params,
}: ObjectPageProps) {
  const { slug } = await params;
  const outcome = await loadObjectBySlugPerRequest(slug);

  if (outcome.kind === "object-not-found") {
    return <ObjectNotFoundView messages={messages.notFound} slug={slug} />;
  }
  if (outcome.kind !== "ok") {
    return (
      <section
        aria-labelledby="object-unavailable-title"
        className="mx-auto max-w-2xl space-y-6 py-10"
        role="status"
      >
        <h1
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
          id="object-unavailable-title"
        >
          {messages.unavailable.title}
        </h1>
        <p className="leading-7 text-[var(--muted)]">{messages.unavailable.description}</p>
        <Link
          className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
          href="/explore"
        >
          {messages.unavailable.browseCatalogue}
        </Link>
      </section>
    );
  }

  return (
    <ObjectView
      collectionSaveMessages={collectionSaveMessages}
      detail={outcome.detail}
      entityTypeMessages={entityTypeMessages}
      journalEntryMessages={journalEntryMessages}
      locale={locale}
      messages={messages}
      slug={slug}
    />
  );
}
