"use client";

import { enMessages } from "../lib/i18n/messages/en";

type GlobalErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  void error;
  const messages = enMessages.routeBoundaries.globalError;

  return (
    <html lang="en">
      <body>
        <main className="global-error-content" role="alert">
          <h1>{messages.title}</h1>
          <p>{messages.description}</p>
          <button onClick={reset} type="button">
            {messages.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
