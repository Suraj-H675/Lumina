"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavigationMessageKey, NavigationMessages } from "../lib/i18n/messages/types";

const navigationItems = [
  { href: "/explore", key: "explore" },
  { href: "/learn", key: "learn" },
  { href: "/lab", key: "lab" },
  { href: "/now", key: "spaceNow" },
  { href: "/identify", key: "identify" },
  { href: "/compare", key: "compare" },
  { href: "/observe", key: "observe" },
  { href: "/tonight", key: "tonight" },
  { href: "/participate", key: "participate" },
  { href: "/journal", key: "journal" },
  { href: "/collections", key: "collections" },
  { href: "/status", key: "systemStatus" },
] as const satisfies ReadonlyArray<Readonly<{ href: string; key: NavigationMessageKey }>>;

type SiteNavProps = Readonly<{
  messages: NavigationMessages;
}>;

/**
 * Header navigation with an honest active-section indicator. Client-side only
 * because the active state depends on the current pathname.
 */
export function SiteNav({ messages }: SiteNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={messages.ariaLabel} className="min-w-0 max-w-full">
      <ul className="flex max-w-full flex-wrap items-center gap-x-1 gap-y-0 sm:gap-x-2">
        {navigationItems.map((item) => {
          // usePathname is null in non-router render contexts (e.g. bare
          // component tests); treat that as "no active section".
          const active = pathname !== null && `${pathname}/`.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                aria-label={
                  item.key === "observe" ? messages.observationPlannerAriaLabel : undefined
                }
                className={
                  active
                    ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-1.5 text-sm font-semibold text-[var(--accent)] underline decoration-[var(--accent)] decoration-2 underline-offset-8 sm:px-3"
                    : "inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-1.5 text-sm font-medium text-[var(--muted)] no-underline transition-colors hover:text-[var(--foreground)] sm:px-3"
                }
                href={item.href}
              >
                {messages.items[item.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
