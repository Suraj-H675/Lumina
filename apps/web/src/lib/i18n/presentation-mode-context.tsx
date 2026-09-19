"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { PresentationModeMessages } from "./messages/types";

const PresentationModeMessagesContext = createContext<PresentationModeMessages | null>(null);

type PresentationModeMessagesProviderProps = Readonly<{
  children: ReactNode;
  messages: PresentationModeMessages;
}>;

export function PresentationModeMessagesProvider({
  children,
  messages,
}: PresentationModeMessagesProviderProps) {
  return (
    <PresentationModeMessagesContext.Provider value={messages}>
      {children}
    </PresentationModeMessagesContext.Provider>
  );
}

export function usePresentationModeMessages(): PresentationModeMessages {
  const messages = useContext(PresentationModeMessagesContext);
  if (messages === null) {
    throw new Error("Presentation mode messages are unavailable outside their localized surface.");
  }
  return messages;
}
