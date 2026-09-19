import Link from "next/link";
import type { ReactNode } from "react";

import { PwaStatus } from "./pwa-status";
import { SiteNav } from "./site-nav";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SiteShellMessages } from "../lib/i18n/messages/types";

type SiteShellProps = Readonly<{
  children: ReactNode;
  locale: PublishedLocale;
  messages: SiteShellMessages;
}>;

export function SiteShell({ children, locale, messages }: SiteShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a className="skip-link" href="#main-content">
        {messages.skipToMainContent}
      </a>
      <PwaStatus locale={locale} messages={messages.pwa} />
      <header className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]">
        <div className="mx-auto flex w-full max-w-[var(--content-width)] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold tracking-tight text-[var(--foreground)]"
            href="/"
          >
            <span aria-hidden="true" className="text-[var(--accent)]">
              ✦
            </span>
            Lumina
          </Link>
          <SiteNav messages={messages.navigation} />
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-[var(--content-width)] flex-1 px-4 py-10 sm:px-6 sm:py-14"
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>
      <footer className="border-t border-[var(--border)] bg-[var(--background-raised)]">
        <div className="mx-auto flex w-full max-w-[var(--content-width)] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-[var(--muted)] sm:px-6">
          <p>{messages.footerTagline}</p>
          <Link
            className="inline-flex min-h-11 items-center text-[var(--link)] underline"
            href="/explore"
          >
            {messages.exploreCatalogue}
          </Link>
        </div>
      </footer>
    </div>
  );
}
