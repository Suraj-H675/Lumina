"use client";

import type { ParticipateResponse } from "@lumina/api-client";
import dynamic from "next/dynamic";

import type { PublishedLocale } from "../lib/i18n/locales";
import type { ParticipateMessages } from "../lib/i18n/messages/types";

const InteractiveParticipate = dynamic(
  () => import("./participate-view").then((module) => module.ParticipateView),
  { loading: () => null, ssr: false },
);

export function ParticipateEnhanced({
  locale,
  messages,
  response,
}: Readonly<{
  locale: PublishedLocale;
  messages: ParticipateMessages;
  response: ParticipateResponse;
}>) {
  return <InteractiveParticipate locale={locale} messages={messages} response={response} />;
}
