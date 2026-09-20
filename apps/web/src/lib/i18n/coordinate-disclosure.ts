import { formatMessageTemplate } from "./format";
import type { CoordinateDisclosureMessages } from "./messages/types";
import type { CoordinateDisclosure } from "../observation/domain";

export function formatCoordinateDisclosure(
  disclosure: CoordinateDisclosure,
  messages: CoordinateDisclosureMessages,
): string {
  const template =
    disclosure.kind === "gaia-dr3"
      ? messages.gaiaDr3
      : disclosure.kind === "messier-j2000"
        ? messages.messierJ2000
        : disclosure.kind === "messier-resolver-j2000"
          ? messages.messierResolverJ2000
          : messages.reviewed;
  return formatMessageTemplate(template, { referenceEpoch: disclosure.referenceEpoch });
}
