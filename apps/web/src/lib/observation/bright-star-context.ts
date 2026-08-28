export const BRIGHT_STAR_CONTEXT_URL = "/data/gaia-dr3-bright-sky-context-v1.csv";
export const BRIGHT_STAR_CONTEXT_ROW_COUNT = 3_690;
export const BRIGHT_STAR_CONTEXT_SOLUTION_ID = "1636148068921376768";
export const BRIGHT_STAR_CONTEXT_REFERENCE_EPOCH = "2016.0";
export const BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE = 5.5;
export const BRIGHT_STAR_CONTEXT_MAXIMUM_BYTES = 2 * 1024 * 1024;
export const BRIGHT_STAR_CONTEXT_MAXIMUM_ROWS = 10_000;

export const BRIGHT_STAR_CONTEXT_COLUMNS = [
  "source_id",
  "solution_id",
  "designation",
  "ref_epoch",
  "ra",
  "dec",
  "phot_g_mean_mag",
  "duplicated_source",
] as const;

export type BrightContextStar = Readonly<{
  sourceId: string;
  rightAscensionDegrees: number;
  declinationDegrees: number;
  gMagnitude: number;
}>;

export class BrightStarContextRejected extends Error {
  constructor() {
    super("The Gaia DR3 bright-star context artifact was rejected.");
    this.name = "BrightStarContextRejected";
  }
}

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const FINITE_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function reject(): never {
  throw new BrightStarContextRejected();
}

function parseCsvLine(line: string): Array<string> {
  const fields: Array<string> = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character !== '"') {
        field += character;
        continue;
      }
      if (line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
        quoteClosed = true;
      }
      continue;
    }
    if (character === ",") {
      fields.push(field);
      field = "";
      quoteClosed = false;
    } else if (character === '"') {
      if (field !== "" || quoteClosed) reject();
      quoted = true;
    } else {
      if (quoteClosed) reject();
      field += character;
    }
  }
  if (quoted) reject();
  fields.push(field);
  return fields;
}

function finiteDecimal(lexeme: string): number {
  if (!FINITE_DECIMAL.test(lexeme)) reject();
  const value = Number(lexeme);
  if (!Number.isFinite(value)) reject();
  return value;
}

/** Compares canonical positive integer lexemes without losing 64-bit source-ID precision. */
export function compareGaiaSourceIds(left: string, right: string): number {
  if (!POSITIVE_INTEGER.test(left) || !POSITIVE_INTEGER.test(right)) reject();
  if (left.length !== right.length) return left.length - right.length;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Strictly validates a complete UTF-8/LF Gaia CSV and returns no partial result on failure. */
export function parseBrightStarContextArtifact(
  bytes: Uint8Array,
  expectedRowCount = BRIGHT_STAR_CONTEXT_ROW_COUNT,
): ReadonlyArray<BrightContextStar> {
  if (
    bytes.byteLength > BRIGHT_STAR_CONTEXT_MAXIMUM_BYTES ||
    bytes.byteLength === 0 ||
    bytes[bytes.byteLength - 1] !== 0x0a ||
    bytes.includes(0x0d) ||
    bytes.includes(0x00)
  ) {
    reject();
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    reject();
  }
  const lines = text.slice(0, -1).split("\n");
  if (
    lines.length !== expectedRowCount + 1 ||
    lines.length > BRIGHT_STAR_CONTEXT_MAXIMUM_ROWS + 1 ||
    lines.some((line) => line.length === 0)
  ) {
    reject();
  }
  const header = parseCsvLine(lines[0] ?? "");
  if (
    header.length !== BRIGHT_STAR_CONTEXT_COLUMNS.length ||
    header.some((field, index) => field !== BRIGHT_STAR_CONTEXT_COLUMNS[index])
  ) {
    reject();
  }

  const seenSourceIds = new Set<string>();
  const stars: Array<BrightContextStar> = [];
  let previousMagnitude: number | null = null;
  let previousSourceId: string | null = null;
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    if (fields.length !== BRIGHT_STAR_CONTEXT_COLUMNS.length) reject();
    const [sourceId, solutionId, designation, refEpoch, ra, dec, magnitude, duplicated] = fields;
    if (
      sourceId === undefined ||
      solutionId === undefined ||
      designation === undefined ||
      refEpoch === undefined ||
      ra === undefined ||
      dec === undefined ||
      magnitude === undefined ||
      duplicated === undefined ||
      !POSITIVE_INTEGER.test(sourceId) ||
      seenSourceIds.has(sourceId) ||
      solutionId !== BRIGHT_STAR_CONTEXT_SOLUTION_ID ||
      designation !== `Gaia DR3 ${sourceId}` ||
      refEpoch !== BRIGHT_STAR_CONTEXT_REFERENCE_EPOCH ||
      duplicated !== "false"
    ) {
      reject();
    }
    const rightAscensionDegrees = finiteDecimal(ra);
    const declinationDegrees = finiteDecimal(dec);
    const gMagnitude = finiteDecimal(magnitude);
    if (
      rightAscensionDegrees < 0 ||
      rightAscensionDegrees >= 360 ||
      declinationDegrees < -90 ||
      declinationDegrees > 90 ||
      gMagnitude > BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE
    ) {
      reject();
    }
    if (
      previousMagnitude !== null &&
      (gMagnitude < previousMagnitude ||
        (gMagnitude === previousMagnitude &&
          previousSourceId !== null &&
          compareGaiaSourceIds(sourceId, previousSourceId) < 0))
    ) {
      reject();
    }
    previousMagnitude = gMagnitude;
    previousSourceId = sourceId;
    seenSourceIds.add(sourceId);
    stars.push(Object.freeze({ sourceId, rightAscensionDegrees, declinationDegrees, gMagnitude }));
  }
  if (stars.length !== expectedRowCount) reject();
  return Object.freeze(stars);
}

let cachedBrightStarContext: Promise<ReadonlyArray<BrightContextStar>> | null = null;

/** Loads the pinned same-origin asset once; the request never includes observer coordinates. */
export function loadBrightStarContext(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ReadonlyArray<BrightContextStar>> {
  cachedBrightStarContext ??= (async () => {
    try {
      const response = await fetcher(BRIGHT_STAR_CONTEXT_URL, {
        cache: "force-cache",
        credentials: "same-origin",
      });
      if (!response.ok) reject();
      const bytes = new Uint8Array(await response.arrayBuffer());
      return parseBrightStarContextArtifact(bytes);
    } catch {
      reject();
    }
  })();
  return cachedBrightStarContext;
}

/** Clears module cache only for isolated tests; production code never calls this. */
export function resetBrightStarContextCacheForTests(): void {
  cachedBrightStarContext = null;
}
