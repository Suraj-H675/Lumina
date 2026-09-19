import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LearningLessonView } from "../../../../components/learning-lesson-view";
import type { PublishedLocale } from "../../../../lib/i18n/locales";
import type {
  LearningLessonMessages,
  LearningSourcesMessages,
} from "../../../../lib/i18n/messages/types";
import { loadLearningContent } from "../../../../lib/learning/content";

type LearningLessonPageProps = Readonly<{
  params: Promise<{ lessonSlug: string; pathSlug: string }>;
}>;

export function learningLessonMetadata(messages: LearningLessonMessages): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export function generateStaticParams(): Array<{ lessonSlug: string; pathSlug: string }> {
  const content = loadLearningContent();
  return content.path.lesson_slugs.map((lessonSlug) => ({
    lessonSlug,
    pathSlug: content.path.slug,
  }));
}

export async function LearningLessonRoute({
  locale,
  messages,
  params,
  sourceMessages,
}: LearningLessonPageProps &
  Readonly<{
    locale: PublishedLocale;
    messages: LearningLessonMessages;
    sourceMessages: LearningSourcesMessages;
  }>) {
  const { lessonSlug, pathSlug } = await params;
  const content = loadLearningContent();
  if (content.path.slug !== pathSlug) notFound();
  const lesson = content.lessons.find((entry) => entry.slug === lessonSlug);
  const quiz = content.quizzes.find((entry) => entry.lesson_slug === lessonSlug);
  if (lesson === undefined || quiz === undefined) notFound();
  return (
    <LearningLessonView
      content={content}
      lesson={lesson}
      locale={locale}
      messages={messages}
      path={content.path}
      quiz={quiz}
      sourceMessages={sourceMessages}
    />
  );
}
