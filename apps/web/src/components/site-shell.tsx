import Link from "next/link";
import type { ReactNode } from "react";

type SiteShellProps = Readonly<{
  children: ReactNode;
}>;

const navigationItems = [
  { href: "/explore", label: "Explore" },
  { href: "/status", label: "Status" },
] as const;

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]">
        <div className="mx-auto flex w-full max-w-[var(--content-width)] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold tracking-tight text-[var(--foreground)]"
            href="/"
          >
            <span aria-hidden="true" className="text-[var(--accent)]">
              ✦
            </span>
            Lumina
          </Link>
          <nav aria-label="Primary">
            <ul className="flex items-center gap-1 sm:gap-2">
              {navigationItems.map((item) => (
                <li key={item.href}>
                  <Link
                    className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-[var(--muted)] no-underline transition-colors hover:text-[var(--foreground)] sm:px-3"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
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
          <p>Lumina — a free, scientifically grounded way to explore space.</p>
          <Link
            className="inline-flex min-h-11 items-center text-[var(--link)] underline"
            href="/explore"
          >
            Explore the catalogue
          </Link>
        </div>
      </footer>
    </div>
  );
}
