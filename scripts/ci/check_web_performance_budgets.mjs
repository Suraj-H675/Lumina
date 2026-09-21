import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const appRoot = process.cwd();
const nextRoot = resolve(appRoot, ".next");
const KIB = 1024;

// Phase 8D baseline measured from the certified production build at a059c278.
// Budgets intentionally keep roughly 16–25% headroom so normal chunk movement
// does not create noise while meaningful initial-client JS regressions fail CI.
const ROUTES = [
  ["home", "(en)/page", 384 * KIB],
  ["explore", "(en)/explore/page", 480 * KIB],
  ["object", "(en)/objects/[slug]/page", 544 * KIB],
  ["compare", "(en)/compare/page", 480 * KIB],
  ["observe", "(en)/observe/page", 768 * KIB],
  ["identify", "(en)/identify/page", 704 * KIB],
  ["learn", "(en)/learn/page", 400 * KIB],
  ["lab", "(en)/lab/page", 320 * KIB],
  ["space-now", "(en)/now/page", 320 * KIB],
  ["journal", "(en)/journal/page", 544 * KIB],
  ["participate", "(en)/participate/page", 320 * KIB],
  ["tonight", "(en)/tonight/page", 608 * KIB],
  ["deep-sky", "(en)/explore/deep-sky/page", 320 * KIB],
  ["hr-diagram", "(en)/lab/hr-diagram-explorer/page", 320 * KIB],
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

try {
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
