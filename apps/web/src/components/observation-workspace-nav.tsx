import Link from "next/link";

import type { ObservationWorkspaceMessages } from "../lib/i18n/messages/types";
import styles from "./observation-workspace-nav.module.css";

type ObservationWorkspaceKey = "identify" | "observe" | "tonight";

const destinations = [
  { href: "/observe", key: "observe" },
  { href: "/tonight", key: "tonight" },
  { href: "/identify", key: "identify" },
] as const satisfies ReadonlyArray<Readonly<{ href: string; key: ObservationWorkspaceKey }>>;

export function ObservationWorkspaceNav({
  current,
  messages,
}: Readonly<{
  current: ObservationWorkspaceKey;
  messages: ObservationWorkspaceMessages;
}>) {
  return (
    <nav aria-label={messages.ariaLabel} className={styles.nav}>
      {destinations.map((destination) => {
        const item = messages.items[destination.key];
        return (
          <Link
            aria-current={current === destination.key ? "page" : undefined}
            className={styles.link}
            href={destination.href}
            key={destination.href}
          >
            <span className={styles.label}>{item.label}</span>
            <span className={styles.description}>{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
