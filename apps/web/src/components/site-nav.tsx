"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/explore", label: "Explore" },
  { href: "/compare", label: "Compare" },
  { href: "/observe", label: "Observe" },
  { href: "/tonight", label: "Tonight" },
  { href: "/collections", label: "Collections" },
  { href: "/status", label: "Status" },
] as const;

/**
 * Header navigation with an honest active-section indicator. Client-side only
 * because the active state depends on the current pathname.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary">
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-0 sm:gap-x-2">
        {navigationItems.map((item) => {
          // usePathname is null in non-router render contexts (e.g. bare
          // component tests); treat that as "no active section".
          const active = pathname !== null && `${pathname}/`.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                aria-label={item.href === "/observe" ? "Observation planner" : undefined}
                className={
                  active
                    ? "inline-flex min-h-11 items-center rounded-sm px-1.5 text-sm font-semibold text-[var(--accent)] underline decoration-[var(--accent)] decoration-2 underline-offset-8 sm:px-3"
                    : "inline-flex min-h-11 items-center rounded-sm px-1.5 text-sm font-medium text-[var(--muted)] no-underline transition-colors hover:text-[var(--foreground)] sm:px-3"
                }
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
