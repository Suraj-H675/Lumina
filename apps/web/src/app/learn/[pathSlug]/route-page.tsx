import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LearningPathView } from "../../../components/learning-path-view";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { LearningPathMessages } from "../../../lib/i18n/messages/types";
import { loadLearningContent } from "../../../lib/learning/content";

type LearningPathPageProps = Readonly<{
  params: Promise<{ pathSlug: string }>;
}>;

export function learningPathMetadata(title: string, messages: LearningPathMessages): Metadata {
  return {
    description: messages.metadataDescription,
    title,
  };
}

export function generateStaticParams(): Array<{ pathSlug: string }> {
  return [{ pathSlug: loadLearningContent().path.slug }];
}

export async function LearningPathRoute({
  locale,
  messages,
  params,
}: LearningPathPageProps & Readonly<{ locale: PublishedLocale; messages: LearningPathMessages }>) {
  const { pathSlug } = await params;
  const content = loadLearningContent();
  if (content.path.slug !== pathSlug) notFound();
  return (
    <LearningPathView content={content} locale={locale} messages={messages} path={content.path} />
  );
}
