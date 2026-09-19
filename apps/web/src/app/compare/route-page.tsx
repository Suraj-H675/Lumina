import type { Metadata } from "next";

import { CompareView } from "../../components/compare-view";
import { buildCompareModel } from "../../lib/compare-model";
import { compareSelectionFromSearchParams } from "../../lib/compare-url";
import { resolveWebApiOrigin } from "../../lib/server/api-origin";
import { loadCompareObjectsPerRequest } from "../../lib/server/compare";

type ComparePageProps = Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>;

/**
 * Truthful share metadata: canonical names only once every selected object has
 * actually loaded; every other state gets the generic truthful title. No
 * descriptive science copy is invented.
 */
export async function generateMetadata({ searchParams }: ComparePageProps): Promise<Metadata> {
  const params = await searchParams;
  const selection = compareSelectionFromSearchParams(params);
  let title = "Compare catalogue objects";
  if (selection.slugs.length >= 2) {
    const states = await loadCompareObjectsPerRequest(selection.slugs);
    const names: Array<string> = [];
    for (const state of states) {
      if (state.kind !== "ok") break;
      names.push(state.detail.canonical_name);
    }
    // The root layout template supplies the "— Lumina" suffix.
    if (names.length === selection.slugs.length) {
      title = names.join(" vs ");
    }
  }
  return {
    description:
      "Compare reviewed astronomical measurements side by side, with every value's source attached.",
    title,
  };
}

/**
 * The committed compare state lives entirely in the URL. Server components
 * parse the selection, fetch each selected object through the accepted reads,
 * and build the provenance-safe comparison model; client components handle
 * only the add/remove interactions.
 */
export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const selection = compareSelectionFromSearchParams(params);

  // The public API origin, resolved once server-side. It carries no secrets —
  // the suggest endpoint is a public read — so the add-object combobox may call
  // it directly for bounded typeahead requests.
  const configured = resolveWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  const states =
    selection.slugs.length > 0 ? await loadCompareObjectsPerRequest(selection.slugs) : [];
  const model = buildCompareModel(states);

  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          The catalogue
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Compare</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Put up to three catalogue objects side by side. Every value keeps its exact units and its
          source — Lumina compares published measurements honestly and never scores them.
        </p>
      </header>

      <CompareView
        {...(apiOrigin === undefined ? {} : { apiOrigin })}
        model={model}
        selectedSlugs={selection.slugs}
      />
    </div>
  );
}
