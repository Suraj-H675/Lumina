"use client";

import { useState } from "react";

import {
  CaptureCheckError,
  MAX_CAPTURE_SAMPLE_PIXELS,
  analyzeCaptureFile,
  type CaptureCheckResult,
} from "../../lib/identification/capture-checks";

type CaptureCheckState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "running" }>
  | Readonly<{ kind: "ready"; result: CaptureCheckResult }>
  | Readonly<{ kind: "error"; message: string }>;

export function CaptureChecksPanel({
  sourceHeightPx,
  sourceImage,
  sourceWidthPx,
}: Readonly<{ sourceHeightPx: number; sourceImage: File | null; sourceWidthPx: number }>) {
  const [state, setState] = useState<CaptureCheckState>({ kind: "idle" });
  if (sourceImage === null) return null;
  const localSourceImage = sourceImage;

  async function runChecks() {
    setState({ kind: "running" });
    try {
      setState({
        kind: "ready",
        result: await analyzeCaptureFile(localSourceImage, sourceWidthPx, sourceHeightPx),
      });
    } catch (error) {
      setState({ kind: "error", message: captureFailureMessage(error) });
    }
  }

  return (
    <section
      aria-labelledby="capture-checks-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Browser-local diagnostics
        </p>
        <h2 className="text-2xl font-semibold" id="capture-checks-heading">
          Capture checks
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Run a bounded diagnostic sample of the image already held in this browser. This action
          makes no additional upload and does not contact Astrometry.net or another survey service.
        </p>
      </div>

      {state.kind === "idle" || state.kind === "error" ? (
        <button
          className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
          onClick={() => void runChecks()}
          type="button"
        >
          {state.kind === "error" ? "Retry local capture checks" : "Run local capture checks"}
        </button>
      ) : null}
      {state.kind === "running" ? (
        <p role="status">Analyzing a bounded local pixel sample…</p>
      ) : null}
      {state.kind === "error" ? <p role="alert">{state.message}</p> : null}
      {state.kind === "ready" ? <CaptureCheckResults result={state.result} /> : null}

      <div className="space-y-2 text-sm leading-6 text-[var(--muted)]">
        <p>
          The browser decodes the selected JPEG/PNG to display RGB and samples at most{" "}
          {MAX_CAPTURE_SAMPLE_PIXELS.toLocaleString("en-US")} pixels with nearest-neighbour scaling.
        </p>
        <p>
          These are code-value proxies, not sensor/raw measurements or universal photography advice.
          Compression, transparency, black borders, processing, colour management, and intentional
          saturation can all affect the numbers.
        </p>
      </div>
    </section>
  );
}
function CaptureCheckResults({ result }: Readonly<{ result: CaptureCheckResult }>) {
  return (
    <div className="space-y-5" role="status">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Source dimensions"
          value={`${result.source_width_px.toLocaleString("en-US")} × ${result.source_height_px.toLocaleString("en-US")} pixels`}
        />
        <Metric
          label="Diagnostic sample"
          value={`${result.sample_width_px.toLocaleString("en-US")} × ${result.sample_height_px.toLocaleString("en-US")}`}
        />
        <Metric
          label="Minimum-code proxy"
          value={`${result.low_endpoint_percentage.toFixed(2)}%`}
        />
        <Metric
          label="Maximum-code proxy"
          value={`${result.high_endpoint_percentage.toFixed(2)}%`}
        />
      </dl>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Display-RGB luma histogram</h3>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Distribution across opaque sampled pixels only. This is not isolated sky-background
          measurement and is not calibrated luminance.
        </p>
        <ol aria-label="Display-RGB luma histogram" className="space-y-2 p-0">
          {result.luminance_histogram.map((bin) => (
            <li className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3" key={bin.code_min}>
              <span className="font-mono text-xs">
                {bin.code_min}–{bin.code_max}
              </span>
              <span aria-hidden="true" className="h-2 border border-[var(--border)]">
                <span
                  className="block h-full bg-[var(--foreground)]"
                  style={{ width: `${Math.min(100, Math.max(0, bin.percentage))}%` }}
                />
              </span>
              <span className="text-right text-xs">{bin.percentage.toFixed(2)}%</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-sm leading-6 text-[var(--muted)]">
        Minimum/maximum-code proxies count opaque sample pixels where at least one RGB channel is
        exactly 0 or 255 after browser decoding. Endpoint occupancy can be consistent with clipping,
        but it can also come from legitimate image content or processing; Lumina does not diagnose
        exposure from these percentages.
      </p>
      {result.non_opaque_sample_pixels > 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {result.non_opaque_sample_pixels.toLocaleString("en-US")} non-opaque sampled pixels were
          excluded from the histogram and endpoint percentages.
        </p>
      ) : null}
    </div>
  );
}
function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function captureFailureMessage(error: unknown): string {
  if (!(error instanceof CaptureCheckError)) {
    return "The browser could not complete the local capture check. No additional upload occurred.";
  }
  if (error.reason === "no-opaque-pixels") {
    return "The bounded sample contains no fully opaque pixels, so these RGB diagnostics are not meaningful.";
  }
  if (error.reason === "invalid-pixels") {
    return "The decoded pixel sample failed Lumina's bounded validation checks.";
  }
  return "This browser could not decode the selected image for local capture checks. The solved result remains available.";
}
