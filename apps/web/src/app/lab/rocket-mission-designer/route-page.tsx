import type { Metadata } from "next";

import { RocketMissionDesignerEnhanced } from "../../../components/rocket-mission-designer-enhanced";
import { RocketMissionDesignerNoScript } from "../../../components/rocket-mission-designer-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { RocketMissionDesignerMessages } from "../../../lib/i18n/messages/types";
import { resolvePublicWebApiOrigin, resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadRocketMissionDesignerCalculation } from "../../../lib/server/rocket-mission-designer";
import {
  DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
  decodeRocketMissionDesignerState,
  type RocketMissionDesignerState,
} from "../../../lib/simulations/rocket-mission-designer";

export function createRocketMissionDesignerMetadata(
  messages: RocketMissionDesignerMessages,
): Metadata {
  return {
    alternates: { canonical: "/lab/rocket-mission-designer" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type RocketMissionDesignerPageProps = Readonly<{
  locale: PublishedLocale;
  messages: RocketMissionDesignerMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: RocketMissionDesignerState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_ROCKET_MISSION_DESIGNER_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeRocketMissionDesignerState(encoded);
  return decoded === null
    ? { state: DEFAULT_ROCKET_MISSION_DESIGNER_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function RocketMissionDesignerPage({
  locale,
  messages,
  searchParams,
}: RocketMissionDesignerPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const serverApiConfiguration = resolveWebApiOrigin();
  const publicApiConfiguration = resolvePublicWebApiOrigin();
  const calculation = await loadRocketMissionDesignerCalculation(requested.state, {
    ...(serverApiConfiguration.valid ? { origin: serverApiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <RocketMissionDesignerNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <RocketMissionDesignerEnhanced
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
