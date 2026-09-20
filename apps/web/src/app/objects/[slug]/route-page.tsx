import type { Metadata } from "next";
import Link from "next/link";

import { ObjectNotFoundView } from "../../../components/object-not-found-view";
import { ObjectView } from "../../../components/object-view";
import { entityTypeLabel } from "../../../lib/catalog-display";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { CollectionSaveMessages } from "../../../lib/i18n/messages/types";
import { loadObjectBySlugPerRequest } from "../../../lib/server/catalog";

type ObjectRoutePageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

type ObjectPageProps = Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  locale: PublishedLocale;
  params: ObjectRoutePageProps["params"];
}>;

export async function generateMetadata({ params }: ObjectRoutePageProps): Promise<Metadata> {
  const { slug } = await params;
  const outcome = await loadObjectBySlugPerRequest(slug);
  if (outcome.kind === "object-not-found") {
    return { title: "Object not found" };
  }
  if (outcome.kind !== "ok") {
    return { title: "Object temporarily unavailable" };
  }
  const name = outcome.detail.canonical_name;
  // Truthful identity-only template; descriptions are never invented.
  return {
    title: name,
    description: `${name} in the Lumina catalogue: ${entityTypeLabel(outcome.detail.entity_type)} with published measurements and full source provenance.`,
  };
}

export default async function ObjectPage({
  collectionSaveMessages,
  locale,
  params,
}: ObjectPageProps) {
  const { slug } = await params;
  const outcome = await loadObjectBySlugPerRequest(slug);

  if (outcome.kind === "object-not-found") {
    return <ObjectNotFoundView slug={slug} />;
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
          This object is temporarily unavailable
        </h1>
        <p className="leading-7 text-[var(--muted)]">
          Lumina could not reach the catalogue service within its bounded request window. Nothing is
          shown rather than showing something wrong — please retry in a moment.
        </p>
        <Link
          className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
          href="/explore"
        >
          Browse the catalogue
        </Link>
      </section>
    );
  }

  return (
    <ObjectView
      collectionSaveMessages={collectionSaveMessages}
      detail={outcome.detail}
      locale={locale}
      slug={slug}
    />
  );
}
