import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_CAPTURE_SAMPLE_PIXELS,
  analyzeCaptureFile,
  analyzeCapturePixels,
  captureSampleDimensions,
} from "../src/lib/identification/capture-checks";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Phase 6C capture-check domain", () => {
  it("summarizes fixed RGB code endpoints and luma bins without a quality verdict", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 255, 0, 0, 255,
    ]);

    const result = analyzeCapturePixels(pixels, 2, 2);
    expect(result.low_endpoint_percentage).toBe(50);
    expect(result.high_endpoint_percentage).toBe(50);
    expect(result.opaque_sample_pixels).toBe(4);
    expect(result.non_opaque_sample_pixels).toBe(0);
    expect(result.luminance_histogram[0]?.pixel_count).toBe(1);
    expect(result.luminance_histogram[3]?.pixel_count).toBe(1);
    expect(result.luminance_histogram[8]?.pixel_count).toBe(1);
    expect(result.luminance_histogram[15]?.pixel_count).toBe(1);
  });
  it("excludes non-opaque sample pixels from endpoint percentages and histogram", () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255]);

    const result = analyzeCapturePixels(pixels, 2, 1);
    expect(result.opaque_sample_pixels).toBe(1);
    expect(result.non_opaque_sample_pixels).toBe(1);
    expect(result.low_endpoint_percentage).toBe(0);
    expect(result.high_endpoint_percentage).toBe(100);
    expect(result.luminance_histogram.reduce((sum, bin) => sum + bin.pixel_count, 0)).toBe(1);
  });

  it("derives a bounded aspect-preserving diagnostic sample", () => {
    expect(captureSampleDimensions(512, 512)).toEqual({ height: 512, width: 512 });
    const sample = captureSampleDimensions(10_000, 5_000);
    expect(sample.width * sample.height).toBeLessThanOrEqual(MAX_CAPTURE_SAMPLE_PIXELS);
    expect(sample.width / sample.height).toBeCloseTo(2, 2);
  });

  it("requests a bounded bitmap decode before reading display pixels", async () => {
    const sample = captureSampleDimensions(1_024, 512);
    const pixels = new Uint8ClampedArray(sample.width * sample.height * 4);
    for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
    const close = vi.fn();
    const createBitmap = vi.fn().mockResolvedValue({ ...sample, close });
    vi.stubGlobal("createImageBitmap", createBitmap);
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels })),
      imageSmoothingEnabled: true,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    const file = new File(["fixture"], "fixture.png", { type: "image/png" });
    const result = await analyzeCaptureFile(file, 1_024, 512);

    expect(createBitmap).toHaveBeenCalledWith(file, {
      imageOrientation: "none",
      resizeHeight: sample.height,
      resizeQuality: "pixelated",
      resizeWidth: sample.width,
    });
    expect(result.sample_width_px * result.sample_height_px).toBeLessThanOrEqual(
      MAX_CAPTURE_SAMPLE_PIXELS,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects malformed pixel buffers and samples with no opaque pixels", () => {
    expect(() => analyzeCapturePixels(new Uint8ClampedArray(4), 2, 2)).toThrow();
    expect(() => analyzeCapturePixels(new Uint8ClampedArray([1, 2, 3, 0]), 1, 1)).toThrow();
  });
});
