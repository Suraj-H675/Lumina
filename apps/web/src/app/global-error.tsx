"use client";

type GlobalErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  void error;

  return (
    <html lang="en">
      <body>
        <main className="global-error-content" role="alert">
          <h1>Something went wrong</h1>
          <p>Lumina could not load. Try again, or return to the foundation home page later.</p>
          <button onClick={reset} type="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
