"use client";

import type { IdentificationSolutionResponse } from "@nova-lumina/api-client";
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
import styles from "./identify-experience.module.css";

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
  const mountedRef = useRef(true);
  const [layerId, setLayerId] = useState<AtlasLayerId>("visible-dss2");
  const [sessionActive, setSessionActive] = useState(false);
  const [state, setState] = useState<SurveyState>({ kind: "idle" });
  const field = surveyComparisonField(solution.calibration.radius_deg);
  const activeLayer = ATLAS_LAYERS.find((layer) => layer.id === layerId) ?? ATLAS_LAYERS[0]!;
  const canActivate = !sessionActive && (state.kind === "idle" || state.kind === "error");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.detach();
      sessionRef.current = null;
    };
  }, []);

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
      if (!mountedRef.current) return;
      setState({ kind: "checking", layerLabel: activeLayer.label });
      const available = await probeAtlasLayerAvailability(layerId);
      if (!mountedRef.current) return;
      if (!available) {
        setState({ kind: "error", layerLabel: activeLayer.label, reason: "layerUnavailable" });
        return;
      }
      setState({ kind: "loading" });
      const container = containerRef.current;
      if (container === null) return;
      const session = await attachWwtAtlas(container, {
        onContextLost: () => {
          if (mountedRef.current) setState({ kind: "context-lost" });
        },
        onContextRestored: () => {
          if (mountedRef.current) setState({ kind: "ready", reason: "contextRestored" });
        },
        onRenderFailed: () => {
          sessionRef.current = null;
          if (!mountedRef.current) return;
          setSessionActive(false);
          setState({ kind: "error", reason: "rendererFailed" });
        },
      });
      if (!mountedRef.current) {
        session.detach();
        return;
      }
      sessionRef.current = session;
      setSessionActive(true);
      session.setLayer(layerId);
      await focus(session);
      if (sessionRef.current !== session) return;
      setState({ kind: "ready", reason: "comparisonReady" });
    } catch {
      sessionRef.current?.detach();
      sessionRef.current = null;
      if (!mountedRef.current) return;
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
    const session = sessionRef.current;
    try {
      const { probeAtlasLayerAvailability } = await import("../../lib/wwt/client");
      if (!mountedRef.current) return;
      const available = await probeAtlasLayerAvailability(nextLayerId);
      if (!mountedRef.current) return;
      if (sessionRef.current !== session) return;
      if (!available) {
        setState({ kind: "error", layerLabel: nextLayer.label, reason: "layerUnavailable" });
        return;
      }
      session.setLayer(nextLayerId);
      setLayerId(nextLayerId);
      await focus(session);
      if (sessionRef.current !== session) return;
      setState({ kind: "ready", layerLabel: nextLayer.label, reason: "showingLayer" });
    } catch {
      if (sessionRef.current !== session) return;
      setState({ kind: "error", reason: "layerApplyFailed" });
    }
  }

  return (
    <section aria-labelledby="survey-comparison-heading" className={styles.stage}>
      <div className={styles.stageHeader}>
        <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
        <h2 className={styles.stageTitle} id="survey-comparison-heading">
          {messages.title}
        </h2>
        <p className={styles.stageDescription}>
          {formatMessageTemplate(messages.description, {
            service: WORLDWIDE_TELESCOPE_NAME,
          })}
        </p>
      </div>

      <div className={styles.stageBody}>
        <div className={styles.surveyControls}>
          <label className={styles.selectField}>
            <span>{messages.layerLabel}</span>
            <select
              className={styles.select}
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
          <div>
            {canActivate ? (
              <button
                className={styles.primaryAction}
                onClick={() => void activate()}
                type="button"
              >
                {messages.action}
              </button>
            ) : null}
            {state.kind === "checking" ? (
              <p className={styles.statusCopy} role="status">
                {formatMessageTemplate(messages.states.checking, { layer: state.layerLabel })}
              </p>
            ) : null}
            {state.kind === "loading" ? (
              <p className={styles.statusCopy} role="status">
                {messages.states.loading}
              </p>
            ) : null}
            {state.kind === "context-lost" ? (
              <p className={styles.alert} role="alert">
                {messages.states.contextLost}
              </p>
            ) : null}
            {state.kind === "error" ? (
              <p className={styles.alert} role="alert">
                {surveyErrorMessage(state, messages.states)}
              </p>
            ) : null}
            {state.kind === "ready" ? (
              <p className={styles.statusCopy} role="status">
                {surveyReadyMessage(state, messages.states)}
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles.surveyFigures}>
          <figure className={styles.figure}>
            <figcaption>{messages.figures.localCaption}</figcaption>
            <div className={styles.figureFrame}>
              {/* A raw img preserves the private browser blob URL; Next image optimization must not proxy it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={messages.figures.localAlt} src={imageUrl} />
            </div>
          </figure>
          <figure className={styles.figure}>
            <figcaption>
              {formatMessageTemplate(messages.figures.surveyCaption, { layer: activeLayer.label })}
            </figcaption>
            <div
              aria-label={formatMessageTemplate(messages.figures.surveyRegionLabel, {
                service: WORLDWIDE_TELESCOPE_NAME,
              })}
              className={styles.surveyCanvas}
              id="nova-lumina-wwt-atlas"
              ref={containerRef}
              role="region"
            />
          </figure>
        </div>
        <div className={styles.surveyNotes}>
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
            <a href={activeLayer.creditUrl} rel="noreferrer" target="_blank">
              {messages.sourceDetails}
            </a>
          </p>
        </div>
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
