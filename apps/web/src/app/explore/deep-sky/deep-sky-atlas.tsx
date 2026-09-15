"use client";

import { useEffect, useRef, useState } from "react";

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
  target: AtlasTarget | null;
}>;

type AtlasStatus =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "checking-survey"; layerLabel: string }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; message?: string }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "context-lost" }>;

export function DeepSkyAtlas({ initialLayerId, target }: Props) {
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
          message: `${activeLayer.label} imagery is unavailable right now. Lumina did not start the interactive renderer; the canonical catalogue and source information remain available.`,
        });
        return;
      }
      setStatus({ kind: "loading" });
      const session = await attachWwtAtlas(containerRef.current, {
        onContextLost: () => setStatus({ kind: "context-lost" }),
        onContextRestored: () =>
          setStatus({ kind: "ready", message: "Graphics context restored." }),
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
        message:
          "The interactive atlas could not start. The catalogue, coordinates, sources, and survey information below remain available.",
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
      setStatus({ kind: "ready", message: `Focused on ${target.name}.` });
    } catch {
      setStatus({ kind: "error", message: "The atlas could not focus that reviewed coordinate." });
    }
  }

  async function chooseLayer(nextLayerId: AtlasLayerId) {
    const nextLayer = ATLAS_LAYERS.find((layer) => layer.id === nextLayerId);
    if (nextLayer === undefined) {
      setStatus({
        kind: "error",
        message: "That survey layer is not part of the reviewed inventory.",
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
          message: `${nextLayer.label} imagery is unavailable right now. The current atlas layer remains active.`,
        });
        return;
      }
      sessionRef.current.setLayer(nextLayerId);
      setLayerId(nextLayerId);
      setStatus({ kind: "ready", message: `Survey layer changed to ${nextLayer.label}.` });
    } catch {
      setStatus({ kind: "error", message: "That survey layer could not be displayed." });
    }
  }

  function pan(horizontalPixels: number, verticalPixels: number) {
    try {
      sessionRef.current?.pan(horizontalPixels, verticalPixels);
    } catch {
      setStatus({ kind: "error", message: "The atlas could not move the view." });
    }
  }

  function zoom(factor: number) {
    try {
      sessionRef.current?.zoom(factor);
    } catch {
      setStatus({ kind: "error", message: "The atlas could not change the field of view." });
    }
  }

  function applyUtcTime() {
    const instant = parseAtlasUtcInstant(utcInput.trim());
    if (instant === null) {
      setStatus({
        kind: "error",
        message: "Enter an ISO 8601 UTC instant such as 2026-09-15T18:30:00Z.",
      });
      return;
    }
    try {
      sessionRef.current?.setTime(instant);
      setStatus({ kind: "ready", message: `Viewing context set to ${instant.toISOString()}.` });
    } catch {
      setStatus({ kind: "error", message: "The atlas could not apply that UTC instant." });
    }
  }

  function useCurrentTime() {
    try {
      sessionRef.current?.syncTimeNow();
      setUtcInput("");
      setStatus({ kind: "ready", message: "Viewing context synchronized to the system clock." });
    } catch {
      setStatus({ kind: "error", message: "The atlas could not synchronize to the current time." });
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
        message: "Enter valid finite latitude, longitude, and elevation.",
      });
      return;
    }
    try {
      sessionRef.current?.setObserver(observer);
      setStatus({
        kind: "ready",
        message: "Observer context applied in this browser tab only. Coordinates were not saved.",
      });
    } catch {
      setStatus({ kind: "error", message: "The atlas could not apply that observer context." });
    }
  }

  function useLocation() {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "error", message: "Geolocation is not available in this browser." });
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
          message: "Location copied into the local fields. Press Apply observer context to use it.",
        });
      },
      () =>
        setStatus({ kind: "error", message: "Location permission was unavailable or declined." }),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  function toggleHorizon(enabled: boolean) {
    setLocalHorizon(enabled);
    try {
      sessionRef.current?.setLocalHorizon(enabled);
      setStatus({
        kind: "ready",
        message: enabled
          ? "Local-horizon observer context enabled."
          : "Equatorial sky context restored.",
      });
    } catch {
      setStatus({ kind: "error", message: "The atlas could not change horizon context." });
    }
  }

  return (
    <section
      aria-labelledby="atlas-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Optional interactive renderer
        </p>
        <h2 className="text-2xl font-semibold" id="atlas-heading">
          WorldWide Telescope atlas
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          The catalogue above is Lumina&apos;s canonical science. Opening this supplemental atlas
          loads the WorldWide Telescope engine and imagery from the credited survey hosts. No
          external WWT or imagery request is made before you activate it.
        </p>
      </div>

      <div
        aria-label="Interactive sky atlas canvas"
        className="relative min-h-72 overflow-hidden border border-[var(--border)] bg-black sm:min-h-96"
        id="lumina-wwt-atlas"
        ref={containerRef}
      >
        {!active ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center sm:min-h-96">
            <div className="max-w-xl space-y-4">
              <p className="text-[var(--muted)]">
                {target === null
                  ? "Select a deep-sky object with one accepted coordinate before focusing the atlas."
                  : `Ready to open the atlas around ${target.name}.`}
              </p>
              <button
                className="min-h-11 border border-[var(--accent)] px-5 font-semibold text-[var(--link)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={status.kind === "loading" || status.kind === "checking-survey"}
                onClick={activate}
                type="button"
              >
                {status.kind === "checking-survey"
                  ? "Checking survey…"
                  : status.kind === "loading"
                    ? "Opening atlas…"
                    : "Open interactive atlas"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <AtlasStatusMessage status={status} />

      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="space-y-3 border border-[var(--border)] p-4">
          <legend className="px-1 font-semibold">Survey layer</legend>
          <label className="block space-y-2">
            <span className="text-sm text-[var(--muted)]">Wavelength context</span>
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
            Credit: {activeLayer.creditText}{" "}
            <a
              className="text-[var(--link)] underline"
              href={activeLayer.creditUrl}
              rel="noreferrer"
            >
              Source details
            </a>
          </p>
        </fieldset>

        <fieldset className="space-y-3 border border-[var(--border)] p-4" disabled={!active}>
          <legend className="px-1 font-semibold">View controls</legend>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={() => void focusTarget()}
              type="button"
            >
              Focus selected object
            </button>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={() => zoom(0.8)}
              type="button"
            >
              Zoom in
            </button>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={() => zoom(1.25)}
              type="button"
            >
              Zoom out
            </button>
          </div>
          <div aria-label="Pan atlas" className="grid max-w-48 grid-cols-3 gap-2">
            <span />
            <button
              aria-label="Pan up"
              className="min-h-11 border border-[var(--border)]"
              onClick={() => pan(0, -40)}
              type="button"
            >
              ↑
            </button>
            <span />
            <button
              aria-label="Pan left"
              className="min-h-11 border border-[var(--border)]"
              onClick={() => pan(-40, 0)}
              type="button"
            >
              ←
            </button>
            <button
              aria-label="Pan down"
              className="min-h-11 border border-[var(--border)]"
              onClick={() => pan(0, 40)}
              type="button"
            >
              ↓
            </button>
            <button
              aria-label="Pan right"
              className="min-h-11 border border-[var(--border)]"
              onClick={() => pan(40, 0)}
              type="button"
            >
              →
            </button>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border border-[var(--border)] p-4" disabled={!active}>
          <legend className="px-1 font-semibold">UTC viewing context</legend>
          <label className="block space-y-2">
            <span className="text-sm text-[var(--muted)]">ISO 8601 UTC instant</span>
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
              Apply UTC time
            </button>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={useCurrentTime}
              type="button"
            >
              Use current time
            </button>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Time changes viewing context only. It does not change Lumina&apos;s canonical catalogue
            coordinates.
          </p>
        </fieldset>

        <fieldset className="space-y-3 border border-[var(--border)] p-4" disabled={!active}>
          <legend className="px-1 font-semibold">Observer context — optional</legend>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Coordinates remain only in this component&apos;s memory. They are not placed in the URL,
            stored, logged, sent to Lumina APIs, or sent to imagery providers.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <ObserverField
              label="Latitude °"
              max="90"
              min="-90"
              onChange={setLatitude}
              value={latitude}
            />
            <ObserverField
              label="Longitude °"
              max="180"
              min="-180"
              onChange={setLongitude}
              value={longitude}
            />
            <ObserverField
              label="Elevation m"
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
              Use my location
            </button>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-3"
              onClick={applyObserver}
              type="button"
            >
              Apply observer context
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input
              checked={localHorizon}
              onChange={(event) => toggleHorizon(event.target.checked)}
              type="checkbox"
            />
            <span>Show local-horizon context</span>
          </label>
        </fieldset>
      </div>

      <p className="text-sm leading-6 text-[var(--muted)]">
        Renderer: WorldWide Telescope web engine 7.40.0 / helpers 0.18.0, MIT licensed. Survey
        images are separate datasets with the per-layer credits shown above. Survey composites and
        false-colour maps are display representations; changing wavelength does not change the
        physical object.
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

function AtlasStatusMessage({ status }: Readonly<{ status: AtlasStatus }>) {
  if (status.kind === "idle") return null;
  if (status.kind === "checking-survey")
    return (
      <p aria-live="polite" role="status">
        Checking {status.layerLabel} imagery availability from its reviewed survey host…
      </p>
    );
  if (status.kind === "loading")
    return (
      <p aria-live="polite" role="status">
        Loading the opt-in WWT renderer and reviewed survey inventory…
      </p>
    );
  if (status.kind === "context-lost")
    return (
      <p aria-live="polite" role="alert">
        The graphics context was lost. Rendering is paused; the non-canvas catalogue content remains
        available.
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
      Interactive atlas ready.
    </p>
  ) : (
    <p aria-live="polite" role="status">
      {status.message}
    </p>
  );
}
