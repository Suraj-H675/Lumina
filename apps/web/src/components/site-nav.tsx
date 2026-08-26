"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/explore", label: "Explore" },
  { href: "/compare", label: "Compare" },
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
      <ul className="flex items-center gap-1 sm:gap-2">
        {navigationItems.map((item) => {
          // usePathname is null in non-router render contexts (e.g. bare
          // component tests); treat that as "no active section".
          const active = pathname !== null && `${pathname}/`.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-semibold text-[var(--accent)] underline decoration-[var(--accent)] decoration-2 underline-offset-8 sm:px-3"
                    : "inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-[var(--muted)] no-underline transition-colors hover:text-[var(--foreground)] sm:px-3"
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
