"use client";

import { useEffect, useRef, useState } from "react";

import { formatMessageTemplate } from "../../../lib/i18n/format";
import type { DeepSkyAtlasMessages } from "../../../lib/i18n/messages/types";
import {
  ATLAS_LAYERS,
  parseAtlasUtcInstant,
  validateAtlasObserver,
  type AtlasLayerId,
} from "../../../lib/wwt/atlas";
import type { WwtAtlasSession } from "../../../lib/wwt/client";

type AtlasTarget = Readonly<{
  declinationDegrees: number;
  name: string;
  rightAscensionDegrees: number;
}>;

type Props = Readonly<{
  initialLayerId: AtlasLayerId;
  messages: DeepSkyAtlasMessages;
  target: AtlasTarget | null;
}>;

type AtlasStatus =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "checking-survey"; layerLabel: string }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; message?: string }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "context-lost" }>;

const WWT_ENGINE_VERSION = "7.40.0";
const WWT_HELPERS_VERSION = "0.18.0";

export function DeepSkyAtlas({ initialLayerId, messages, target }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<WwtAtlasSession | null>(null);
  const [status, setStatus] = useState<AtlasStatus>({ kind: "idle" });
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [layerId, setLayerId] = useState<AtlasLayerId>(initialLayerId);
  const [utcInput, setUtcInput] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [elevation, setElevation] = useState("0");
  const [localHorizon, setLocalHorizon] = useState(false);

  useEffect(
    () => () => {
      sessionRef.current?.detach();
      sessionRef.current = null;
    },
    [],
  );

  const activeLayer = ATLAS_LAYERS.find((layer) => layer.id === layerId) ?? ATLAS_LAYERS[0]!;
  const active = atlasOpen;

  async function activate() {
    if (
      containerRef.current === null ||
      status.kind === "loading" ||
      status.kind === "checking-survey" ||
      sessionRef.current !== null
    ) {
      return;
    }
    try {
      const { attachWwtAtlas, probeAtlasLayerAvailability } =
        await import("../../../lib/wwt/client");
      setStatus({ kind: "checking-survey", layerLabel: activeLayer.label });
      const available = await probeAtlasLayerAvailability(layerId);
      if (!available) {
        setStatus({
          kind: "error",
          message: formatMessageTemplate(messages.status.initialLayerUnavailable, {
            layerLabel: activeLayer.label,
          }),
        });
        return;
      }
      setStatus({ kind: "loading" });
      const session = await attachWwtAtlas(containerRef.current, {
        onContextLost: () => setStatus({ kind: "context-lost" }),
        onContextRestored: () =>
          setStatus({ kind: "ready", message: messages.status.graphicsRestored }),
      });
      sessionRef.current = session;
      setAtlasOpen(true);
      session.setLayer(layerId);
      if (target !== null) await focusTarget(session);
      setStatus({ kind: "ready" });
    } catch {
      sessionRef.current?.detach();
      sessionRef.current = null;
      setAtlasOpen(false);
      setStatus({
        kind: "error",
        message: messages.status.activationFailed,
      });
    }
  }

  async function focusTarget(session: WwtAtlasSession | null = sessionRef.current) {
    if (session === null || target === null) return;
    try {
      await session.focus({
        declinationDegrees: target.declinationDegrees,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        rightAscensionDegrees: target.rightAscensionDegrees,
      });
      setStatus({
        kind: "ready",
        message: formatMessageTemplate(messages.status.focused, { objectName: target.name }),
      });
    } catch {
      setStatus({ kind: "error", message: messages.status.focusFailed });
    }
  }

  async function chooseLayer(nextLayerId: AtlasLayerId) {
    const nextLayer = ATLAS_LAYERS.find((layer) => layer.id === nextLayerId);
    if (nextLayer === undefined) {
      setStatus({
        kind: "error",
        message: messages.status.invalidLayer,
      });
      return;
    }
    if (sessionRef.current === null) {
      setLayerId(nextLayerId);
      setStatus({ kind: "idle" });
      return;
    }

    setStatus({ kind: "checking-survey", layerLabel: nextLayer.label });
    try {
      const { probeAtlasLayerAvailability } = await import("../../../lib/wwt/client");
      const available = await probeAtlasLayerAvailability(nextLayerId);
      if (!available) {
        setStatus({
          kind: "error",
          message: formatMessageTemplate(messages.status.switchLayerUnavailable, {
            layerLabel: nextLayer.label,
          }),
        });
        return;
      }
      sessionRef.current.setLayer(nextLayerId);
      setLayerId(nextLayerId);
      setStatus({
        kind: "ready",
        message: formatMessageTemplate(messages.status.layerChanged, {
          layerLabel: nextLayer.label,
        }),
      });
    } catch {
      setStatus({ kind: "error", message: messages.status.layerDisplayFailed });
    }
  }

  function pan(horizontalPixels: number, verticalPixels: number) {
    try {
      sessionRef.current?.pan(horizontalPixels, verticalPixels);
    } catch {
      setStatus({ kind: "error", message: messages.status.panFailed });
    }
  }

  function zoom(factor: number) {
    try {
      sessionRef.current?.zoom(factor);
    } catch {
      setStatus({ kind: "error", message: messages.status.zoomFailed });
    }
  }

  function applyUtcTime() {
    const instant = parseAtlasUtcInstant(utcInput.trim());
    if (instant === null) {
      setStatus({
        kind: "error",
        message: messages.status.utcInvalid,
      });
      return;
    }
    try {
      sessionRef.current?.setTime(instant);
      setStatus({
        kind: "ready",
        message: formatMessageTemplate(messages.status.utcApplied, {
          instant: instant.toISOString(),
        }),
      });
    } catch {
      setStatus({ kind: "error", message: messages.status.utcApplyFailed });
    }
  }

  function useCurrentTime() {
    try {
      sessionRef.current?.syncTimeNow();
      setUtcInput("");
      setStatus({ kind: "ready", message: messages.status.currentTimeApplied });
    } catch {
      setStatus({ kind: "error", message: messages.status.currentTimeFailed });
    }
  }

  function applyObserver() {
    const observer = validateAtlasObserver({
      elevationM: Number(elevation),
      latitude: Number(latitude),
      longitude: Number(longitude),
    });
    if (observer === null || latitude.trim() === "" || longitude.trim() === "") {
      setStatus({
        kind: "error",
        message: messages.status.observerInvalid,
      });
      return;
    }
    try {
      sessionRef.current?.setObserver(observer);
      setStatus({
        kind: "ready",
        message: messages.status.observerApplied,
      });
    } catch {
      setStatus({ kind: "error", message: messages.status.observerFailed });
    }
  }

  function useLocation() {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "error", message: messages.status.geolocationUnavailable });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        if (coords.altitude !== null && Number.isFinite(coords.altitude)) {
          setElevation(coords.altitude.toFixed(1));
        }
        setStatus({
          kind: "ready",
          message: messages.status.locationCopied,
        });
      },
      () => setStatus({ kind: "error", message: messages.status.geolocationDenied }),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  function toggleHorizon(enabled: boolean) {
    setLocalHorizon(enabled);
    try {
      sessionRef.current?.setLocalHorizon(enabled);
      setStatus({
        kind: "ready",
        message: enabled ? messages.status.horizonEnabled : messages.status.horizonDisabled,
      });
    } catch {
      setStatus({ kind: "error", message: messages.status.horizonFailed });
    }
  }

  return (
    <section
      aria-labelledby="atlas-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <h2 className="text-2xl font-semibold" id="atlas-heading">
          {messages.header.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.header.intro}</p>
      </div>

      <div
        aria-label={messages.canvasAriaLabel}
        className="relative min-h-72 overflow-hidden border border-[var(--border)] bg-black sm:min-h-96"
        id="lumina-wwt-atlas"
        ref={containerRef}
      >
        {!active ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center sm:min-h-96">
            <div className="max-w-xl space-y-4">
              <p className="text-[var(--muted)]">
                {target === null
                  ? messages.activation.missingTarget
                  : formatMessageTemplate(messages.activation.readyForTarget, {
                      objectName: target.name,
                    })}
              </p>
              <button
                className="min-h-11 border border-[var(--accent)] px-5 font-semibold text-[var(--link)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={status.kind === "loading" || status.kind === "checking-survey"}
                onClick={activate}
                type="button"
              >
                {status.kind === "checking-survey"
                  ? messages.activation.checking
                  : status.kind === "loading"
                    ? messages.activation.opening
                    : messages.activation.open}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <AtlasStatusMessage messages={messages.status} status={status} />

      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="space-y-3 border border-[var(--border)] p-4">
          <legend className="px-1 font-semibold">{messages.survey.legend}</legend>
          <label className="block space-y-2">
            <span className="text-sm text-[var(--muted)]">{messages.survey.wavelengthLabel}</span>
            <select
              className="min-h-11 w-full border border-[var(--border)] bg-[var(--background)] px-3"
              disabled={status.kind === "checking-survey" || status.kind === "loading"}
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
          <p className="text-sm leading-6 text-[var(--muted)]">{activeLayer.interpretation}</p>
          <p className="text-sm">
            {messages.survey.creditLabel}: {activeLayer.creditText}{" "}
            <a
              className="text-[var(--link)] underline"
              href={activeLayer.creditUrl}
              rel="noreferrer"
            >
              {messages.survey.sourceDetails}
            </a>
          </p>
        </fieldset>

        <fieldset className="space-y-3 border border-[var(--border)] p-4" disabled={!active}>
          <legend className="px-1 font-semibold">{messages.view.legend}</legend>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={() => void focusTarget()}
              type="button"
            >
              {messages.view.focus}
            </button>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={() => zoom(0.8)}
              type="button"
            >
              {messages.view.zoomIn}
            </button>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={() => zoom(1.25)}
              type="button"
            >
              {messages.view.zoomOut}
            </button>
          </div>
          <div aria-label={messages.view.panAriaLabel} className="grid max-w-48 grid-cols-3 gap-2">
            <span />
            <button
              aria-label={messages.view.panUp}
              className="min-h-11 border border-[var(--border)]"
              onClick={() => pan(0, -40)}
              type="button"
            >
              ↑
            </button>
            <span />
            <button
              aria-label={messages.view.panLeft}
              className="min-h-11 border border-[var(--border)]"
              onClick={() => pan(-40, 0)}
              type="button"
            >
              ←
            </button>
            <button
              aria-label={messages.view.panDown}
              className="min-h-11 border border-[var(--border)]"
              onClick={() => pan(0, 40)}
              type="button"
            >
              ↓
            </button>
            <button
              aria-label={messages.view.panRight}
              className="min-h-11 border border-[var(--border)]"
              onClick={() => pan(40, 0)}
              type="button"
            >
              →
            </button>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border border-[var(--border)] p-4" disabled={!active}>
          <legend className="px-1 font-semibold">{messages.time.legend}</legend>
          <label className="block space-y-2">
            <span className="text-sm text-[var(--muted)]">{messages.time.inputLabel}</span>
            <input
              className="min-h-11 w-full border border-[var(--border)] bg-[var(--background)] px-3 font-mono"
              onChange={(event) => setUtcInput(event.target.value)}
              placeholder="2026-09-15T18:30:00Z"
              type="text"
              value={utcInput}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={applyUtcTime}
              type="button"
            >
              {messages.time.apply}
            </button>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={useCurrentTime}
              type="button"
            >
              {messages.time.useCurrent}
            </button>
          </div>
          <p className="text-sm text-[var(--muted)]">{messages.time.help}</p>
        </fieldset>

        <fieldset className="space-y-3 border border-[var(--border)] p-4" disabled={!active}>
          <legend className="px-1 font-semibold">{messages.observer.legend}</legend>
          <p className="text-sm leading-6 text-[var(--muted)]">{messages.observer.privacy}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <ObserverField
              label={messages.observer.latitudeLabel}
              max="90"
              min="-90"
              onChange={setLatitude}
              value={latitude}
            />
            <ObserverField
              label={messages.observer.longitudeLabel}
              max="180"
              min="-180"
              onChange={setLongitude}
              value={longitude}
            />
            <ObserverField
              label={messages.observer.elevationLabel}
              max="10000"
              min="-500"
              onChange={setElevation}
              value={elevation}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={useLocation}
              type="button"
            >
              {messages.observer.useLocation}
            </button>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={applyObserver}
              type="button"
            >
              {messages.observer.apply}
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input
              checked={localHorizon}
              onChange={(event) => toggleHorizon(event.target.checked)}
              type="checkbox"
            />
            <span>{messages.observer.localHorizon}</span>
          </label>
        </fieldset>
      </div>

      <p className="text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.rendererDisclosure, {
          engineVersion: WWT_ENGINE_VERSION,
          helpersVersion: WWT_HELPERS_VERSION,
        })}
      </p>
    </section>
  );
}

function ObserverField({
  label,
  max,
  min,
  onChange,
  value,
}: Readonly<{
  label: string;
  max: string;
  min: string;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <label className="space-y-2">
      <span className="text-sm">{label}</span>
      <input
        className="min-h-11 w-full border border-[var(--border)] bg-[var(--background)] px-3"
        inputMode="decimal"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        step="any"
        type="number"
        value={value}
      />
    </label>
  );
}

function AtlasStatusMessage({
  messages,
  status,
}: Readonly<{ messages: DeepSkyAtlasMessages["status"]; status: AtlasStatus }>) {
  if (status.kind === "idle") return null;
  if (status.kind === "checking-survey")
    return (
      <p aria-live="polite" role="status">
        {formatMessageTemplate(messages.checkingSurvey, { layerLabel: status.layerLabel })}
      </p>
    );
  if (status.kind === "loading")
    return (
      <p aria-live="polite" role="status">
        {messages.loading}
      </p>
    );
  if (status.kind === "context-lost")
    return (
      <p aria-live="polite" role="alert">
        {messages.contextLost}
      </p>
    );
  if (status.kind === "error")
    return (
      <p aria-live="polite" className="text-[var(--muted)]" role="alert">
        {status.message}
      </p>
    );
  return status.message === undefined ? (
    <p aria-live="polite" role="status">
      {messages.ready}
    </p>
  ) : (
    <p aria-live="polite" role="status">
      {status.message}
    </p>
  );
}
