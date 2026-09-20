import type { Metadata } from "next";

import { TonightView } from "../../components/tonight-view";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type {
  CollectionStateMessages,
  CoordinateDisclosureMessages,
  EntityTypeMessages,
  TonightMessages,
} from "../../lib/i18n/messages/types";
import { isValidNightDate } from "../../lib/observation/domain";
import { resolveWebApiOrigin } from "../../lib/server/api-origin";

export function createTonightMetadata(messages: TonightMessages): Metadata {
  return {
    title: messages.metadataTitle,
    description: messages.metadataDescription,
  };
}

type TonightPageProps = Readonly<{
  collectionStateMessages: CollectionStateMessages;
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: TonightMessages;
  searchParams: Promise<Readonly<{ date?: string | string[] }>>;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TonightPage({
  collectionStateMessages,
  coordinateDisclosureMessages,
  entityTypeMessages,
  locale,
  messages,
  searchParams,
}: TonightPageProps) {
  const params = await searchParams;
  const date = firstValue(params.date);
  const initialDate = date !== undefined && isValidNightDate(date) ? date : undefined;
  const configured = resolveWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  return (
    <TonightView
      {...(apiOrigin === undefined ? {} : { apiOrigin })}
      collectionStateMessages={collectionStateMessages}
      coordinateDisclosureMessages={coordinateDisclosureMessages}
      entityTypeMessages={entityTypeMessages}
      {...(initialDate === undefined ? {} : { initialDate })}
      locale={locale}
      messages={messages}
    />
  );
}
