"use client";

import { enMessages } from "../../../lib/i18n/messages/en";
import LearningError from "../../learn/route-error";

type LearningErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function EnglishLearningError(props: LearningErrorProps) {
  return <LearningError {...props} messages={enMessages.learn.routeState.error} />;
}
