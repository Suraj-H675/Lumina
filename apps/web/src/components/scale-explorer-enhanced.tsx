"use client";

import dynamic from "next/dynamic";

import type { PublishedLocale } from "../lib/i18n/locales";
import type { PresentationModeMessages, ScaleExplorerMessages } from "../lib/i18n/messages/types";
import { PresentationModeMessagesProvider } from "../lib/i18n/presentation-mode-context";
import type { ScaleExplorerState } from "../lib/simulations/scale-explorer";

const InteractiveScaleExplorer = dynamic(
  () => import("./scale-explorer-view").then((module) => module.ScaleExplorerView),
  {
    // The server-rendered no-script representation is the truthful fallback while this bundle loads.
    loading: () => null,
    ssr: false,
  },
);

type ScaleExplorerEnhancedProps = Readonly<{
  initialState: ScaleExplorerState;
  initialStateInvalid: boolean;
  locale: PublishedLocale;
  messages: ScaleExplorerMessages;
  presentationModeMessages: PresentationModeMessages;
}>;

/**
 * Progressive enhancement boundary for the lab. The accessible server representation stays
 * available before this intentionally lazy interactive bundle is loaded.
 */
export function ScaleExplorerEnhanced({
  initialState,
  initialStateInvalid,
  locale,
  messages,
  presentationModeMessages,
}: ScaleExplorerEnhancedProps) {
  return (
    <PresentationModeMessagesProvider messages={presentationModeMessages}>
      <div className="scale-explorer-enhanced-shell">
        <InteractiveScaleExplorer
          initialState={initialState}
          initialStateInvalid={initialStateInvalid}
          locale={locale}
          messages={messages}
        />
      </div>
    </PresentationModeMessagesProvider>
  );
}
