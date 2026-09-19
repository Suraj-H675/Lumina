import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import manifest from "../src/app/manifest";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function pngDimensions(path: string): Readonly<{ height: number; width: number }> {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
}

describe("Lumina web app manifest", () => {
  it("publishes the accepted installable identity with only local reviewed icons", () => {
    expect(manifest()).toEqual({
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
    });
  });

  it("ships real PNG install icons at the declared dimensions", () => {
    expect(pngDimensions(resolve(webRoot, "public/icon-192x192.png"))).toEqual({
      height: 192,
      width: 192,
    });
    expect(pngDimensions(resolve(webRoot, "public/icon-512x512.png"))).toEqual({
      height: 512,
      width: 512,
    });
  });
});
