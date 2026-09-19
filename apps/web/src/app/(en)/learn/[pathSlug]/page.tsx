import { DEFAULT_LOCALE } from "../../../../lib/i18n/locales";
import { enMessages } from "../../../../lib/i18n/messages/en";
import { loadLearningContent } from "../../../../lib/learning/content";
import {
  generateStaticParams,
  LearningPathRoute,
  learningPathMetadata,
} from "../../../learn/[pathSlug]/route-page";

export { generateStaticParams };

export const metadata = learningPathMetadata(
  loadLearningContent().path.title,
  enMessages.learn.path,
);

export default function EnglishLearningPathPage(props: Parameters<typeof LearningPathRoute>[0]) {
  return (
    <LearningPathRoute
      {...props}
      locale={DEFAULT_LOCALE}
      messages={enMessages.learn.path}
      sourceMessages={enMessages.learn.sources}
    />
  );
}
