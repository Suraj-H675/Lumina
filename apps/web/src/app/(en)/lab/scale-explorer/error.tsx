"use client";

import { enMessages } from "../../../../lib/i18n/messages/en";
import ScaleExplorerError from "../../../lab/scale-explorer/route-error";

type ScaleExplorerErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function EnglishScaleExplorerError(props: ScaleExplorerErrorProps) {
  return <ScaleExplorerError {...props} messages={enMessages.routeBoundaries.lab.scaleExplorer} />;
}
