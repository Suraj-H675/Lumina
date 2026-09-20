"use client";

import type { IdentificationSolutionResponse } from "@lumina/api-client";
import { useEffect, useRef, useState } from "react";

import { formatLocaleFixedNumber, formatMessageTemplate } from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { IdentifyMessages } from "../../lib/i18n/messages/types";
import { surveyComparisonField } from "../../lib/identification/survey-comparison";
import {
  ATLAS_LAYERS,
  WORLDWIDE_TELESCOPE_NAME,
  WORLDWIDE_TELESCOPE_SHORT_NAME,
  type AtlasLayerId,
} from "../../lib/wwt/atlas";
import type { WwtAtlasSession } from "../../lib/wwt/client";

type SurveyErrorReason = "layerApplyFailed" | "layerUnavailable" | "rendererFailed";
type SurveyReadyReason = "comparisonReady" | "contextRestored" | "showingLayer";

type SurveyState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "checking"; layerLabel: string }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; reason: Exclude<SurveyReadyReason, "showingLayer"> }>
  | Readonly<{ kind: "ready"; layerLabel: string; reason: "showingLayer" }>
  | Readonly<{ kind: "error"; reason: Exclude<SurveyErrorReason, "layerUnavailable"> }>
  | Readonly<{ kind: "error"; layerLabel: string; reason: "layerUnavailable" }>
  | Readonly<{ kind: "context-lost" }>;

export function SurveyComparisonPanel({
  imageUrl,
  locale,
  messages,
  solution,
}: Readonly<{
  imageUrl: string;
  locale: PublishedLocale;
  messages: IdentifyMessages["surveyComparison"];
  solution: IdentificationSolutionResponse;
}>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<WwtAtlasSession | null>(null);
  const [layerId, setLayerId] = useState<AtlasLayerId>("visible-dss2");
  const [sessionActive, setSessionActive] = useState(false);
  const [state, setState] = useState<SurveyState>({ kind: "idle" });
  const field = surveyComparisonField(solution.calibration.radius_deg);
  const activeLayer = ATLAS_LAYERS.find((layer) => layer.id === layerId) ?? ATLAS_LAYERS[0]!;
  const canActivate = !sessionActive && (state.kind === "idle" || state.kind === "error");

  useEffect(
    () => () => {
      sessionRef.current?.detach();
      sessionRef.current = null;
    },
    [],
  );

  async function focus(session: WwtAtlasSession) {
    await session.focus({
      declinationDegrees: solution.calibration.center_dec_deg,
      fieldOfViewDegrees: field.field_of_view_deg,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      rightAscensionDegrees: solution.calibration.center_ra_deg,
    });
  }

  async function activate() {
    if (containerRef.current === null || sessionRef.current !== null) return;
    try {
      const { attachWwtAtlas, probeAtlasLayerAvailability } = await import("../../lib/wwt/client");
      setState({ kind: "checking", layerLabel: activeLayer.label });
      if (!(await probeAtlasLayerAvailability(layerId))) {
        setState({ kind: "error", layerLabel: activeLayer.label, reason: "layerUnavailable" });
        return;
      }
      setState({ kind: "loading" });
      const session = await attachWwtAtlas(containerRef.current, {
        onContextLost: () => setState({ kind: "context-lost" }),
        onContextRestored: () => setState({ kind: "ready", reason: "contextRestored" }),
      });
      sessionRef.current = session;
      setSessionActive(true);
      session.setLayer(layerId);
      await focus(session);
      setState({ kind: "ready", reason: "comparisonReady" });
    } catch {
      sessionRef.current?.detach();
      sessionRef.current = null;
      setSessionActive(false);
      setState({ kind: "error", reason: "rendererFailed" });
    }
  }

  async function chooseLayer(nextLayerId: AtlasLayerId) {
    const nextLayer = ATLAS_LAYERS.find((layer) => layer.id === nextLayerId);
    if (nextLayer === undefined) return;
    if (sessionRef.current === null) {
      setLayerId(nextLayerId);
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "checking", layerLabel: nextLayer.label });
    try {
      const { probeAtlasLayerAvailability } = await import("../../lib/wwt/client");
      if (!(await probeAtlasLayerAvailability(nextLayerId))) {
        setState({ kind: "error", layerLabel: nextLayer.label, reason: "layerUnavailable" });
        return;
      }
      sessionRef.current.setLayer(nextLayerId);
      setLayerId(nextLayerId);
      await focus(sessionRef.current);
      setState({ kind: "ready", layerLabel: nextLayer.label, reason: "showingLayer" });
    } catch {
      setState({ kind: "error", reason: "layerApplyFailed" });
    }
  }

  return (
    <section
      aria-labelledby="survey-comparison-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h2 className="text-2xl font-semibold" id="survey-comparison-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            service: WORLDWIDE_TELESCOPE_NAME,
          })}
        </p>
      </div>

      <label className="block max-w-md space-y-2 font-semibold">
        <span>{messages.layerLabel}</span>
        <select
          className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
          disabled={state.kind === "checking" || state.kind === "loading"}
          onChange={(event) => void chooseLayer(event.target.value as AtlasLayerId)}
          value={layerId}
        >
          {ATLAS_LAYERS.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.label}
            </option>
          ))}
        </select>
      </label>

      {canActivate ? (
        <button
          className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
          onClick={() => void activate()}
          type="button"
        >
          {messages.action}
        </button>
      ) : null}
      {state.kind === "checking" ? (
        <p role="status">
          {formatMessageTemplate(messages.states.checking, { layer: state.layerLabel })}
        </p>
      ) : null}
      {state.kind === "loading" ? <p role="status">{messages.states.loading}</p> : null}
      {state.kind === "context-lost" ? <p role="alert">{messages.states.contextLost}</p> : null}
      {state.kind === "error" ? (
        <p role="alert">{surveyErrorMessage(state, messages.states)}</p>
      ) : null}
      {state.kind === "ready" ? (
        <p role="status">{surveyReadyMessage(state, messages.states)}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <figure className="min-w-0 space-y-3">
          <figcaption className="font-semibold">{messages.figures.localCaption}</figcaption>
          <div className="overflow-auto border border-[var(--border)] bg-[var(--surface)] p-2">
            {/* A raw img preserves the private browser blob URL; Next image optimization must not proxy it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={messages.figures.localAlt}
              className="h-auto max-h-[60vh] w-full object-contain"
              src={imageUrl}
            />
          </div>
        </figure>
        <figure className="min-w-0 space-y-3">
          <figcaption className="font-semibold">
            {formatMessageTemplate(messages.figures.surveyCaption, { layer: activeLayer.label })}
          </figcaption>
          <div
            aria-label={formatMessageTemplate(messages.figures.surveyRegionLabel, {
              service: WORLDWIDE_TELESCOPE_NAME,
            })}
            className="aspect-square min-h-64 overflow-hidden border border-[var(--border)] bg-black"
            id="lumina-wwt-atlas"
            ref={containerRef}
            role="region"
          />
        </figure>
      </div>
      <div className="max-w-4xl space-y-2 text-sm leading-6 text-[var(--muted)]">
        <p>
          {formatMessageTemplate(
            field.was_clamped ? messages.fieldDescriptionClamped : messages.fieldDescription,
            {
              fieldOfView: formatLocaleFixedNumber(field.field_of_view_deg, 3, locale),
            },
          )}
        </p>
        <p>{activeLayer.interpretation}</p>
        <p>
          {formatMessageTemplate(messages.privacy, {
            serviceShort: WORLDWIDE_TELESCOPE_SHORT_NAME,
          })}
        </p>
        <p>
          {messages.creditLabel} {activeLayer.creditText}{" "}
          <a
            className="font-semibold text-[var(--link)] underline"
            href={activeLayer.creditUrl}
            rel="noreferrer"
            target="_blank"
          >
            {messages.sourceDetails}
          </a>
        </p>
      </div>
    </section>
  );
}

function surveyErrorMessage(
  state: Extract<SurveyState, { kind: "error" }>,
  messages: IdentifyMessages["surveyComparison"]["states"],
): string {
  if (state.reason === "layerUnavailable") {
    return formatMessageTemplate(messages.layerUnavailable, { layer: state.layerLabel });
  }
  if (state.reason === "layerApplyFailed") return messages.layerApplyFailed;
  return messages.rendererFailed;
}

function surveyReadyMessage(
  state: Extract<SurveyState, { kind: "ready" }>,
  messages: IdentifyMessages["surveyComparison"]["states"],
): string {
  if (state.reason === "showingLayer") {
    return formatMessageTemplate(messages.showingLayer, { layer: state.layerLabel });
  }
  if (state.reason === "contextRestored") return messages.contextRestored;
  return messages.comparisonReady;
}
