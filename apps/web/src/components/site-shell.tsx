import Link from "next/link";
import type { ReactNode } from "react";

type SiteShellProps = Readonly<{
  children: ReactNode;
}>;

export function SiteShell({ children }: SiteShellProps) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-[var(--content-width)] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <p className="text-lg font-semibold tracking-tight text-[var(--foreground)]">Lumina</p>
          <nav aria-label="Foundation navigation">
            <Link
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--link)] underline"
              href="/#about"
            >
              About this foundation
            </Link>
          </nav>
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-[var(--content-width)] px-4 py-12 sm:px-6 sm:py-16"
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>
      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto w-full max-w-[var(--content-width)] px-4 py-6 text-sm text-[var(--muted)] sm:px-6">
          Lumina foundation — honest beginnings for a future space learning platform.
        </div>
      </footer>
    </>
  );
}
