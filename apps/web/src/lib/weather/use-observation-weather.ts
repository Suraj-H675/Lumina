"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { localDateString, type ObserverLocation } from "../observation/domain";
import {
  forecastDateAvailability,
  roundedWeatherCoordinates,
  type ForecastDateAvailability,
  type WeatherForecast,
} from "./domain";
import {
  buildOpenMeteoForecastUrl,
  fetchOpenMeteoForecast,
  WeatherProviderError,
} from "./open-meteo";

const forecastCache = new Map<string, WeatherForecast>();

export type ObservationWeatherState = Readonly<{
  availability: ForecastDateAvailability;
  enable: () => void;
  retry: () => void;
  status: "idle" | "loading" | "success" | "unavailable";
  forecast?: WeatherForecast;
  unavailableReason?: "date" | "error";
}>;

type ObservationWeatherOptions = Readonly<{
  location: ObserverLocation;
  nightDate: string;
}>;

type NetworkState = Readonly<{
  attempt: number;
  forecast?: WeatherForecast;
  requestKey?: string;
  status: "idle" | "unavailable" | "success";
  unavailableReason?: "error";
}>;

/** Clears only the in-memory session cache; no forecast is persisted. */
export function clearWeatherForecastCache(): void {
  forecastCache.clear();
}

/**
 * Loads weather only after explicit opt-in. The cache identity contains the
 * rounded provider request and current forecast window, never the target.
 */
export function useObservationWeather({
  location,
  nightDate,
}: ObservationWeatherOptions): ObservationWeatherState {
  const [enabled, setEnabled] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const todayLocalDate = useSyncExternalStore(
    () => () => undefined,
    () => localDateString(new Date()),
    () => "",
  );
  const [state, setState] = useState<NetworkState>({ attempt: 0, status: "idle" });
  const requestGeneration = useRef(0);

  const availability = useMemo(
    () => forecastDateAvailability(nightDate, todayLocalDate),
    [nightDate, todayLocalDate],
  );
  const requestLocation = useMemo(
    () => ({ latitude: location.latitude, longitude: location.longitude }),
    [location.latitude, location.longitude],
  );
  const requestKey = useMemo(() => {
    if (todayLocalDate === "") return null;
    const rounded = roundedWeatherCoordinates(requestLocation);
    return `${todayLocalDate}:${rounded.latitude}:${rounded.longitude}:${buildOpenMeteoForecastUrl(requestLocation)}`;
  }, [requestLocation, todayLocalDate]);
  const requestLocationRef = useRef(requestLocation);
  useEffect(() => {
    requestLocationRef.current = requestLocation;
  }, [requestLocation]);

  useEffect(() => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    if (!enabled || availability !== "allowed" || requestKey === null) return;

    const cached = forecastCache.get(requestKey);
    if (cached !== undefined) return;

    const controller = new AbortController();
    void fetchOpenMeteoForecast(requestLocationRef.current, { signal: controller.signal })
      .then((forecast) => {
        if (requestGeneration.current !== generation) return;
        forecastCache.set(requestKey, forecast);
        setState({ attempt: retryToken, forecast, requestKey, status: "success" });
      })
      .catch((error: unknown) => {
        if (requestGeneration.current !== generation) return;
        if (error instanceof WeatherProviderError && error.kind === "aborted") return;
        setState({
          attempt: retryToken,
          requestKey,
          status: "unavailable",
          unavailableReason: "error",
        });
      });

    return () => controller.abort();
  }, [availability, enabled, requestKey, retryToken]);

  const enable = useCallback(() => setEnabled(true), []);
  const retry = useCallback(() => {
    setEnabled(true);
    setRetryToken((token) => token + 1);
  }, []);

  const cachedForecast = requestKey === null ? undefined : forecastCache.get(requestKey);
  const effectiveState: Pick<ObservationWeatherState, "status" | "forecast" | "unavailableReason"> =
    !enabled
      ? { status: "idle" }
      : availability !== "allowed" || requestKey === null
        ? { status: "unavailable", unavailableReason: "date" }
        : cachedForecast !== undefined
          ? { forecast: cachedForecast, status: "success" }
          : state.requestKey !== requestKey || state.attempt !== retryToken
            ? { status: "loading" }
            : state;

  return { ...effectiveState, availability, enable, retry };
}
