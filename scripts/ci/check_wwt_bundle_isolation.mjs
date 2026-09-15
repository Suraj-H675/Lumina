import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const appRoot = process.cwd();
const nextRoot = resolve(appRoot, ".next");
const MAX_DEEP_SKY_PAGE_BYTES = 64 * 1024;
const WWT_SIGNATURES = ["ImageSets6", "WWTControlBuilder", "ConstellationNamePositions_v2_EN"];

const ROUTES = [
  ["home", "server/app/page_client-reference-manifest.js", "/page"],
  ["explore", "server/app/explore/page_client-reference-manifest.js", "/explore/page"],
  ["object", "server/app/objects/[slug]/page_client-reference-manifest.js", "/objects/[slug]/page"],
  [
    "deep-sky",
    "server/app/explore/deep-sky/page_client-reference-manifest.js",
    "/explore/deep-sky/page",
  ],
];

function fail(message) {
  process.stderr.write(`WWT bundle isolation failed: ${message}\n`);
  process.exitCode = 1;
}

function normalizeChunk(value) {
  return value.replace(/^\/_next\//u, "").replace(/^\.next\//u, "");
}

function readManifest(relativePath, routeKey) {
  const path = join(nextRoot, relativePath);
  if (!existsSync(path)) throw new Error(`missing production manifest: ${relativePath}`);
  const source = readFileSync(path, "utf8");
  const marker = `globalThis.__RSC_MANIFEST[${JSON.stringify(routeKey)}] = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`route key ${routeKey} missing from ${relativePath}`);
  const payload = source
    .slice(start + marker.length)
    .trim()
    .replace(/;\s*$/u, "");
  return JSON.parse(payload);
}

function initialChunks(manifest) {
  const chunks = new Set();
  for (const module of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of module.chunks ?? []) chunks.add(normalizeChunk(chunk));
  }
  for (const entry of Object.values(manifest.entryJSFiles ?? {})) {
    for (const chunk of entry) chunks.add(normalizeChunk(chunk));
  }
  return chunks;
}

function containsWwtImplementation(path) {
  const source = readFileSync(path, "utf8");
  return WWT_SIGNATURES.some((signature) => source.includes(signature));
}

function walkJavascript(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkJavascript(path));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

try {
  const routeManifests = new Map();
  const allInitialChunks = new Set();
  for (const [label, relativePath, routeKey] of ROUTES) {
    const manifest = readManifest(relativePath, routeKey);
    routeManifests.set(label, manifest);
    const chunks = initialChunks(manifest);
    for (const chunk of chunks) {
      allInitialChunks.add(chunk);
      const path = join(nextRoot, chunk);
      if (!existsSync(path)) fail(`${label} references missing initial chunk ${chunk}`);
      else if (containsWwtImplementation(path)) {
        fail(`${label} initial client graph contains WWT implementation bytes in ${chunk}`);
      }
    }
  }

  const deepSky = routeManifests.get("deep-sky");
  const entryEntries = Object.entries(deepSky.entryJSFiles ?? {});
  const pageEntry = entryEntries.find(([key]) => key.endsWith("/src/app/explore/deep-sky/page"));
  const layoutEntry = entryEntries.find(([key]) => key.endsWith("/src/app/layout"));
  if (pageEntry === undefined || layoutEntry === undefined) {
    fail("could not resolve deep-sky page/layout entry chunks");
  } else {
    const shared = new Set(layoutEntry[1].map(normalizeChunk));
    const shellChunks = pageEntry[1].map(normalizeChunk).filter((chunk) => !shared.has(chunk));
    const shellBytes = shellChunks.reduce(
      (total, chunk) => total + statSync(join(nextRoot, chunk)).size,
      0,
    );
    if (shellBytes > MAX_DEEP_SKY_PAGE_BYTES) {
      fail(`deep-sky route shell is ${shellBytes} bytes, budget is ${MAX_DEEP_SKY_PAGE_BYTES}`);
    } else {
      process.stdout.write(
        `WWT deep-sky shell: ${shellBytes} bytes (${shellChunks.length} route chunk(s)).\n`,
      );
    }
  }

  const staticChunkRoot = join(nextRoot, "static/chunks");
  const wwtChunks = walkJavascript(staticChunkRoot).filter(containsWwtImplementation);
  if (wwtChunks.length === 0) {
    fail("no emitted lazy WWT implementation chunk was found");
  }
  for (const path of wwtChunks) {
    const relative = path.slice(nextRoot.length + 1);
    if (allInitialChunks.has(relative))
      fail(`WWT implementation chunk ${relative} is initial-route reachable`);
  }
  if (process.exitCode === undefined) {
    const bytes = wwtChunks.reduce((total, path) => total + statSync(path).size, 0);
    process.stdout.write(
      `WWT bundle isolation passed: ${wwtChunks.length} lazy chunk(s), ${bytes} bytes, absent from home/explore/object/deep-sky initial graphs.\n`,
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
