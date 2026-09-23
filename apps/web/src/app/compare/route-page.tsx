import type { Metadata } from "next";

import { CompareView } from "../../components/compare-view";
import { buildCompareModel } from "../../lib/compare-model";
import { compareSelectionFromSearchParams } from "../../lib/compare-url";
import { formatMessageTemplate } from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type {
  CollectionSaveMessages,
  CompareMessages,
  EntityTypeMessages,
} from "../../lib/i18n/messages/types";
import { resolvePublicWebApiOrigin } from "../../lib/server/api-origin";
import { loadCompareObjectsPerRequest } from "../../lib/server/compare";

type CompareRoutePageProps = Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>;

type ComparePageProps = Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: CompareMessages;
  searchParams: CompareRoutePageProps["searchParams"];
}>;

/**
 * Truthful share metadata: canonical names only once every selected object has
 * actually loaded; every other state gets the generic truthful title. No
 * descriptive science copy is invented.
 */
export async function createCompareMetadata(
  { searchParams }: CompareRoutePageProps,
  messages: CompareMessages["metadata"],
): Promise<Metadata> {
  const params = await searchParams;
  const selection = compareSelectionFromSearchParams(params);
  let title = messages.genericTitle;
  if (selection.slugs.length >= 2) {
    const states = await loadCompareObjectsPerRequest(selection.slugs);
    const names: Array<string> = [];
    for (const state of states) {
      if (state.kind !== "ok") break;
      names.push(state.detail.canonical_name);
    }
    // The root layout template supplies the "— Lumina" suffix.
    if (names.length === selection.slugs.length) {
      if (names.length === 2) {
        title = formatMessageTemplate(messages.twoObjectTitle, {
          first: names[0] ?? "",
          second: names[1] ?? "",
        });
      } else if (names.length === 3) {
        title = formatMessageTemplate(messages.threeObjectTitle, {
          first: names[0] ?? "",
          second: names[1] ?? "",
          third: names[2] ?? "",
        });
      }
    }
  }
  return {
    description: messages.description,
    title,
  };
}

/**
 * The committed compare state lives entirely in the URL. Server components
 * parse the selection, fetch each selected object through the accepted reads,
 * and build the provenance-safe comparison model; client components handle
 * only the add/remove interactions.
 */
export default async function ComparePage({
  collectionSaveMessages,
  entityTypeMessages,
  locale,
  messages,
  searchParams,
}: ComparePageProps) {
  const params = await searchParams;
  const selection = compareSelectionFromSearchParams(params);

  // The public API origin, resolved once server-side. It carries no secrets —
  // the suggest endpoint is a public read — so the add-object combobox may call
  // it directly for bounded typeahead requests.
  const configured = resolvePublicWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  const states =
    selection.slugs.length > 0 ? await loadCompareObjectsPerRequest(selection.slugs) : [];
  const model = buildCompareModel(states);

  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.header.intro}</p>
      </header>

      <CompareView
        {...(apiOrigin === undefined ? {} : { apiOrigin })}
        collectionSaveMessages={collectionSaveMessages}
        entityTypeMessages={entityTypeMessages}
        locale={locale}
        messages={messages}
        model={model}
        selectedSlugs={selection.slugs}
      />
    </div>
  );
}
