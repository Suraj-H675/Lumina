"use client";

import type { IdentificationSolutionResponse } from "@lumina/api-client";
import { useMemo, useState } from "react";

type SolutionOverlayProps = Readonly<{
  completedAt: string | null;
  imageUrl: string;
  loadingMore: boolean;
  loadMoreWarning: boolean;
  onLoadMore: () => void;
  solution: IdentificationSolutionResponse;
}>;

type ComparisonMode = "annotated" | "original";

export function SolutionOverlay({
  completedAt,
  imageUrl,
  loadingMore,
  loadMoreWarning,
  onLoadMore,
  solution,
}: SolutionOverlayProps) {
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("annotated");
  const [hiddenCategories, setHiddenCategories] = useState<ReadonlySet<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const categories = useMemo(
    () => [...new Set(solution.annotations.map((annotation) => annotation.category))].sort(),
    [solution.annotations],
  );
  const visibleAnnotations = solution.annotations.filter(
    (annotation) => !hiddenCategories.has(annotation.category),
  );
  const width = solution.wcs.image_width;
  const height = solution.wcs.image_height;
  const shortestSide = Math.min(width, height);
  const markerRadius = Math.max(3, shortestSide * 0.006);
  const labelSize = Math.max(10, shortestSide * 0.018);
  const labelOffset = markerRadius * 1.8;

  function toggleCategory(category: string) {
    setHiddenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <section
      aria-labelledby="identify-solution-heading"
      className="space-y-6 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Normalized astrometric result
        </p>
        <h2 className="text-2xl font-semibold" id="identify-solution-heading">
          Solved field and WCS-backed annotations
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Annotation positions below are the stored image-pixel coordinates produced from the
          validated WCS solution. The browser does not estimate positions from percentages or
          contact Astrometry.net directly.
        </p>
      </div>

      <CalibrationSummary completedAt={completedAt} solution={solution} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-2 font-semibold">Image comparison</legend>
            <label className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3">
              <input
                checked={comparisonMode === "annotated"}
                name="identification-comparison"
                onChange={() => setComparisonMode("annotated")}
                type="radio"
              />
              Annotated
            </label>
            <label className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3">
              <input
                checked={comparisonMode === "original"}
                name="identification-comparison"
                onChange={() => setComparisonMode("original")}
                type="radio"
              />
              Original
            </label>
          </fieldset>

          <label className="block max-w-md space-y-2 font-semibold" htmlFor="identify-overlay-zoom">
            <span>Zoom: {zoom.toFixed(1)}×</span>
            <input
              className="block min-h-11 w-full"
              id="identify-overlay-zoom"
              max="4"
              min="1"
              onChange={(event) => setZoom(Number(event.target.value))}
              step="0.5"
              type="range"
              value={zoom}
            />
          </label>
          <p className="text-sm leading-6 text-[var(--muted)]">
            At zoom levels above 1×, pan across the solved image by scrolling the image region.
          </p>

          <div
            aria-label="Scrollable solved astronomical image"
            className="max-h-[70vh] overflow-auto border border-[var(--border)] bg-[var(--surface)]"
            tabIndex={0}
          >
            <div style={{ minWidth: "100%", width: `${zoom * 100}%` }}>
              <svg
                aria-label="Solved astronomical image"
                className="block h-auto w-full text-[var(--accent)]"
                preserveAspectRatio="xMidYMid meet"
                role="img"
                viewBox={`0 0 ${width} ${height}`}
              >
                <title id="identify-overlay-title">Solved astronomical image</title>
                <desc id="identify-overlay-description">
                  {comparisonMode === "annotated"
                    ? `${visibleAnnotations.length} WCS-derived annotations are visible over the local image.`
                    : "The original browser-local image is shown without annotations."}
                </desc>
                <image
                  height={height}
                  href={imageUrl}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ imageOrientation: "none" }}
                  width={width}
                  x="0"
                  y="0"
                />
                {comparisonMode === "annotated"
                  ? visibleAnnotations.map((annotation, index) => (
                      <g
                        key={`${annotation.category}-${annotation.pixel_x}-${annotation.pixel_y}-${index}`}
                      >
                        <circle
                          cx={annotation.pixel_x}
                          cy={annotation.pixel_y}
                          fill="none"
                          r={markerRadius}
                          stroke="currentColor"
                          strokeWidth={Math.max(1.5, markerRadius * 0.22)}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          fill="currentColor"
                          fontSize={labelSize}
                          fontWeight="600"
                          paintOrder="stroke"
                          stroke="var(--surface)"
                          strokeWidth={Math.max(1, labelSize * 0.12)}
                          x={annotation.pixel_x + labelOffset}
                          y={annotation.pixel_y - labelOffset}
                        >
                          {annotation.names[0]}
                        </text>
                      </g>
                    ))
                  : null}
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="font-semibold">Annotation categories</legend>
            {categories.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No named annotations were returned.</p>
            ) : (
              categories.map((category) => (
                <label className="flex min-h-11 items-center gap-3" key={category}>
                  <input
                    checked={!hiddenCategories.has(category)}
                    onChange={() => toggleCategory(category)}
                    type="checkbox"
                  />
                  <span>{formatCategory(category)}</span>
                </label>
              ))
            )}
          </fieldset>

          <div className="space-y-2 border-t border-[var(--border)] pt-4">
            <p className="font-semibold">Annotations loaded: {solution.annotations.length}</p>
            <p className="text-sm text-[var(--muted)]">
              Visible with current filters: {visibleAnnotations.length}
            </p>
            {solution.has_more ? (
              <button
                className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold disabled:opacity-50"
                disabled={loadingMore}
                onClick={onLoadMore}
                type="button"
              >
                {loadingMore ? "Loading annotations…" : "Load more annotations"}
              </button>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                All available annotation pages are loaded.
              </p>
            )}
            {loadMoreWarning ? (
              <p className="text-sm" role="alert">
                More annotations are temporarily unavailable. The loaded solution remains usable.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <AnnotationTable solution={solution} />

      <details className="border border-[var(--border)] p-4">
        <summary className="cursor-pointer font-semibold">
          Solution provenance and limitations
        </summary>
        <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
          <p>
            Solver: Astrometry.net Nova
            {solution.solver_version ? ` (${solution.solver_version})` : ""}. Lumina validates and
            normalizes the returned calibration and WCS before storing it.
          </p>
          <p>
            Annotation names are provider-derived labels associated with the solved WCS; they are
            not object-recognition or generative-AI detections and may not enumerate every object in
            the field.
          </p>
          <p>
            WCS source fingerprint: <code>{solution.wcs.source_sha256}</code>
          </p>
        </div>
      </details>
    </section>
  );
}

function CalibrationSummary({
  completedAt,
  solution,
}: Readonly<{ completedAt: string | null; solution: IdentificationSolutionResponse }>) {
  const calibration = solution.calibration;
  const frame = solution.wcs.coordinate_frame === "icrs" ? "ICRS" : "FK5 J2000";
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Center RA" value={`${calibration.center_ra_deg.toFixed(6)}°`} />
      <Metric label="Center Dec" value={`${calibration.center_dec_deg.toFixed(6)}°`} />
      <Metric label="Coordinate frame" value={frame} />
      <Metric
        label="Pixel scale"
        value={`${calibration.pixel_scale_arcsec_per_pixel.toFixed(3)} arcsec/pixel`}
      />
      <Metric label="Orientation" value={`${calibration.orientation_deg.toFixed(3)}°`} />
      <Metric label="Parity" value={calibration.parity === 1 ? "+1" : "−1"} />
      <Metric label="Field radius" value={`${calibration.radius_deg.toFixed(4)}°`} />
      <Metric
        label="Solved image"
        value={`${solution.wcs.image_width} × ${solution.wcs.image_height}px`}
      />
      {completedAt === null ? null : (
        <Metric label="Solution timestamp" value={formatTimestamp(completedAt)} />
      )}
    </dl>
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

function AnnotationTable({ solution }: Readonly<{ solution: IdentificationSolutionResponse }>) {
  if (solution.annotations.length === 0) return null;
  return (
    <div className="overflow-x-auto border border-[var(--border)]">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <caption className="p-4 text-left font-semibold">Loaded WCS-derived annotations</caption>
        <thead>
          <tr className="border-t border-[var(--border)] bg-[var(--surface)]">
            <th className="p-3" scope="col">
              Label
            </th>
            <th className="p-3" scope="col">
              Category
            </th>
            <th className="p-3" scope="col">
              Pixel x
            </th>
            <th className="p-3" scope="col">
              Pixel y
            </th>
            <th className="p-3" scope="col">
              RA
            </th>
            <th className="p-3" scope="col">
              Dec
            </th>
          </tr>
        </thead>
        <tbody>
          {solution.annotations.map((annotation, index) => (
            <tr
              className="border-t border-[var(--border)]"
              key={`${annotation.category}-${annotation.pixel_x}-${annotation.pixel_y}-${index}`}
            >
              <td className="p-3">{annotation.names.join(" · ")}</td>
              <td className="p-3">{formatCategory(annotation.category)}</td>
              <td className="p-3 tabular-nums">{annotation.pixel_x.toFixed(2)}</td>
              <td className="p-3 tabular-nums">{annotation.pixel_y.toFixed(2)}</td>
              <td className="p-3 tabular-nums">{annotation.ra_deg.toFixed(6)}°</td>
              <td className="p-3 tabular-nums">{annotation.dec_deg.toFixed(6)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCategory(value: string): string {
  return value.replaceAll(/[._-]+/gu, " ").replaceAll(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}
