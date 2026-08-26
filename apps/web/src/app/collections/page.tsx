import type { Metadata } from "next";

import { CollectionsOverview } from "../../components/collections-overview";

/**
 * Truthful generic metadata: collection names are local-only and must never
 * leak into server infrastructure, so the overview never personalizes titles.
 */
export const metadata: Metadata = {
  description:
    "Create and browse your own collections of catalogue objects. Saved locally in this browser — no account needed.",
  title: "Collections",
};

export default function CollectionsPage() {
  return <CollectionsOverview />;
}
