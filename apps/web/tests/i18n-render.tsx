import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import { PresentationModeMessagesProvider } from "../src/lib/i18n/presentation-mode-context";
import { enMessages } from "../src/lib/i18n/messages/en";

export function renderWithEnglishMessages(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(
    <PresentationModeMessagesProvider messages={enMessages.presentationMode}>
      {ui}
    </PresentationModeMessagesProvider>,
    options,
  );
}
