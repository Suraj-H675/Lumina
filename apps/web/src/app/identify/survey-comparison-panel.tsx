"use client";

import type { IdentificationSolutionResponse } from "@lumina/api-client";
import { useEffect, useRef, useState } from "react";

import { surveyComparisonField } from "../../lib/identification/survey-comparison";
import { ATLAS_LAYERS, type AtlasLayerId } from "../../lib/wwt/atlas";
import type { WwtAtlasSession } from "../../lib/wwt/client";

type SurveyState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "checking"; layerLabel: string }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; message?: string }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "context-lost" }>;

export function SurveyComparisonPanel({
  imageUrl,
  solution,
}: Readonly<{ imageUrl: string; solution: IdentificationSolutionResponse }>) {
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
        setState({
          kind: "error",
          message: `${activeLayer.label} imagery is unavailable right now.`,
        });
        return;
      }
      setState({ kind: "loading" });
      const session = await attachWwtAtlas(containerRef.current, {
        onContextLost: () => setState({ kind: "context-lost" }),
        onContextRestored: () => setState({ kind: "ready", message: "Graphics context restored." }),
      });
      sessionRef.current = session;
      setSessionActive(true);
      session.setLayer(layerId);
      await focus(session);
      setState({ kind: "ready", message: "Survey comparison ready." });
    } catch {
      sessionRef.current?.detach();
      sessionRef.current = null;
      setSessionActive(false);
      setState({
        kind: "error",
        message: "The survey renderer could not start. Your local solved image remains available.",
      });
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
        setState({
          kind: "error",
          message: `${nextLayer.label} imagery is unavailable right now.`,
        });
        return;
      }
      sessionRef.current.setLayer(nextLayerId);
      setLayerId(nextLayerId);
      await focus(sessionRef.current);
      setState({ kind: "ready", message: `Showing ${nextLayer.label}.` });
    } catch {
      setState({
        kind: "error",
        message:
          "The selected survey layer could not be applied. The previous view remains available.",
      });
    }
  }

  return (
    <section
      aria-labelledby="survey-comparison-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Opt-in survey context
        </p>
        <h2 className="text-2xl font-semibold" id="survey-comparison-heading">
          Compare with survey context
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Compare your solved image with a reviewed WorldWide Telescope survey layer centered on the
          same astrometric field. The two views are not pixel-registered and are not photometrically
          equivalent; orientation, projection, epoch, resolution, bandpass, and processing may
          differ.
        </p>
      </div>

      <label className="block max-w-md space-y-2 font-semibold">
        <span>Survey layer</span>
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
          Open survey comparison
        </button>
      ) : null}
      {state.kind === "checking" ? (
        <p role="status">Checking {state.layerLabel} availability…</p>
      ) : null}
      {state.kind === "loading" ? <p role="status">Starting the survey renderer…</p> : null}
      {state.kind === "context-lost" ? (
        <p role="alert">The survey graphics context was lost. The local image remains available.</p>
      ) : null}
      {state.kind === "error" ? <p role="alert">{state.message}</p> : null}
      {state.kind === "ready" && state.message ? <p role="status">{state.message}</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <figure className="min-w-0 space-y-3">
          <figcaption className="font-semibold">Your local solved image</figcaption>
          <div className="overflow-auto border border-[var(--border)] bg-[var(--surface)] p-2">
            {/* A raw img preserves the private browser blob URL; Next image optimization must not proxy it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Original solved astronomical image for survey comparison"
              className="h-auto max-h-[60vh] w-full object-contain"
              src={imageUrl}
            />
          </div>
        </figure>
        <figure className="min-w-0 space-y-3">
          <figcaption className="font-semibold">{activeLayer.label} survey context</figcaption>
          <div
            aria-label="WorldWide Telescope survey comparison"
            className="aspect-square min-h-64 overflow-hidden border border-[var(--border)] bg-black"
            id="lumina-wwt-atlas"
            ref={containerRef}
            role="region"
          />
        </figure>
      </div>
      <div className="max-w-4xl space-y-2 text-sm leading-6 text-[var(--muted)]">
        <p>
          Lumina requests a {field.field_of_view_deg.toFixed(3)}° atlas field from the solved
          center, derived as twice the normalized solution radius
          {field.was_clamped ? " and clamped to the certified atlas range" : ""}.
        </p>
        <p>{activeLayer.interpretation}</p>
        <p>
          Opening this comparison contacts approved WWT/survey hosts, which may observe the sky
          region being requested. Your uploaded image bytes, filename, journal data, and observer
          location are not sent to those hosts by this panel.
        </p>
        <p>
          Credit: {activeLayer.creditText}{" "}
          <a
            className="font-semibold text-[var(--link)] underline"
            href={activeLayer.creditUrl}
            rel="noreferrer"
            target="_blank"
          >
            Source details
          </a>
        </p>
      </div>
    </section>
  );
}
