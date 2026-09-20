"use client";

import { enMessages } from "../../../../lib/i18n/messages/en";
import ObjectRouteError from "../../../objects/[slug]/route-error";

type ObjectRouteErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function EnglishObjectRouteError(props: ObjectRouteErrorProps) {
  return <ObjectRouteError {...props} messages={enMessages.object.routeError} />;
}
