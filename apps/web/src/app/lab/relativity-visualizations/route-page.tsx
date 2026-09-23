import type { Metadata } from "next";

import { RelativityVisualizationsEnhanced } from "../../../components/relativity-visualizations-enhanced";
import { RelativityVisualizationsNoScript } from "../../../components/relativity-visualizations-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { RelativityVisualizationsMessages } from "../../../lib/i18n/messages/types";
import { resolvePublicWebApiOrigin, resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadRelativityVisualizationsCalculation } from "../../../lib/server/relativity-visualizations";
import {
  DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
  decodeRelativityVisualizationsState,
  type RelativityVisualizationsState,
} from "../../../lib/simulations/relativity-visualizations";

export function createRelativityVisualizationsMetadata(
  messages: RelativityVisualizationsMessages,
): Metadata {
  return {
    alternates: { canonical: "/lab/relativity-visualizations" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type RelativityVisualizationsPageProps = Readonly<{
  locale: PublishedLocale;
  messages: RelativityVisualizationsMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: RelativityVisualizationsState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_RELATIVITY_VISUALIZATIONS_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeRelativityVisualizationsState(encoded);
  return decoded === null
    ? { state: DEFAULT_RELATIVITY_VISUALIZATIONS_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function RelativityVisualizationsPage({
  locale,
  messages,
  searchParams,
}: RelativityVisualizationsPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const serverApiConfiguration = resolveWebApiOrigin();
  const publicApiConfiguration = resolvePublicWebApiOrigin();
  const calculation = await loadRelativityVisualizationsCalculation(requested.state, {
    ...(serverApiConfiguration.valid ? { origin: serverApiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <RelativityVisualizationsNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <RelativityVisualizationsEnhanced
        apiOrigin={publicApiConfiguration.valid ? publicApiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
    </>
  );
}
