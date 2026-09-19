import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#05070f",
    description:
      "A free, scientifically grounded platform for exploring, learning, observing, simulating, and participating in astronomy.",
    display: "standalone",
    icons: [
      {
        sizes: "192x192",
        src: "/icon-192x192.png",
        type: "image/png",
      },
      {
        sizes: "512x512",
        src: "/icon-512x512.png",
        type: "image/png",
      },
    ],
    name: "Lumina",
    scope: "/",
    short_name: "Lumina",
    start_url: "/",
    theme_color: "#05070f",
  };
}
