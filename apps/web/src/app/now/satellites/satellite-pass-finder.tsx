"use client";

import {
  satellitePassEndpoint,
  validateExactGenerated,
  type SatelliteItemResponse,
  type SatellitePassResponse,
} from "@lumina/api-client";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

type Props = Readonly<{ satellites: Array<SatelliteItemResponse> }>;

type State =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "result"; response: SatellitePassResponse }>;

export function SatellitePassFinder({ satellites }: Props) {
  const selectable = useMemo(
    () => satellites.filter((item) => item.pass_prediction_runtime_supported),
    [satellites],
  );
  const [catalog, setCatalog] = useState(selectable[0]?.catalog_number.toString() ?? "");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [elevation, setElevation] = useState("0");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const catalogNumber = Number(catalog);
    const latitudeDeg = Number(latitude);
    const longitudeDeg = Number(longitude);
    const elevationM = Number(elevation);
    if (![catalogNumber, latitudeDeg, longitudeDeg, elevationM].every(Number.isFinite)) {
      setState({ kind: "error", message: "Enter valid finite numeric values." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/satellite-passes", {
        body: JSON.stringify({
          catalog_number: catalogNumber,
          observer: {
            elevation_m: elevationM,
            latitude_deg: latitudeDeg,
            longitude_deg: longitudeDeg,
          },
          start_utc: new Date().toISOString(),
        }),
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setState({ kind: "error", message: messageForStatus(response.status) });
        return;
      }
      const raw: unknown = await response.json();
      const parsed = validateExactGenerated(satellitePassEndpoint.validator, raw);
      if (!parsed.valid) {
        setState({ kind: "error", message: "Lumina returned an unexpected pass response." });
        return;
      }
      setState({ kind: "result", response: parsed.data });
    } catch {
      setState({ kind: "error", message: "Pass calculation is temporarily unavailable." });
    }
  }

  function useLocation() {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "Geolocation is not available in this browser." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        if (coords.altitude !== null && Number.isFinite(coords.altitude)) {
          setElevation(coords.altitude.toFixed(1));
        }
        setState({ kind: "idle" });
      },
      () =>
        setState({ kind: "error", message: "Location permission was unavailable or declined." }),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  return (
    <section
      aria-labelledby="pass-finder-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold" id="pass-finder-heading">
          Find passes for your location
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Coordinates are used only for this calculation. They are not placed in the URL, sent to
          CelesTrak, stored by Lumina, or echoed in the result. Browser geolocation runs only when
          you press the button below.
        </p>
      </div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="space-y-2 sm:col-span-2">
          <span className="font-medium">Satellite</span>
          <select
            className="min-h-11 w-full border border-[var(--border)] bg-[var(--background)] px-3"
            onChange={(event) => setCatalog(event.target.value)}
            required
            value={catalog}
          >
            {selectable.map((satellite) => (
              <option key={satellite.catalog_number} value={satellite.catalog_number}>
                {satellite.name} · NORAD {satellite.catalog_number}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Latitude (degrees)"
          max="90"
          min="-90"
          onChange={setLatitude}
          value={latitude}
        />
        <NumberField
          label="Longitude (degrees)"
          max="180"
          min="-180"
          onChange={setLongitude}
          value={longitude}
        />
        <NumberField
          label="Elevation (metres)"
          max="10000"
          min="-500"
          onChange={setElevation}
          value={elevation}
        />
        <div className="flex flex-wrap items-end gap-3">
          <button
            className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
            onClick={useLocation}
            type="button"
          >
            Use my location
          </button>
          <button
            className="min-h-11 border border-[var(--accent)] px-4 font-semibold text-[var(--link)]"
            disabled={state.kind === "loading" || selectable.length === 0}
            type="submit"
          >
            {state.kind === "loading" ? "Calculating…" : "Calculate next 24 hours"}
          </button>
        </div>
      </form>
      <PassState state={state} />
    </section>
  );
}

function NumberField({
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
      <span className="font-medium">{label}</span>
      <input
        className="min-h-11 w-full border border-[var(--border)] bg-[var(--background)] px-3"
        inputMode="decimal"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        required
        step="any"
        type="number"
        value={value}
      />
    </label>
  );
}

function PassState({ state }: Readonly<{ state: State }>) {
  if (state.kind === "idle")
    return (
      <p className="text-sm text-[var(--muted)]">
        Predictions start from the current UTC time when you submit.
      </p>
    );
  if (state.kind === "loading")
    return (
      <p aria-live="polite" role="status">
        Calculating from the cached element set…
      </p>
    );
  if (state.kind === "error")
    return (
      <p aria-live="polite" className="text-[var(--muted)]" role="alert">
        {state.message}
      </p>
    );
  const { prediction, satellite } = state.response;
  if (prediction.state === "refused") {
    return (
      <div className="space-y-2" role="status">
        <p className="font-semibold">Prediction safely refused</p>
        <p className="text-[var(--muted)]">
          Reason: {prediction.refusal_reason?.replaceAll("_", " ") ?? "unsupported state"}.
        </p>
      </div>
    );
  }
  if (prediction.state === "no_passes") {
    return (
      <p role="status">
        No complete passes above {prediction.algorithm.altitude_threshold_deg}° were found in the
        next {prediction.algorithm.window_hours} hours.
      </p>
    );
  }
  return (
    <div className="space-y-5" role="status">
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">{satellite.name} predicted passes</h3>
        <p className="text-sm text-[var(--muted)]">
          SGP4 · {prediction.algorithm.gravity_model} · observer{" "}
          {prediction.algorithm.observer_ellipsoid} · element offset{" "}
          {prediction.element_age_hours_at_start.toFixed(1)} h
        </p>
        {prediction.stale_element_warning ? (
          <p className="font-medium">
            Element-age warning: prediction uses elements beyond Lumina&apos;s 24-hour warning
            threshold.
          </p>
        ) : null}
      </div>
      <ol className="space-y-4">
        {prediction.passes.map((passItem) => (
          <li className="space-y-2 border border-[var(--border)] p-4" key={passItem.peak.time_utc}>
            <p className="font-semibold">
              Peak <time dateTime={passItem.peak.time_utc}>{passItem.peak.time_utc}</time> ·{" "}
              {passItem.peak_altitude_deg.toFixed(1)}° {passItem.peak.direction}
            </p>
            <p className="text-sm text-[var(--muted)]">
              Rise {passItem.rise.time_utc} ({passItem.rise.direction}) · Set{" "}
              {passItem.set.time_utc} ({passItem.set.direction})
            </p>
            <p className="text-sm text-[var(--muted)]">
              Satellite sunlit at peak: {passItem.satellite_sunlit_at_peak ? "yes" : "no"}. Observer
              sky: {passItem.observer_sky_state_at_peak.replaceAll("_", " ")} (Sun{" "}
              {passItem.observer_sun_altitude_deg_at_peak.toFixed(1)}°).
            </p>
          </li>
        ))}
      </ol>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Sunlit status and observer sky state are model context only. Lumina has no optical-magnitude
        model here and does not claim that a pass will be visible.
      </p>
    </div>
  );
}

function messageForStatus(status: number): string {
  if (status === 404) return "That satellite is no longer present in the current snapshot.";
  if (status === 422) return "The pass request could not be validated.";
  if (status === 503) return "Satellite data is temporarily unavailable.";
  return "Pass calculation could not be completed.";
}
