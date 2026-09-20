"use client";

import { enMessages } from "../../../../lib/i18n/messages/en";
import TelescopeBuilderError from "../../../lab/telescope-builder/route-error";

type TelescopeBuilderErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function EnglishTelescopeBuilderError(props: TelescopeBuilderErrorProps) {
  return (
    <TelescopeBuilderError {...props} messages={enMessages.routeBoundaries.lab.telescopeBuilder} />
  );
}
