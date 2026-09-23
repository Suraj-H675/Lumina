import type { Metadata } from "next";

import { TelescopeBuilderEnhanced } from "../../../components/telescope-builder-enhanced";
import { TelescopeBuilderNoScript } from "../../../components/telescope-builder-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type {
  PresentationModeMessages,
  TelescopeBuilderMessages,
} from "../../../lib/i18n/messages/types";
import {
  DEFAULT_TELESCOPE_BUILDER_STATE,
  decodeTelescopeBuilderState,
  type TelescopeBuilderState,
} from "../../../lib/simulations/telescope-builder";
import { resolvePublicWebApiOrigin, resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadTelescopeBuilderCalculation } from "../../../lib/server/telescope-builder";

export const dynamic = "force-dynamic";

export function createTelescopeBuilderMetadata(messages: TelescopeBuilderMessages): Metadata {
  return {
    alternates: {
      canonical: "/lab/telescope-builder",
    },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type TelescopeBuilderPageProps = Readonly<{
  locale: PublishedLocale;
  messages: TelescopeBuilderMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  presentationModeMessages: PresentationModeMessages;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{
  state: TelescopeBuilderState;
  invalid: boolean;
}> {
  const rawState = searchParams.state;
  if (rawState === undefined) return { state: DEFAULT_TELESCOPE_BUILDER_STATE, invalid: false };
  const encoded = Array.isArray(rawState) || rawState.length === 0 ? null : rawState;
  const decoded = encoded === null ? null : decodeTelescopeBuilderState(encoded);
  return decoded === null
    ? { state: DEFAULT_TELESCOPE_BUILDER_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function TelescopeBuilderPage({
  locale,
  messages,
  presentationModeMessages,
  searchParams,
}: TelescopeBuilderPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const serverApiConfiguration = resolveWebApiOrigin();
  const publicApiConfiguration = resolvePublicWebApiOrigin();
  const calculation = await loadTelescopeBuilderCalculation(requested.state, {
    ...(serverApiConfiguration.valid ? { origin: serverApiConfiguration.origin } : {}),
  });
  const stateInvalid = requested.invalid || calculation.kind === "invalid";
  const initialState = stateInvalid ? DEFAULT_TELESCOPE_BUILDER_STATE : requested.state;
  const initialCalculation = calculation.kind === "ok" && !stateInvalid ? calculation.data : null;

  return (
    <>
      <TelescopeBuilderNoScript
        initialCalculation={initialCalculation}
        initialState={initialState}
        initialStateInvalid={stateInvalid}
        locale={locale}
        messages={messages}
      />
      <TelescopeBuilderEnhanced
        apiOrigin={publicApiConfiguration.valid ? publicApiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={initialState}
        initialStateInvalid={stateInvalid}
        locale={locale}
        messages={messages}
        presentationModeMessages={presentationModeMessages}
      />
    </>
  );
}
