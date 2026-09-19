import { DEFAULT_LOCALE } from "../../../../../lib/i18n/locales";
import { enMessages } from "../../../../../lib/i18n/messages/en";
import {
  generateStaticParams,
  LearningLessonRoute,
  metadata,
} from "../../../../learn/[pathSlug]/[lessonSlug]/route-page";

export { generateStaticParams, metadata };

export default function EnglishLearningLessonPage(
  props: Parameters<typeof LearningLessonRoute>[0],
) {
  return (
    <LearningLessonRoute
      {...props}
      locale={DEFAULT_LOCALE}
      sourceMessages={enMessages.learn.sources}
    />
  );
}
