import type { Metadata } from "next";

import { formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SpaceWeatherMessages } from "../../../lib/i18n/messages/types";
import { NOAA_SPACE_WEATHER_PREDICTION_CENTER_NAME } from "../../../lib/space-now/provider-display";
import { loadNowSpaceWeather } from "../../../lib/server/space-now";
import { SpaceWeatherView } from "./space-weather-view";

export function createSpaceWeatherMetadata(messages: SpaceWeatherMessages): Metadata {
  return {
    title: messages.metadataTitle,
    description: formatMessageTemplate(messages.metadataDescription, {
      provider: NOAA_SPACE_WEATHER_PREDICTION_CENTER_NAME,
    }),
  };
}

export default async function SpaceWeatherPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SpaceWeatherMessages }>) {
  const outcome = await loadNowSpaceWeather();
  return <SpaceWeatherView locale={locale} messages={messages} outcome={outcome} />;
}
