"use client";

import { useRouter } from "next/navigation";

import { useCallback } from "react";

type CompareRemoveButtonProps = Readonly<{
  /** Human identity used in the accessible name (canonical name or slot label). */
  displayName: string;
  /** The slug this button removes from the committed URL state. */
  removeSlug: string;
  /** Every currently selected slug, in URL order. */
  slugs: ReadonlyArray<string>;
}>;

/**
 * Remove one object from the comparison by navigating to the remaining
 * selection. The URL owns the state, so browser back/forward keeps working.
 */
export function CompareRemoveButton({ displayName, removeSlug, slugs }: CompareRemoveButtonProps) {
  const router = useRouter();

  const remove = useCallback(() => {
    const params = new URLSearchParams();
    for (const slug of slugs) {
      if (slug !== removeSlug) params.append("object", slug);
    }
    const encoded = params.toString();
    router.push(encoded === "" ? "/compare" : `/compare?${encoded}`);
  }, [removeSlug, router, slugs]);

  return (
    <button
      aria-label={`Remove ${displayName} from the comparison`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      onClick={remove}
      type="button"
    >
      <span aria-hidden="true">✕</span>
    </button>
  );
}
