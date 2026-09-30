"use client";

import {
  satellitePassEndpoint,
  validateExactGenerated,
  type SatelliteItemResponse,
  type SatellitePassResponse,
} from "@nova-lumina/api-client";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SatelliteMessages } from "../../../lib/i18n/messages/types";
import { CELESTRAK_NAME } from "../../../lib/space-now/provider-display";
import styles from "../live-data-detail.module.css";

type Props = Readonly<{
  locale: PublishedLocale;
  messages: SatelliteMessages["passFinder"];
  satellites: Array<SatelliteItemResponse>;
}>;

type ErrorReason =
  | "finiteValues"
  | "geolocationUnavailable"
  | "locationPermission"
  | "noLongerAvailable"
  | "requestInvalid"
  | "responseInvalid"
  | "temporarilyUnavailable"
  | "unknown";

type State =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; reason: ErrorReason }>
  | Readonly<{ kind: "result"; response: SatellitePassResponse }>;

const ELEMENT_WARNING_HOURS = 24;
const PREDICTION_WINDOW_HOURS = 24;

export function SatellitePassFinder({ locale, messages, satellites }: Props) {
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
      setState({ kind: "error", reason: "finiteValues" });
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
        setState({ kind: "error", reason: reasonForStatus(response.status) });
        return;
      }
      const raw: unknown = await response.json();
      const parsed = validateExactGenerated(satellitePassEndpoint.validator, raw);
      if (!parsed.valid) {
        setState({ kind: "error", reason: "responseInvalid" });
        return;
      }
      setState({ kind: "result", response: parsed.data });
    } catch {
      setState({ kind: "error", reason: "unknown" });
    }
  }

  function useLocation() {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", reason: "geolocationUnavailable" });
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
      () => setState({ kind: "error", reason: "locationPermission" }),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  return (
    <section aria-labelledby="pass-finder-heading" className={styles.instrument}>
      <div className={styles.instrumentHeader}>
        <h2 className={styles.instrumentTitle} id="pass-finder-heading">
          {messages.heading}
        </h2>
        <p className={styles.instrumentDescription}>
          {formatMessageTemplate(messages.privacy, { provider: CELESTRAK_NAME })}
        </p>
      </div>
      <form onSubmit={submit}>
        <div className={styles.formGrid}>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>{messages.fields.satellite}</span>
            <select
              className={styles.select}
              onChange={(event) => setCatalog(event.target.value)}
              required
              value={catalog}
            >
              {selectable.map((satellite) => (
                <option key={satellite.catalog_number} value={satellite.catalog_number}>
                  {formatMessageTemplate(messages.option, {
                    catalogNumber: satellite.catalog_number,
                    name: satellite.name,
                  })}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label={messages.fields.latitude}
            max="90"
            min="-90"
            onChange={setLatitude}
            value={latitude}
          />
          <NumberField
            label={messages.fields.longitude}
            max="180"
            min="-180"
            onChange={setLongitude}
            value={longitude}
          />
          <NumberField
            label={messages.fields.elevation}
            max="10000"
            min="-500"
            onChange={setElevation}
            value={elevation}
          />
        </div>
        <div className={styles.formActions}>
          <button className={styles.button} onClick={useLocation} type="button">
            {messages.actions.useLocation}
          </button>
          <button
            className={styles.primaryButton}
            disabled={state.kind === "loading" || selectable.length === 0}
            type="submit"
          >
            {state.kind === "loading"
              ? messages.actions.calculating
              : formatMessageTemplate(messages.actions.calculate, {
                  hours: formatLocaleNumber(PREDICTION_WINDOW_HOURS, locale),
                })}
          </button>
        </div>
      </form>
      <PassState locale={locale} messages={messages} state={state} />
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
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        className={styles.input}
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

function PassState({
  locale,
  messages,
  state,
}: Readonly<{
  locale: PublishedLocale;
  messages: SatelliteMessages["passFinder"];
  state: State;
}>) {
  if (state.kind === "idle") return <p className={styles.stateText}>{messages.idle}</p>;
  if (state.kind === "loading")
    return (
      <p aria-live="polite" className={styles.stateText} role="status">
        {messages.loading}
      </p>
    );
  if (state.kind === "error")
    return (
      <p aria-live="polite" className={styles.stateText} role="alert">
        {messages.errors[state.reason]}
      </p>
    );
  const { prediction, satellite } = state.response;
  if (prediction.state === "refused") {
    return (
      <div className={styles.result} role="status">
        <p className={styles.resultTitle}>{messages.result.refusedTitle}</p>
        <p className={styles.stateText}>
          {messages.result.reasonLabel}{" "}
          {refusalReasonMessage(prediction.refusal_reason, messages.result)}.
        </p>
      </div>
    );
  }
  if (prediction.state === "no_passes") {
    return (
      <p className={styles.stateText} role="status">
        {formatMessageTemplate(messages.result.noPasses, {
          altitudeThreshold: formatLocaleNumber(
            prediction.algorithm.altitude_threshold_deg,
            locale,
            { maximumFractionDigits: 20, useGrouping: false },
          ),
          windowHours: formatLocaleNumber(prediction.algorithm.window_hours, locale),
        })}
      </p>
    );
  }
  return (
    <div className={styles.result} role="status">
      <div>
        <h3 className={styles.resultTitle}>
          {formatMessageTemplate(messages.result.heading, { satellite: satellite.name })}
        </h3>
        <p className={styles.quietCopy}>
          {formatMessageTemplate(messages.result.algorithmSummary, {
            gravityModel: prediction.algorithm.gravity_model,
            hours: formatLocaleFixedNumber(prediction.element_age_hours_at_start, 1, locale),
            observerEllipsoid: prediction.algorithm.observer_ellipsoid,
            propagationModel: prediction.algorithm.propagation_model,
          })}
        </p>
        {prediction.stale_element_warning ? (
          <p className={styles.warning}>
            {formatMessageTemplate(messages.result.staleWarning, {
              hours: formatLocaleNumber(ELEMENT_WARNING_HOURS, locale),
            })}
          </p>
        ) : null}
      </div>
      <ol className={styles.passList}>
        {prediction.passes.map((passItem) => (
          <li className={styles.pass} key={passItem.peak.time_utc}>
            <p className={styles.passTitle}>
              {messages.result.passPeakLabel}{" "}
              <time dateTime={passItem.peak.time_utc}>{passItem.peak.time_utc}</time>{" "}
              {formatMessageTemplate(messages.result.passPeakAfterTime, {
                altitude: formatLocaleFixedNumber(passItem.peak_altitude_deg, 1, locale),
                direction: passItem.peak.direction,
              })}
            </p>
            <p className={styles.passMeta}>
              {formatMessageTemplate(messages.result.passRiseSet, {
                riseDirection: passItem.rise.direction,
                riseTime: passItem.rise.time_utc,
                setDirection: passItem.set.direction,
                setTime: passItem.set.time_utc,
              })}
            </p>
            <p className={styles.passMeta}>
              {formatMessageTemplate(messages.result.illumination, {
                skyState: skyStateLabel(passItem.observer_sky_state_at_peak, messages.result),
                sunAltitude: formatLocaleFixedNumber(
                  passItem.observer_sun_altitude_deg_at_peak,
                  1,
                  locale,
                ),
                sunlit: passItem.satellite_sunlit_at_peak
                  ? messages.result.yes
                  : messages.result.no,
              })}
            </p>
          </li>
        ))}
      </ol>
      <p className={styles.stateText}>{messages.result.limitation}</p>
    </div>
  );
}

function refusalReasonMessage(
  reason: SatellitePassResponse["prediction"]["refusal_reason"],
  messages: SatelliteMessages["passFinder"]["result"],
): string {
  if (reason === "elements_outside_supported_age") return messages.refusalElementAge;
  if (reason === "catalog_number_unsupported_by_sgp4") return messages.refusalCatalogUnsupported;
  if (reason === "unsupported_sgp4_state") return messages.refusalSgp4State;
  if (reason === "unsupported_event_sequence") return messages.refusalEventSequence;
  return messages.refusalFallback;
}

function skyStateLabel(
  state: SatellitePassResponse["prediction"]["passes"][number]["observer_sky_state_at_peak"],
  messages: SatelliteMessages["passFinder"]["result"],
): string {
  if (state === "daylight") return messages.skyDaylight;
  if (state === "civil_twilight") return messages.skyCivilTwilight;
  if (state === "nautical_twilight") return messages.skyNauticalTwilight;
  if (state === "astronomical_twilight") return messages.skyAstronomicalTwilight;
  if (state === "night") return messages.skyNight;
  return messages.skyUnknown;
}

function reasonForStatus(status: number): ErrorReason {
  if (status === 404) return "noLongerAvailable";
  if (status === 422) return "requestInvalid";
  if (status === 503) return "temporarilyUnavailable";
  return "unknown";
}
