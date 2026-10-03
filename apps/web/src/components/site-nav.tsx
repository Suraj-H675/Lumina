"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavigationMessageKey, NavigationMessages } from "../lib/i18n/messages/types";
import styles from "./site-shell.module.css";

const primaryNavigationItems = [
  { href: "/explore", key: "explore" },
  { href: "/learn", key: "learn" },
  { href: "/lab", key: "lab" },
  { href: "/now", key: "spaceNow" },
  { href: "/observe", key: "observe" },
] as const satisfies ReadonlyArray<Readonly<{ href: string; key: NavigationMessageKey }>>;
const primaryNavigationHrefs = new Set<string>(primaryNavigationItems.map((item) => item.href));

const navigationGroups = [
  {
    key: "explore",
    items: [
      { href: "/explore", key: "explore" },
      { href: "/compare", key: "compare" },
    ],
  },
  {
    key: "observe",
    items: [
      { href: "/observe", key: "observe" },
      { href: "/tonight", key: "tonight" },
      { href: "/identify", key: "identify" },
    ],
  },
  {
    key: "learnAndExperiment",
    items: [
      { href: "/learn", key: "learn" },
      { href: "/lab", key: "lab" },
      { href: "/participate", key: "participate" },
    ],
  },
  {
    key: "personal",
    items: [
      { href: "/collections", key: "collections" },
      { href: "/journal", key: "journal" },
    ],
  },
  {
    key: "currentAndSystem",
    items: [
      { href: "/now", key: "spaceNow" },
      { href: "/status", key: "systemStatus" },
    ],
  },
] as const;

type SiteNavProps = Readonly<{
  messages: NavigationMessages;
}>;

export function SiteNav({ messages }: SiteNavProps) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname !== null && `${pathname}/`.startsWith(`${href}/`);

  return (
    <nav aria-label={messages.ariaLabel} className={styles.nav}>
      <ul className={styles.primaryList}>
        {primaryNavigationItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                aria-current={pathname === item.href ? "page" : undefined}
                aria-label={
                  item.key === "observe" ? messages.observationPlannerAriaLabel : undefined
                }
                className={styles.primaryLink}
                data-active={active}
                href={item.href}
              >
                {messages.items[item.key]}
              </Link>
            </li>
          );
        })}
      </ul>
      <details className={styles.navigator}>
        <summary className={styles.navigatorSummary}>{messages.menuLabel}</summary>
        <div className={styles.navigatorPanel}>
          {navigationGroups.map((group) => (
            <section className={styles.navGroup} key={group.key}>
              <p className={styles.navGroupTitle}>{messages.groups[group.key]}</p>
              <ul className={styles.navGroupList}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      aria-current={pathname === item.href ? "page" : undefined}
                      aria-label={
                        item.key === "observe" ? messages.observationPlannerAriaLabel : undefined
                      }
                      className={styles.menuLink}
                      data-active={isActive(item.href)}
                      data-primary-destination={primaryNavigationHrefs.has(item.href) || undefined}
                      href={item.href}
                    >
                      {messages.items[item.key]}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </nav>
  );
}
