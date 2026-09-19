"use client";

import RouteError, { type RouteErrorProps } from "../route-error";
import { enMessages } from "../../lib/i18n/messages/en";

export default function EnglishRouteError(props: Omit<RouteErrorProps, "messages">) {
  return <RouteError {...props} messages={enMessages.routeBoundaries.routeError} />;
}
