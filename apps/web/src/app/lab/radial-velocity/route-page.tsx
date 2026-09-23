import type { Metadata } from "next";

import { RadialVelocityEnhanced } from "../../../components/radial-velocity-enhanced";
import { RadialVelocityNoScript } from "../../../components/radial-velocity-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { RadialVelocityMessages } from "../../../lib/i18n/messages/types";
import { resolvePublicWebApiOrigin, resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadRadialVelocityCalculation } from "../../../lib/server/radial-velocity";
import {
  DEFAULT_RADIAL_VELOCITY_STATE,
  decodeRadialVelocityState,
  type RadialVelocityState,
} from "../../../lib/simulations/radial-velocity";

export function createRadialVelocityMetadata(messages: RadialVelocityMessages): Metadata {
  return {
    alternates: { canonical: "/lab/radial-velocity" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type RadialVelocityPageProps = Readonly<{
  locale: PublishedLocale;
  messages: RadialVelocityMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: RadialVelocityState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_RADIAL_VELOCITY_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeRadialVelocityState(encoded);
  return decoded === null
    ? { state: DEFAULT_RADIAL_VELOCITY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function RadialVelocityPage({
  locale,
  messages,
  searchParams,
}: RadialVelocityPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const serverApiConfiguration = resolveWebApiOrigin();
  const publicApiConfiguration = resolvePublicWebApiOrigin();
  const calculation = await loadRadialVelocityCalculation(requested.state, {
    ...(serverApiConfiguration.valid ? { origin: serverApiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <RadialVelocityNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <RadialVelocityEnhanced
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
