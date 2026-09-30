"use client";

import { useState } from "react";

import {
  formatCountMessage,
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { IdentifyMessages } from "../../lib/i18n/messages/types";
import {
  CaptureCheckError,
  MAX_CAPTURE_SAMPLE_PIXELS,
  analyzeCaptureFile,
  type CaptureCheckResult,
} from "../../lib/identification/capture-checks";
import { ASTROMETRY_PROVIDER_NAME } from "../../lib/identification/provider-display";
import styles from "./identify-experience.module.css";

type CaptureCheckFailureReason = "decodeFailed" | "invalidPixels" | "noOpaquePixels" | "unknown";

type CaptureCheckState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "running" }>
  | Readonly<{ kind: "ready"; result: CaptureCheckResult }>
  | Readonly<{ kind: "error"; reason: CaptureCheckFailureReason }>;

export function CaptureChecksPanel({
  locale,
  messages,
  sourceHeightPx,
  sourceImage,
  sourceWidthPx,
}: Readonly<{
  locale: PublishedLocale;
  messages: IdentifyMessages["captureChecks"];
  sourceHeightPx: number;
  sourceImage: File | null;
  sourceWidthPx: number;
}>) {
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
      setState({ kind: "error", reason: captureFailureReason(error) });
    }
  }

  return (
    <section aria-labelledby="capture-checks-heading" className={styles.stage}>
      <div className={styles.stageHeader}>
        <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
        <h2 className={styles.stageTitle} id="capture-checks-heading">
          {messages.title}
        </h2>
        <p className={styles.stageDescription}>
          {formatMessageTemplate(messages.description, {
            provider: ASTROMETRY_PROVIDER_NAME,
          })}
        </p>
      </div>

      <div className={styles.stageBody}>
        <div className={styles.diagnosticBody}>
          {state.kind === "idle" || state.kind === "error" ? (
            <button
              className={styles.secondaryAction}
              onClick={() => void runChecks()}
              type="button"
            >
              {state.kind === "error" ? messages.actions.retry : messages.actions.run}
            </button>
          ) : null}
          {state.kind === "running" ? (
            <p className={styles.statusCopy} role="status">
              {messages.analyzing}
            </p>
          ) : null}
          {state.kind === "error" ? (
            <p className={styles.alert} role="alert">
              {messages.failures[state.reason]}
            </p>
          ) : null}
          {state.kind === "ready" ? (
            <CaptureCheckResults locale={locale} messages={messages} result={state.result} />
          ) : null}

          <div className={styles.diagnosticNotes}>
            <p>
              {formatMessageTemplate(messages.boundedSample, {
                count: formatLocaleNumber(MAX_CAPTURE_SAMPLE_PIXELS, locale),
              })}
            </p>
            <p>{messages.proxyCaveat}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
function CaptureCheckResults({
  locale,
  messages,
  result,
}: Readonly<{
  locale: PublishedLocale;
  messages: IdentifyMessages["captureChecks"];
  result: CaptureCheckResult;
}>) {
  return (
    <div className={styles.diagnosticBody} role="status">
      <dl className={styles.metrics}>
        <Metric
          label={messages.metrics.sourceDimensions}
          value={formatMessageTemplate(messages.metrics.sourceDimensionsValue, {
            height: formatLocaleNumber(result.source_height_px, locale),
            width: formatLocaleNumber(result.source_width_px, locale),
          })}
        />
        <Metric
          label={messages.metrics.diagnosticSample}
          value={formatMessageTemplate(messages.metrics.diagnosticSampleValue, {
            height: formatLocaleNumber(result.sample_height_px, locale),
            width: formatLocaleNumber(result.sample_width_px, locale),
          })}
        />
        <Metric
          label={messages.metrics.minimumCode}
          value={`${formatLocaleFixedNumber(result.low_endpoint_percentage, 2, locale)}%`}
        />
        <Metric
          label={messages.metrics.maximumCode}
          value={`${formatLocaleFixedNumber(result.high_endpoint_percentage, 2, locale)}%`}
        />
      </dl>

      <div className={styles.histogram}>
        <h3 className={styles.histogramTitle}>{messages.histogram.title}</h3>
        <p className={styles.histogramDescription}>{messages.histogram.description}</p>
        <ol aria-label={messages.histogram.ariaLabel} className={styles.histogramList}>
          {result.luminance_histogram.map((bin) => (
            <li className={styles.histogramBin} key={bin.code_min}>
              <span>
                {formatLocaleNumber(bin.code_min, locale)}–
                {formatLocaleNumber(bin.code_max, locale)}
              </span>
              <span aria-hidden="true" className={styles.histogramBar}>
                <span
                  className={styles.histogramFill}
                  style={{ width: `${Math.min(100, Math.max(0, bin.percentage))}%` }}
                />
              </span>
              <span className={styles.histogramValue}>
                {formatLocaleFixedNumber(bin.percentage, 2, locale)}%
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className={styles.statusCopy}>{messages.endpointDisclosure}</p>
      {result.non_opaque_sample_pixels > 0 ? (
        <p className={styles.statusCopy}>
          {formatCountMessage(messages.nonOpaque, result.non_opaque_sample_pixels, locale)}
        </p>
      ) : null}
    </div>
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

function captureFailureReason(error: unknown): CaptureCheckFailureReason {
  if (!(error instanceof CaptureCheckError)) return "unknown";
  if (error.reason === "no-opaque-pixels") return "noOpaquePixels";
  if (error.reason === "invalid-pixels") return "invalidPixels";
  return "decodeFailed";
}
