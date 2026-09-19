"use client";

import type { ParticipateResponse } from "@lumina/api-client";
import dynamic from "next/dynamic";

const InteractiveParticipate = dynamic(
  () => import("./participate-view").then((module) => module.ParticipateView),
  { loading: () => null, ssr: false },
);

export function ParticipateEnhanced({
  response,
}: Readonly<{
  response: ParticipateResponse;
}>) {
  return <InteractiveParticipate response={response} />;
}
