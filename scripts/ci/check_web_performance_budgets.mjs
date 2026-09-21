import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const appRoot = process.cwd();
const nextRoot = resolve(appRoot, ".next");
const KIB = 1024;

// Phase 8D baseline measured from the production build at b488339f and then
// expanded to every canonical English page. Budgets intentionally keep roughly
// 16–25% headroom so normal chunk movement does not create noise while
// meaningful initial-client JS regressions fail CI.
const ROUTES = [
  ["home", "(en)/page", 384 * KIB],
  ["explore", "(en)/explore/page", 480 * KIB],
  ["deep-sky", "(en)/explore/deep-sky/page", 320 * KIB],
  ["exoplanet-systems", "(en)/explore/exoplanet-systems/page", 336 * KIB],
  ["voyager", "(en)/explore/missions/voyager-1/page", 336 * KIB],
  ["solar-system", "(en)/explore/solar-system/page", 336 * KIB],
  ["system-compare", "(en)/explore/system-compare/page", 384 * KIB],
  ["object", "(en)/objects/[slug]/page", 544 * KIB],
  ["compare", "(en)/compare/page", 480 * KIB],
  ["collections", "(en)/collections/page", 336 * KIB],
  ["collection-detail", "(en)/collections/[collectionId]/page", 480 * KIB],
  ["discoveries", "(en)/discoveries/page", 320 * KIB],
  ["observe", "(en)/observe/page", 768 * KIB],
  ["identify", "(en)/identify/page", 704 * KIB],
  ["learn", "(en)/learn/page", 400 * KIB],
  ["learn-path", "(en)/learn/[pathSlug]/page", 400 * KIB],
  ["learn-lesson", "(en)/learn/[pathSlug]/[lessonSlug]/page", 416 * KIB],
  ["lab", "(en)/lab/page", 320 * KIB],
  ["black-hole-relativity", "(en)/lab/black-hole-relativity/page", 320 * KIB],
  ["eclipse", "(en)/lab/eclipse-simulator/page", 320 * KIB],
  ["impact", "(en)/lab/impact-simulator/page", 320 * KIB],
  ["orbit", "(en)/lab/orbit-sandbox/page", 320 * KIB],
  ["planetary-system", "(en)/lab/planetary-system-builder/page", 320 * KIB],
  ["radial-velocity", "(en)/lab/radial-velocity/page", 320 * KIB],
  ["relativity", "(en)/lab/relativity-visualizations/page", 320 * KIB],
  ["rocket-mission", "(en)/lab/rocket-mission-designer/page", 320 * KIB],
  ["scale-explorer", "(en)/lab/scale-explorer/page", 320 * KIB],
  ["scale-explorer-node", "(en)/lab/scale-explorer/[nodeId]/page", 320 * KIB],
  ["scale-explorer-invalid", "(en)/lab/scale-explorer/invalid-state/page", 320 * KIB],
  ["seasons", "(en)/lab/seasons-simulator/page", 320 * KIB],
  ["spectroscopy", "(en)/lab/spectroscopy-lab/page", 320 * KIB],
  ["stellar", "(en)/lab/stellar-laboratory/page", 320 * KIB],
  ["telescope", "(en)/lab/telescope-builder/page", 320 * KIB],
  ["transit", "(en)/lab/transit-method/page", 320 * KIB],
  ["space-now", "(en)/now/page", 320 * KIB],
  ["launches", "(en)/now/launches/page", 320 * KIB],
  ["launch-detail", "(en)/now/launches/[launchId]/page", 320 * KIB],
  ["near-earth", "(en)/now/near-earth/page", 320 * KIB],
  ["satellites", "(en)/now/satellites/page", 448 * KIB],
  ["space-weather", "(en)/now/space-weather/page", 320 * KIB],
  ["journal", "(en)/journal/page", 544 * KIB],
  ["participate", "(en)/participate/page", 320 * KIB],
  ["tonight", "(en)/tonight/page", 608 * KIB],
  ["hr-diagram", "(en)/lab/hr-diagram-explorer/page", 320 * KIB],
  ["offline", "(en)/offline/page", 320 * KIB],
  ["offline-storage", "(en)/offline/storage/page", 512 * KIB],
  ["status", "(en)/status/page", 320 * KIB],
];

function fail(message) {
  process.stderr.write(`Web performance budget failed: ${message}\n`);
  process.exitCode = 1;
}

function normalizeChunk(value) {
  return value.replace(/^\/_next\//u, "").replace(/^\.next\//u, "");
}

function readManifest(routeKey) {
  const relativePath = `server/app/${routeKey}_client-reference-manifest.js`;
  const path = join(nextRoot, relativePath);
  if (!existsSync(path)) throw new Error(`missing production manifest: ${relativePath}`);

  const source = readFileSync(path, "utf8");
  const marker = "globalThis.__RSC_MANIFEST[";
  const assignmentStart = source.indexOf(marker);
  if (assignmentStart < 0) throw new Error(`route manifest assignment missing: ${relativePath}`);
  const equals = source.indexOf(" = ", assignmentStart);
  if (equals < 0) throw new Error(`route manifest payload missing: ${relativePath}`);

  const payload = source
    .slice(equals + 3)
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

function formatKib(bytes) {
  return `${(bytes / KIB).toFixed(1)} KiB`;
}

function discoverCanonicalPageKeys(directory) {
  const keys = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) keys.push(...discoverCanonicalPageKeys(path));
    else if (entry.isFile() && entry.name === "page_client-reference-manifest.js") {
      keys.push(
        relative(join(nextRoot, "server/app"), path).replace(
          /_client-reference-manifest\.js$/u,
          "",
        ),
      );
    }
  }
  return keys;
}

try {
  const budgetedRouteKeys = new Set(ROUTES.map(([, routeKey]) => routeKey));
  const canonicalRoot = join(nextRoot, "server/app/(en)");
  for (const routeKey of discoverCanonicalPageKeys(canonicalRoot)) {
    if (!budgetedRouteKeys.has(routeKey))
      fail(`canonical page has no explicit budget: ${routeKey}`);
  }

  for (const [label, routeKey, budgetBytes] of ROUTES) {
    const manifest = readManifest(routeKey);
    const chunks = initialChunks(manifest);
    let bytes = 0;

    for (const chunk of chunks) {
      const path = join(nextRoot, chunk);
      if (!existsSync(path)) {
        fail(`${label} references missing initial chunk ${chunk}`);
        continue;
      }
      bytes += statSync(path).size;
    }

    if (bytes > budgetBytes) {
      fail(
        `${label} initial client JS is ${formatKib(bytes)}; budget is ${formatKib(budgetBytes)}`,
      );
    } else {
      process.stdout.write(
        `Web performance budget: ${label} ${formatKib(bytes)} / ${formatKib(budgetBytes)} (${chunks.size} chunks).\n`,
      );
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
