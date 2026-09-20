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
    <section
      aria-labelledby="capture-checks-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h2 className="text-2xl font-semibold" id="capture-checks-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            provider: ASTROMETRY_PROVIDER_NAME,
          })}
        </p>
      </div>

      {state.kind === "idle" || state.kind === "error" ? (
        <button
          className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
          onClick={() => void runChecks()}
          type="button"
        >
          {state.kind === "error" ? messages.actions.retry : messages.actions.run}
        </button>
      ) : null}
      {state.kind === "running" ? <p role="status">{messages.analyzing}</p> : null}
      {state.kind === "error" ? <p role="alert">{messages.failures[state.reason]}</p> : null}
      {state.kind === "ready" ? (
        <CaptureCheckResults locale={locale} messages={messages} result={state.result} />
      ) : null}

      <div className="space-y-2 text-sm leading-6 text-[var(--muted)]">
        <p>
          {formatMessageTemplate(messages.boundedSample, {
            count: formatLocaleNumber(MAX_CAPTURE_SAMPLE_PIXELS, locale),
          })}
        </p>
        <p>{messages.proxyCaveat}</p>
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
    <div className="space-y-5" role="status">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">{messages.histogram.title}</h3>
        <p className="text-sm leading-6 text-[var(--muted)]">{messages.histogram.description}</p>
        <ol aria-label={messages.histogram.ariaLabel} className="space-y-2 p-0">
          {result.luminance_histogram.map((bin) => (
            <li className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3" key={bin.code_min}>
              <span className="font-mono text-xs">
                {formatLocaleNumber(bin.code_min, locale)}–
                {formatLocaleNumber(bin.code_max, locale)}
              </span>
              <span aria-hidden="true" className="h-2 border border-[var(--border)]">
                <span
                  className="block h-full bg-[var(--foreground)]"
                  style={{ width: `${Math.min(100, Math.max(0, bin.percentage))}%` }}
                />
              </span>
              <span className="text-right text-xs">
                {formatLocaleFixedNumber(bin.percentage, 2, locale)}%
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-sm leading-6 text-[var(--muted)]">{messages.endpointDisclosure}</p>
      {result.non_opaque_sample_pixels > 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {formatCountMessage(messages.nonOpaque, result.non_opaque_sample_pixels, locale)}
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

function captureFailureReason(error: unknown): CaptureCheckFailureReason {
  if (!(error instanceof CaptureCheckError)) return "unknown";
  if (error.reason === "no-opaque-pixels") return "noOpaquePixels";
  if (error.reason === "invalid-pixels") return "invalidPixels";
  return "decodeFailed";
}
