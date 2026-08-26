import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteShell } from "../components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lumina — Foundation",
    template: "%s — Lumina",
  },
  description:
    "Lumina is a free, scientifically grounded platform for exploring space. Its first public capability is a provenance-first astronomical catalogue you can search and browse.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070f",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
