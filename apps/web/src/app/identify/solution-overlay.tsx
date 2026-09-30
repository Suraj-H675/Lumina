"use client";

import type { IdentificationSolutionResponse } from "@nova-lumina/api-client";
import { useMemo, useState } from "react";

import {
  formatCountMessage,
  formatLocaleDateTime,
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { IdentifyMessages } from "../../lib/i18n/messages/types";
import {
  ASTROMETRY_PROVIDER_NAME,
  NOVA_SERVICE_NAME,
} from "../../lib/identification/provider-display";
import styles from "./identify-experience.module.css";

type SolutionOverlayProps = Readonly<{
  completedAt: string | null;
  imageUrl: string;
  locale: PublishedLocale;
  loadingMore: boolean;
  loadMoreWarning: boolean;
  messages: IdentifyMessages["solutionOverlay"];
  onLoadMore: () => void;
  solution: IdentificationSolutionResponse;
}>;

type ComparisonMode = "annotated" | "original";

export function SolutionOverlay({
  completedAt,
  imageUrl,
  locale,
  loadingMore,
  loadMoreWarning,
  messages,
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
    <section aria-labelledby="identify-solution-heading" className={styles.stage}>
      <div className={styles.stageHeader}>
        <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
        <h2 className={styles.stageTitle} id="identify-solution-heading">
          {messages.title}
        </h2>
        <p className={styles.stageDescription}>
          {formatMessageTemplate(messages.description, {
            provider: ASTROMETRY_PROVIDER_NAME,
          })}
        </p>
      </div>

      <div className={styles.stageBody}>
        <div className={styles.solutionStack}>
          <CalibrationSummary
            completedAt={completedAt}
            locale={locale}
            messages={messages.metrics}
            solution={solution}
          />

          <div className={styles.viewerLayout}>
            <div className={styles.viewerMain}>
              <fieldset className={styles.choiceFieldset}>
                <legend>{messages.comparison.legend}</legend>
                <div className={styles.choiceRow}>
                  <label className={styles.choice}>
                    <input
                      checked={comparisonMode === "annotated"}
                      name="identification-comparison"
                      onChange={() => setComparisonMode("annotated")}
                      type="radio"
                    />
                    {messages.comparison.annotated}
                  </label>
                  <label className={styles.choice}>
                    <input
                      checked={comparisonMode === "original"}
                      name="identification-comparison"
                      onChange={() => setComparisonMode("original")}
                      type="radio"
                    />
                    {messages.comparison.original}
                  </label>
                </div>
              </fieldset>

              <label className={styles.zoomField} htmlFor="identify-overlay-zoom">
                <span>
                  {formatMessageTemplate(messages.comparison.zoomLabel, {
                    zoom: formatLocaleFixedNumber(zoom, 1, locale),
                  })}
                </span>
                <input
                  id="identify-overlay-zoom"
                  max="4"
                  min="1"
                  onChange={(event) => setZoom(Number(event.target.value))}
                  step="0.5"
                  type="range"
                  value={zoom}
                />
              </label>
              <p className={styles.fieldHelp}>{messages.comparison.zoomHelp}</p>

              <div
                aria-label={messages.comparison.scrollRegionLabel}
                className={styles.imageViewport}
                tabIndex={0}
              >
                <div style={{ minWidth: "100%", width: `${zoom * 100}%` }}>
                  <svg
                    aria-label={messages.comparison.solvedImageLabel}
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    viewBox={`0 0 ${width} ${height}`}
                  >
                    <title id="identify-overlay-title">
                      {messages.comparison.solvedImageLabel}
                    </title>
                    <desc id="identify-overlay-description">
                      {comparisonMode === "annotated"
                        ? formatCountMessage(
                            messages.comparison.visibleAnnotations,
                            visibleAnnotations.length,
                            locale,
                          )
                        : messages.comparison.originalDescription}
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

            <div className={styles.viewerControls}>
              <fieldset className={styles.categoryFieldset}>
                <legend>{messages.annotations.categoriesLegend}</legend>
                {categories.length === 0 ? (
                  <p className={styles.fieldHelp}>{messages.annotations.empty}</p>
                ) : (
                  categories.map((category) => (
                    <label className={styles.categoryChoice} key={category}>
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

              <div className={styles.annotationCount}>
                <p>
                  <strong>
                    {formatMessageTemplate(messages.annotations.loadedCount, {
                      count: formatLocaleNumber(solution.annotations.length, locale),
                    })}
                  </strong>
                </p>
                <p>
                  {formatMessageTemplate(messages.annotations.visibleCount, {
                    count: formatLocaleNumber(visibleAnnotations.length, locale),
                  })}
                </p>
                {solution.has_more ? (
                  <button
                    className={styles.secondaryAction}
                    disabled={loadingMore}
                    onClick={onLoadMore}
                    type="button"
                  >
                    {loadingMore ? messages.annotations.loadingMore : messages.annotations.loadMore}
                  </button>
                ) : (
                  <p>{messages.annotations.allLoaded}</p>
                )}
                {loadMoreWarning ? (
                  <p className={styles.alert} role="alert">
                    {messages.annotations.warning}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <AnnotationTable locale={locale} messages={messages.table} solution={solution} />

          <details className={styles.provenance}>
            <summary>{messages.provenance.title}</summary>
            <div className={styles.provenanceBody}>
              <p>
                {messages.provenance.solverLabel} {NOVA_SERVICE_NAME}
                {solution.solver_version ? <> ({solution.solver_version})</> : null}.{" "}
                {messages.provenance.solverDescription}
              </p>
              <p>{messages.provenance.annotationDescription}</p>
              <p>
                {messages.provenance.fingerprintLabel} <code>{solution.wcs.source_sha256}</code>
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

function CalibrationSummary({
  completedAt,
  locale,
  messages,
  solution,
}: Readonly<{
  completedAt: string | null;
  locale: PublishedLocale;
  messages: IdentifyMessages["solutionOverlay"]["metrics"];
  solution: IdentificationSolutionResponse;
}>) {
  const calibration = solution.calibration;
  const frame = solution.wcs.coordinate_frame === "icrs" ? "ICRS" : "FK5 J2000";
  return (
    <dl className={styles.metrics}>
      <Metric
        label={messages.centerRa}
        value={`${formatLocaleFixedNumber(calibration.center_ra_deg, 6, locale)}°`}
      />
      <Metric
        label={messages.centerDec}
        value={`${formatLocaleFixedNumber(calibration.center_dec_deg, 6, locale)}°`}
      />
      <Metric label={messages.coordinateFrame} value={frame} />
      <Metric
        label={messages.pixelScale}
        value={formatMessageTemplate(messages.pixelScaleValue, {
          value: formatLocaleFixedNumber(calibration.pixel_scale_arcsec_per_pixel, 3, locale),
        })}
      />
      <Metric
        label={messages.orientation}
        value={`${formatLocaleFixedNumber(calibration.orientation_deg, 3, locale)}°`}
      />
      <Metric label={messages.parity} value={calibration.parity === 1 ? "+1" : "−1"} />
      <Metric
        label={messages.fieldRadius}
        value={`${formatLocaleFixedNumber(calibration.radius_deg, 4, locale)}°`}
      />
      <Metric
        label={messages.solvedImage}
        value={formatMessageTemplate(messages.solvedImageValue, {
          height: formatLocaleNumber(solution.wcs.image_height, locale),
          width: formatLocaleNumber(solution.wcs.image_width, locale),
        })}
      />
      {completedAt === null ? null : (
        <Metric label={messages.solutionTimestamp} value={formatTimestamp(completedAt, locale)} />
      )}
    </dl>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AnnotationTable({
  locale,
  messages,
  solution,
}: Readonly<{
  locale: PublishedLocale;
  messages: IdentifyMessages["solutionOverlay"]["table"];
  solution: IdentificationSolutionResponse;
}>) {
  if (solution.annotations.length === 0) return null;
  return (
    <div
      aria-label={messages.caption}
      className={styles.annotationTableWrap}
      role="region"
      tabIndex={0}
    >
      <table className={styles.annotationTable}>
        <caption>{messages.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{messages.label}</th>
            <th scope="col">{messages.category}</th>
            <th scope="col">{messages.pixelX}</th>
            <th scope="col">{messages.pixelY}</th>
            <th scope="col">{messages.ra}</th>
            <th scope="col">{messages.dec}</th>
          </tr>
        </thead>
        <tbody>
          {solution.annotations.map((annotation, index) => (
            <tr key={`${annotation.category}-${annotation.pixel_x}-${annotation.pixel_y}-${index}`}>
              <td>{annotation.names.join(" · ")}</td>
              <td>{formatCategory(annotation.category)}</td>
              <td className="tabular-nums">
                {formatLocaleFixedNumber(annotation.pixel_x, 2, locale)}
              </td>
              <td className="tabular-nums">
                {formatLocaleFixedNumber(annotation.pixel_y, 2, locale)}
              </td>
              <td className="tabular-nums">
                {formatLocaleFixedNumber(annotation.ra_deg, 6, locale)}°
              </td>
              <td className="tabular-nums">
                {formatLocaleFixedNumber(annotation.dec_deg, 6, locale)}°
              </td>
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

function formatTimestamp(value: string, locale: PublishedLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  };
  if (date.getUTCMilliseconds() !== 0) options.fractionalSecondDigits = 3;
  return formatLocaleDateTime(date, locale, options);
}
