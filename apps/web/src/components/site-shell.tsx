import Link from "next/link";
import type { ReactNode } from "react";

import { PwaStatus } from "./pwa-status";
import { SiteNav } from "./site-nav";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SiteShellMessages } from "../lib/i18n/messages/types";
import styles from "./site-shell.module.css";

type SiteShellProps = Readonly<{
  children: ReactNode;
  locale: PublishedLocale;
  messages: SiteShellMessages;
}>;

export function SiteShell({ children, locale, messages }: SiteShellProps) {
  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main-content">
        {messages.skipToMainContent}
      </a>
      <PwaStatus locale={locale} messages={messages.pwa} />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/">
            <span aria-hidden="true" className={styles.brandMark}>
              <svg fill="none" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="8.5" stroke="currentColor" strokeWidth="1.25" />
                <path d="M16 2.5v6M16 23.5v6M2.5 16h6M23.5 16h6" stroke="currentColor" />
                <circle cx="16" cy="16" fill="currentColor" r="1.75" />
              </svg>
            </span>
            <span className={styles.brandWordmark}>Nova-Lumina</span>
          </Link>
          <SiteNav messages={messages.navigation} />
        </div>
      </header>
      <main className={styles.main} id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>{messages.footerTagline}</p>
          <Link className={styles.footerLink} href="/explore">
            {messages.exploreCatalogue}
          </Link>
        </div>
      </footer>
    </div>
  );
}
