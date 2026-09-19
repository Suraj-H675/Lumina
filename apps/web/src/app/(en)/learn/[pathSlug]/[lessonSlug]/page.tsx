import { DEFAULT_LOCALE } from "../../../../../lib/i18n/locales";
import { enMessages } from "../../../../../lib/i18n/messages/en";
import {
  generateStaticParams,
  learningLessonMetadata,
  LearningLessonRoute,
} from "../../../../learn/[pathSlug]/[lessonSlug]/route-page";

export { generateStaticParams };

export const metadata = learningLessonMetadata(enMessages.learn.lesson);

export default function EnglishLearningLessonPage(
  props: Parameters<typeof LearningLessonRoute>[0],
) {
  return (
    <LearningLessonRoute
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.learn.lesson}
      presentationModeMessages={enMessages.presentationMode}
      sourceMessages={enMessages.learn.sources}
    />
  );
}
