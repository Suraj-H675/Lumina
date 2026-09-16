import type { Metadata } from "next";

import { JournalView } from "./journal-view";

export const metadata: Metadata = {
  description: "Review observations saved locally in this browser.",
  robots: { follow: false, index: false },
  title: "Journal · Lumina",
};

export default function JournalPage() {
  return <JournalView />;
}
