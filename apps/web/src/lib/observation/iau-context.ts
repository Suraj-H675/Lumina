import type { CoordinatePair } from "./domain";

export const NAMED_ANCHOR_CONTEXT_URL = "/data/iau-named-gaia-bright-anchors-v1.json";
export const NAMED_ANCHOR_CONTEXT_ROW_COUNT = 236;
export const NAMED_ANCHOR_CONTEXT_ARTIFACT_BYTES = 79_245;
export const NAMED_ANCHOR_CONTEXT_ARTIFACT_SHA256 =
  "68097843437fe7eea89f1b577b4ed3fd7956238fd84d2c7fcb2d8de1696d1aa7";
export const NAMED_ANCHOR_CONTEXT_MAXIMUM_BYTES = 512 * 1024;

export const CONSTELLATION_CONTEXT_URL = "/data/iau-constellation-context-v1.json";
export const CONSTELLATION_CONTEXT_ROW_COUNT = 88;
export const CONSTELLATION_CONTEXT_PART_COUNT = 89;
export const CONSTELLATION_CONTEXT_VERTEX_COUNT = 1_565;
export const CONSTELLATION_CONTEXT_ARTIFACT_BYTES = 236_885;
export const CONSTELLATION_CONTEXT_ARTIFACT_SHA256 =
  "c4c4710f1f57ec9575e658d7a9a6c9b003bb1d61c6fed6797def5f4b6f78795e";
export const CONSTELLATION_CONTEXT_MAXIMUM_BYTES = 512 * 1024;

const NAMED_ANCHOR_COLUMNS = [
  "iau_name",
  "hip_id",
  "iau_constellation_abbreviation",
  "date_approved",
  "gaia_source_id",
  "gaia_crossmatch_angular_distance_arcsec",
  "gaia_crossmatch_neighbour_count",
  "gaia_crossmatch_flag",
] as const;

const CONSTELLATION_ROOT_KEYS = [
  "boundary_semantics",
  "constellations",
  "coordinate_reference",
  "dataset_id",
  "row_count",
  "schema_version",
  "target_memberships",
] as const;

const BOUNDARY_PART_KEYS = ["source_file", "vertices"] as const;
const BOUNDARY_VERTEX_KEYS = ["declination_degrees", "right_ascension_degrees"] as const;
const TARGET_MEMBERSHIP_KEYS = [
  "constellation_abbreviation",
  "coordinate_source",
  "declination_degrees",
  "gaia_source_id",
  "membership_method",
  "right_ascension_degrees",
  "target_name",
  "target_slug",
  "verification_source",
] as const;
const COORDINATE_SOURCE_KEYS = [
  "dataset_code",
  "provider_code",
  "reference_epoch",
  "release_version",
  "table",
] as const;

const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const DATE_APPROVED = /^([0-9]{4})\/([0-9]{2})\/([0-9]{2})$/u;
const TARGET_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SOURCE_FILE = /^[a-z0-9]+\.txt$/u;

const OFFICIAL_CONSTELLATIONS = {
  And: ["Andromeda", "the Chained Maiden"],
  Ant: ["Antlia", "the Air Pump"],
  Aps: ["Apus", "the Bird of Paradise"],
  Aql: ["Aquila", "the Eagle"],
  Aqr: ["Aquarius", "the Water Bearer"],
  Ara: ["Ara", "the Altar"],
  Ari: ["Aries", "the Ram"],
  Aur: ["Auriga", "the Charioteer"],
  Boo: ["Boötes", "the Herdsman"],
  CMa: ["Canis Major", "the Great Dog"],
  CMi: ["Canis Minor", "the Lesser Dog"],
  CVn: ["Canes Venatici", "the Hunting Dogs"],
  Cae: ["Caelum", "the Engraving Tool"],
  Cam: ["Camelopardalis", "the Giraffe"],
  Cap: ["Capricornus", "the Sea Goat"],
  Car: ["Carina", "the Keel"],
  Cas: ["Cassiopeia", "the Seated Queen"],
  Cen: ["Centaurus", "the Centaur"],
  Cep: ["Cepheus", "the King"],
  Cet: ["Cetus", "the Sea Monster"],
  Cha: ["Chamaeleon", "the Chameleon"],
  Cir: ["Circinus", "the Drawing Compass"],
  Cnc: ["Cancer", "the Crab"],
  Col: ["Columba", "the Dove"],
  Com: ["Coma Berenices", "the Bernice's Hair"],
  CrA: ["Corona Australis", "the Southern Crown"],
  CrB: ["Corona Borealis", "the Northern Crown"],
  Crt: ["Crater", "the Cup"],
  Cru: ["Crux", "the Southern Cross"],
  Crv: ["Corvus", "the Crow"],
  Cyg: ["Cygnus", "the Swan"],
  Del: ["Delphinus", "the Dolphin"],
  Dor: ["Dorado", "the Swordfish"],
  Dra: ["Draco", "the Dragon"],
  Equ: ["Equuleus", "the Little Horse"],
  Eri: ["Eridanus", "the River"],
  For: ["Fornax", "the Furnace"],
  Gem: ["Gemini", "the Twins"],
  Gru: ["Grus", "the Crane"],
  Her: ["Hercules", "the Hercules"],
  Hor: ["Horologium", "the Clock"],
  Hya: ["Hydra", "the Female Water Snake"],
  Hyi: ["Hydrus", "the Male Water Snake"],
  Ind: ["Indus", "the Indian"],
  LMi: ["Leo Minor", "the Lesser Lion"],
  Lac: ["Lacerta", "the Lizard"],
  Leo: ["Leo", "the Lion"],
  Lep: ["Lepus", "the Hare"],
  Lib: ["Libra", "the Scales"],
  Lup: ["Lupus", "the Wolf"],
  Lyn: ["Lynx", "the Lynx"],
  Lyr: ["Lyra", "the Lyre"],
  Men: ["Mensa", "the Table Mountain"],
  Mic: ["Microscopium", "the Microscope"],
  Mon: ["Monoceros", "the Unicorn"],
  Mus: ["Musca", "the Fly"],
  Nor: ["Norma", "the Carpenter's Square"],
  Oct: ["Octans", "the Octant"],
  Oph: ["Ophiuchus", "the Serpent Bearer"],
  Ori: ["Orion", "the Hunter"],
  Pav: ["Pavo", "the Peacock"],
  Peg: ["Pegasus", "the Winged Horse"],
  Per: ["Perseus", "the Hero"],
  Phe: ["Phoenix", "the Phoenix"],
  Pic: ["Pictor", "the Painter's Easel"],
  PsA: ["Piscis Austrinus", "the Southern Fish"],
  Psc: ["Pisces", "the Fishes"],
  Pup: ["Puppis", "the Stern"],
  Pyx: ["Pyxis", "the Mariner Compass"],
  Ret: ["Reticulum", "the Reticle"],
  Scl: ["Sculptor", "the Sculptor"],
  Sco: ["Scorpius", "the Scorpion"],
  Sct: ["Scutum", "the Shield"],
  Ser: ["Serpens", "the Serpent"],
  Sex: ["Sextans", "the Sextant"],
  Sge: ["Sagitta", "the Arrow"],
  Sgr: ["Sagittarius", "the Archer"],
  Tau: ["Taurus", "the Bull"],
  Tel: ["Telescopium", "the Telescope"],
  TrA: ["Triangulum Australe", "the Southern Triangle"],
  Tri: ["Triangulum", "the Triangle"],
  Tuc: ["Tucana", "the Toucan"],
  UMa: ["Ursa Major", "the Great Bear"],
  UMi: ["Ursa Minor", "the Little Bear"],
  Vel: ["Vela", "the Sails"],
  Vir: ["Virgo", "the Maiden"],
  Vol: ["Volans", "the Flying Fish"],
  Vul: ["Vulpecula", "the Fox"],
} as const satisfies Readonly<Record<string, readonly [string, string]>>;

const OFFICIAL_ABBREVIATIONS = new Set(Object.keys(OFFICIAL_CONSTELLATIONS));

const TARGET_MEMBERSHIP_SLUGS = new Set([
  "51-pegasi",
  "hd-209458",
  "k2-18",
  "kepler-186",
  "kepler-452",
]);

const BOUNDARY_SEMANTICS =
  "Each ordered boundary part is a sky-region boundary; its final vertex connects back to its first vertex. No stick-figure line tradition is represented.";

const EXPECTED_COORDINATE_SOURCE = {
  dataset_code: "gaia-source-astrometry",
  provider_code: "esa-gaia",
  reference_epoch: "J2016.0",
  release_version: "dr3",
  table: "gaiadr3.gaia_source",
} as const;

export type NamedAnchorContextRow = Readonly<{
  iauName: string;
  hipId: number;
  constellationAbbreviation: string;
  dateApproved: string;
  gaiaSourceId: string;
  gaiaCrossmatchAngularDistanceArcsec: number;
  gaiaCrossmatchNeighbourCount: number;
  gaiaCrossmatchFlag: number;
}>;

export type BoundaryVertex = Readonly<{
  rightAscensionDegrees: number;
  declinationDegrees: number;
}>;

export type BoundaryPart = Readonly<{
  sourceFile: string;
  vertices: ReadonlyArray<BoundaryVertex>;
}>;

export type ConstellationRegion = Readonly<{
  abbreviation: string;
  latinName: string;
  englishName: string;
  boundaryParts: ReadonlyArray<BoundaryPart>;
}>;

export type TargetMembership = Readonly<{
  targetSlug: string;
  targetName: string;
  gaiaSourceId: string;
  rightAscensionDegrees: number;
  declinationDegrees: number;
  constellationAbbreviation: string;
  membershipMethod: string;
  verificationSource: string;
}>;

export type NamedAnchorContext = Readonly<{
  rows: ReadonlyArray<NamedAnchorContextRow>;
}>;

export type ConstellationContext = Readonly<{
  constellations: ReadonlyArray<ConstellationRegion>;
  targetMemberships: ReadonlyArray<TargetMembership>;
}>;

export class IAUContextRejected extends Error {
  constructor() {
    super("The IAU sky-context artifact was rejected.");
    this.name = "IAUContextRejected";
  }
}

function reject(): never {
  throw new IAUContextRejected();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordWithKeys(value: unknown, keys: ReadonlyArray<string>): Record<string, unknown> {
  if (!isRecord(value)) reject();
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) reject();
  return value;
}

function requiredString(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    reject();
  }
  return value;
}

function requiredPositiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) reject();
  return value;
}

function requiredNonnegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) reject();
  return value;
}

function requiredFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) reject();
  return value;
}

function requiredPositiveIntegerLexeme(value: unknown): string {
  const text = requiredString(value);
  if (!POSITIVE_INTEGER.test(text)) reject();
  return text;
}

function requiredDateApproved(value: unknown): string {
  const text = requiredString(value);
  const match = DATE_APPROVED.exec(text);
  if (match === null) reject();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    reject();
  }
  return text;
}

function requiredStringArray(value: unknown, expectedLength: number): ReadonlyArray<string> {
  if (!Array.isArray(value) || value.length !== expectedLength) reject();
  return Object.freeze(value.map((item) => requiredString(item)));
}

function parseJson(bytes: Uint8Array): Record<string, unknown> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    reject();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    reject();
  }
  if (!isRecord(parsed)) reject();
  return parsed;
}

function parseNamedRows(value: unknown, expectedRowCount: number): NamedAnchorContext {
  if (!Number.isSafeInteger(expectedRowCount) || expectedRowCount <= 0) reject();
  const document = recordWithKeys(value, [
    "anchors",
    "columns",
    "dataset_id",
    "row_count",
    "schema_version",
  ]);
  if (
    document.dataset_id !== "iau-named-gaia-bright-anchors-v1" ||
    document.schema_version !== 1 ||
    document.row_count !== expectedRowCount ||
    JSON.stringify(requiredStringArray(document.columns, NAMED_ANCHOR_COLUMNS.length)) !==
      JSON.stringify(NAMED_ANCHOR_COLUMNS)
  ) {
    reject();
  }
  if (!Array.isArray(document.anchors) || document.anchors.length !== expectedRowCount) reject();

  const rows: Array<NamedAnchorContextRow> = [];
  const seenNames = new Set<string>();
  const seenSourceIds = new Set<string>();
  let previousName: string | null = null;
  for (const value of document.anchors) {
    const anchor = recordWithKeys(value, NAMED_ANCHOR_COLUMNS);
    const iauName = requiredString(anchor.iau_name);
    if (seenNames.has(iauName) || (previousName !== null && iauName <= previousName)) reject();
    seenNames.add(iauName);
    previousName = iauName;
    const hipId = requiredPositiveInteger(anchor.hip_id);
    const constellationAbbreviation = requiredString(anchor.iau_constellation_abbreviation);
    if (!OFFICIAL_ABBREVIATIONS.has(constellationAbbreviation)) reject();
    const dateApproved = requiredDateApproved(anchor.date_approved);
    const gaiaSourceId = requiredPositiveIntegerLexeme(anchor.gaia_source_id);
    if (seenSourceIds.has(gaiaSourceId)) reject();
    seenSourceIds.add(gaiaSourceId);
    const angularDistance = requiredFiniteNumber(anchor.gaia_crossmatch_angular_distance_arcsec);
    if (angularDistance < 0) reject();
    const neighbourCount = requiredPositiveInteger(anchor.gaia_crossmatch_neighbour_count);
    if (neighbourCount !== 1) reject();
    const crossmatchFlag = requiredNonnegativeInteger(anchor.gaia_crossmatch_flag);
    if (crossmatchFlag > 32_767 || (crossmatchFlag & 3) !== 0) reject();
    rows.push(
      Object.freeze({
        iauName,
        hipId,
        constellationAbbreviation,
        dateApproved,
        gaiaSourceId,
        gaiaCrossmatchAngularDistanceArcsec: angularDistance,
        gaiaCrossmatchNeighbourCount: neighbourCount,
        gaiaCrossmatchFlag: crossmatchFlag,
      }),
    );
  }
  return Object.freeze({ rows: Object.freeze(rows) });
}

function parseBoundaryVertex(value: unknown): BoundaryVertex {
  const vertex = recordWithKeys(value, BOUNDARY_VERTEX_KEYS);
  const rightAscensionDegrees = requiredFiniteNumber(vertex.right_ascension_degrees);
  const declinationDegrees = requiredFiniteNumber(vertex.declination_degrees);
  if (
    rightAscensionDegrees < 0 ||
    rightAscensionDegrees >= 360 ||
    declinationDegrees < -90 ||
    declinationDegrees > 90
  ) {
    reject();
  }
  return Object.freeze({ rightAscensionDegrees, declinationDegrees });
}

function parseConstellations(value: unknown): ReadonlyArray<ConstellationRegion> {
  if (!Array.isArray(value) || value.length !== CONSTELLATION_CONTEXT_ROW_COUNT) reject();
  const rows: Array<ConstellationRegion> = [];
  const seenAbbreviations = new Set<string>();
  const seenSourceFiles = new Set<string>();
  let previousAbbreviation: string | null = null;
  let partCount = 0;
  let vertexCount = 0;

  for (const constellationValue of value) {
    const item = recordWithKeys(constellationValue, [
      "abbreviation",
      "boundary_parts",
      "english_name",
      "latin_name",
    ]);
    const abbreviation = requiredString(item.abbreviation);
    if (
      !OFFICIAL_ABBREVIATIONS.has(abbreviation) ||
      seenAbbreviations.has(abbreviation) ||
      (previousAbbreviation !== null && abbreviation <= previousAbbreviation)
    ) {
      reject();
    }
    seenAbbreviations.add(abbreviation);
    previousAbbreviation = abbreviation;
    const identity = OFFICIAL_CONSTELLATIONS[abbreviation as keyof typeof OFFICIAL_CONSTELLATIONS];
    if (item.latin_name !== identity[0] || item.english_name !== identity[1]) reject();
    if (!Array.isArray(item.boundary_parts) || item.boundary_parts.length === 0) reject();

    const parts: Array<BoundaryPart> = [];
    for (const partValue of item.boundary_parts) {
      const part = recordWithKeys(partValue, BOUNDARY_PART_KEYS);
      const sourceFile = requiredString(part.source_file);
      if (!SOURCE_FILE.test(sourceFile) || seenSourceFiles.has(sourceFile)) reject();
      const stem = sourceFile.slice(0, -4);
      if (
        stem !== abbreviation.toLowerCase() &&
        !(abbreviation === "Ser" && ["ser1", "ser2"].includes(stem))
      ) {
        reject();
      }
      seenSourceFiles.add(sourceFile);
      if (!Array.isArray(part.vertices) || part.vertices.length < 3) reject();
      const vertices = Object.freeze(part.vertices.map((vertex) => parseBoundaryVertex(vertex)));
      parts.push(Object.freeze({ sourceFile, vertices }));
      partCount += 1;
      vertexCount += vertices.length;
    }
    rows.push(
      Object.freeze({
        abbreviation,
        latinName: identity[0],
        englishName: identity[1],
        boundaryParts: Object.freeze(parts),
      }),
    );
  }
  if (
    seenAbbreviations.size !== CONSTELLATION_CONTEXT_ROW_COUNT ||
    seenSourceFiles.size !== CONSTELLATION_CONTEXT_PART_COUNT ||
    partCount !== CONSTELLATION_CONTEXT_PART_COUNT ||
    vertexCount !== CONSTELLATION_CONTEXT_VERTEX_COUNT
  ) {
    reject();
  }
  return Object.freeze(rows);
}

function parseTargetMemberships(value: unknown): ReadonlyArray<TargetMembership> {
  if (!Array.isArray(value) || value.length !== TARGET_MEMBERSHIP_SLUGS.size) reject();
  const rows: Array<TargetMembership> = [];
  const seenSlugs = new Set<string>();
  const seenSourceIds = new Set<string>();
  let previousSlug: string | null = null;
  for (const targetValue of value) {
    const target = recordWithKeys(targetValue, TARGET_MEMBERSHIP_KEYS);
    const targetSlug = requiredString(target.target_slug);
    if (
      !TARGET_SLUG.test(targetSlug) ||
      !TARGET_MEMBERSHIP_SLUGS.has(targetSlug) ||
      seenSlugs.has(targetSlug) ||
      (previousSlug !== null && targetSlug <= previousSlug)
    ) {
      reject();
    }
    seenSlugs.add(targetSlug);
    previousSlug = targetSlug;
    const targetName = requiredString(target.target_name);
    const gaiaSourceId = requiredPositiveIntegerLexeme(target.gaia_source_id);
    if (seenSourceIds.has(gaiaSourceId)) reject();
    seenSourceIds.add(gaiaSourceId);
    const rightAscensionDegrees = requiredFiniteNumber(target.right_ascension_degrees);
    const declinationDegrees = requiredFiniteNumber(target.declination_degrees);
    if (
      rightAscensionDegrees < 0 ||
      rightAscensionDegrees >= 360 ||
      declinationDegrees < -90 ||
      declinationDegrees > 90
    ) {
      reject();
    }
    const constellationAbbreviation = requiredString(target.constellation_abbreviation);
    if (!OFFICIAL_ABBREVIATIONS.has(constellationAbbreviation)) reject();
    const coordinateSource = recordWithKeys(target.coordinate_source, COORDINATE_SOURCE_KEYS);
    if (
      coordinateSource.dataset_code !== EXPECTED_COORDINATE_SOURCE.dataset_code ||
      coordinateSource.provider_code !== EXPECTED_COORDINATE_SOURCE.provider_code ||
      coordinateSource.reference_epoch !== EXPECTED_COORDINATE_SOURCE.reference_epoch ||
      coordinateSource.release_version !== EXPECTED_COORDINATE_SOURCE.release_version ||
      coordinateSource.table !== EXPECTED_COORDINATE_SOURCE.table
    ) {
      reject();
    }
    const membershipMethod = requiredString(target.membership_method);
    const verificationSource = requiredString(target.verification_source);
    rows.push(
      Object.freeze({
        targetSlug,
        targetName,
        gaiaSourceId,
        rightAscensionDegrees,
        declinationDegrees,
        constellationAbbreviation,
        membershipMethod,
        verificationSource,
      }),
    );
  }
  if (seenSlugs.size !== TARGET_MEMBERSHIP_SLUGS.size) reject();
  return Object.freeze(rows);
}

export function parseNamedAnchorContextArtifact(
  bytes: Uint8Array,
  expectedRowCount = NAMED_ANCHOR_CONTEXT_ROW_COUNT,
): NamedAnchorContext {
  return parseNamedRows(parseJson(bytes), expectedRowCount);
}

export function parseConstellationContextArtifact(bytes: Uint8Array): ConstellationContext {
  const document = recordWithKeys(parseJson(bytes), CONSTELLATION_ROOT_KEYS);
  if (
    document.dataset_id !== "iau-constellation-context-v1" ||
    document.schema_version !== 1 ||
    document.row_count !== CONSTELLATION_CONTEXT_ROW_COUNT ||
    document.boundary_semantics !== BOUNDARY_SEMANTICS
  ) {
    reject();
  }
  const coordinateReference = recordWithKeys(document.coordinate_reference, [
    "declination_unit",
    "frame",
    "representation",
    "right_ascension_unit",
    "source_notation",
  ]);
  if (
    coordinateReference.declination_unit !== "degrees" ||
    coordinateReference.frame !== "equatorial" ||
    coordinateReference.representation !== "J2000.0" ||
    coordinateReference.right_ascension_unit !== "degrees" ||
    coordinateReference.source_notation !==
      "IAU boundary TXT right ascension HH MM SS.SSSS and declination degrees"
  ) {
    reject();
  }
  return Object.freeze({
    constellations: parseConstellations(document.constellations),
    targetMemberships: parseTargetMemberships(document.target_memberships),
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) reject();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadJsonArtifact(
  fetcher: typeof fetch,
  url: string,
  byteCount: number,
  sha256Hex: string,
  maximumBytes: number,
): Promise<Uint8Array> {
  try {
    const response = await fetcher(url, { cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) reject();
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== byteCount || bytes.byteLength > maximumBytes) reject();
    if ((await sha256(bytes)) !== sha256Hex) reject();
    return bytes;
  } catch {
    reject();
  }
}

let cachedNamedAnchorContext: Promise<NamedAnchorContext> | null = null;
let cachedConstellationContext: Promise<ConstellationContext> | null = null;

export function loadNamedAnchorContext(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<NamedAnchorContext> {
  if (cachedNamedAnchorContext !== null) return cachedNamedAnchorContext;
  const pending = (async () => {
    const bytes = await loadJsonArtifact(
      fetcher,
      NAMED_ANCHOR_CONTEXT_URL,
      NAMED_ANCHOR_CONTEXT_ARTIFACT_BYTES,
      NAMED_ANCHOR_CONTEXT_ARTIFACT_SHA256,
      NAMED_ANCHOR_CONTEXT_MAXIMUM_BYTES,
    );
    return parseNamedAnchorContextArtifact(bytes);
  })();
  cachedNamedAnchorContext = pending.catch((error: unknown) => {
    cachedNamedAnchorContext = null;
    throw error;
  });
  return cachedNamedAnchorContext;
}

export function loadConstellationContext(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ConstellationContext> {
  if (cachedConstellationContext !== null) return cachedConstellationContext;
  const pending = (async () => {
    const bytes = await loadJsonArtifact(
      fetcher,
      CONSTELLATION_CONTEXT_URL,
      CONSTELLATION_CONTEXT_ARTIFACT_BYTES,
      CONSTELLATION_CONTEXT_ARTIFACT_SHA256,
      CONSTELLATION_CONTEXT_MAXIMUM_BYTES,
    );
    return parseConstellationContextArtifact(bytes);
  })();
  cachedConstellationContext = pending.catch((error: unknown) => {
    cachedConstellationContext = null;
    throw error;
  });
  return cachedConstellationContext;
}

export function resolveTargetConstellation(
  context: ConstellationContext,
  targetSlug: string,
  coordinate: Pick<
    CoordinatePair,
    "epoch" | "rightAscensionDegrees" | "declinationDegrees" | "source"
  >,
): TargetMembership | null {
  const membership = context.targetMemberships.find((item) => item.targetSlug === targetSlug);
  if (membership === undefined) return null;
  if (
    coordinate.epoch !== 2016 ||
    coordinate.source.provider.code !== "esa-gaia" ||
    coordinate.source.dataset.code !== "gaia-source-astrometry" ||
    coordinate.source.dataset.release_version !== "dr3" ||
    coordinate.rightAscensionDegrees !== membership.rightAscensionDegrees ||
    coordinate.declinationDegrees !== membership.declinationDegrees
  ) {
    return null;
  }
  return membership;
}

export function resetIauContextCachesForTests(): void {
  cachedNamedAnchorContext = null;
  cachedConstellationContext = null;
}
