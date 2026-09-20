"use client";

import { useRouter } from "next/navigation";

import { useCallback } from "react";

import { formatMessageTemplate } from "../lib/i18n/format";

type CompareRemoveButtonProps = Readonly<{
  /** Human identity used in the accessible name (canonical name or slot label). */
  displayName: string;
  /** Locale-owned accessible-name template. */
  removeAction: string;
  /** The slug this button removes from the committed URL state. */
  removeSlug: string;
  /** Every currently selected slug, in URL order. */
  slugs: ReadonlyArray<string>;
}>;

/**
 * Remove one object from the comparison by navigating to the remaining
 * selection. The URL owns the state, so browser back/forward keeps working.
 */
export function CompareRemoveButton({
  displayName,
  removeAction,
  removeSlug,
  slugs,
}: CompareRemoveButtonProps) {
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
      aria-label={formatMessageTemplate(removeAction, { displayName })}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      onClick={remove}
      type="button"
    >
      <span aria-hidden="true">✕</span>
    </button>
  );
}
