export const WWT_FREESTANDING_ASSET_BASE = "https://web.wwtassets.org/engine/assets";
export const WWT_LAYER_COLLECTION_PATH = "/wwt/lumina-sky-layers.wtml";
export const WORLDWIDE_TELESCOPE_NAME = "WorldWide Telescope";
export const WORLDWIDE_TELESCOPE_SHORT_NAME = "WWT";
export const ATLAS_DEFAULT_FIELD_OF_VIEW_DEG = 5;
export const ATLAS_MIN_FIELD_OF_VIEW_DEG = 0.05;
export const ATLAS_MAX_FIELD_OF_VIEW_DEG = 120;

export type AtlasLayerId =
  "visible-dss2" | "infrared-wise" | "ultraviolet-galex" | "microwave-planck";

export type AtlasLayer = Readonly<{
  availabilityProbeUrl: string;
  band: "visible" | "infrared" | "ultraviolet" | "microwave";
  creditText: string;
  creditUrl: string;
  id: AtlasLayerId;
  imageSetName: string;
  interpretation: string;
  label: string;
  runtimeHosts: ReadonlyArray<string>;
}>;

export const ATLAS_LAYERS: ReadonlyArray<AtlasLayer> = [
  {
    availabilityProbeUrl: "https://cdn.worldwidetelescope.org/wwtweb/dss.aspx?q=0,0,0",
    band: "visible",
    creditText: "Copyright DSS Consortium. These data are from the DSS2 survey.",
    creditUrl: "https://gsss.stsci.edu/Acknowledgements/DataCopyrights.htm",
    id: "visible-dss2",
    imageSetName: "Digitized Sky Survey (Color)",
    interpretation:
      "A photographic optical survey composite. Display colours are a survey rendering, not a direct naked-eye view.",
    label: "Visible · DSS2",
    runtimeHosts: ["cdn.worldwidetelescope.org"],
  },
  {
    availabilityProbeUrl: "https://www.worldwidetelescope.org/wwtweb/tiles.aspx?q=0,0,0,wise",
    band: "infrared",
    creditText: "NASA/JPL-Caltech/UCLA",
    creditUrl: "https://wise.ssl.berkeley.edu/",
    id: "infrared-wise",
    imageSetName: "WISE All Sky (Infrared)",
    interpretation:
      "Infrared survey imagery mapped into display colours. The colours represent infrared measurements, not visible-light colour.",
    label: "Infrared · WISE",
    runtimeHosts: ["www.worldwidetelescope.org"],
  },
  {
    availabilityProbeUrl: "https://www.worldwidetelescope.org/wwtweb/galexTOAST.aspx?q=0,0,0",
    band: "ultraviolet",
    creditText:
      "Space Telescope Science Institute. TOAST-formatted data was obtained from NASA's SkyView Virtual Telescope. The Galaxy Explorer instrument allows observations to be made in ultraviolet bands Far UV 1350-1780A and Near UV 1770-2730A. This is the GR2/3 release.",
    creditUrl: "https://archive.stsci.edu/missions-and-data/galex",
    id: "ultraviolet-galex",
    imageSetName: "GALEX (Ultraviolet)",
    interpretation:
      "GALEX far- and near-ultraviolet measurements mapped into display colours; this is false-colour ultraviolet context.",
    label: "Ultraviolet · GALEX",
    runtimeHosts: ["www.worldwidetelescope.org"],
  },
  {
    availabilityProbeUrl: "https://www.worldwidetelescope.org/wwtweb/tiles.aspx?q=0,0,0,planck",
    band: "microwave",
    creditText:
      "Planck is a European Space Agency mission, with significant participation from NASA. NASA's Planck Project Office is based at JPL. JPL contributed mission-enabling technology for both of Planck's science instruments. European, Canadian and U.S. Planck scientists work together to analyze the Planck data.",
    creditUrl: "https://science.nasa.gov/mission/planck/",
    id: "microwave-planck",
    imageSetName: "Planck CMB",
    interpretation:
      "Microwave sky measurements rendered as a scientific map; display colour encodes data values rather than visible colour.",
    label: "Microwave · Planck",
    runtimeHosts: ["www.worldwidetelescope.org"],
  },
] as const;

const LAYERS_BY_ID = new Map<AtlasLayerId, AtlasLayer>(
  ATLAS_LAYERS.map((layer) => [layer.id, layer]),
);

export const APPROVED_WWT_RUNTIME_HOSTS = Object.freeze(
  new Set(["web.wwtassets.org", ...ATLAS_LAYERS.flatMap((layer) => layer.runtimeHosts)]),
);

export function atlasLayerById(value: string | undefined): AtlasLayer | null {
  if (value === undefined) return ATLAS_LAYERS[0] ?? null;
  return LAYERS_BY_ID.get(value as AtlasLayerId) ?? null;
}

export function degreesToRadians(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Angle must be finite");
  return (value * Math.PI) / 180;
}

export type AtlasObserver = Readonly<{
  elevationM: number;
  latitude: number;
  longitude: number;
}>;

export function validateAtlasObserver(value: AtlasObserver): AtlasObserver | null {
  if (![value.latitude, value.longitude, value.elevationM].every(Number.isFinite)) return null;
  if (value.latitude < -90 || value.latitude > 90) return null;
  if (value.longitude < -180 || value.longitude > 180) return null;
  if (value.elevationM < -500 || value.elevationM > 10_000) return null;
  return Object.freeze({ ...value });
}

export function validateFieldOfViewDeg(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < ATLAS_MIN_FIELD_OF_VIEW_DEG || value > ATLAS_MAX_FIELD_OF_VIEW_DEG) return null;
  return value;
}

export function parseAtlasUtcInstant(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/u.exec(value);
  if (match === null) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number((millisecondText ?? "0").padEnd(3, "0"));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== day ||
    instant.getUTCHours() !== hour ||
    instant.getUTCMinutes() !== minute ||
    instant.getUTCSeconds() !== second ||
    instant.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }
  return instant;
}
