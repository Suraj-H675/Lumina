import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_WWT_RUNTIME_HOSTS, ATLAS_LAYERS } from "../src/lib/wwt/atlas";

const WTML_PATH = resolve(process.cwd(), "public/wwt/lumina-sky-layers.wtml");

function parsedImageSets(
  xml: string,
): Array<
  Readonly<{ band: string; creditText: string; creditUrl: string; name: string; url: string }>
> {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  expect(document.querySelector("parsererror")).toBeNull();
  return [...document.querySelectorAll("ImageSet")].map((node) => ({
    band: node.getAttribute("BandPass") ?? "",
    creditText: node.querySelector("Credits")?.textContent ?? "",
    creditUrl: node.querySelector("CreditsUrl")?.textContent ?? "",
    name: node.getAttribute("Name") ?? "",
    url: node.getAttribute("Url") ?? "",
  }));
}

describe("reviewed WWT layer inventory", () => {
  it("keeps WTML and TypeScript inventories one-to-one with only approved HTTPS hosts", async () => {
    const xml = await readFile(WTML_PATH, "utf8");
    const imageSets = parsedImageSets(xml);

    expect(imageSets).toHaveLength(ATLAS_LAYERS.length);
    expect(imageSets.map((entry) => entry.name)).toEqual(
      ATLAS_LAYERS.map((layer) => layer.imageSetName),
    );
    expect(imageSets.map((entry) => entry.band)).toEqual([
      "Visible",
      "IR",
      "Ultraviolet",
      "Microwave",
    ]);
    expect(imageSets.map((entry) => entry.creditText)).toEqual(
      ATLAS_LAYERS.map((layer) => layer.creditText),
    );
    expect(imageSets.map((entry) => entry.creditUrl)).toEqual(
      ATLAS_LAYERS.map((layer) => layer.creditUrl),
    );

    for (const entry of imageSets) {
      const url = new URL(entry.url.replaceAll(/\{[^}]+\}/gu, "0"));
      expect(url.protocol).toBe("https:");
      expect(APPROVED_WWT_RUNTIME_HOSTS.has(url.hostname)).toBe(true);
    }
    for (const layer of ATLAS_LAYERS) {
      const probeUrl = new URL(layer.availabilityProbeUrl);
      expect(probeUrl.protocol).toBe("https:");
      expect(layer.runtimeHosts).toContain(probeUrl.hostname);
      expect(APPROVED_WWT_RUNTIME_HOSTS.has(probeUrl.hostname)).toBe(true);
    }
    expect(xml).not.toMatch(/AltUrl=|ThumbnailUrl|<Place\b|<Folder[^>]+Url=/u);
  });

  it("contains no caller-controlled or proxy-style collection endpoint", async () => {
    const xml = await readFile(WTML_PATH, "utf8");
    expect(xml).not.toMatch(/cors|proxy|hips|fits|\{query\}|\{url\}/iu);
    expect(xml).not.toContain("http://");
  });
});
