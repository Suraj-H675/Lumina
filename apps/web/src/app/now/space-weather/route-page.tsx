import type { Metadata } from "next";

import { loadNowSpaceWeather } from "../../../lib/server/space-now";
import { SpaceWeatherView } from "./space-weather-view";

export const metadata: Metadata = {
  title: "Space Weather",
  description:
    "A source-backed NOAA Space Weather Prediction Center view of separate R, S, and G scales, planetary Kp, solar-wind measurements, and provider notifications.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SpaceWeatherPage() {
  const outcome = await loadNowSpaceWeather();
  return <SpaceWeatherView outcome={outcome} />;
}
