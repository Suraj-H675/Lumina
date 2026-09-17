"use client";

export const CAPTURE_CHECK_MODEL_VERSION = "browser-raster-sample-v1" as const;
export const MAX_CAPTURE_SAMPLE_PIXELS = 512 * 512;
export const CAPTURE_HISTOGRAM_BINS = 16;

export type CaptureHistogramBin = Readonly<{
  code_max: number;
  code_min: number;
  pixel_count: number;
  percentage: number;
}>;

export type CaptureCheckResult = Readonly<{
  model_version: typeof CAPTURE_CHECK_MODEL_VERSION;
  source_height_px: number;
  source_width_px: number;
  sample_height_px: number;
  sample_width_px: number;
  opaque_sample_pixels: number;
  non_opaque_sample_pixels: number;
  low_endpoint_percentage: number;
  high_endpoint_percentage: number;
  luminance_histogram: ReadonlyArray<CaptureHistogramBin>;
}>;

export class CaptureCheckError extends Error {
  constructor(readonly reason: "decode-failed" | "invalid-pixels" | "no-opaque-pixels") {
    super("The browser-local capture check could not be completed safely.");
    this.name = "CaptureCheckError";
  }
}
export function captureSampleDimensions(
  width: number,
  height: number,
): Readonly<{ height: number; width: number }> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new CaptureCheckError("invalid-pixels");
  }
  const sourcePixels = width * height;
  if (!Number.isSafeInteger(sourcePixels)) throw new CaptureCheckError("invalid-pixels");
  if (sourcePixels <= MAX_CAPTURE_SAMPLE_PIXELS) return { height, width };

  const scale = Math.sqrt(MAX_CAPTURE_SAMPLE_PIXELS / sourcePixels);
  let sampleWidth = Math.max(1, Math.floor(width * scale));
  let sampleHeight = Math.max(1, Math.floor(height * scale));
  while (sampleWidth * sampleHeight > MAX_CAPTURE_SAMPLE_PIXELS) {
    if (sampleWidth >= sampleHeight) sampleWidth -= 1;
    else sampleHeight -= 1;
  }
  return { height: sampleHeight, width: sampleWidth };
}

function percentage(count: number, total: number): number {
  return (count / total) * 100;
}
export function analyzeCapturePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Omit<CaptureCheckResult, "source_height_px" | "source_width_px"> {
  const pixelCount = width * height;
  if (
    !Number.isSafeInteger(pixelCount) ||
    pixelCount <= 0 ||
    rgba.length !== pixelCount * 4 ||
    pixelCount > MAX_CAPTURE_SAMPLE_PIXELS
  ) {
    throw new CaptureCheckError("invalid-pixels");
  }

  const histogramCounts = Array<number>(CAPTURE_HISTOGRAM_BINS).fill(0);
  let opaque = 0;
  let nonOpaque = 0;
  let lowEndpoint = 0;
  let highEndpoint = 0;

  for (let offset = 0; offset < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3] ?? 0;
    if (alpha !== 255) {
      nonOpaque += 1;
      continue;
    }
    const red = rgba[offset] ?? 0;
    const green = rgba[offset + 1] ?? 0;
    const blue = rgba[offset + 2] ?? 0;
    opaque += 1;
    if (red === 0 || green === 0 || blue === 0) lowEndpoint += 1;
    if (red === 255 || green === 255 || blue === 255) highEndpoint += 1;

    // Fixed integer display-RGB luma proxy: approximately Rec.709 weights.
    // This is a code-value summary only, not calibrated scene luminance.
    const lumaCode = Math.min(255, Math.floor((54 * red + 183 * green + 19 * blue) / 256));
    const binIndex = Math.min(CAPTURE_HISTOGRAM_BINS - 1, Math.floor(lumaCode / 16));
    histogramCounts[binIndex] = (histogramCounts[binIndex] ?? 0) + 1;
  }

  if (opaque === 0) throw new CaptureCheckError("no-opaque-pixels");
  const luminanceHistogram = histogramCounts.map((count, index) => ({
    code_max: index === CAPTURE_HISTOGRAM_BINS - 1 ? 255 : index * 16 + 15,
    code_min: index * 16,
    pixel_count: count,
    percentage: percentage(count, opaque),
  }));

  return {
    high_endpoint_percentage: percentage(highEndpoint, opaque),
    low_endpoint_percentage: percentage(lowEndpoint, opaque),
    luminance_histogram: luminanceHistogram,
    model_version: CAPTURE_CHECK_MODEL_VERSION,
    non_opaque_sample_pixels: nonOpaque,
    opaque_sample_pixels: opaque,
    sample_height_px: height,
    sample_width_px: width,
  };
}
export async function analyzeCaptureFile(
  file: File,
  sourceWidth: number,
  sourceHeight: number,
): Promise<CaptureCheckResult> {
  if (
    (file.type !== "image/jpeg" && file.type !== "image/png") ||
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    throw new CaptureCheckError("decode-failed");
  }

  const sample = captureSampleDimensions(sourceWidth, sourceHeight);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "none",
      resizeHeight: sample.height,
      resizeQuality: "pixelated",
      resizeWidth: sample.width,
    });
  } catch {
    throw new CaptureCheckError("decode-failed");
  }

  try {
    if (bitmap.width !== sample.width || bitmap.height !== sample.height) {
      throw new CaptureCheckError("decode-failed");
    }
    const canvas = document.createElement("canvas");
    canvas.width = sample.width;
    canvas.height = sample.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) throw new CaptureCheckError("decode-failed");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, sample.width, sample.height);
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    let pixels: ImageData;
    try {
      pixels = context.getImageData(0, 0, sample.width, sample.height);
    } catch {
      throw new CaptureCheckError("decode-failed");
    }
    return {
      ...analyzeCapturePixels(pixels.data, sample.width, sample.height),
      source_height_px: sourceHeight,
      source_width_px: sourceWidth,
    };
  } finally {
    bitmap.close();
  }
}
