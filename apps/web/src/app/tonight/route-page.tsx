import type { Metadata } from "next";

import { TonightView } from "../../components/tonight-view";
import type { CollectionStateMessages } from "../../lib/i18n/messages/types";
import { isValidNightDate } from "../../lib/observation/domain";
import { resolveWebApiOrigin } from "../../lib/server/api-origin";

export const metadata: Metadata = {
  title: "Tonight",
  description:
    "Compare the observing geometry of saved catalogue objects for one location and selected night.",
};

type TonightPageProps = Readonly<{
  collectionStateMessages: CollectionStateMessages;
  searchParams: Promise<Readonly<{ date?: string | string[] }>>;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TonightPage({
  collectionStateMessages,
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
      {...(initialDate === undefined ? {} : { initialDate })}
    />
  );
}
