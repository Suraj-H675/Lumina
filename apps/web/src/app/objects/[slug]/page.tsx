import type { Metadata } from "next";
import Link from "next/link";

import { ObjectNotFoundView } from "../../../components/object-not-found-view";
import { ObjectView } from "../../../components/object-view";
import { entityTypeLabel } from "../../../lib/catalog-display";
import { loadObjectBySlug } from "../../../lib/server/catalog";

type ObjectPageProps = Readonly<{
  params: Promise<Readonly<{ slug: string }>>;
}>;

export async function generateMetadata({ params }: ObjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const outcome = await loadObjectBySlug(slug);
  if (outcome.kind !== "ok") {
    return { title: "Object not found" };
  }
  const name = outcome.detail.canonical_name;
  // Truthful identity-only template; descriptions are never invented.
  return {
    title: name,
    description: `${name} in the Lumina catalogue: ${entityTypeLabel(outcome.detail.entity_type)} with published measurements and full source provenance.`,
  };
}

export default async function ObjectPage({ params }: ObjectPageProps) {
  const { slug } = await params;
  const outcome = await loadObjectBySlug(slug);

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

  return <ObjectView detail={outcome.detail} />;
}
